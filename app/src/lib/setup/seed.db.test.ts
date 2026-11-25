/**
 * Inserts the first-run seed into a real Postgres with all migrations applied.
 * Runs only when TEST_DATABASE_URL is set (skipped in normal test runs).
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { businessRow, categoryRows, serviceRows } from "./seed";

const url = process.env.TEST_DATABASE_URL;

function insertSql(table: string, rows: Record<string, unknown>[]) {
  const cols = Object.keys(rows[0]);
  const values: unknown[] = [];
  const tuples = rows.map(
    (r) =>
      `(${cols
        .map((c) => {
          values.push(r[c]);
          return `$${values.length}`;
        })
        .join(",")})`,
  );
  return { text: `insert into ${table} (${cols.join(",")}) values ${tuples.join(",")} returning *`, values };
}

const json = (r: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(r).map(([k, v]) => [k, v && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : v]),
  );

describe.skipIf(!url)("seed against real schema", () => {
  it("creates the business, categories and services", async () => {
    const db = new pg.Client({ connectionString: url });
    await db.connect();
    try {
      await db.query("begin");
      const b = (await db.query(insertSql("businesses", [json(businessRow("Intensity Salon"))]))).rows[0];
      const cats = (await db.query(insertSql("service_categories", categoryRows(b.id)))).rows;
      const ids = Object.fromEntries(cats.map((c) => [c.key, c.id]));
      const svcs = (await db.query(insertSql("services", serviceRows(b.id, ids)))).rows;
      expect(svcs).toHaveLength(18);
      expect(b.policy_settings.flags.clearAfterOnTimeVisits).toBe(4);
      expect(b.payment_methods.methods.length).toBeGreaterThan(10);
      await db.query("rollback");
    } finally {
      await db.end();
    }
  });
});
