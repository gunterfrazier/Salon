/** Retail at checkout and quick_sale() against a real Postgres (runs only with TEST_DATABASE_URL). */
import pg from "pg";
import { describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("retail", () => {
  it("sells products at checkout and as a quick sale, taking them out of stock", async () => {
    const db = new pg.Client({ connectionString: url });
    await db.connect();
    const q = async (sql: string, v: unknown[] = []) => (await db.query(sql, v)).rows;
    try {
      await db.query("begin");
      const [b] = await q(`insert into businesses(name, policy_settings) values ('T','{}') returning id`);
      const [st] = await q(`insert into staff(business_id, display_name) values ($1,'S') returning id`, [b.id]);
      const [cat] = await q(`insert into service_categories(business_id, key, name) values ($1,'c','C') returning id`, [b.id]);
      const [svc] = await q(`insert into services(business_id, category_id, key, name, price_type, price_cents, active_min) values ($1,$2,'cut','Cut','fixed',3000,45) returning id`, [b.id, cat.id]);
      const [cl] = await q(`insert into clients(business_id, first_name) values ($1,'Ana') returning id`, [b.id]);
      const [shampoo] = await q(`insert into products(business_id, kind, brand, line, name, price_cents, on_hand) values ($1,'retail','Redken','Acidic Bonding','Shampoo 10oz',2400,5) returning id`, [b.id]);
      const [{ id: appt }] = await q(`select book_appointment($1::jsonb) id`, [JSON.stringify({
        business_id: b.id, client_id: cl.id, staff_id: st.id, start_at: "2026-12-01T15:00:00Z", end_at: "2026-12-01T15:45:00Z", booked_via: "stylist",
        services: [{ service_id: svc.id, list_price_cents: 3000, price_quoted_cents: 3000, sort: 0, busy: [{ phase: "active", start: "2026-12-01T15:00:00Z", end: "2026-12-01T15:45:00Z" }] }],
      })]);
      const [line] = await q(`select id from appointment_services where appointment_id=$1`, [appt]);

      // Cut $30 + shampoo $24 + tip $10 = $64, paid by Venmo.
      await q(`select checkout_appointment($1::jsonb)`, [JSON.stringify({
        appointment_id: appt, lines: [{ id: line.id, price_cents: 3000 }], tip_cents: 1000,
        retail: [{ product_id: shampoo.id, qty: 1, price_cents: 2400 }],
        payment: { method: "venmo_direct", amount_cents: 6400, tip_cents: 1000, retail_cents: 2400 }, balance_cents: 0, refund_cents: 0,
      })]);
      expect(await q(`select kind, amount_cents from payments where appointment_id=$1 order by kind`, [appt])).toEqual([
        { kind: "service", amount_cents: 3000 }, { kind: "retail", amount_cents: 2400 }, { kind: "tip", amount_cents: 1000 },
      ]);
      expect(await q(`select name, qty::float, price_cents from sale_items where appointment_id=$1`, [appt])).toEqual([{ name: "Redken Acidic Bonding Shampoo 10oz", qty: 1, price_cents: 2400 }]);

      // Walk-in quick sale of 2, no client.
      const [{ id: sale }] = await q(`select quick_sale($1::jsonb) id`, [JSON.stringify({ business_id: b.id, items: [{ product_id: shampoo.id, qty: 2, price_cents: 2400 }], payment: { method: "cash" } })]);
      expect(await q(`select kind, amount_cents, client_id from payments where note=$1`, [`sale:${sale}`])).toEqual([{ kind: "retail", amount_cents: 4800, client_id: null }]);
      expect(Number((await q(`select on_hand from products where id=$1`, [shampoo.id]))[0].on_hand)).toBe(2);
      expect((await q(`select count(*)::int n from stock_moves where product_id=$1 and reason='sold'`, [shampoo.id]))[0].n).toBe(2);

      await expect(q(`select quick_sale($1::jsonb)`, [JSON.stringify({ business_id: b.id, items: [], payment: { method: "cash" } })])).rejects.toMatchObject({ code: "22023" });
    } finally {
      await db.query("rollback");
      await db.end();
    }
  });
});
