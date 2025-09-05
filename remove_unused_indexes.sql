
-- Remove Unused Indexes
-- This removes indexes that haven't been used and may be impacting write performance

-- Note: Only remove these if you're confident they won't be needed
-- Run EXPLAIN ANALYZE on your queries first to ensure these indexes aren't needed

-- 1. Remove unused session index (sessions table might be legacy)
DROP INDEX IF EXISTS idx_session_expire;

-- 2. Remove unused enrollment modification indexes (we have better ones now)
DROP INDEX IF EXISTS idx_enrollment_modifications_modified_by;
DROP INDEX IF EXISTS idx_enrollment_modifications_subscription_id;
DROP INDEX IF EXISTS idx_enrollment_modifications_user_id;

-- 3. Remove unused user approval status index (if not frequently querying by approval status)
-- DROP INDEX IF EXISTS idx_users_approval_status; -- Keep this one, we likely use it

-- 4. Remove unused subscription user_id index (we created a better one above)
-- DROP INDEX IF EXISTS idx_subscriptions_user_id; -- Keep this one, we use it for user queries

-- 5. Remove unused payment user_id index
-- DROP INDEX IF EXISTS idx_payments_user_id; -- Keep this one, we use it for user payment history

-- 6. Remove unused leads indexes (if lead management isn't heavily used yet)
-- DROP INDEX IF EXISTS idx_leads_status; -- Keep this one, useful for lead filtering
-- DROP INDEX IF EXISTS idx_leads_assigned_agent_id; -- Keep this one, agents need this

-- 7. Remove unused family members index
DROP INDEX IF EXISTS idx_family_members_primary_user_id;

-- 8. Remove unused commissions agent_id index (we have user_id index which covers this)
-- DROP INDEX IF EXISTS idx_commissions_agent_id; -- Actually keep this, agents query their commissions

-- Verify remaining indexes
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes 
WHERE schemaname = 'public'
  AND indexname NOT LIKE 'pg_%'
ORDER BY tablename, indexname;
