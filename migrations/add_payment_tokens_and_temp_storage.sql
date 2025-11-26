-- Migration: Add payment token fields and temporary registration storage
-- Purpose: Support payment-first registration flow with EPX BRIC tokens
-- Date: 2024

-- Add payment token fields to members table
ALTER TABLE members 
ADD COLUMN IF NOT EXISTS payment_token VARCHAR(255),
ADD COLUMN IF NOT EXISTS payment_method_type VARCHAR(20);

-- Add EPX subscription ID to subscriptions table
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS epx_subscription_id VARCHAR(100) UNIQUE;

-- Create index for EPX subscription lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_epx_subscription_id 
ON subscriptions(epx_subscription_id);

-- Create temporary registrations table for payment-first flow
CREATE TABLE IF NOT EXISTS temp_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_data JSONB NOT NULL,
    payment_attempts INTEGER DEFAULT 0,
    last_payment_error TEXT,
    agent_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL
);

-- Create indexes for temp_registrations
CREATE INDEX IF NOT EXISTS idx_temp_registrations_expires_at 
ON temp_registrations(expires_at);

CREATE INDEX IF NOT EXISTS idx_temp_registrations_created_at 
ON temp_registrations(created_at);

-- Create admin notifications table for system alerts
CREATE TABLE IF NOT EXISTS admin_notifications (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    member_id INTEGER REFERENCES members(id),
    subscription_id INTEGER REFERENCES subscriptions(id),
    error_message TEXT,
    metadata JSONB,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP,
    resolved_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for admin_notifications
CREATE INDEX IF NOT EXISTS idx_admin_notifications_resolved 
ON admin_notifications(resolved);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_type 
ON admin_notifications(type);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_created_at 
ON admin_notifications(created_at);

-- Add comments for documentation
COMMENT ON COLUMN members.payment_token IS 'BRIC token from EPX Hosted Checkout for recurring billing';
COMMENT ON COLUMN members.payment_method_type IS 'Payment method type: CreditCard or BankAccount';
COMMENT ON COLUMN subscriptions.epx_subscription_id IS 'EPX recurring billing subscription ID';
COMMENT ON TABLE temp_registrations IS 'Temporary storage for registration data during payment processing (expires after 1 hour)';
COMMENT ON COLUMN temp_registrations.payment_attempts IS 'Number of failed payment attempts (max 3 before purging)';
COMMENT ON TABLE admin_notifications IS 'System alerts for admin review (e.g., failed EPX subscription creation)';
COMMENT ON COLUMN admin_notifications.type IS 'Notification type: epx_subscription_failed, payment_failed, etc';

-- Create function to cleanup expired temp registrations
CREATE OR REPLACE FUNCTION cleanup_expired_temp_registrations()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM temp_registrations 
    WHERE expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup (if pg_cron is available, otherwise run manually/via scheduler)
-- SELECT cron.schedule('cleanup-temp-registrations', '*/15 * * * *', 'SELECT cleanup_expired_temp_registrations()');
