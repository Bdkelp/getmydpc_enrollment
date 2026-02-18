-- Add ACH payment support to members and payment_tokens tables
-- Date: 2026-02-18
-- Purpose: Enable EPX ACH (CKC2) payment processing as quiet backup option

-- ============================================================
-- CREATE PAYMENT_TOKENS TABLE (if it doesn't exist)
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_tokens (
  id SERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  
  -- EPX BRIC Token (treat like password - secure storage)
  bric_token VARCHAR(255) NOT NULL UNIQUE,
  
  -- Payment Method Type (CreditCard or ACH)
  payment_method_type VARCHAR(20) DEFAULT 'CreditCard',
  
  -- Card display information (for member UI - for CreditCard type)
  card_last_four VARCHAR(4),
  card_type VARCHAR(50), -- Visa, Mastercard, Discover, Amex
  expiry_month VARCHAR(2),
  expiry_year VARCHAR(4),
  
  -- Card network tracking (CRITICAL for recurring charges)
  original_network_trans_id VARCHAR(255),
  
  -- Bank account information (for ACH type)
  bank_routing_number VARCHAR(9), -- ABA routing number
  bank_account_last_four VARCHAR(4), -- Last 4 for display
  bank_account_type VARCHAR(20), -- Checking, Savings
  bank_name VARCHAR(100), -- Optional: derived from routing lookup
  
  -- Token management
  is_active BOOLEAN DEFAULT true,
  is_primary BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP,
  expires_at TIMESTAMP
);

-- Create indexes for payment_tokens if they don't exist
CREATE INDEX IF NOT EXISTS idx_payment_tokens_member_id ON payment_tokens(member_id);
CREATE INDEX IF NOT EXISTS idx_payment_tokens_bric ON payment_tokens(bric_token);
CREATE INDEX IF NOT EXISTS idx_payment_tokens_payment_method_type ON payment_tokens(payment_method_type);

-- ============================================================
-- CREATE BILLING_SCHEDULE TABLE (if it doesn't exist)
-- ============================================================

CREATE TABLE IF NOT EXISTS billing_schedule (
  id SERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  payment_token_id INTEGER NOT NULL REFERENCES payment_tokens(id) ON DELETE RESTRICT,
  
  -- Billing configuration
  amount DECIMAL(10, 2) NOT NULL,
  frequency VARCHAR(20) DEFAULT 'monthly', -- monthly, quarterly, annual
  
  -- Schedule tracking
  next_billing_date TIMESTAMP NOT NULL,
  last_billing_date TIMESTAMP,
  last_successful_billing TIMESTAMP,
  
  -- Status management
  status VARCHAR(20) DEFAULT 'active', -- active, paused, cancelled
  failure_count INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for billing_schedule if they don't exist
CREATE INDEX IF NOT EXISTS idx_billing_schedule_member_id ON billing_schedule(member_id);
CREATE INDEX IF NOT EXISTS idx_billing_schedule_next_billing ON billing_schedule(next_billing_date);
CREATE INDEX IF NOT EXISTS idx_billing_schedule_status ON billing_schedule(status);

-- ============================================================
-- MEMBERS TABLE - Add bank account fields
-- ============================================================

ALTER TABLE members 
ADD COLUMN IF NOT EXISTS bank_routing_number VARCHAR(9),
ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(255), -- Encrypted storage
ADD COLUMN IF NOT EXISTS bank_account_type VARCHAR(20), -- 'Checking' or 'Savings'
ADD COLUMN IF NOT EXISTS bank_account_holder_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS bank_account_last_four VARCHAR(4); -- For display

COMMENT ON COLUMN members.bank_routing_number IS 'ABA routing number (9 digits) - for ACH payments';
COMMENT ON COLUMN members.bank_account_number IS 'Bank account number (encrypted) - for ACH payments';
COMMENT ON COLUMN members.bank_account_type IS 'Account type: Checking or Savings';
COMMENT ON COLUMN members.bank_account_holder_name IS 'Name on bank account';
COMMENT ON COLUMN members.bank_account_last_four IS 'Last 4 digits of account number for display';

-- ============================================================
-- PAYMENT_TOKENS TABLE - Add columns if they don't exist (for existing tables)
-- ============================================================

-- Add payment_method_type if it doesn't exist
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payment_tokens' AND column_name = 'payment_method_type'
  ) THEN
    ALTER TABLE payment_tokens ADD COLUMN payment_method_type VARCHAR(20) DEFAULT 'CreditCard';
  END IF;
END $$;

-- Add bank-related columns if they don't exist
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payment_tokens' AND column_name = 'bank_routing_number'
  ) THEN
    ALTER TABLE payment_tokens 
    ADD COLUMN bank_routing_number VARCHAR(9),
    ADD COLUMN bank_account_last_four VARCHAR(4),
    ADD COLUMN bank_account_type VARCHAR(20),
    ADD COLUMN bank_name VARCHAR(100);
  END IF;
END $$;

COMMENT ON COLUMN payment_tokens.payment_method_type IS 'Payment type: CreditCard or ACH';
COMMENT ON COLUMN payment_tokens.bank_routing_number IS 'ABA routing number for ACH tokens';
COMMENT ON COLUMN payment_tokens.bank_account_last_four IS 'Last 4 of account number for ACH display';
COMMENT ON COLUMN payment_tokens.bank_account_type IS 'Checking or Savings for ACH';
COMMENT ON COLUMN payment_tokens.bank_name IS 'Bank name derived from routing number';

-- Update existing payment_tokens to set payment_method_type to 'CreditCard'
UPDATE payment_tokens 
SET payment_method_type = 'CreditCard' 
WHERE payment_method_type IS NULL;

-- ============================================================
-- PAYMENTS TABLE - Add payment method tracking
-- ============================================================

ALTER TABLE payments
ADD COLUMN IF NOT EXISTS payment_method_type VARCHAR(20); -- Track whether payment was card or ACH

COMMENT ON COLUMN payments.payment_method_type IS 'Payment method used: CreditCard or ACH';

-- Update existing payments to set payment_method_type based on existing data
UPDATE payments 
SET payment_method_type = 'CreditCard' 
WHERE payment_method_type IS NULL;

-- ============================================================
-- INDEXES for performance (additional indexes for members table)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_members_payment_method_type 
ON members(payment_method_type);

-- ============================================================
-- VALIDATION CHECK CONSTRAINTS
-- ============================================================

-- Ensure payment_method_type is valid in members table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'members_payment_method_type_check'
  ) THEN
    ALTER TABLE members 
    ADD CONSTRAINT members_payment_method_type_check 
    CHECK (payment_method_type IS NULL OR payment_method_type IN ('CreditCard', 'ACH', 'BankAccount'));
  END IF;
