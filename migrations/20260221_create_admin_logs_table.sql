-- Migration: Create admin_logs table for audit trail
-- Date: 2026-02-21
-- Purpose: Track admin actions for compliance and security audit
-- 
-- This table logs all admin access to sensitive data and critical operations

CREATE TABLE IF NOT EXISTS admin_logs (
  id SERIAL PRIMARY KEY,
  log_type VARCHAR(50) NOT NULL,
  admin_id VARCHAR(255),
  admin_email VARCHAR(255),
  member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  reason TEXT,
  metadata JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for querying by admin
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_id ON admin_logs(admin_id);

-- Index for querying by member
CREATE INDEX IF NOT EXISTS idx_admin_logs_member_id ON admin_logs(member_id);

-- Index for querying by log type
CREATE INDEX IF NOT EXISTS idx_admin_logs_type ON admin_logs(log_type);

-- Index for querying by date (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON admin_logs(created_at DESC);

-- Composite index for admin activity reports
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_date ON admin_logs(admin_id, created_at DESC);

-- Add comment
COMMENT ON TABLE admin_logs IS 'Audit trail for admin actions on sensitive data and critical operations';
COMMENT ON COLUMN admin_logs.log_type IS 'Type of action: sensitive_data_access, payment_override, member_status_change, etc.';
COMMENT ON COLUMN admin_logs.metadata IS 'Additional structured data about the action (fields accessed, old values, etc.)';
COMMENT ON COLUMN admin_logs.reason IS 'Admin-provided reason for accessing/modifying data';

-- Grant appropriate permissions (adjust based on your RLS setup)
-- Admins should be able to read their own logs
-- Super admins should be able to read all logs
-- No one should be able to modify or delete logs

-- Example RLS policies (adjust to match your auth setup)
ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read all logs" ON admin_logs;
CREATE POLICY "Admins can read all logs" 
  ON admin_logs FOR SELECT 
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id::text = auth.uid()::text 
      AND users.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Service role can insert logs" ON admin_logs;
CREATE POLICY "Service role can insert logs"
  ON admin_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Prevent updates and deletes for immutability
DROP POLICY IF EXISTS "Prevent log modification" ON admin_logs;
CREATE POLICY "Prevent log modification"
  ON admin_logs FOR UPDATE
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS "Prevent log deletion" ON admin_logs;
CREATE POLICY "Prevent log deletion"
  ON admin_logs FOR DELETE
  TO authenticated
  USING (false);
