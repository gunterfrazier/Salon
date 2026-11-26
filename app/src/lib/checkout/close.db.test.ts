/**
 * cancel_appointment() / checkout_appointment() against a real Postgres with
 * all migrations applied. Runs only when TEST_DATABASE_URL is set.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import policyJson from "../../../seed/policies.json";
import rulesJson from "../../../seed/pricing-rules.json";
import { buildBooking, type BookableService } from "../booking/build";
import { servicesByKey } from "../menu";
import type { PolicySettings } from "../policy/types";
import type { BundleRule } from "../pricing/discounts";
import { checkoutTotals, settleCancel } from "./settle";

const url = process.env.TEST_DATABASE_URL;
const policy = policyJson as unknown as PolicySettings;
const rules = rulesJson.bundles as BundleRule[];
const client = { onTimeVisits: [], priorVisitCount: 3, flags: [], depositOverride: null, outstandingBalance: 0 };

describe.skipIf(!url)("closing appointments", () => {
  it("no-show records fee, balance and flag and frees the time; checkout records payment", async () => {
    const db = new pg.Client({ connectionString: url });
    await db.connect();
    const q = async (sql: string, v: unknown[] = []) => (await db.query(sql, v)).rows;
    try {
      await db.query("begin");
      const [b] = await q(`insert into businesses(name, policy_settings) values ('T','{}') returning id`);
      const [st] = await q(`insert into staff(business_id, display_name) values ($1,'S') returning id`, [b.id]);
      const [cat] = await q(`insert into service_categories(business_id, key, name) values ($1,'c','C') returning id`, [b.id]);
      const [cl] = await q(`insert into clients(business_id, first_name) values ($1,'Ana') returning id`, [b.id]);
      const s = servicesByKey.womens_cut;
      const [row] = await q(
        `insert into services(business_id, category_id, key, name, price_type, price_cents, active_min) values ($1,$2,'womens_cut',$3,'fixed',3500,45) returning id`,
        [b.id, cat.id, s.name],
      );
      const svc: BookableService = { ...s, id: row.id };
      const book = async (start: string) => {
        const r = buildBooking({ services: [svc], start: new Date(start), rules, policy, client, now: new Date("2026-11-26T00:00:00Z") });
        const [x] = await q(`select book_appointment($1::jsonb) id`, [JSON.stringify({ ...r.payload, business_id: b.id, client_id: cl.id, staff_id: st.id })]);
        return x.id as string;
      };

      // --- No-show, full price, nothing collected → balance + flag, time freed
      const a1 = await book("2026-12-01T21:30:00Z");
      const s1 = settleCancel({ kind: "full" }, 3500, 0, { refundDepositIfNoCharge: true, collectNow: false });
      await q(`select cancel_appointment($1::jsonb)`, [JSON.stringify({
        appointment_id: a1, status: "no_show", cancelled_by: "client", fee_cents: s1.fee, flag_type: "no_show",
        balance_cents: s1.balance, refund_cents: s1.refund, collect: null,
      })]);
      expect((await q(`select status from appointments where id=$1`, [a1]))[0].status).toBe("no_show");
      expect((await q(`select amount_cents from balances where appointment_id=$1`, [a1]))[0].amount_cents).toBe(3500);
      expect((await q(`select type, fee_charged_cents from client_flags where appointment_id=$1`, [a1]))[0]).toEqual({ type: "no_show", fee_charged_cents: 3500 });
      expect((await q(`select count(*)::int n from staff_busy_blocks`))[0].n).toBe(0);

      // Same time can be booked again; can't close the no-show twice.
      const a2 = await book("2026-12-01T21:30:00Z");
      await db.query("savepoint s");
      await expect(q(`select cancel_appointment($1::jsonb)`, [JSON.stringify({ appointment_id: a1, status: "cancelled" })])).rejects.toMatchObject({ code: "P0002" });
      await db.query("rollback to savepoint s");

      // --- Checkout a2: raise price to $40, $8 tip, paid by Venmo
      const [line] = await q(`select id from appointment_services where appointment_id=$1`, [a2]);
      const t = checkoutTotals({ prices: [4000], tip: 800, depositPaid: 0, paid: 4800 });
      await q(`select checkout_appointment($1::jsonb)`, [JSON.stringify({
        appointment_id: a2, lines: [{ id: line.id, price_cents: 4000 }], tip_cents: t.tip,
        payment: { method: "venmo_direct", amount_cents: t.paid, tip_cents: t.tipPaid, reference: "venmo #123" },
        balance_cents: t.balance, refund_cents: t.refund,
      })]);
      expect((await q(`select status from appointments where id=$1`, [a2]))[0].status).toBe("completed");
      expect((await q(`select price_quoted_cents from appointment_services where id=$1`, [line.id]))[0].price_quoted_cents).toBe(4000);
      expect(await q(`select kind, method, amount_cents from payments where appointment_id=$1 order by kind`, [a2])).toEqual([
        { kind: "service", method: "venmo_direct", amount_cents: 4000 },
        { kind: "tip", method: "venmo_direct", amount_cents: 800 },
      ]);
      // Completed visits count as on-time.
      expect((await q(`select on_time from appointments where id=$1`, [a2]))[0].on_time).toBe(true);
    } finally {
      await db.query("rollback");
      await db.end();
    }
  });
});
