/** move_appointment() against a real Postgres (runs only with TEST_DATABASE_URL). */
import pg from "pg";
import { describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("move_appointment", () => {
  it("shifts every block, even onto its own old time, and refuses overlaps", async () => {
    const db = new pg.Client({ connectionString: url });
    await db.connect();
    const q = async (sql: string, v: unknown[] = []) => (await db.query(sql, v)).rows;
    try {
      await db.query("begin");
      const [b] = await q(`insert into businesses(name, policy_settings) values ('T','{}') returning id`);
      const [st] = await q(`insert into staff(business_id, display_name) values ($1,'S') returning id`, [b.id]);
      const [cat] = await q(`insert into service_categories(business_id, key, name) values ($1,'c','C') returning id`, [b.id]);
      const [svc] = await q(`insert into services(business_id, category_id, key, name, price_type, price_cents, active_min) values ($1,$2,'color','Color','fixed',9500,45) returning id`, [b.id, cat.id]);
      const [cl] = await q(`insert into clients(business_id, first_name) values ($1,'Ana') returning id`, [b.id]);
      const book = async (start: string, end: string, busy: { phase: string; start: string; end: string }[]) =>
        (await q(`select book_appointment($1::jsonb) id`, [JSON.stringify({
          business_id: b.id, client_id: cl.id, staff_id: st.id, start_at: start, end_at: end, booked_via: "stylist",
          services: [{ service_id: svc.id, list_price_cents: 9500, price_quoted_cents: 9500, sort: 0, busy }],
        })]))[0].id;

      // Color: 45 min on, 45 min processing (open), 30 min finish.
      const color = await book("2026-12-01T15:00:00Z", "2026-12-01T17:00:00Z", [
        { phase: "active", start: "2026-12-01T15:00:00Z", end: "2026-12-01T15:45:00Z" },
        { phase: "finish", start: "2026-12-01T16:30:00Z", end: "2026-12-01T17:00:00Z" },
      ]);
      const blocks = async () => (await q(`select phase, lower(during) s, upper(during) e from staff_busy_blocks where staff_id=$1 order by 2`, [st.id])).map((r) => [r.phase, new Date(r.s).toISOString(), new Date(r.e).toISOString()]);

      // 30 minutes later: the new active block overlaps the old one.
      await q(`select move_appointment($1::jsonb)`, [JSON.stringify({ appointment_id: color, new_start: "2026-12-01T15:30:00Z" })]);
      expect(await blocks()).toEqual([
        ["active", "2026-12-01T15:30:00.000Z", "2026-12-01T16:15:00.000Z"],
        ["finish", "2026-12-01T17:00:00.000Z", "2026-12-01T17:30:00.000Z"],
      ]);
      expect((await q(`select start_at, end_at from appointments where id=$1`, [color]))[0].end_at.toISOString()).toBe("2026-12-01T17:30:00.000Z");

      // Another client's cut at 18:00; moving color onto it is refused and nothing changes.
      await book("2026-12-01T18:00:00Z", "2026-12-01T18:45:00Z", [{ phase: "active", start: "2026-12-01T18:00:00Z", end: "2026-12-01T18:45:00Z" }]);
      await db.query("savepoint s");
      await expect(q(`select move_appointment($1::jsonb)`, [JSON.stringify({ appointment_id: color, new_start: "2026-12-01T18:15:00Z" })])).rejects.toMatchObject({ code: "23P01" });
      await db.query("rollback to savepoint s");
      // ...but its processing gap can hold the cut: move color so 18:00 falls in processing.
      await q(`select move_appointment($1::jsonb)`, [JSON.stringify({ appointment_id: color, new_start: "2026-12-01T17:15:00Z" })]);

      await q(`update appointments set status='completed' where id=$1`, [color]);
      await expect(q(`select move_appointment($1::jsonb)`, [JSON.stringify({ appointment_id: color, new_start: "2026-12-02T15:00:00Z" })])).rejects.toMatchObject({ code: "P0002" });
    } finally {
      await db.query("rollback");
      await db.end();
    }
  });
});
