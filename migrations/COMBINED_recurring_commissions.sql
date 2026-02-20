-- ============================================================
-- COMBINED MIGRATION SCRIPT FOR RECURRING COMMISSIONS
-- Run this entire file in Supabase SQL Editor
-- ============================================================

-- STEP 1: Add payment_eligible_date to agent_commissions
-- ============================================================

ALTER TABLE agent_commissions
ADD COLUMN IF NOT EXISTS payment_eligible_date TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN agent_commissions.payment_eligible_date IS 'Date when commission becomes eligible for payout (calculated as Friday after week ends, Monday-Sunday). Can be overridden by admin/super_admin.';

CREATE INDEX IF NOT EXISTS idx_agent_commissions_payment_eligible_date 
ON agent_commissions(payment_eligible_date);

-- Backfill payment_eligible_date for existing unpaid commissions
UPDATE agent_commissions
SET payment_eligible_date = (
  DATE_TRUNC('week', created_at + INTERVAL '1 day')::date + INTERVAL '6 days'
  + INTERVAL '5 days'
)::timestamp with time zone
WHERE payment_eligible_date IS NULL
  AND payment_status = 'unpaid';


-- STEP 2: Fix member 10 plan type
-- ============================================================

DO $$
DECLARE
  correct_plan_id INTEGER;
  member_10_subscription_id INTEGER;
BEGIN
  -- Find the Plus plan for Member/Spouse (ESP)
  SELECT id INTO correct_plan_id
  FROM plans
  WHERE name ILIKE '%plus%'
    AND (name ILIKE '%spouse%' OR description ILIKE '%spouse%')
  LIMIT 1;

  -- Find member 10's subscription
  SELECT id INTO member_10_subscription_id
  FROM subscriptions
  WHERE member_id = 10
  LIMIT 1;

  -- Update the subscription to use the correct plan
  IF correct_plan_id IS NOT NULL AND member_10_subscription_id IS NOT NULL THEN
    UPDATE subscriptions
    SET plan_id = correct_plan_id,
        updated_at = NOW()
    WHERE id = member_10_subscription_id;
    
    RAISE NOTICE 'Updated subscription % for member 10 to use plan %', member_10_subscription_id, correct_plan_id;
  ELSE
    RAISE NOTICE 'Could not find Plus plan or member 10 subscription. Plan ID: %, Subscription ID: %', correct_plan_id, member_10_subscription_id;
  END IF;
END $$;

-- Update existing commission for member 10 to reflect correct plan and amount
UPDATE agent_commissions
SET commission_amount = 40.00,
    notes = COALESCE(notes, '') || ' [Updated to correct plan: Member/Spouse Plus - $40.00 commission]',
    updated_at = NOW()
WHERE member_id = '10'
  AND commission_amount != 40.00;


-- STEP 3: Add commission_type and override tracking
-- ============================================================

ALTER TABLE agent_commissions
ADD COLUMN IF NOT EXISTS commission_type TEXT DEFAULT 'direct';

ALTER TABLE agent_commissions
ADD COLUMN IF NOT EXISTS override_for_agent_id TEXT REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_agent_commissions_commission_type 
ON agent_commissions(commission_type);

CREATE INDEX IF NOT EXISTS idx_agent_commissions_override_for 
ON agent_commissions(override_for_agent_id);

COMMENT ON COLUMN agent_commissions.commission_type IS 'Type of commission: direct (earned by enrolling agent) or override (earned by upline agent for downline sales)';
COMMENT ON COLUMN agent_commissions.override_for_agent_id IS 'If commission_type is override, this is the downline agent ID whose sale generated the override';

-- Update existing records to mark them as 'direct' if NULL
UPDATE agent_commissions
SET commission_type = 'direct'
WHERE commission_type IS NULL;


-- STEP 4: Create commission_payouts table
-- ============================================================

CREATE TABLE IF NOT EXISTS commission_payouts (
  id SERIAL PRIMARY KEY,
  
  -- Link to base commission relationship
  commission_id INTEGER NOT NULL REFERENCES agent_commissions(id) ON DELETE CASCADE,
  
  -- Payout Period (what month is this for?)
  payout_month DATE NOT NULL,
  
  -- Payment Tracking
  payment_captured_at TIMESTAMP WITH TIME ZONE,
  payment_eligible_date TIMESTAMP WITH TIME ZONE,
  
  -- Amount
  payout_amount DECIMAL(10, 2) NOT NULL,
  
  -- Commission Type (direct or override for downline structure)
  commission_type TEXT NOT NULL DEFAULT 'direct',
  override_for_agent_id TEXT,
  
  -- Status Tracking
  status TEXT NOT NULL DEFAULT 'pending',
  paid_date TIMESTAMP WITH TIME ZONE,
  
  -- References
  member_payment_id INTEGER REFERENCES payments(id),
  epx_transaction_id TEXT,
  batch_id TEXT,
  
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

CREATE INDEX IF NOT EXISTS idx_commission_payouts_status_eligible 
  ON commission_payouts(status, payment_eligible_date) 
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_payouts_unique_month 
  ON commission_payouts(commission_id, payout_month);

-- Add comments for documentation
COMMENT ON TABLE commission_payouts IS 'Tracks individual monthly commission payments for recurring subscriptions. Created reactively when member payments are captured.';
COMMENT ON COLUMN commission_payouts.payout_month IS 'First day of the month this payout is for (e.g., 2026-02-01 for February)';
COMMENT ON COLUMN commission_payouts.payment_captured_at IS 'Timestamp when the member''s monthly payment was captured by EPX';
COMMENT ON COLUMN commission_payouts.payment_eligible_date IS 'Friday after the week ends (Monday-Sunday). Agent becomes eligible for payment on this date.';
COMMENT ON COLUMN commission_payouts.status IS 'pending: waiting for eligible date | paid: agent paid | cancelled: member cancelled | ineligible: within 14-day grace period';
COMMENT ON COLUMN commission_payouts.commission_type IS 'Type of commission payout: direct or override';
COMMENT ON COLUMN commission_payouts.override_for_agent_id IS 'If commission_type is override, this is the downline agent ID';

-- Backfill: Create initial payout records for existing active commissions
INSERT INTO commission_payouts (
  commission_id,
  payout_month,
  payment_captured_at,
  payment_eligible_date,
  payout_amount,
  commission_type,
  override_for_agent_id,
  status,
  member_payment_id,
  notes
)
SELECT 
  ac.id as commission_id,
  DATE_TRUNC('month', ac.created_at)::date as payout_month,
  ac.created_at as payment_captured_at,
  (DATE_TRUNC('week', ac.created_at + INTERVAL '1 day')::date + INTERVAL '11 days')::timestamp with time zone as payment_eligible_date,
  ac.commission_amount as payout_amount,
  COALESCE(ac.commission_type, 'direct') as commission_type,
  ac.override_for_agent_id,
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
  RAISE NOTICE '✅ Backfilled % payout records from existing commissions', backfill_count;
END $$;

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==================================================';
  RAISE NOTICE '✅ Recurring Commission System Migration Complete!';
  RAISE NOTICE '==================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes applied:';
  RAISE NOTICE '  - agent_commissions: Added payment_eligible_date, commission_type, override_for_agent_id';
  RAISE NOTICE '  - commission_payouts: New table created';
  RAISE NOTICE '  - Member 10: Updated to Member/Spouse Plus ($40 commission)';
  RAISE NOTICE '  - Existing commissions: Backfilled into commission_payouts';
  RAISE NOTICE '';
END $$;
