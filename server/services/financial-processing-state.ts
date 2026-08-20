import { supabase } from '../lib/supabaseClient';

type ProcessingState = 'pending' | 'complete' | 'skipped' | 'failed';

export async function updateFinancialProcessingState(input: {
  paymentId: number;
  commissionStatus?: ProcessingState;
  ledgerStatus?: ProcessingState;
  commissionError?: string | null;
  ledgerError?: string | null;
}): Promise<void> {
  const payload: Record<string, unknown> = {
    financial_processing_updated_at: new Date().toISOString(),
  };

  if (input.commissionStatus) payload.commission_processing_status = input.commissionStatus;
  if (input.ledgerStatus) payload.ledger_sync_status = input.ledgerStatus;
  if (input.commissionError !== undefined) payload.commission_processing_error = input.commissionError;
  if (input.ledgerError !== undefined) payload.ledger_sync_error = input.ledgerError;

  const { error } = await supabase
    .from('payments')
    .update(payload)
    .eq('id', input.paymentId);

  if (!error) return;

  const message = String(error.message || '');
  if (message.toLowerCase().includes('column')) {
    console.warn(
      `[FinancialProcessingState] FINANCIAL SCHEMA MIGRATION REQUIRED: payment ${input.paymentId} state columns are unavailable. Run scripts/sql/2026-08-20c_commission_processing_state.sql.`,
    );
    return;
  }

  throw new Error(`Failed updating durable financial processing state: ${message}`);
}
