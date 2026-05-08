-- Add payer-source support for recurring billing by allowing payment_tokens rows
-- to be owned by either a member or a group context.

ALTER TABLE payment_tokens
  ALTER COLUMN member_id DROP NOT NULL;

ALTER TABLE payment_tokens
  ADD COLUMN IF NOT EXISTS group_id TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(255),
  ADD COLUMN IF NOT EXISTS bank_account_holder_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_payment_tokens_group_id
  ON payment_tokens(group_id)
  WHERE group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_tokens_owner_method_active
  ON payment_tokens(group_id, payment_method_type, is_active)
  WHERE group_id IS NOT NULL;

COMMENT ON COLUMN payment_tokens.group_id IS 'Group owner id when token is owned by a group payer source';
COMMENT ON COLUMN payment_tokens.bank_account_number IS 'Encrypted account number for ACH runtime charging';
COMMENT ON COLUMN payment_tokens.bank_account_holder_name IS 'Name on account for ACH runtime charging';
