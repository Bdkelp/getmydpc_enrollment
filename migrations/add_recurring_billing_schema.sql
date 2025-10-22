-- ============================================================
-- EPX Server Post: Recurring Billing Schema Migration
-- ============================================================
-- This migration adds tables and columns needed for:
-- - Card on File (BRIC tokens)
-- - Recurring monthly membership charges
-- - Billing schedule management
-- ============================================================

-- ============================================================
-- 1. PAYMENT TOKENS (Card on File)
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_tokens (
    id SERIAL PRIMARY KEY,
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    
    -- EPX BRIC Token (treat like password - secure storage)
    bric_token VARCHAR(255) NOT NULL UNIQUE,
    
    -- Card display information (for member UI)
    card_last_four VARCHAR(4),
    card_type VARCHAR(50), -- Visa, Mastercard, Discover, Amex
    expiry_month VARCHAR(2),
    expiry_year VARCHAR(4),
    
    -- Card network tracking (CRITICAL for recurring charges)
    original_network_trans_id VARCHAR(255), -- From initial transaction
    
    -- Token management
    is_active BOOLEAN DEFAULT TRUE,
    is_primary BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    last_used_at TIMESTAMP,
    expires_at TIMESTAMP,
    
    -- Ensure only one primary token per member
    CONSTRAINT unique_primary_token_per_member 
        UNIQUE (member_id, is_primary) 
        WHERE is_primary = TRUE
);

