-- CLEANUP SCRIPT: Remove Old Commission System
-- Run this AFTER confirming the new system works perfectly
-- This removes all the problematic legacy commission code

-- Step 1: Drop the old problematic commissions table
-- WARNING: This will delete all existing commission data!
-- Only run this after migrating any important data

DROP TABLE IF EXISTS commissions CASCADE;

-- Step 2: Drop any views that depend on the old table
DROP VIEW IF EXISTS commission_summary CASCADE;
DROP VIEW IF EXISTS agent_commission_stats CASCADE;

-- Step 3: Remove any indexes from old table (they'll be dropped with table)
-- No additional action needed - indexes drop with table

-- Step 4: Remove any triggers related to old commission table
DROP TRIGGER IF EXISTS update_commissions_updated_at ON commissions;

-- Step 5: Clean up any stored procedures/functions for old system
DROP FUNCTION IF EXISTS calculate_agent_commissions(uuid);
DROP FUNCTION IF EXISTS get_commission_totals(uuid, date, date);

-- Verification: Confirm only new table exists
SELECT 
  table_name,
  table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name LIKE '%commission%'
ORDER BY table_name;

-- Success message
SELECT 
  'Old commission system removed!' as status,
  'Only clean agent_commissions table remains' as message;

-- Final check: Show structure of new clean table
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'agent_commissions'
ORDER BY ordinal_position;