/** stock_move() against a real Postgres (runs only with TEST_DATABASE_URL). */
import pg from "pg";
import { describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("stock_move", () => {
  it("keeps on-hand and history in step", async () => {
    const db = new pg.Client({ connectionString: url });
    await db.connect();
    const q = async (sql: string, v: unknown[] = []) => (await db.query(sql, v)).rows;
    const move = async (p: object) => Number((await q(`select stock_move($1::jsonb) n`, [JSON.stringify(p)]))[0].n);
    try {
      await db.query("begin");
      const [b] = await q(`insert into businesses(name, policy_settings) values ('T','{}') returning id`);
      const [p] = await q(`insert into products(business_id, brand, line, shade, name, size, unit) values ($1,'Redken','Shades EQ','09V','09V Platinum Ice',2,'oz') returning id`, [b.id]);
      expect(await move({ product_id: p.id, reason: "received", change: 6 })).toBe(6);
      expect(await move({ product_id: p.id, reason: "used", change: -0.75, amount: 1.5, unit: "oz" })).toBe(5.25);
      expect(await move({ product_id: p.id, reason: "count", count: 4 })).toBe(4);
      const moves = await q(`select reason, change::float, on_hand_after::float from stock_moves where product_id=$1 order by created_at, on_hand_after desc`, [p.id]);
      expect(moves).toEqual([
        { reason: "received", change: 6, on_hand_after: 6 },
        { reason: "used", change: -0.75, on_hand_after: 5.25 },
        { reason: "count", change: -1.25, on_hand_after: 4 },
      ]);
      // Same product twice is refused (case-insensitive).
      await db.query("savepoint s");
      await expect(q(`insert into products(business_id, brand, line, shade, name, size) values ($1,'redken','shades eq','09v','dup',2)`, [b.id])).rejects.toMatchObject({ code: "23505" });
      await db.query("rollback to savepoint s");
      await expect(move({ product_id: p.id, reason: "count", count: -1 })).rejects.toMatchObject({ code: "22023" });
    } finally {
      await db.query("rollback");
      await db.end();
    }
  });
});
