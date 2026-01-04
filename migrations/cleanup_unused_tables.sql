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
-- Clean Test Data from Payments Table
-- ============================================================

-- Option 1: Remove ALL payments (use if still in testing/development phase)
-- WARNING: This will delete ALL payment records
-- TRUNCATE TABLE payments RESTART IDENTITY CASCADE;

-- Option 2: Remove only obvious test payments (selective cleanup)
-- Uncomment the DELETE statements you want to use:

-- Delete payments with test email patterns
-- DELETE FROM payments WHERE email ILIKE '%test%' OR email ILIKE '%example.com%';

-- Delete payments with $1.00 or other test amounts
-- DELETE FROM payments WHERE amount IN (1.00, 0.01, 99.99);

-- Delete payments from specific test date range (adjust dates as needed)
-- DELETE FROM payments WHERE created_at < '2026-01-01';

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
