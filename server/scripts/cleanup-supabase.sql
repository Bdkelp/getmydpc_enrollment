-- Clean up existing Supabase tables before schema migration
-- Run this in Supabase SQL Editor

-- Drop all existing tables (CASCADE will drop dependent objects)
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS agent_codes CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;
DROP TABLE IF EXISTS billing_schedule CASCADE;
DROP TABLE IF EXISTS commissions CASCADE;
DROP TABLE IF EXISTS enrollment_modifications CASCADE;
DROP TABLE IF EXISTS family_members CASCADE;
DROP TABLE IF EXISTS lead_activities CASCADE;
DROP TABLE IF EXISTS leads CASCADE;
DROP TABLE IF EXISTS members CASCADE;
DROP TABLE IF EXISTS payment_tokens CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS plans CASCADE;
DROP TABLE IF EXISTS recurring_billing_log CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;

-- Confirmation message
SELECT 'All tables dropped successfully. Ready for Drizzle schema push.' as status;
