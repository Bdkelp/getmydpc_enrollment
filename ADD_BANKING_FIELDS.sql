-- Add banking information fields to users table for commission payouts
-- Execute this in Supabase SQL Editor

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS bank_name VARCHAR,
ADD COLUMN IF NOT EXISTS routing_number VARCHAR(9),
ADD COLUMN IF NOT EXISTS account_number VARCHAR,
ADD COLUMN IF NOT EXISTS account_type VARCHAR,
ADD COLUMN IF NOT EXISTS account_holder_name VARCHAR;

-- Add comment for documentation
COMMENT ON COLUMN users.bank_name IS 'Bank name for commission payouts';
COMMENT ON COLUMN users.routing_number IS '9-digit ABA routing number';
COMMENT ON COLUMN users.account_number IS 'Bank account number (encrypted if needed)';
COMMENT ON COLUMN users.account_type IS 'Account type: checking or savings';
COMMENT ON COLUMN users.account_holder_name IS 'Name on the bank account';