-- Indexes for performance
CREATE INDEX idx_payment_tokens_member_id ON payment_tokens(member_id);
CREATE INDEX idx_payment_tokens_active ON payment_tokens(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_payment_tokens_bric ON payment_tokens(bric_token);

COMMENT ON TABLE payment_tokens IS 'Stores EPX BRIC tokens for recurring billing';
COMMENT ON COLUMN payment_tokens.bric_token IS 'EPX BRIC token - encrypt at rest in production';
COMMENT ON COLUMN payment_tokens.original_network_trans_id IS 'Network transaction ID from initial payment (required for recurring charges)';

-- ============================================================
-- 2. BILLING SCHEDULE
-- ============================================================

CREATE TABLE IF NOT EXISTS billing_schedule (
    id SERIAL PRIMARY KEY,
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    payment_token_id INTEGER NOT NULL REFERENCES payment_tokens(id) ON DELETE RESTRICT,
    
    -- Billing configuration
    amount NUMERIC(10, 2) NOT NULL,
    frequency VARCHAR(20) DEFAULT 'monthly', -- monthly, quarterly, annual
    
    -- Schedule tracking
    next_billing_date DATE NOT NULL,
    last_billing_date DATE,
    last_successful_billing TIMESTAMP,
    
    -- Status management
    status VARCHAR(20) DEFAULT 'active', -- active, paused, cancelled, suspended
    
    -- Failure tracking
    consecutive_failures INTEGER DEFAULT 0,
    last_failure_reason TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    cancelled_at TIMESTAMP,
    cancellation_reason TEXT
);

-- Indexes
CREATE INDEX idx_billing_schedule_member ON billing_schedule(member_id);
CREATE INDEX idx_billing_schedule_token ON billing_schedule(payment_token_id);
CREATE INDEX idx_billing_schedule_next_billing ON billing_schedule(next_billing_date) 
    WHERE status = 'active';
CREATE INDEX idx_billing_schedule_status ON billing_schedule(status);

COMMENT ON TABLE billing_schedule IS 'Manages recurring billing schedules for active memberships';
COMMENT ON COLUMN billing_schedule.next_billing_date IS 'Date when next charge should be processed';
COMMENT ON COLUMN billing_schedule.consecutive_failures IS 'Suspend membership after 3 consecutive failures';

-- ============================================================
-- 3. RECURRING BILLING LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS recurring_billing_log (
    id SERIAL PRIMARY KEY,
    
    -- References
    subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE CASCADE,
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    payment_token_id INTEGER REFERENCES payment_tokens(id),
    billing_schedule_id INTEGER REFERENCES billing_schedule(id),
    
    -- Charge details
    amount NUMERIC(10, 2) NOT NULL,
    billing_date DATE NOT NULL,
    attempt_number INTEGER DEFAULT 1,
    
    -- Status
    status VARCHAR(50) NOT NULL, -- success, failed, pending, retry
    
    -- EPX response data
    epx_transaction_id VARCHAR(255),
    epx_network_trans_id VARCHAR(255), -- Store for future reference
    epx_auth_code VARCHAR(50),
    epx_response_code VARCHAR(10),
    epx_response_message TEXT,
    
    -- Failure handling
    failure_reason TEXT,
    next_retry_date TIMESTAMP,
    
    -- Link to payments table if successful
    payment_id INTEGER REFERENCES payments(id),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP
);

-- Indexes
CREATE INDEX idx_billing_log_subscription ON recurring_billing_log(subscription_id);
CREATE INDEX idx_billing_log_member ON recurring_billing_log(member_id);
CREATE INDEX idx_billing_log_status ON recurring_billing_log(status);
CREATE INDEX idx_billing_log_billing_date ON recurring_billing_log(billing_date);
CREATE INDEX idx_billing_log_next_retry ON recurring_billing_log(next_retry_date) 
    WHERE status = 'retry';

COMMENT ON TABLE recurring_billing_log IS 'Audit log of all recurring billing attempts';
COMMENT ON COLUMN recurring_billing_log.attempt_number IS 'Retry counter (1 = first attempt, 2-3 = retries)';

-- ============================================================
-- 4. UPDATE EXISTING TABLES
-- ============================================================

-- Add fields to subscriptions table
ALTER TABLE subscriptions 
    ADD COLUMN IF NOT EXISTS payment_token_id INTEGER REFERENCES payment_tokens(id),
    ADD COLUMN IF NOT EXISTS original_network_trans_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS last_billing_attempt TIMESTAMP,
    ADD COLUMN IF NOT EXISTS last_successful_billing TIMESTAMP,
    ADD COLUMN IF NOT EXISTS billing_retry_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS billing_failure_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_subscriptions_payment_token 
    ON subscriptions(payment_token_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_next_billing 
    ON subscriptions(next_billing_date) WHERE status = 'active';

COMMENT ON COLUMN subscriptions.payment_token_id IS 'Links subscription to payment method';
COMMENT ON COLUMN subscriptions.original_network_trans_id IS 'From initial enrollment payment';

-- Add fields to payments table
ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS parent_transaction_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS epx_auth_code VARCHAR(50),
    ADD COLUMN IF NOT EXISTS epx_response_code VARCHAR(10),
    ADD COLUMN IF NOT EXISTS epx_network_trans_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_payments_recurring 
    ON payments(is_recurring);
CREATE INDEX IF NOT EXISTS idx_payments_parent_trans 
    ON payments(parent_transaction_id);

COMMENT ON COLUMN payments.is_recurring IS 'TRUE for automated recurring charges, FALSE for one-time';
COMMENT ON COLUMN payments.parent_transaction_id IS 'Links recurring charges to original enrollment payment';
COMMENT ON COLUMN payments.epx_network_trans_id IS 'Network transaction ID for future recurring charges';

-- ============================================================
-- 5. FUNCTIONS & TRIGGERS
-- ============================================================

-- Function to update billing schedule next_billing_date
CREATE OR REPLACE FUNCTION update_billing_schedule_after_success()
RETURNS TRIGGER AS $$
BEGIN
    -- When a billing log entry is marked successful
    IF NEW.status = 'success' AND OLD.status != 'success' THEN
        UPDATE billing_schedule
        SET 
            last_billing_date = NEW.billing_date,
            last_successful_billing = NEW.processed_at,
            next_billing_date = NEW.billing_date + INTERVAL '1 month',
            consecutive_failures = 0,
            last_failure_reason = NULL,
            updated_at = NOW()
        WHERE id = NEW.billing_schedule_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_billing_success
    AFTER UPDATE ON recurring_billing_log
    FOR EACH ROW
    WHEN (NEW.status = 'success')
    EXECUTE FUNCTION update_billing_schedule_after_success();

-- Function to track consecutive failures
CREATE OR REPLACE FUNCTION track_billing_failures()
RETURNS TRIGGER AS $$
BEGIN
    -- When a billing attempt fails
    IF NEW.status = 'failed' THEN
        UPDATE billing_schedule
        SET 
            consecutive_failures = consecutive_failures + 1,
            last_failure_reason = NEW.failure_reason,
            -- Suspend after 3 consecutive failures
            status = CASE 
                WHEN consecutive_failures + 1 >= 3 THEN 'suspended'
                ELSE status
            END,
            updated_at = NOW()
        WHERE id = NEW.billing_schedule_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_billing_failure
    AFTER INSERT ON recurring_billing_log
    FOR EACH ROW
    WHEN (NEW.status = 'failed')
    EXECUTE FUNCTION track_billing_failures();

-- ============================================================
-- 6. SEED DATA (Optional - for testing)
-- ============================================================

-- Add comment to identify migration version
COMMENT ON TABLE payment_tokens IS 'EPX Server Post recurring billing - v1.0';

-- Migration complete message
DO $$
BEGIN
    RAISE NOTICE '✅ Recurring billing schema migration completed successfully';
    RAISE NOTICE 'Tables created: payment_tokens, billing_schedule, recurring_billing_log';
    RAISE NOTICE 'Updated tables: subscriptions, payments';
    RAISE NOTICE 'Triggers created: billing success/failure tracking';
END $$;
