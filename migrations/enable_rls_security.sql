-- ============================================================
-- Row Level Security (RLS) Migration
-- ============================================================
-- Purpose: Fix Supabase security warnings by enabling RLS
-- Approach: Enable RLS + Create permissive policies for service role
-- Result: Backend continues working, external API access blocked
-- ============================================================

-- ============================================================
-- STEP 1: Enable RLS on All Tables
-- ============================================================
-- This prevents direct PostgREST API access without policies

ALTER TABLE billing_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment_modifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_billing_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- STEP 2: Create Restrictive Policies (Deny External Access)
-- ============================================================
-- Note: Service role (used by Express backend) BYPASSES these policies
-- These policies only affect PostgREST API (anon/authenticated users)

-- Drop existing policies if any (idempotent)
DROP POLICY IF EXISTS "Block direct access" ON billing_schedule;
DROP POLICY IF EXISTS "Block direct access" ON commissions;
DROP POLICY IF EXISTS "Block direct access" ON enrollment_modifications;
DROP POLICY IF EXISTS "Block direct access" ON family_members;
DROP POLICY IF EXISTS "Block direct access" ON lead_activities;
DROP POLICY IF EXISTS "Block direct access" ON leads;
DROP POLICY IF EXISTS "Block direct access" ON member_change_requests;
DROP POLICY IF EXISTS "Block direct access" ON members;
DROP POLICY IF EXISTS "Block direct access" ON payment_tokens;
DROP POLICY IF EXISTS "Block direct access" ON payments;
DROP POLICY IF EXISTS "Block direct access" ON recurring_billing_log;
DROP POLICY IF EXISTS "Block direct access" ON sessions;
DROP POLICY IF EXISTS "Block direct access" ON subscriptions;
DROP POLICY IF EXISTS "Block direct access" ON users;
DROP POLICY IF EXISTS "Allow public read" ON plans;

-- Sensitive tables: DENY ALL direct access
CREATE POLICY "Block direct access" ON payment_tokens 
    FOR ALL 
    TO public
    USING (false);

CREATE POLICY "Block direct access" ON billing_schedule 
    FOR ALL 
    TO public
    USING (false);

CREATE POLICY "Block direct access" ON users 
    FOR ALL 
    TO public
    USING (false);

CREATE POLICY "Block direct access" ON members 
    FOR ALL 
    TO public
    USING (false);

CREATE POLICY "Block direct access" ON payments 
    FOR ALL 
    TO public
    USING (false);

CREATE POLICY "Block direct access" ON commissions 
    FOR ALL 
    TO public
    USING (false);

CREATE POLICY "Block direct access" ON subscriptions 
    FOR ALL 
    TO public
    USING (false);

CREATE POLICY "Block direct access" ON sessions 
    FOR ALL 
    TO public
    USING (false);

CREATE POLICY "Block direct access" ON enrollment_modifications 
    FOR ALL 
    TO public
    USING (false);

CREATE POLICY "Block direct access" ON family_members 
    FOR ALL 
    TO public
    USING (false);

CREATE POLICY "Block direct access" ON leads 
    FOR ALL 
    TO public
    USING (false);

CREATE POLICY "Block direct access" ON lead_activities 
    FOR ALL 
    TO public
    USING (false);

CREATE POLICY "Block direct access" ON recurring_billing_log 
    FOR ALL 
    TO public
    USING (false);

CREATE POLICY "Block direct access" ON member_change_requests 
    FOR ALL 
    TO public
    USING (false);

-- Plans table: Allow PUBLIC READ ONLY (for enrollment page pricing)
-- This is safe - pricing should be public
CREATE POLICY "Allow public read" ON plans 
    FOR SELECT 
    TO public
    USING (true);

-- Block writes to plans via PostgREST (only backend should modify)
CREATE POLICY "Block direct access" ON plans 
    FOR INSERT 
    TO public
    USING (false);

CREATE POLICY "Block direct access" ON plans 
    FOR UPDATE 
    TO public
    USING (false);

CREATE POLICY "Block direct access" ON plans 
    FOR DELETE 
    TO public
    USING (false);

-- ============================================================
-- STEP 3: Verify Configuration
-- ============================================================

-- Check that RLS is enabled on all tables
DO $$
DECLARE
    table_record RECORD;
    rls_count INTEGER := 0;
    total_count INTEGER := 0;
BEGIN
    FOR table_record IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename IN (
            'billing_schedule', 'commissions', 'enrollment_modifications',
            'family_members', 'lead_activities', 'leads', 'member_change_requests',
            'members', 'payment_tokens', 'payments', 'plans', 'recurring_billing_log',
            'sessions', 'subscriptions', 'users'
        )
    LOOP
        total_count := total_count + 1;
        
        -- Check if RLS is enabled
        IF EXISTS (
            SELECT 1 FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
            AND c.relname = table_record.tablename
            AND c.relrowsecurity = true
        ) THEN
            rls_count := rls_count + 1;
            RAISE NOTICE 'RLS enabled on table: %', table_record.tablename;
        ELSE
            RAISE WARNING 'RLS NOT enabled on table: %', table_record.tablename;
        END IF;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'RLS Security Migration Summary';
    RAISE NOTICE 'Tables with RLS enabled: % out of %', rls_count, total_count;
    RAISE NOTICE '============================================================';
    
    IF rls_count = total_count THEN
        RAISE NOTICE 'All tables secured with RLS';
        RAISE NOTICE 'Express backend will continue working normally';
        RAISE NOTICE 'Direct PostgREST API access is now blocked';
        RAISE NOTICE 'Plans table allows public read access only';
    ELSE
        RAISE WARNING 'Some tables may not have RLS enabled';
    END IF;
END $$;

-- ============================================================
-- STEP 4: Document What Was Done
-- ============================================================

COMMENT ON TABLE payment_tokens IS 'RLS enabled - Service role only (via Express backend)';
COMMENT ON TABLE billing_schedule IS 'RLS enabled - Service role only (via Express backend)';
COMMENT ON TABLE users IS 'RLS enabled - Service role only (via Express backend)';
COMMENT ON TABLE members IS 'RLS enabled - Service role only (via Express backend)';
COMMENT ON TABLE payments IS 'RLS enabled - Service role only (via Express backend)';
COMMENT ON TABLE plans IS 'RLS enabled - Public read allowed for pricing display';

-- ============================================================
-- IMPORTANT NOTES:
-- ============================================================
-- 1. Your Express backend uses SERVICE ROLE key - bypasses all RLS
-- 2. PostgREST API (anon/authenticated) is now blocked by policies
-- 3. Plans table allows public read (needed for enrollment page)
-- 4. No changes needed to backend code - works exactly as before
-- 5. Security warnings in Supabase will be resolved
-- ============================================================

-- Migration complete
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE 'RLS Security Migration Completed Successfully!';
    RAISE NOTICE '';
END $$;
