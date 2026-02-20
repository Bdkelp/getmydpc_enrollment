-- Fix member 10's plan to use Plus instead of Base
-- This fixes the commission calculation for member 10

-- First, find the correct Plus plan ID for Member/Spouse
DO $$
DECLARE
  correct_plan_id INTEGER;
  member_10_subscription_id INTEGER;
BEGIN
  -- Find the Plus plan for Member/Spouse (ESP)
  SELECT id INTO correct_plan_id
  FROM plans
  WHERE name ILIKE '%plus%'
    AND (name ILIKE '%spouse%' OR description ILIKE '%spouse%' OR tier = 'Plus')
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

  -- Also update the member's plan_name field if it exists
  UPDATE members
  SET plan_name = 'MyPremierPlan+'
  WHERE id = 10;

  RAISE NOTICE 'Updated member 10 plan_name to MyPremierPlan+';
END $$;

-- Update existing commission for member 10 to reflect correct plan and amount
-- Member/Spouse Plus should be $40.00 commission
UPDATE agent_commissions
SET commission_amount = 40.00,
    notes = COALESCE(notes, '') || ' [Updated to correct plan: Member/Spouse Plus - $40.00 commission]',
    updated_at = NOW()
WHERE member_id = '10'
  AND commission_amount != 40.00;
