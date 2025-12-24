#!/usr/bin/env node
/**
 * Reset a Supabase Auth user's password via the service role key.
 *
 * Usage examples:
 *   npx tsx server/scripts/reset-user-password.ts user@example.com
 *   npx tsx server/scripts/reset-user-password.ts user@example.com NewTempPass99!
 *
 * Optionally, set env vars:
 *   SUPABASE_RESET_EMAIL=user@example.com
 *   SUPABASE_RESET_PASSWORD="MyTempPass01$"
 */
import crypto from "crypto";
import { supabase } from "../lib/supabaseClient";

const argEmail = process.argv[2];
const argPassword = process.argv[3];

const targetEmail = (argEmail || process.env.SUPABASE_RESET_EMAIL || "").trim().toLowerCase();

if (!targetEmail) {
  console.error("Usage: npx tsx server/scripts/reset-user-password.ts <email> [newPassword]");
  process.exit(1);
}

const providedPassword = argPassword || process.env.SUPABASE_RESET_PASSWORD;

function generatePassword(): string {
  const adjectives = ["Brisk", "Calm", "Daring", "Eager", "Nimble", "Mighty", "Sharp", "Solid", "Swift", "Wise"];
  const nouns = ["Falcon", "Lion", "Orca", "Panther", "Raven", "Tiger", "Viper", "Wolf", "Yak", "Zebra"];
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const digits = crypto.randomInt(10, 99);
  const symbol = ["!", "@", "#", "$", "%", "&"][crypto.randomInt(0, 6)];
  return `${adjective}${noun}${digits}${symbol}`;
}

async function findUserByEmail(email: string) {
  const normalizedEmail = email.toLowerCase();
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(error.message);
    }

    const match = data.users?.find((user: any) => user.email?.toLowerCase() === normalizedEmail);
    if (match) return match;

    if (!data.users || data.users.length < perPage) {
      return null;
    }

    page += 1;
  }
}

async function main() {
  console.log(`\n[Reset] Looking up Supabase user for: ${targetEmail}`);

  const authUser = await findUserByEmail(targetEmail);
  if (!authUser) {
    console.error("[Reset] No Supabase Auth user found for", targetEmail);
    process.exit(1);
  }

  const newPassword = providedPassword || generatePassword();

  console.log(`[Reset] Updating password for user ${authUser.id}`);
  const { error: updateError } = await supabase.auth.admin.updateUserById(authUser.id, {
    password: newPassword,
  });

  if (updateError) {
    console.error("[Reset] Failed to update password:", updateError.message);
    process.exit(1);
  }

  console.log("[Reset] Password updated successfully!\n");
  console.log("================ TEMP PASSWORD ================");
  console.log(newPassword);
  console.log("================================================");
  console.log("Share this password securely and ask the user to change it after signing in.\n");
}

main().catch((error) => {
  console.error("[Reset] Unexpected error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
