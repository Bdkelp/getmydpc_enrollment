#!/usr/bin/env node
/**
 * Check if a specific user exists in Supabase Auth and the users table.
 *
 * Usage examples:
 *   npx tsx server/scripts/check-supabase-user.ts
 *   npx tsx server/scripts/check-supabase-user.ts someone@example.com
 *
 * When no email is provided, the script defaults to Joaquin Davila.
 */
import { supabase } from "../lib/supabaseClient";

const DEFAULT_EMAIL = "joaquin@mypremierplans.com";
const argEmail = process.argv[2];
const targetEmail = (argEmail || process.env.SUPABASE_CHECK_EMAIL || DEFAULT_EMAIL).trim().toLowerCase();

async function main() {
  console.log("\n🔍 Checking Supabase for:", targetEmail);

  const results = {
    auth: null as null | any,
    db: null as null | any,
  };

  try {
    const { data: authUser, error: authError } = await supabase.auth.admin.getUserByEmail(targetEmail);
    if (authError && authError.message !== "User not found") {
      throw new Error(`Auth lookup failed: ${authError.message}`);
    }

    results.auth = authUser ?? null;

    const { data: dbUser, error: dbError } = await supabase
      .from("users")
      .select("id, email, first_name, last_name, role, agent_number, is_active, approval_status")
      .eq("email", targetEmail)
      .maybeSingle();

    if (dbError && dbError.code !== "PGRST116") {
      throw new Error(`Database lookup failed: ${dbError.message}`);
    }

    results.db = dbUser ?? null;
  } catch (error) {
    console.error("❌", error instanceof Error ? error.message : error);
    process.exit(1);
  }

  console.log("\n📊 Results:\n");
  if (results.auth) {
    console.log("✅ Supabase Auth: FOUND");
    console.log(`   ├─ ID: ${results.auth.id}`);
    console.log(`   ├─ Email confirmed: ${results.auth.email_confirmed_at ? "yes" : "no"}`);
    console.log(`   └─ Created: ${results.auth.created_at}`);
  } else {
    console.log("❌ Supabase Auth: NOT FOUND");
  }

  console.log("");

  if (results.db) {
    console.log("✅ users table: FOUND");
    console.log(`   ├─ ID: ${results.db.id}`);
    console.log(`   ├─ Name: ${results.db.first_name ?? ""} ${results.db.last_name ?? ""}`.trim());
    console.log(`   ├─ Role: ${results.db.role}`);
    console.log(`   ├─ Agent #: ${results.db.agent_number ?? "N/A"}`);
    console.log(`   └─ Status: ${results.db.is_active ? "active" : "inactive"} / ${results.db.approval_status}`);
  } else {
    console.log("❌ users table: NOT FOUND");
  }

  console.log("\nDone.\n");
}

main();
