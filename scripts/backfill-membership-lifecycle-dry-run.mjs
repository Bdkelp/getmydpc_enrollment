#!/usr/bin/env node

import {
  analyzeBackfillState,
  createSupabaseAdminClient,
  loadEnvFromDotEnv,
  writeReportFile,
} from './backfill-membership-lifecycle-lib.mjs';

async function main() {
  loadEnvFromDotEnv();
  const supabase = createSupabaseAdminClient();

  const report = await analyzeBackfillState(supabase);
  const reportPath = writeReportFile('membership-lifecycle-backfill-dry-run', report);

  console.log('\nMembership lifecycle backfill dry-run complete.');
  console.log(`Report: ${reportPath}`);
  console.log('');
  console.table(report.dryRunSummary);

  if (report.manualReview.length > 0) {
    console.log('\nManual review records (first 25):');
    console.table(report.manualReview.slice(0, 25).map((row) => ({
      type: row.type,
      memberId: row.memberId,
      subscriptionId: row.subscriptionId,
      reason: row.reason,
    })));
  }

  if (report.scheduledPlanChanges) {
    console.log('\nScheduled plan changes:');
    console.log(`  Total: ${report.scheduledPlanChanges.total}`);
    console.log(`  Past-due (not yet finalized): ${report.scheduledPlanChanges.pastDue}`);
    console.log(`  Missing effective_date: ${report.scheduledPlanChanges.missingEffectiveDate}`);
    if (report.scheduledPlanChanges.rows.length > 0) {
      console.table(report.scheduledPlanChanges.rows.map((r) => ({
        subscriptionId: r.subscriptionId,
        memberId: r.memberId,
        type: r.pendingType,
        effectiveDate: r.effectiveDate ?? '—',
        newAmount: r.newAmount,
        status: r.isPastDue ? 'PAST DUE' : r.isMissingEffectiveDate ? 'MISSING DATE' : 'pending',
      })));
    }
  }
}

main().catch((error) => {
  console.error('Dry-run failed:', error?.message || error);
  process.exit(1);
});
