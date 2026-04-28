#!/usr/bin/env node

import {
  analyzeBackfillState,
  applyBackfillPlan,
  createSupabaseAdminClient,
  loadEnvFromDotEnv,
  writeReportFile,
} from './backfill-membership-lifecycle-lib.mjs';

const args = process.argv.slice(2);
const confirm = args.includes('--apply');

async function main() {
  if (!confirm) {
    console.error('Refusing to run apply mode without --apply');
    process.exit(1);
  }

  loadEnvFromDotEnv();
  const supabase = createSupabaseAdminClient();

  const dryRunReport = await analyzeBackfillState(supabase);
  const dryRunPath = writeReportFile('membership-lifecycle-backfill-pre-apply-dry-run', dryRunReport);

  const applied = await applyBackfillPlan(supabase, dryRunReport);
  const applyPath = writeReportFile('membership-lifecycle-backfill-apply-results', {
    dryRunReportPath: dryRunPath,
    dryRunSummary: dryRunReport.dryRunSummary,
    proposedCounts: {
      nextBillingDateFixes: dryRunReport.proposedChanges.nextBillingDateFixes.length,
      scheduledCancellationFixes: dryRunReport.proposedChanges.scheduledCancellationFixes.length,
      commissionBackfills: dryRunReport.proposedChanges.commissionBackfills.length,
      manualReview: dryRunReport.manualReview.length,
    },
    applied,
  });

  console.log('\nMembership lifecycle backfill apply complete.');
  console.log(`Pre-apply dry-run report: ${dryRunPath}`);
  console.log(`Apply results: ${applyPath}`);
  console.log('');
  console.table({
    nextBillingDateFixesApplied: applied.nextBillingDateFixesApplied.length,
    scheduledCancellationFixesApplied: applied.scheduledCancellationFixesApplied.length,
    commissionBackfillsApplied: applied.commissionBackfillsApplied.length,
    skipped: applied.skipped.length,
    manualReviewRemaining: dryRunReport.manualReview.length,
  });

  if (applied.skipped.length > 0) {
    console.log('\nSkipped changes (first 25):');
    console.table(applied.skipped.slice(0, 25));
  }
}

main().catch((error) => {
  console.error('Apply failed:', error?.message || error);
  process.exit(1);
});
