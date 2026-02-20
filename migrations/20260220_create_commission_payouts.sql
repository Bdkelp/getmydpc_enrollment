-- Create commission_payouts table for recurring monthly commission tracking
-- This tracks each individual monthly commission payment separately

CREATE TABLE IF NOT EXISTS commission_payouts (
  id SERIAL PRIMARY KEY,
  
  -- Link to base commission relationship
  commission_id INTEGER NOT NULL REFERENCES agent_commissions(id) ON DELETE CASCADE,
  
  -- Payout Period (what month is this for?)
  payout_month DATE NOT NULL, -- First day of the month (e.g., 2026-02-01)
  
  -- Payment Tracking
  payment_captured_at TIMESTAMP WITH TIME ZONE, -- When member's payment was captured by EPX
  payment_eligible_date TIMESTAMP WITH TIME ZONE, -- Friday after week ends (Monday-Sunday)
  
  -- Amount
  payout_amount DECIMAL(10, 2) NOT NULL, -- Commission amount for this month
  
  -- Commission Type (direct or override for downline structure)
  commission_type TEXT NOT NULL DEFAULT 'direct', -- 'direct' or 'override'
  override_for_agent_id TEXT, -- If override, which downline agent
  
  -- Status Tracking
  status TEXT NOT NULL DEFAULT 'pending', 
    -- 'pending': Payment captured, waiting for eligible date
    -- 'paid': Agent has been paid
    -- 'cancelled': Member cancelled before payment captured
    -- 'ineligible': Within 14-day grace period, not eligible yet
  
  paid_date TIMESTAMP WITH TIME ZONE, -- When agent was actually paid
  
  -- References
  member_payment_id INTEGER REFERENCES payments(id), -- Link to member's payment record
  epx_transaction_id TEXT, -- EPX transaction ID for this payment
  batch_id TEXT, -- Weekly payment batch identifier (e.g., "2026-02-28")
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_commission_payouts_commission_id 
  ON commission_payouts(commission_id);

CREATE INDEX IF NOT EXISTS idx_commission_payouts_payout_month 
  ON commission_payouts(payout_month);

CREATE INDEX IF NOT EXISTS idx_commission_payouts_status 
  ON commission_payouts(status);

CREATE INDEX IF NOT EXISTS idx_commission_payouts_payment_eligible_date 
  ON commission_payouts(payment_eligible_date);

CREATE INDEX IF NOT EXISTS idx_commission_payouts_batch_id 
  ON commission_payouts(batch_id);

-- Composite index for weekly batch queries
CREATE INDEX IF NOT EXISTS idx_commission_payouts_status_eligible 
  ON commission_payouts(status, payment_eligible_date) 
  WHERE status = 'pending';

-- Unique constraint: One payout per commission per month
CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_payouts_unique_month 
  ON commission_payouts(commission_id, payout_month);

-- Add comments for documentation
COMMENT ON TABLE commission_payouts IS 'Tracks individual monthly commission payments for recurring subscriptions. Created reactively when member payments are captured.';
COMMENT ON COLUMN commission_payouts.payout_month IS 'First day of the month this payout is for (e.g., 2026-02-01 for February)';
COMMENT ON COLUMN commission_payouts.payment_captured_at IS 'Timestamp when the member''s monthly payment was captured by EPX';
COMMENT ON COLUMN commission_payouts.payment_eligible_date IS 'Friday after the week ends (Monday-Sunday). Agent becomes eligible for payment on this date.';
COMMENT ON COLUMN commission_payouts.status IS 'pending: waiting for eligible date | paid: agent paid | cancelled: member cancelled | ineligible: within 14-day grace period';

-- Backfill: Create initial payout records for existing active commissions
-- Only create for commissions where payment was already captured
INSERT INTO commission_payouts (
  commission_id,
  payout_month,
  payment_captured_at,
  payment_eligible_date,
  payout_amount,
  status,
  member_payment_id,
  notes
)
SELECT 
  ac.id as commission_id,
  DATE_TRUNC('month', ac.created_at)::date as payout_month,
  ac.created_at as payment_captured_at,
  -- Calculate payment eligible date (Friday after week ends)
  (DATE_TRUNC('week', ac.created_at + INTERVAL '1 day')::date + INTERVAL '11 days')::timestamp with time zone as payment_eligible_date,
  ac.commission_amount as payout_amount,
  CASE 
    WHEN ac.payment_status = 'paid' THEN 'paid'::text
    WHEN (DATE_TRUNC('week', ac.created_at + INTERVAL '1 day')::date + INTERVAL '11 days')::date <= CURRENT_DATE THEN 'pending'::text
    ELSE 'ineligible'::text
  END as status,
  p.id as member_payment_id,
  'Backfilled from existing commission record' as notes
FROM agent_commissions ac
LEFT JOIN payments p ON p.member_id = ac.member_id::integer AND DATE_TRUNC('month', p.created_at) = DATE_TRUNC('month', ac.created_at)
WHERE ac.status != 'cancelled'
ON CONFLICT (commission_id, payout_month) DO NOTHING;

-- Log backfill results
DO $$
DECLARE
  backfill_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO backfill_count FROM commission_payouts WHERE notes LIKE '%Backfilled%';
  RAISE NOTICE 'Backfilled % payout records from existing commissions', backfill_count;
END $$;
