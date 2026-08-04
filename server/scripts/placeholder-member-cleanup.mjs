#!/usr/bin/env node
/**
 * Find members with obvious placeholder/training emails (e.g. email@email.com,
 * john@email.com, anyemail@email.com, test@test.com) and delete them ONLY if
 * they have no REAL payment attempt anywhere (recurring_billing_log,
 * agent_commissions, or a payments row that isn't just a cancelled/abandoned
 * checkout stub with no EPX auth GUID). Any candidate with a real payment
 * attempt on record is always skipped, never deleted.
 *
 * Modes:
 *   (default)  Dry run — finds candidates, prints the list, makes NO writes.
 *   --apply    Deletes only the members that passed the zero-payment-history
 *              check, along with their dependent rows (subscriptions,
 *              group_members, payment_tokens, etc.), in a single transaction
 *              per member.
 *
 * Usage:
 *   node server/scripts/placeholder-member-cleanup.mjs
 *   node server/scripts/placeholder-member-cleanup.mjs --apply
 */

import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 3,
});

// Common placeholder/training-data email patterns seen in test enrollments.
const PLACEHOLDER_EMAIL_PATTERN =
  /^(email|anyemail|test|testemail|sample|placeholder|noemail|foo|bar|asdf|qwerty|xyz|abc|demo|fake|dummy)@|@(email|test|example|sample|placeholder|noemail|domain|mydomain)\.com$/i;

async function main() {
  const membersResult = await pool.query(
    `SELECT id, first_name, last_name, email, status, is_active, created_at
     FROM members
     ORDER BY id ASC`,
  );

  const candidates = membersResult.rows.filter((m) =>
    PLACEHOLDER_EMAIL_PATTERN.test(String(m.email || "").trim()),
  );

  if (candidates.length === 0) {
    console.log("No members found with placeholder-looking emails.");
    await pool.end();
    return;
  }

  const memberIds = candidates.map((c) => c.id);
  const memberIdsAsText = memberIds.map((id) => String(id));

  const [paymentsRes, billingLogRes, commissionsRes, subsRes] =
    await Promise.all([
      pool.query(
        `SELECT member_id, status, epx_auth_guid FROM payments WHERE member_id = ANY($1::int[])`,
        [memberIds],
      ),
      pool.query(
        `SELECT DISTINCT member_id FROM recurring_billing_log WHERE member_id = ANY($1::int[])`,
        [memberIds],
      ),
      pool.query(
        `SELECT DISTINCT member_id::text AS member_id FROM agent_commissions WHERE member_id::text = ANY($1::text[])`,
        [memberIdsAsText],
      ),
      pool.query(
        `SELECT member_id, id AS subscription_id, status FROM subscriptions WHERE member_id = ANY($1::int[])`,
        [memberIds],
      ),
    ]);

  // A payments row only counts as a REAL attempt if it isn't a cancelled
  // checkout stub with no EPX auth GUID (i.e. no charge was ever authorized).
  const withPayments = new Set(
    paymentsRes.rows
      .filter(
        (r) =>
          String(r.status || "").toLowerCase() !== "cancelled" ||
          r.epx_auth_guid,
      )
      .map((r) => r.member_id),
  );
  const withBillingLog = new Set(billingLogRes.rows.map((r) => r.member_id));
  const withCommissions = new Set(
    commissionsRes.rows.map((r) => Number(r.member_id)),
  );
  const subsByMember = new Map();
  for (const row of subsRes.rows) {
    if (!subsByMember.has(row.member_id)) subsByMember.set(row.member_id, []);
    subsByMember.get(row.member_id).push(row);
  }

  const safeToDelete = [];
  const blocked = [];

  for (const c of candidates) {
    const hasPayment =
      withPayments.has(c.id) ||
      withBillingLog.has(c.id) ||
      withCommissions.has(c.id);
    if (hasPayment) {
      blocked.push({
        ...c,
        reason: "has payment/billing-log/commission history — NOT deleted",
      });
    } else {
      safeToDelete.push({ ...c, subscriptions: subsByMember.get(c.id) || [] });
    }
  }

  console.log(`\nPlaceholder-email candidates found: ${candidates.length}`);
  console.log(
    `  Safe to delete (zero payment history): ${safeToDelete.length}`,
  );
  console.log(
    `  Blocked (has payment history, will NOT be deleted): ${blocked.length}\n`,
  );

  if (blocked.length) {
    console.log("BLOCKED (kept):");
    for (const b of blocked) {
      console.log(
        `  Member #${b.id} ${b.first_name} ${b.last_name} <${b.email}> — ${b.reason}`,
      );
    }
    console.log("");
  }

  console.log(`${APPLY ? "DELETING" : "WOULD DELETE"}:`);
  for (const s of safeToDelete) {
    const subInfo = s.subscriptions.length
      ? s.subscriptions
          .map((x) => `sub#${x.subscription_id}(${x.status})`)
          .join(", ")
      : "no subscriptions";
    console.log(
      `  Member #${s.id} ${s.first_name} ${s.last_name} <${s.email}> status=${s.status} created=${s.created_at} — ${subInfo}`,
    );
  }

  if (!APPLY) {
    console.log(
      "\nDry run only — no changes made. Re-run with --apply to delete the safe list above.",
    );
    await pool.end();
    return;
  }

  if (safeToDelete.length === 0) {
    console.log("\nNothing to delete.");
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    for (const s of safeToDelete) {
      await client.query("BEGIN");
      await client.query(`DELETE FROM group_members WHERE member_id = $1`, [
        s.id,
      ]);
      await client.query(
        `DELETE FROM family_members WHERE primary_member_id = $1`,
        [s.id],
      );
      await client.query(
        `DELETE FROM enrollment_modifications WHERE member_id = $1`,
        [s.id],
      );
      await client.query(
        `DELETE FROM admin_notifications WHERE member_id = $1`,
        [s.id],
      );
      await client.query(
        `DELETE FROM member_change_requests WHERE member_id = $1`,
        [s.id],
      );
      await client.query(`DELETE FROM billing_schedule WHERE member_id = $1`, [
        s.id,
      ]);
      await client.query(
        `DELETE FROM recurring_billing_log WHERE member_id = $1`,
        [s.id],
      );
      await client.query(`DELETE FROM payments WHERE member_id = $1`, [s.id]);
      await client.query(`DELETE FROM payment_tokens WHERE member_id = $1`, [
        s.id,
      ]);
      await client.query(`DELETE FROM subscriptions WHERE member_id = $1`, [
        s.id,
      ]);
      await client.query(`DELETE FROM members WHERE id = $1`, [s.id]);
      await client.query("COMMIT");
      console.log(`  Deleted member #${s.id} <${s.email}>`);
    }
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Deletion failed, rolled back current member:", error);
  } finally {
    client.release();
  }

  await pool.end();
}

main().catch(async (error) => {
  console.error("[placeholder-member-cleanup] failed:", error);
  await pool.end();
  process.exit(1);
});
