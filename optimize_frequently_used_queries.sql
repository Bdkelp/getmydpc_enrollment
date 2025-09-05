
-- Optimize Frequently Used Query Patterns
-- Add indexes based on common application usage patterns

-- 1. Users table optimizations
CREATE INDEX IF NOT EXISTS idx_users_email_active 
ON public.users(email) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_users_role_active 
ON public.users(role, is_active);

-- 2. Subscriptions table optimizations
CREATE INDEX IF NOT EXISTS idx_subscriptions_status_next_billing 
ON public.subscriptions(status, next_billing_date)
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status 
ON public.subscriptions(user_id, status);

-- 3. Payments table optimizations
CREATE INDEX IF NOT EXISTS idx_payments_status_created 
ON public.payments(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_user_created 
ON public.payments(user_id, created_at DESC);

-- 4. Leads table optimizations
CREATE INDEX IF NOT EXISTS idx_leads_agent_status_created 
ON public.leads(assigned_agent_id, status, created_at DESC)
WHERE assigned_agent_id IS NOT NULL;

-- 5. Commissions table optimizations
CREATE INDEX IF NOT EXISTS idx_commissions_agent_period 
ON public.commissions(agent_id, period_start, period_end);

-- 6. Add partial indexes for common filters
CREATE INDEX IF NOT EXISTS idx_users_pending_approval 
ON public.users(created_at DESC) 
WHERE approval_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_subscriptions_active 
ON public.subscriptions(user_id, created_at DESC) 
WHERE status = 'active';

-- Analyze tables to update statistics
ANALYZE public.users;
ANALYZE public.subscriptions;
ANALYZE public.payments;
ANALYZE public.leads;
ANALYZE public.commissions;
ANALYZE public.lead_activities;
ANALYZE public.enrollment_modifications;
