/**
 * book_appointment() against a real Postgres with all migrations applied.
 * Runs only when TEST_DATABASE_URL is set.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import policyJson from "../../../seed/policies.json";
import rulesJson from "../../../seed/pricing-rules.json";
import { servicesByKey } from "../menu";
import type { PolicySettings } from "../policy/types";
import type { BundleRule } from "../pricing/discounts";
import { buildBooking, type BookableService } from "./build";

const url = process.env.TEST_DATABASE_URL;
const policy = policyJson as unknown as PolicySettings;
const rules = rulesJson.bundles as BundleRule[];
const client = { onTimeVisits: [], priorVisitCount: 3, flags: [], depositOverride: null, outstandingBalance: 0 };

describe.skipIf(!url)("book_appointment()", () => {
  it("saves a booking, allows the processing gap, refuses overlaps atomically", async () => {
    const db = new pg.Client({ connectionString: url });
    await db.connect();
    try {
      await db.query("begin");
      const q = async (sql: string, v: unknown[] = []) => (await db.query(sql, v)).rows;
      const [b] = await q(`insert into businesses(name, policy_settings) values ('T','{}') returning id`);
      const [st] = await q(`insert into staff(business_id, display_name) values ($1,'S') returning id`, [b.id]);
      const [cat] = await q(`insert into service_categories(business_id, key, name) values ($1,'c','C') returning id`, [b.id]);
      const [cl] = await q(`insert into clients(business_id, first_name) values ($1,'Ana') returning id`, [b.id]);
      const ids: Record<string, string> = {};
      for (const k of ["all_over_color", "mens_boys_cut", "womens_cut"]) {
        const s = servicesByKey[k];
        const [row] = await q(
          `insert into services(business_id, category_id, key, name, price_type, price_cents, active_min, processing_min, finish_min) values ($1,$2,$3,$4,'fixed',$5,$6,$7,$8) returning id`,
          [b.id, cat.id, k, s.name, Math.round(s.price * 100), s.active, s.processing, s.finish],
        );
        ids[k] = row.id;
      }
      const svc = (k: string): BookableService => ({ ...servicesByKey[k], id: ids[k] });
      const book = (services: BookableService[], start: string) => {
        const r = buildBooking({ services, start: new Date(start), rules, policy, client, now: new Date("2026-11-26T00:00:00Z") });
        return q(`select book_appointment($1::jsonb) as id`, [JSON.stringify({ ...r.payload, business_id: b.id, client_id: cl.id, staff_id: st.id })]);
      };

      // Color at 3:00 PM Central (21:00Z): hands-on 21:00-21:30, processing 21:30-22:05, rinse 22:05-22:20
      const [a] = await book([svc("all_over_color")], "2026-12-01T21:00:00Z");
      expect(a.id).toBeTruthy();
      expect((await q(`select count(*)::int n from staff_busy_blocks`))[0].n).toBe(2);

      // 15-min men's cut inside the processing gap: allowed
      await book([svc("mens_boys_cut")], "2026-12-01T21:40:00Z");

      // Women's cut overlapping the rinse: refused, nothing half-saved
      await db.query("savepoint s");
      await expect(book([svc("womens_cut")], "2026-12-01T22:00:00Z")).rejects.toMatchObject({ code: "23P01" });
      await db.query("rollback to savepoint s");
      expect((await q(`select count(*)::int n from appointments`))[0].n).toBe(2);
      expect((await q(`select count(*)::int n from appointment_services`))[0].n).toBe(2);
    } finally {
      await db.query("rollback");
      await db.end();
    }
  });
});
