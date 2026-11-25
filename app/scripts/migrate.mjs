// Applies pending SQL files from ../supabase/migrations to the Supabase
// database. Runs before `next build` on Vercel production builds only, so a
// failing migration stops the deploy instead of shipping code that needs it.
//
// Applied files are recorded in chairvana_meta.schema_migrations (a schema the
// Supabase API doesn't expose). Each file runs in its own transaction.
//
// Usage: node scripts/migrate.mjs          (no-op outside Vercel production)
//        MIGRATE=1 node scripts/migrate.mjs (force, e.g. against a local db)

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(here, "../../supabase/migrations");

// Production builds only: Vercel production, or a Cloudflare Workers Build of
// the production branch (MIGRATE_BRANCH, default "main").
const force = process.env.MIGRATE === "1";
const vercelProd = process.env.VERCEL_ENV === "production";
const cloudflareProd =
  process.env.WORKERS_CI === "1" && process.env.WORKERS_CI_BRANCH === (process.env.MIGRATE_BRANCH ?? "main");
if (!force && !vercelProd && !cloudflareProd) {
  console.log(
    `[migrate] skipped (not a production build: VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}, WORKERS_CI_BRANCH=${process.env.WORKERS_CI_BRANCH ?? "unset"})`,
  );
  process.exit(0);
}

// Prefer the direct (session) connection; fall back to the pooled one.
const candidates = [process.env.POSTGRES_URL_NON_POOLING, process.env.POSTGRES_URL, process.env.DATABASE_URL].filter(Boolean);
if (candidates.length === 0) {
  console.error("[migrate] no database URL set (POSTGRES_URL_NON_POOLING / POSTGRES_URL)");
  process.exit(1);
}

/** Supabase uses its own CA; connect with TLS but without CA pinning. */
function clientFor(url) {
  const u = new URL(url);
  u.searchParams.delete("sslmode");
  u.searchParams.delete("supa");
  const local = ["localhost", "127.0.0.1"].includes(u.hostname) || u.hostname.startsWith("/");
  return new pg.Client({ connectionString: u.toString(), ssl: local ? false : { rejectUnauthorized: false } });
}

async function connect() {
  let lastErr;
  for (const url of candidates) {
    const c = clientFor(url);
    try {
      await c.connect();
      return c;
    } catch (e) {
      lastErr = e;
      console.warn(`[migrate] connection attempt failed (${e.code ?? e.message}); trying next`);
    }
  }
  throw lastErr;
}

const files = readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
const db = await connect();

try {
  await db.query(`create schema if not exists chairvana_meta`);
  await db.query(`revoke all on schema chairvana_meta from public`);
  await db.query(`create table if not exists chairvana_meta.schema_migrations (
    version text primary key,
    applied_at timestamptz not null default now()
  )`);

  // Baseline: 0001 and 0002 were applied by hand in the SQL Editor.
  const { rows: tracked } = await db.query(`select count(*)::int as n from chairvana_meta.schema_migrations`);
  if (tracked[0].n === 0) {
    const { rows } = await db.query(`select to_regclass('public.businesses') is not null as has_schema`);
    if (rows[0].has_schema) {
      for (const f of files.filter((f) => /^000[12]_/.test(f))) {
        await db.query(`insert into chairvana_meta.schema_migrations(version) values ($1) on conflict do nothing`, [f]);
        console.log(`[migrate] baseline: ${f} (already applied by hand)`);
      }
    }
  }

  const { rows: done } = await db.query(`select version from chairvana_meta.schema_migrations`);
  const applied = new Set(done.map((r) => r.version));
  const pending = files.filter((f) => !applied.has(f));

  for (const f of pending) {
    const sql = readFileSync(path.join(dir, f), "utf8");
    console.log(`[migrate] applying ${f}`);
    await db.query("begin");
    try {
      await db.query(sql);
      await db.query(`insert into chairvana_meta.schema_migrations(version) values ($1)`, [f]);
      await db.query("commit");
    } catch (e) {
      await db.query("rollback");
      console.error(`[migrate] FAILED in ${f}: ${e.message}`);
      process.exitCode = 1;
      break;
    }
  }
  if (!process.exitCode) console.log(`[migrate] up to date (${pending.length} applied, ${files.length} total)`);
} finally {
  await db.end();
}
