/** Pending online bookings + mark_deposit_received() (runs only with TEST_DATABASE_URL). */
import pg from "pg";
import { describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("pending bookings", () => {
  it("pending holds the time; deposit received confirms it", async () => {
    const db = new pg.Client({ connectionString: url });
    await db.connect();
    const q = async (sql: string, v: unknown[] = []) => (await db.query(sql, v)).rows;
    try {
      await db.query("begin");
      const [b] = await q(`insert into businesses(name, policy_settings) values ('T','{}') returning id`);
      const [st] = await q(`insert into staff(business_id, display_name) values ($1,'S') returning id`, [b.id]);
      const [cat] = await q(`insert into service_categories(business_id, key, name) values ($1,'c','C') returning id`, [b.id]);
      const [svc] = await q(`insert into services(business_id, category_id, key, name, price_type, price_cents, active_min) values ($1,$2,'cut','Cut','fixed',3500,45) returning id`, [b.id, cat.id]);
      const [cl] = await q(`insert into clients(business_id, first_name) values ($1,'Ana') returning id`, [b.id]);
      const [pc] = await q(`insert into policy_consents(business_id, client_id, policy_version, policy_text) values ($1,$2,'v-1','text') returning id`, [b.id, cl.id]);
      const payload = (start: string, end: string, status?: string) => JSON.stringify({
        business_id: b.id, client_id: cl.id, staff_id: st.id, start_at: start, end_at: end, status, booked_via: "online",
        deposit_required_cents: 3500, policy_consent_id: pc.id,
        services: [{ service_id: svc.id, list_price_cents: 3500, price_quoted_cents: 3500, sort: 0, busy: [{ phase: "active", start, end }] }],
      });

      const [{ id }] = await q(`select book_appointment($1::jsonb) id`, [payload("2026-12-01T21:30:00Z", "2026-12-01T22:15:00Z", "pending")]);
      expect(await q(`select status, booked_via, policy_consent_id from appointments where id=$1`, [id])).toEqual([{ status: "pending", booked_via: "online", policy_consent_id: pc.id }]);

      // Pending still blocks the time.
      await db.query("savepoint s");
      await expect(q(`select book_appointment($1::jsonb)`, [payload("2026-12-01T21:45:00Z", "2026-12-01T22:30:00Z")])).rejects.toMatchObject({ code: "23P01" });
      await db.query("rollback to savepoint s");

      // Can't create other statuses.
      await db.query("savepoint s2");
      await expect(q(`select book_appointment($1::jsonb)`, [payload("2026-12-02T21:30:00Z", "2026-12-02T22:15:00Z", "completed")])).rejects.toMatchObject({ code: "22023" });
      await db.query("rollback to savepoint s2");

      await q(`select mark_deposit_received($1::jsonb)`, [JSON.stringify({ appointment_id: id, amount_cents: 3500, method: "zelle", reference: "Z-9" })]);
      expect((await q(`select status from appointments where id=$1`, [id]))[0].status).toBe("booked");
      expect(await q(`select kind, method, amount_cents, status from payments where appointment_id=$1`, [id])).toEqual([{ kind: "deposit", method: "zelle", amount_cents: 3500, status: "succeeded" }]);

      // Stylist bookings still default to booked.
      const [{ id: id2 }] = await q(`select book_appointment($1::jsonb) id`, [payload("2026-12-03T21:30:00Z", "2026-12-03T22:15:00Z")]);
      expect((await q(`select status from appointments where id=$1`, [id2]))[0].status).toBe("booked");
    } finally {
      await db.query("rollback");
      await db.end();
    }
  });
});
