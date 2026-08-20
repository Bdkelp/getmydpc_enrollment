-- Phase 3A: durable financial exception lifecycle.
-- Additive only. Historical financial rows are never modified.
BEGIN;

CREATE TABLE IF NOT EXISTS public.financial_exceptions (
  id bigserial PRIMARY KEY,
  fingerprint text NOT NULL UNIQUE,
  exception_type text NOT NULL CHECK (exception_type IN (
    'PAYMENT_CONFIRMED_COMMISSION_FAILED',
    'PAYMENT_CONFIRMED_COMMISSION_MISSING',
    'COMMISSION_LEDGER_SYNC_FAILED',
    'COMMISSION_LEDGER_MISSING',
    'PAYMENT_PENDING_REVIEW_REQUIRED',
    'GROUP_EFFECTIVE_DATE_UNRESOLVED',
    'SOURCE_PAYMENT_MISSING',
    'DUPLICATE_COMMISSION_EVENT',
    'DUPLICATE_LEDGER_ENTRY',
    'RETRY_LIMIT_EXCEEDED'
  )),
  payment_id integer,
  member_id integer,
  commission_id text,
  ledger_id text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  retry_count integer NOT NULL DEFAULT 0,
  last_retry_at timestamptz,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','retrying','review_required','resolved','ignored')),
  error_reason text,
  resolution_method text,
  resolved_at timestamptz,
  resolved_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financial_exceptions_status ON public.financial_exceptions(status);
CREATE INDEX IF NOT EXISTS idx_financial_exceptions_payment_id ON public.financial_exceptions(payment_id);
CREATE INDEX IF NOT EXISTS idx_financial_exceptions_type ON public.financial_exceptions(exception_type);
CREATE INDEX IF NOT EXISTS idx_financial_exceptions_detected_at ON public.financial_exceptions(detected_at);

COMMENT ON TABLE public.financial_exceptions IS 'Durable financial pipeline exceptions for retry/review. Does not replace or rewrite financial records.';
COMMENT ON COLUMN public.financial_exceptions.fingerprint IS 'Deterministic condition identity used to avoid duplicate exception rows.';

COMMIT;
