import fs from 'node:fs';
import path from 'node:path';
import { formatLocalDate } from '../shared/localDate';
import { getAllCommissionsNew } from '../server/storage';
import {
  buildDraftPayoutBatches,
  buildQuickBooksCsvFromBatch,
  getBatchDetails,
  syncCommissionLedgerFromFeed,
} from '../server/services/commission-ledger-service';
import { supabase } from '../server/lib/supabaseClient';

function csvPreview(csv: string, lines = 8): string[] {
  return String(csv || '')
    .split(/\r?\n/)
    .slice(0, lines)
    .filter(Boolean);
}

async function getCount(table: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('*', { head: true, count: 'exact' });

  if (error) {
    throw new Error(`Count failed for ${table}: ${error.message}`);
  }

  return Number(count || 0);
}

async function run(): Promise<void> {
  const today = formatLocalDate(new Date());

  const feed = await getAllCommissionsNew();
  const syncResult = await syncCommissionLedgerFromFeed(feed || []);

  const ledgerCountAfterSync = await getCount('commission_ledger');

  const generatedBatches = await buildDraftPayoutBatches(today);
  const batchCountAfterGenerate = await getCount('commission_payout_batches');

  let firstBatchSummary: any = null;
  let statementPreview: any = null;
  let quickBooksPreview: string[] = [];
  let flaggedRows: any[] = [];

  if (Array.isArray(generatedBatches) && generatedBatches.length > 0) {
    const firstBatch = generatedBatches[0];
    const detail = await getBatchDetails(firstBatch.id);

    const rows = Array.isArray(detail?.rows) ? detail.rows : [];
    const byAgent = Array.isArray(detail?.byAgent) ? detail.byAgent : [];
    const firstAgent = byAgent[0] || null;

    firstBatchSummary = {
      id: detail?.batch?.id,
      batchName: detail?.batch?.batch_name,
      batchType: detail?.batch?.batch_type,
      cutoffDate: detail?.batch?.cutoff_date,
      scheduledPayDate: detail?.batch?.scheduled_pay_date,
      status: detail?.batch?.status,
      totalAmount: Number(detail?.batch?.total_amount || 0),
      totalAgents: Number(detail?.batch?.total_agents || 0),
      totalRecords: Number(detail?.batch?.total_records || 0),
    };

    if (firstAgent) {
      const agentItems = Array.isArray(firstAgent.items) ? firstAgent.items : [];
      const subtotal = agentItems
        .filter((item: any) => item.commission_type !== 'adjustment' && item.commission_type !== 'reversal')
        .reduce((sum: number, item: any) => sum + Number(item.commission_amount || 0), 0);
      const adjustments = agentItems
        .filter((item: any) => item.commission_type === 'adjustment' || item.commission_type === 'reversal')
        .reduce((sum: number, item: any) => sum + Number(item.commission_amount || 0), 0);

      statementPreview = {
        agentId: firstAgent.agentId,
        agentName: firstAgent.agentName,
        writingNumber: firstAgent.writingNumber,
        lineCount: agentItems.length,
        subtotal,
        adjustments,
        totalPayout: subtotal + adjustments,
        sampleLines: agentItems.slice(0, 3).map((row: any) => ({
          ledgerId: row.id,
          memberName: row.member_name,
          memberId: row.member_id,
          commissionAmount: Number(row.commission_amount || 0),
          commissionType: row.commission_type,
          status: row.status,
        })),
      };
    }

    const quickbooksCsv = buildQuickBooksCsvFromBatch(detail.batch, rows);
    quickBooksPreview = csvPreview(quickbooksCsv, 10);

    flaggedRows = rows
      .filter((row: any) => !['queued', 'paid'].includes(String(row.status || '').toLowerCase()))
      .slice(0, 50)
      .map((row: any) => ({
        id: row.id,
        status: row.status,
        memberId: row.member_id,
        memberName: row.member_name,
        payoutBatchId: row.payout_batch_id,
      }));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    runMode: 'controlled-ledger-go-live',
    constraints: {
      autoPayPerformed: false,
      backfillHistoryPerformed: false,
    },
    sync: {
      sourceCommissions: Array.isArray(feed) ? feed.length : 0,
      inserted: syncResult.inserted,
      skipped: syncResult.skipped,
      newlyEligible: syncResult.newlyEligible,
      ledgerCountAfterSync,
    },
    batches: {
      generatedCount: Array.isArray(generatedBatches) ? generatedBatches.length : 0,
      batchCountAfterGenerate,
      firstBatch: firstBatchSummary,
    },
    previews: {
      statementPreview,
      quickBooksPreview,
    },
    flagged: {
      skippedRows: syncResult.skipped,
      nonPayableRowsInFirstBatch: flaggedRows,
    },
  };

  const outDir = path.join(process.cwd(), 'tmp');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'controlled-ledger-go-live.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('\nControlled Ledger Go-Live');
  console.log('=========================');
  console.log(`Report file: ${outPath}`);
  console.log(`Source commissions: ${report.sync.sourceCommissions}`);
  console.log(`Sync inserted/skipped/newlyEligible: ${report.sync.inserted}/${report.sync.skipped}/${report.sync.newlyEligible}`);
  console.log(`Ledger rows after sync: ${report.sync.ledgerCountAfterSync}`);
  console.log(`Draft batches generated: ${report.batches.generatedCount}`);
  if (report.batches.firstBatch) {
    console.log(`First batch total: ${report.batches.firstBatch.totalAmount} across ${report.batches.firstBatch.totalRecords} rows / ${report.batches.firstBatch.totalAgents} agents`);
  }
  if (report.previews.statementPreview) {
    console.log(`Statement preview agent: ${report.previews.statementPreview.agentName}`);
  }
  console.log(`QuickBooks preview lines: ${report.previews.quickBooksPreview.length}`);
  console.log(`Flagged non-payable rows in first batch: ${report.flagged.nonPayableRowsInFirstBatch.length}`);
}

run().catch((error) => {
  console.error('Controlled go-live failed:', error.message || error);
  process.exit(1);
});
