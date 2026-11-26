/** settle_balance() against a real Postgres (runs only with TEST_DATABASE_URL). */
import pg from "pg";
import { describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("settle_balance()", () => {
  it("records the payment once and links it", async () => {
    const db = new pg.Client({ connectionString: url });
    await db.connect();
    const q = async (sql: string, v: unknown[] = []) => (await db.query(sql, v)).rows;
    try {
      await db.query("begin");
      const [b] = await q(`insert into businesses(name, policy_settings) values ('T','{}') returning id`);
      const [c] = await q(`insert into clients(business_id, first_name) values ($1,'Ana') returning id`, [b.id]);
      const [bal] = await q(`insert into balances(business_id, client_id, amount_cents, reason) values ($1,$2,6250,'Late cancellation fee') returning id`, [b.id, c.id]);

      const [{ id: payId }] = await q(`select settle_balance($1::jsonb) id`, [JSON.stringify({ balance_id: bal.id, method: "zelle", reference: "Z-1" })]);
      expect(await q(`select kind, method, amount_cents, status from payments where id=$1`, [payId])).toEqual([
        { kind: "balance", method: "zelle", amount_cents: 6250, status: "succeeded" },
      ]);
      expect((await q(`select settled_payment_id from balances where id=$1`, [bal.id]))[0].settled_payment_id).toBe(payId);

      await db.query("savepoint s");
      await expect(q(`select settle_balance($1::jsonb)`, [JSON.stringify({ balance_id: bal.id, method: "cash" })])).rejects.toMatchObject({ code: "P0002" });
      await db.query("rollback to savepoint s");
      expect((await q(`select count(*)::int n from payments`))[0].n).toBe(1);
    } finally {
      await db.query("rollback");
      await db.end();
    }
  });
});
