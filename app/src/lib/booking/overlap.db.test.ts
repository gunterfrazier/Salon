/** Confirmed double-bookings against a real Postgres (runs only with TEST_DATABASE_URL). */
import pg from "pg";
import { describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("double-booking", () => {
  it("refuses an overlap unless the stylist confirmed it", async () => {
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
      const book = (start: string, end: string, extra: Record<string, unknown> = {}) =>
        q(`select book_appointment($1::jsonb) id`, [JSON.stringify({
          business_id: b.id, client_id: cl.id, staff_id: st.id, start_at: start, end_at: end, status: "booked",
          services: [{ service_id: svc.id, list_price_cents: 3500, price_quoted_cents: 3500, sort: 0, busy: [{ phase: "active", start, end }] }],
          ...extra,
        })]);
      await book("2026-12-01T15:00:00Z", "2026-12-01T16:00:00Z");
      await db.query("savepoint s");
      await expect(book("2026-12-01T15:30:00Z", "2026-12-01T16:30:00Z")).rejects.toMatchObject({ code: "23P01" });
      await db.query("rollback to savepoint s");
      const [ok] = await book("2026-12-01T15:30:00Z", "2026-12-01T16:30:00Z", { allow_overlap: true, outside_hours: true });
      expect(await q(`select outside_hours from appointments where id=$1`, [ok.id])).toEqual([{ outside_hours: true }]);
      expect(await q(`select overlap_ok from staff_busy_blocks b join appointment_services s on s.id=b.appointment_service_id where s.appointment_id=$1`, [ok.id])).toEqual([{ overlap_ok: true }]);
    } finally {
      await db.query("rollback");
      await db.end();
    }
  });
});
