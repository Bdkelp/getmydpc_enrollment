#!/usr/bin/env node
/**
 * fix-billing-date-day-drift.mjs
 *
 * One-time data correction for subscriptions whose next_billing_date day has
 * drifted from the original enrollment anchor due to months with fewer days
 * (e.g. enrolled on Jan 31 → billed Feb 28 → next_billing_date became Mar 28
 * instead of Mar 31).
 *
 * Usage:
 *   node scripts/fix-billing-date-day-drift.mjs           # dry run (default)
 *   node scripts/fix-billing-date-day-drift.mjs --apply   # apply corrections
 */

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Load .env
// ---------------------------------------------------------------------------
const cwd = process.cwd();
const envPath = path.join(cwd, '.env');

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^"|"$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

const normalizeEnv = (v) => (v || '').replace(/["']/g, '').trim();
const supabaseUrl = normalizeEnv(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
const supabaseKey = normalizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: 'public' },
});

const args = process.argv.slice(2);
const applyMode = args.includes('--apply');

// ---------------------------------------------------------------------------
// Date helpers — mirrors server/utils/membership-dates.ts logic
// ---------------------------------------------------------------------------

/**
 * Given a billing date and the original enrollment anchor day, advance by one
 * month while snapping back to the anchor day (or the last valid day of that
 * month if the anchor day exceeds the month length).
 */
function calculateNextBillingDate(billingDate, anchorDay) {
  const d = new Date(billingDate);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth(); // 0-based

  const nextMonth = month + 1;
  const nextYear = year + (nextMonth > 11 ? 1 : 0);
  const nextMonthNorm = nextMonth % 12;

  // Last day of next month
  const daysInNextMonth = new Date(Date.UTC(nextYear, nextMonthNorm + 1, 0)).getUTCDate();
  const targetDay = Math.min(anchorDay, daysInNextMonth);

  return new Date(Date.UTC(nextYear, nextMonthNorm, targetDay));
}

/**
 * Snap an existing next_billing_date to the correct anchor day without
 * advancing by a full month — just fix the day within the same month.
 */
function snapToAnchorDay(nextBillingDate, anchorDay) {
  const d = new Date(nextBillingDate);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const targetDay = Math.min(anchorDay, daysInMonth);
  return new Date(Date.UTC(year, month, targetDay));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log(`\n🔍 Billing date day-drift fix — ${applyMode ? 'APPLY MODE' : 'DRY RUN'}\n`);

// Fetch all active subscriptions that have both start_date and next_billing_date
const { data: subscriptions, error: fetchError } = await supabase
  .from('subscriptions')
  .select('id, status, start_date, next_billing_date, member_id')
  .not('start_date', 'is', null)
  .not('next_billing_date', 'is', null)
  .in('status', ['active', 'pending']);

if (fetchError) {
  console.error('Failed to fetch subscriptions:', fetchError.message);
  process.exit(1);
}

console.log(`Fetched ${subscriptions.length} subscriptions with start_date + next_billing_date.\n`);

const drifted = [];

for (const sub of subscriptions) {
  const startDate = new Date(sub.start_date);
  const nextBilling = new Date(sub.next_billing_date);
  const anchorDay = startDate.getUTCDate();
  const currentDay = nextBilling.getUTCDate();

  // Determine if the next_billing_date day matches the anchor OR the last-day-of-month clamp
  const year = nextBilling.getUTCFullYear();
  const month = nextBilling.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const expectedDay = Math.min(anchorDay, daysInMonth);

  if (currentDay !== expectedDay) {
    const corrected = snapToAnchorDay(nextBilling, anchorDay);
    drifted.push({
      id: sub.id,
      member_id: sub.member_id,
      status: sub.status,
      anchor_day: anchorDay,
      current_next_billing: sub.next_billing_date,
      corrected_next_billing: corrected.toISOString(),
    });
  }
}

if (drifted.length === 0) {
  console.log('✅ No drift detected — all next_billing_date values match their enrollment anchor day.');
  process.exit(0);
}

console.log(`⚠️  Found ${drifted.length} subscription(s) with billing date drift:\n`);
for (const row of drifted) {
  console.log(
    `  sub ${row.id} (member ${row.member_id}) | status: ${row.status}\n` +
    `    anchor day: ${row.anchor_day}\n` +
    `    current:    ${row.current_next_billing}\n` +
    `    corrected:  ${row.corrected_next_billing}\n`
  );
}

if (!applyMode) {
  console.log('ℹ️  Dry run — no changes written. Re-run with --apply to correct these rows.\n');
  process.exit(0);
}

// Apply corrections
console.log('\n📝 Applying corrections...\n');
let successCount = 0;
let failCount = 0;

for (const row of drifted) {
  const { error: updateError } = await supabase
    .from('subscriptions')
    .update({ next_billing_date: row.corrected_next_billing })
    .eq('id', row.id);

  if (updateError) {
    console.error(`  ❌ Failed to update sub ${row.id}: ${updateError.message}`);
    failCount++;
  } else {
    console.log(`  ✅ Updated sub ${row.id} → ${row.corrected_next_billing}`);
    successCount++;
  }
}

console.log(`\nDone. ${successCount} corrected, ${failCount} failed.\n`);
