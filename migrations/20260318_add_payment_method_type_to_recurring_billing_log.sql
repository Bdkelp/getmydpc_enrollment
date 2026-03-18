-- Add explicit payment method type tracking for recurring billing log entries
-- Required for mixed CreditCard + ACH scheduler processing

ALTER TABLE public.recurring_billing_log
  ADD COLUMN IF NOT EXISTS payment_method_type VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_billing_log_payment_method_type
  ON public.recurring_billing_log(payment_method_type);
