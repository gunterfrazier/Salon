/** purge_clients() against a real Postgres (runs only with TEST_DATABASE_URL). */
import pg from "pg";
import { describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("purge_clients", () => {
  it("removes test clients with their bookings and payments, and nothing else", async () => {
    const db = new pg.Client({ connectionString: url });
    await db.connect();
    const q = async (sql: string, v: unknown[] = []) => (await db.query(sql, v)).rows;
    try {
      await db.query("begin");
      const [b] = await q(`insert into businesses(name, policy_settings) values ('T','{}') returning id`);
      const [other] = await q(`insert into businesses(name, policy_settings) values ('Other','{}') returning id`);
      const [st] = await q(`insert into staff(business_id, display_name) values ($1,'S') returning id`, [b.id]);
      const [cat] = await q(`insert into service_categories(business_id, key, name) values ($1,'c','C') returning id`, [b.id]);
      const [svc] = await q(`insert into services(business_id, category_id, key, name, price_type, price_cents, active_min) values ($1,$2,'cut','Cut','fixed',3500,45) returning id`, [b.id, cat.id]);
      const [test] = await q(`insert into clients(business_id, first_name) values ($1,'Test') returning id`, [b.id]);
      const [real] = await q(`insert into clients(business_id, first_name) values ($1,'Real') returning id`, [b.id]);
      const [elsewhere] = await q(`insert into clients(business_id, first_name) values ($1,'Elsewhere') returning id`, [other.id]);
      const book = async (client: string, start: string, end: string) =>
        (await q(`select book_appointment($1::jsonb) id`, [JSON.stringify({
          business_id: b.id, client_id: client, staff_id: st.id, start_at: start, end_at: end, status: "pending", booked_via: "online", deposit_required_cents: 3500,
          services: [{ service_id: svc.id, list_price_cents: 3500, price_quoted_cents: 3500, sort: 0, busy: [{ phase: "active", start, end }] }],
        })]))[0].id;
      const testAppt = await book(test.id, "2026-12-01T15:00:00Z", "2026-12-01T16:00:00Z");
      const realAppt = await book(real.id, "2026-12-01T17:00:00Z", "2026-12-01T18:00:00Z");
      await q(`select mark_deposit_received($1::jsonb)`, [JSON.stringify({ appointment_id: testAppt, amount_cents: 3500, method: "zelle" })]);
      await q(`insert into messages(business_id, client_id, appointment_id, channel, template, body, dedupe_key) values ($1,$2,$3,'sms','reminder','x','k1')`, [b.id, test.id, testAppt]);

      // Another salon's client can't be removed through this salon.
      const r = (await q(`select purge_clients($1, $2::uuid[]) r`, [b.id, [test.id, elsewhere.id]]))[0].r;
      expect(r).toEqual({ clients: 1, appointments: 1 });
      expect(await q(`select id from clients where id = any($1::uuid[])`, [[test.id, real.id, elsewhere.id]])).toHaveLength(2);
      expect(await q(`select id from appointments where id = any($1::uuid[])`, [[testAppt, realAppt]])).toEqual([{ id: realAppt }]);
      expect(await q(`select id from payments where appointment_id = $1`, [testAppt])).toHaveLength(0);
      expect(await q(`select id from messages where client_id = $1`, [test.id])).toHaveLength(0);
    } finally {
      await db.query("rollback");
      await db.end();
    }
  });
});
