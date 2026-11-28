/** rebook_appointment() against a real Postgres (runs only with TEST_DATABASE_URL). */
import pg from "pg";
import { describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("rebook_appointment", () => {
  it("moves to another stylist and time with new prices, keeps the deposit, refuses taken times", async () => {
    const db = new pg.Client({ connectionString: url });
    await db.connect();
    const q = async (sql: string, v: unknown[] = []) => (await db.query(sql, v)).rows;
    try {
      await db.query("begin");
      const [b] = await q(`insert into businesses(name, policy_settings) values ('T','{}') returning id`);
      const [sick] = await q(`insert into staff(business_id, display_name) values ($1,'Sick') returning id`, [b.id]);
      const [sub] = await q(`insert into staff(business_id, display_name) values ($1,'Sub') returning id`, [b.id]);
      const [cat] = await q(`insert into service_categories(business_id, key, name) values ($1,'c','C') returning id`, [b.id]);
      const [svc] = await q(`insert into services(business_id, category_id, key, name, price_type, price_cents, active_min) values ($1,$2,'cut','Cut','fixed',3500,45) returning id`, [b.id, cat.id]);
      const [cl] = await q(`insert into clients(business_id, first_name) values ($1,'Ana') returning id`, [b.id]);
      const book = async (staff: string, start: string, end: string) =>
        (await q(`select book_appointment($1::jsonb) id`, [JSON.stringify({
          business_id: b.id, client_id: cl.id, staff_id: staff, start_at: start, end_at: end, booked_via: "stylist", deposit_required_cents: 1000,
          services: [{ service_id: svc.id, list_price_cents: 3500, price_quoted_cents: 3500, sort: 0, busy: [{ phase: "active", start, end }] }],
        })]))[0].id;
      const appt = await book(sick.id, "2026-12-01T15:00:00Z", "2026-12-01T15:45:00Z");
      await q(`insert into payments(business_id, appointment_id, client_id, kind, method, amount_cents, status) values ($1,$2,$3,'deposit','zelle',1000,'succeeded')`, [b.id, appt, cl.id]).catch(() => null);

      // The substitute already has a cut at 16:00.
      await book(sub.id, "2026-12-01T16:00:00Z", "2026-12-01T16:45:00Z");
      const rebook = (start: string, end: string) =>
        q(`select rebook_appointment($1::jsonb)`, [JSON.stringify({
          appointment_id: appt, staff_id: sub.id, start_at: start, end_at: end,
          services: [{ service_id: svc.id, list_price_cents: 3500, price_quoted_cents: 3000, sort: 0, discounts: [{ source: "sick_day", label: "Sorry for the change", amount_cents: 500 }], busy: [{ phase: "active", start, end }] }],
        })]);

      await db.query("savepoint s");
      await expect(rebook("2026-12-01T16:15:00Z", "2026-12-01T17:00:00Z")).rejects.toMatchObject({ code: "23P01" });
      await db.query("rollback to savepoint s");

      await rebook("2026-12-01T15:00:00Z", "2026-12-01T15:45:00Z");
      const [a] = await q(`select staff_id, start_at, deposit_required_cents from appointments where id=$1`, [appt]);
      expect(a.staff_id).toBe(sub.id);
      expect(a.deposit_required_cents).toBe(1000);
      const [line] = await q(`select price_quoted_cents, discounts from appointment_services where appointment_id=$1`, [appt]);
      expect(line.price_quoted_cents).toBe(3000);
      expect(line.discounts[0].source).toBe("sick_day");
      const blocks = await q(`select staff_id from staff_busy_blocks where appointment_service_id in (select id from appointment_services where appointment_id=$1)`, [appt]);
      expect(blocks.map((x) => x.staff_id)).toEqual([sub.id]);

      await q(`update appointments set status='completed' where id=$1`, [appt]);
      await expect(rebook("2026-12-02T15:00:00Z", "2026-12-02T15:45:00Z")).rejects.toMatchObject({ code: "P0002" });
    } finally {
      await db.query("rollback");
      await db.end();
    }
  });
});
