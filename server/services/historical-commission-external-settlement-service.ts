import { neonPool } from "../lib/neonDb";

export const HISTORICAL_SETTLEMENT_KIND = "HISTORICAL_EXTERNAL_SETTLEMENT";
export const HISTORICAL_SETTLEMENT_EVENT = "historical_external_settlement";
export const HISTORICAL_SETTLEMENT_ACTOR =
  "system:historical-commission-cutover";
export const HISTORICAL_CUTOVER_MIGRATION =
  "scripts/sql/2026-08-20e_historical_commission_external_settlement_cutover.sql";

export type HistoricalCutover = {
  cutoverAt: string;
  reconciliationReference: string;
};

type SettlementPlanRow = {
  id: string;
  agent_id: string | null;
  agent_name: string;
  compensation_type: "writing" | "override";
  status: string;
  commission_amount: string;
  activity_at: string;
  source_payment_id: number | null;
  commission_source_payment_id: number | null;
};

export async function getHistoricalCutoverSchemaStatus(): Promise<{
  ready: boolean;
  missingRelations: string[];
  requiredMigration: string;
}> {
  const result = await neonPool.query<{ relation_name: string | null }>(
    `SELECT to_regclass('public.commission_financial_cutovers')::text AS relation_name`,
  );
  const ready = Boolean(result.rows[0]?.relation_name);
  return {
    ready,
    missingRelations: ready ? [] : ["public.commission_financial_cutovers"],
    requiredMigration: HISTORICAL_CUTOVER_MIGRATION,
  };
}

function referenceForDate(cutoverAt: string): string {
  return `MPP-HISTORICAL-CUTOVER-${new Date(cutoverAt).toISOString().slice(0, 10)}`;
}

export function isPreCutoverActivity(
  activityAt: string | Date,
  cutoverAt: string | Date,
): boolean {
  return new Date(activityAt).getTime() <= new Date(cutoverAt).getTime();
}

export async function ensureHistoricalCutover(): Promise<HistoricalCutover> {
  const result = await neonPool.query(
    `INSERT INTO commission_financial_cutovers
       (cutover_key, cutover_at, reconciliation_reference, instruction, created_by)
     VALUES ('commission_financial_cutover', NOW(), $1, $2, $3)
     ON CONFLICT (cutover_key) DO NOTHING
     RETURNING cutover_at, reconciliation_reference`,
    [
      referenceForDate(new Date().toISOString()),
      "All historical commissions were paid outside the platform before MPP commission-system cutover.",
      HISTORICAL_SETTLEMENT_ACTOR,
    ],
  );

  if (result.rows[0]) {
    return {
      cutoverAt: result.rows[0].cutover_at,
      reconciliationReference: result.rows[0].reconciliation_reference,
    };
  }

  const existing = await neonPool.query(
    `SELECT cutover_at, reconciliation_reference
       FROM commission_financial_cutovers
      WHERE cutover_key = 'commission_financial_cutover'`,
  );
  if (!existing.rows[0]) {
    throw new Error(
      "Historical commission cutover could not be loaded after insert",
    );
  }
  return {
    cutoverAt: existing.rows[0].cutover_at,
    reconciliationReference: existing.rows[0].reconciliation_reference,
  };
}

export async function getHistoricalCutover(): Promise<HistoricalCutover | null> {
  const result = await neonPool.query(
    `SELECT cutover_at, reconciliation_reference
       FROM commission_financial_cutovers
      WHERE cutover_key = 'commission_financial_cutover'`,
  );
  return result.rows[0]
    ? {
        cutoverAt: result.rows[0].cutover_at,
        reconciliationReference: result.rows[0].reconciliation_reference,
      }
    : null;
}

export async function loadHistoricalSettlementPlan(
  cutoverAt: string,
  onlyLedgerIds?: string[],
): Promise<{
  rows: SettlementPlanRow[];
  statuses: Record<string, number>;
  heldAmount: number;
  reversedAmount: number;
}> {
  const params: unknown[] = [cutoverAt];
  let filter = "";
  if (onlyLedgerIds?.length) {
    params.push(onlyLedgerIds);
    filter = " AND l.id = ANY($2::uuid[])";
  }
  const result = await neonPool.query<SettlementPlanRow>(
    `SELECT l.id, l.agent_id, l.agent_name,
            COALESCE(l.compensation_type, 'writing') AS compensation_type,
            l.status, l.commission_amount,
            COALESCE(p.payment_transaction_at, p.payment_confirmed_at, p.created_at,
                     l.created_at) AS activity_at,
            l.source_payment_id,
            ac.source_payment_id AS commission_source_payment_id
       FROM commission_ledger l
       LEFT JOIN agent_commissions ac ON ac.id = l.source_commission_id
       LEFT JOIN payments p ON p.id = COALESCE(l.source_payment_id, ac.source_payment_id)
      WHERE l.status IN ('earned', 'queued', 'carry_forward', 'held')
        AND COALESCE(p.payment_transaction_at, p.payment_confirmed_at, p.created_at,
                     l.created_at) <= $1::timestamptz${filter}
      ORDER BY l.agent_id, compensation_type, l.created_at, l.id`,
    params,
  );
  const rows = result.rows;
  const statuses: Record<string, number> = {};
  let heldAmount = 0;
  for (const row of rows) {
    statuses[row.status] = (statuses[row.status] || 0) + 1;
    if (row.status === "held") heldAmount += Number(row.commission_amount || 0);
  }
  const reversed = await neonPool.query(
    `SELECT COALESCE(SUM(commission_amount), 0) AS amount
       FROM commission_ledger
      WHERE status = 'reversed'
        AND created_at <= $1::timestamptz`,
    [cutoverAt],
  );
  return {
    rows,
    statuses,
    heldAmount,
    reversedAmount: Number(reversed.rows[0]?.amount || 0),
  };
}

