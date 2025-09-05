
-- Add Missing Foreign Key Indexes
-- This addresses the unindexed foreign keys performance warnings

-- 1. Add index on commissions.subscriptionId (subscription_id)
CREATE INDEX IF NOT EXISTS idx_commissions_subscription_id 
ON public.commissions(subscription_id);

-- 2. Add index on commissions.userId (user_id) 
CREATE INDEX IF NOT EXISTS idx_commissions_user_id 
ON public.commissions(user_id);

-- 3. Add index on lead_activities.lead_id
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_id 
ON public.lead_activities(lead_id);

-- 4. Add index on payments.subscription_id
CREATE INDEX IF NOT EXISTS idx_payments_subscription_id 
ON public.payments(subscription_id);

-- 5. Add index on subscriptions.plan_id
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_id 
ON public.subscriptions(plan_id);

-- Verify indexes were created
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes 
WHERE tablename IN ('commissions', 'lead_activities', 'payments', 'subscriptions')
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
