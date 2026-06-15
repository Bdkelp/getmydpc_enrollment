#!/usr/bin/env node

import fs from "node:fs";
import { Client } from "pg";

function loadEnvFile(filePath = ".env") {
  const env = { ...process.env };
  if (!fs.existsSync(filePath)) {
    return env;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line
      .slice(idx + 1)
      .trim()
      .replace(/^"|"$/g, "");
    if (!env[key]) env[key] = value;
  }

  return env;
}

function maskDatabaseUrl(urlValue) {
  if (!urlValue) return "(missing)";

  try {
    const url = new URL(urlValue);
    url.username = "***";
    url.password = "***";
    return url.toString();
  } catch {
    return String(urlValue).replace(/:\/\/[^@]+@/, "://***@");
  }
}

async function main() {
  const env = loadEnvFile(".env");
  const databaseUrl = env.DATABASE_URL || env.SUPABASE_DB_URL || "";

  console.log(
    `SUPABASE_URL=${env.SUPABASE_URL || env.VITE_SUPABASE_URL || "(missing)"}`,
  );
  console.log(`DATABASE_URL_MASKED=${maskDatabaseUrl(databaseUrl)}`);
  console.log(`EPX_ENVIRONMENT=${env.EPX_ENVIRONMENT || "(missing)"}`);
  console.log(`NODE_ENV=${env.NODE_ENV || "(missing)"}`);
  console.log(`APP_ENV=${env.APP_ENV || "(missing)"}`);

  if (!databaseUrl) {
    console.log("PAYMENT_ENVIRONMENT=(unavailable-no-database-url)");
    process.exit(0);
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    const paymentEnvironmentRes = await client.query(
      "select key, value, updated_at, updated_by from public.platform_settings where key = 'payment_environment' limit 1",
    );

    const allEnvironmentKeysRes = await client.query(
      "select key, value from public.platform_settings where key ilike '%environment%' order by key",
    );

    const basicDataSignalRes = await client.query(
      "select (select count(*)::int from public.members) as members_count, (select count(*)::int from public.payments) as payments_count, (select count(*)::int from public.agent_commissions) as commissions_count",
    );

    console.log(
      `PAYMENT_ENVIRONMENT_ROW=${JSON.stringify(paymentEnvironmentRes.rows?.[0] || null)}`,
    );
    console.log(
      `PLATFORM_ENVIRONMENT_KEYS=${JSON.stringify(allEnvironmentKeysRes.rows || [])}`,
    );
    console.log(
      `DATA_VOLUME_SIGNAL=${JSON.stringify(basicDataSignalRes.rows?.[0] || null)}`,
    );
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(`INSPECT_ERROR=${error.message || error}`);
  process.exit(1);
});
