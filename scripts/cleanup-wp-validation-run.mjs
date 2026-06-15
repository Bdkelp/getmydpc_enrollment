#!/usr/bin/env node

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const runId = process.argv[2];
if (!runId) {
  console.error("Usage: node scripts/cleanup-wp-validation-run.mjs <runId>");
  process.exit(1);
}

const env = { ...process.env };
if (fs.existsSync(".env")) {
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
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
}

const url = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(
  /["']/g,
  "",
);
const key = String(
  env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || "",
).replace(/["']/g, "");

if (!url || !key) {
  console.error("Missing Supabase URL or service key");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: "public" },
});

async function main() {
  const { data: users } = await supabase
    .from("users")
    .select("id,email")
    .ilike("email", `%${runId}%`);

  const userIds = (users || []).map((u) => String(u.id));

  const { data: members } = await supabase
    .from("members")
    .select("id,email")
    .ilike("email", `%${runId}%`);

  const memberIds = (members || []).map((m) => Number(m.id));

  if (memberIds.length > 0) {
    await supabase
      .from("agent_commissions")
      .delete()
      .in("member_id", memberIds.map(String));
    await supabase.from("payments").delete().in("member_id", memberIds);
    await supabase.from("subscriptions").delete().in("member_id", memberIds);
    await supabase.from("members").delete().in("id", memberIds);
  }

  if (userIds.length > 0) {
    await supabase
      .from("agent_hierarchy_history")
      .delete()
      .in("agent_id", userIds);
    await supabase.from("users").delete().in("id", userIds);
  }

  console.log(`cleanup_run_id=${runId}`);
  console.log(`cleanup_user_count=${userIds.length}`);
  console.log(`cleanup_member_count=${memberIds.length}`);
}

main().catch((error) => {
  console.error(`cleanup_error=${error.message || error}`);
  process.exit(1);
});
