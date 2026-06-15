#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

const cwd = process.cwd();
const defaultEnvPath = path.join(cwd, ".env");
const envFileArg = process.argv.find((arg) => arg.startsWith("--env-file="));
const envFilePath = envFileArg
  ? path.resolve(cwd, envFileArg.slice("--env-file=".length).trim())
  : defaultEnvPath;

if (fs.existsSync(envFilePath)) {
  const content = fs.readFileSync(envFilePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line
      .slice(idx + 1)
      .trim()
      .replace(/^"|"$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

const normalize = (value) =>
  String(value || "")
    .replace(/["']/g, "")
    .trim();
const databaseUrl = normalize(
  process.env.DATABASE_URL || process.env.SUPABASE_DB_URL,
);
const migrationPath = path.join(
  cwd,
  "migrations",
  "20260613_add_agent_lineage_snapshots.sql",
);

if (!databaseUrl) {
  console.error("Missing DATABASE_URL (or SUPABASE_DB_URL) in environment");
  process.exit(1);
}

if (!fs.existsSync(migrationPath)) {
  console.error(`Migration file not found: ${migrationPath}`);
  process.exit(1);
}

const client = new Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

async function tableExists(tableName) {
  const result = await client.query("select to_regclass($1) as regclass", [
    tableName,
  ]);
  return Boolean(result.rows?.[0]?.regclass);
}

async function countRows(tableName) {
  const result = await client.query(
    `select count(*)::int as count from ${tableName}`,
  );
  return Number(result.rows?.[0]?.count || 0);
}

async function main() {
  await client.connect();

  const envRes = await client.query(
    "select value from public.platform_settings where key = 'payment_environment' limit 1",
  );

  const envValue = envRes.rows?.[0]?.value?.environment || null;
  if (String(envValue || "").toLowerCase() !== "sandbox") {
    console.error(
      `Refusing to run migration because payment_environment is '${envValue || "unknown"}' (expected sandbox)`,
    );
    process.exit(2);
  }

  const migrationSql = fs.readFileSync(migrationPath, "utf8");

  await client.query("begin");
  await client.query(migrationSql);
  await client.query("notify pgrst, 'reload schema'");
  await client.query("commit");

  const tableExistsAfter = await tableExists("public.agent_lineage_snapshots");

  const policyRes = await client.query(
    "select policyname from pg_policies where schemaname='public' and tablename='agent_lineage_snapshots' and policyname='agent_lineage_snapshots_service_role_only'",
  );

  const indexRes = await client.query(
    "select indexname from pg_indexes where schemaname='public' and tablename in ('agent_lineage_snapshots','agent_commissions','commission_ledger')",
  );

  const expectedIndexes = [
    "uq_agent_lineage_snapshots_member_payment",
    "uq_agent_lineage_snapshots_idempotency_key",
    "idx_agent_lineage_snapshots_member_id",
    "idx_agent_lineage_snapshots_payment_id",
    "idx_agent_commissions_lineage_snapshot_id",
    "idx_commission_ledger_lineage_snapshot_id",
  ];

  const existingIndexes = new Set(
    (indexRes.rows || []).map((row) => row.indexname),
  );
  const missingIndexes = expectedIndexes.filter(
    (idx) => !existingIndexes.has(idx),
  );

  const rlsRes = await client.query(
    "select relrowsecurity as rls_enabled, relforcerowsecurity as rls_forced from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='agent_lineage_snapshots'",
  );

  const rlsEnabled = Boolean(rlsRes.rows?.[0]?.rls_enabled);
  const rlsForced = Boolean(rlsRes.rows?.[0]?.rls_forced);

  const tableCount = await countRows("public.agent_lineage_snapshots");

  console.log("Sandbox lineage snapshot migration applied.");
  console.log(`payment_environment=${envValue}`);
  console.log(`table_exists=${tableExistsAfter}`);
  console.log(`rls_enabled=${rlsEnabled}`);
  console.log(`rls_forced=${rlsForced}`);
  console.log(`policy_exists=${policyRes.rowCount > 0}`);
  console.log(
    `missing_indexes=${missingIndexes.length > 0 ? missingIndexes.join(",") : "none"}`,
  );
  console.log(`agent_lineage_snapshots_count=${tableCount}`);
}

main()
  .catch(async (error) => {
    try {
      await client.query("rollback");
    } catch {
      // no-op
    }
    console.error("Failed applying sandbox migration:", error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await client.end().catch(() => {});
  });
