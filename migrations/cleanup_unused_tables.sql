-- ============================================================
-- Database Cleanup: Remove Unused Tables
-- Date: January 3, 2026
-- Reason: Removed payment-first flow, reverted to registration-first
-- ============================================================

-- Drop temp_registrations table (no longer used after reverting to registration-first flow)
-- This table was used to store registration data before payment was processed
-- Now we create members first, then process payment
DROP TABLE IF EXISTS temp_registrations CASCADE;

-- ============================================================
-- Clean ALL Test Enrollment Data
-- ============================================================
-- WARNING: This removes ALL members, payments, commissions, and related data
-- Preserves: users, plans, discount_codes, and other configuration tables
-- ============================================================

-- Clear member-related data (order matters due to foreign keys)
TRUNCATE TABLE family_members RESTART IDENTITY CASCADE;
TRUNCATE TABLE subscriptions RESTART IDENTITY CASCADE;
TRUNCATE TABLE member_change_requests RESTART IDENTITY CASCADE;
TRUNCATE TABLE member_discount_codes RESTART IDENTITY CASCADE;
TRUNCATE TABLE enrollment_modifications RESTART IDENTITY CASCADE;

-- Clear payment and commission data
TRUNCATE TABLE payments RESTART IDENTITY CASCADE;
TRUNCATE TABLE agent_commissions RESTART IDENTITY CASCADE;

-- Clear members (this will cascade to any remaining dependent tables)
TRUNCATE TABLE members RESTART IDENTITY CASCADE;

-- Optional: Clear leads if you want fresh start on lead tracking too
TRUNCATE TABLE lead_activities RESTART IDENTITY CASCADE;
TRUNCATE TABLE leads RESTART IDENTITY CASCADE;

-- ============================================================

-- Optional: Drop sessions table if using Supabase Auth exclusively
-- (Uncomment if you want to remove session storage - Supabase handles auth sessions)
-- DROP TABLE IF EXISTS sessions CASCADE;

-- Optional: Drop leads tables if not using lead management features
-- (Uncomment if you're not tracking leads)
-- DROP TABLE IF EXISTS lead_activities CASCADE;
-- DROP TABLE IF EXISTS leads CASCADE;

-- Verify remaining tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