export function summarizeHistoricalSettlementPlan(
  plan: Awaited<ReturnType<typeof loadHistoricalSettlementPlan>>,
) {
  const byType = { writing: 0, override: 0 };
  const agents = new Set<string>();
  for (const row of plan.rows) {
    byType[row.compensation_type] += Number(row.commission_amount || 0);
    if (row.agent_id) agents.add(row.agent_id);
  }
  return {
    agentsAffected: agents.size,
    rowsAffected: plan.rows.length,
    writingAmount: byType.writing,
    overrideAmount: byType.override,
    statuses: plan.statuses,
    heldAmount: plan.heldAmount,
    reversedAmount: plan.reversedAmount,
  };
}

export async function applyHistoricalExternalSettlement(
  cutover: HistoricalCutover,
  onlyLedgerIds?: string[],
) {
  const client = await neonPool.connect();
  try {
    await client.query("BEGIN");
    const planResult = await loadHistoricalSettlementPlan(
      cutover.cutoverAt,
      onlyLedgerIds,
    );
    const summary = summarizeHistoricalSettlementPlan(planResult);
    const batches: Record<string, string> = {};

    for (const compensationType of ["writing", "override"] as const) {
      const amount =
        compensationType === "writing"
          ? summary.writingAmount
          : summary.overrideAmount;
      const rows = planResult.rows.filter(
        (row) => row.compensation_type === compensationType,
      );
      if (!rows.length) continue;
      const compatibleBatchType =
        compensationType === "writing" ? "1st-cycle" : "15th-cycle";
      const batch = await client.query(
        `INSERT INTO commission_payout_batches
          (batch_name, batch_type, cutoff_date, scheduled_pay_date, total_amount,
           total_agents, total_records, status, compensation_type, settlement_kind,
           reconciliation_reference, reconciled_at, actual_external_payment_at,
           payment_date_known, reason)
         VALUES ($1, $2, $3::date, NULL, $4, $5, $6,
                 'externally_settled', $7, $8, $9, $10::timestamptz, NULL, false, $11)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          `Historical External ${compensationType === "writing" ? "Writing" : "Override"} Settlement`,
          compatibleBatchType,
          cutover.cutoverAt,
          amount,
          new Set(rows.map((row) => row.agent_id).filter(Boolean)).size,
          rows.length,
          compensationType,
          HISTORICAL_SETTLEMENT_KIND,
          cutover.reconciliationReference,
          cutover.cutoverAt,
          "Historical commission paid outside platform before MPP commission-system cutover.",
        ],
      );
      let batchId = batch.rows[0]?.id;
      if (!batchId) {
        const existing = await client.query(
          `SELECT id FROM commission_payout_batches
            WHERE reconciliation_reference = $1 AND compensation_type = $2
              AND settlement_kind = $3`,
          [
            cutover.reconciliationReference,
            compensationType,
            HISTORICAL_SETTLEMENT_KIND,
          ],
        );
        batchId = existing.rows[0]?.id;
      }
      if (!batchId)
        throw new Error(
          `Could not resolve historical ${compensationType} settlement batch`,
        );
      batches[compensationType] = batchId;

      const ids = rows.map((row) => row.id);
      await client.query(
        `INSERT INTO commission_ledger_events
          (ledger_id, event_type, from_status, to_status, payout_batch_id,
           reason, metadata, settlement_reference, settlement_kind)
         SELECT id, $1, status, 'externally_settled', $2,
                $3, jsonb_build_object('cutoverAt', $4::timestamptz,
                  'priorLedgerStatus', status, 'settlementAmount', commission_amount,
                  'compensationType', $5::text, 'settlementReference', $6::text,
                  'actor', $7::text, 'actualExternalPaymentAt', NULL,
                  'paymentDateKnown', false), $6, $8
           FROM commission_ledger
          WHERE id = ANY($9::uuid[])
         ON CONFLICT (ledger_id, event_type, settlement_reference)
           WHERE event_type = 'historical_external_settlement' DO NOTHING`,
        [
          HISTORICAL_SETTLEMENT_EVENT,
          batchId,
          "Historical commission paid outside platform before MPP commission-system cutover.",
          cutover.cutoverAt,
          compensationType,
          cutover.reconciliationReference,
          HISTORICAL_SETTLEMENT_ACTOR,
          HISTORICAL_SETTLEMENT_KIND,
          ids,
        ],
      );
      await client.query(
        `UPDATE commission_ledger
            SET status = 'externally_settled', payout_batch_id = $1,
                settlement_kind = $2, settlement_reference = $3,
                reconciled_at = $4::timestamptz,
                actual_external_payment_at = NULL, payment_date_known = false,
                metadata = COALESCE(metadata, '{}'::jsonb) || $5::jsonb
          WHERE id = ANY($6::uuid[])
            AND status IN ('earned', 'queued', 'carry_forward', 'held')`,
        [
          batchId,
          HISTORICAL_SETTLEMENT_KIND,
          cutover.reconciliationReference,
          cutover.cutoverAt,
          JSON.stringify({
            historicalExternalSettlement: true,
            settlementReference: cutover.reconciliationReference,
            actualExternalPaymentAt: null,
            paymentDateKnown: false,
          }),
          ids,
        ],
      );
    }

    await client.query("COMMIT");
    return { ...summary, batches };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
