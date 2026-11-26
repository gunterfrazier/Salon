/** release_pending_hold() against a real Postgres (runs only with TEST_DATABASE_URL). */
import pg from "pg";
import { describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("release_pending_hold", () => {
  it("releases only unpaid pending holds and frees the time", async () => {
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
      const book = async (start: string, end: string) =>
        (await q(`select book_appointment($1::jsonb) id`, [JSON.stringify({
          business_id: b.id, client_id: cl.id, staff_id: st.id, start_at: start, end_at: end, status: "pending", booked_via: "online", deposit_required_cents: 3500,
          services: [{ service_id: svc.id, list_price_cents: 3500, price_quoted_cents: 3500, sort: 0, busy: [{ phase: "active", start, end }] }],
        })]))[0].id;

      const unpaid = await book("2026-12-01T15:00:00Z", "2026-12-01T16:00:00Z");
      const paid = await book("2026-12-01T17:00:00Z", "2026-12-01T18:00:00Z");
      await q(`select mark_deposit_received($1::jsonb)`, [JSON.stringify({ appointment_id: paid, amount_cents: 3500, method: "zelle" })]);

      expect((await q(`select release_pending_hold($1) r`, [unpaid]))[0].r).toBe(true);
      expect((await q(`select release_pending_hold($1) r`, [unpaid]))[0].r).toBe(false);
      expect((await q(`select release_pending_hold($1) r`, [paid]))[0].r).toBe(false);
      expect(await q(`select status, cancel_reason from appointments where id=$1`, [unpaid])).toEqual([{ status: "cancelled", cancel_reason: "Deposit not received; hold released" }]);
      expect((await q(`select status from appointments where id=$1`, [paid]))[0].status).toBe("booked");
      // The released time can be booked again.
      await expect(book("2026-12-01T15:00:00Z", "2026-12-01T16:00:00Z")).resolves.toBeTruthy();

      // Outbox keys are unique per salon + channel.
      const ins = `insert into messages(business_id, channel, template, body, dedupe_key) values ($1,'sms','reminder','x','k1') on conflict (business_id, dedupe_key, channel) do nothing returning id`;
      expect(await q(ins, [b.id])).toHaveLength(1);
      expect(await q(ins, [b.id])).toHaveLength(0);
    } finally {
      await db.query("rollback");
      await db.end();
    }
  });
});