END $$;

-- Ensure payment_method_type is valid in payment_tokens table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_tokens_payment_method_type_check'
  ) THEN
    ALTER TABLE payment_tokens 
    ADD CONSTRAINT payment_tokens_payment_method_type_check 
    CHECK (payment_method_type IN ('CreditCard', 'ACH', 'BankAccount'));
  END IF;
END $$;

-- Ensure bank_account_type is valid
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'members_bank_account_type_check'
  ) THEN
    ALTER TABLE members 
    ADD CONSTRAINT members_bank_account_type_check 
    CHECK (bank_account_type IS NULL OR bank_account_type IN ('Checking', 'Savings'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_tokens_bank_account_type_check'
  ) THEN
    ALTER TABLE payment_tokens 
    ADD CONSTRAINT payment_tokens_bank_account_type_check 
    CHECK (bank_account_type IS NULL OR bank_account_type IN ('Checking', 'Savings'));
  END IF;
END $$;

-- ============================================================
-- MIGRATION NOTES
-- ============================================================
-- 
-- This migration adds "quiet" ACH support:
-- - Default to credit card payments
-- - ACH available for group enrollments or edge cases
-- - No prominent display of ACH option in UI
-- - Uses existing EPX Server POST API with CKC2 transaction type
-- - No instant verification needed (EPX handles on their end)
-- - Existing members remain unchanged
-- - Same commission calculations for ACH
-- 
-- EPX Transaction Types:
-- - CCE1: Credit Card MIT (Merchant Initiated Transaction)
-- - CKC2: ACH MIT (NEW - added by this migration)
-- 
