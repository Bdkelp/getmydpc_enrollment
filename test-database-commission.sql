-- Quick test to verify new commission table works
-- Run this in Supabase SQL Editor to test basic functionality

-- Test 1: Can we access the table?
SELECT 'Table exists and is accessible' as test_1_result, COUNT(*) as current_count 
FROM agent_commissions;

-- Test 2: Can we insert a record?
INSERT INTO agent_commissions (
  agent_id, 
  member_id, 
  commission_amount, 
  coverage_type, 
  notes
) VALUES (
  'test-agent-' || EXTRACT(epoch FROM NOW()),
  'test-member-' || EXTRACT(epoch FROM NOW()), 
  125.50,
  'aca',
  'Manual test commission - ' || NOW()
);

-- Test 3: Can we query the inserted record?
SELECT 
  'Commission created successfully' as test_3_result,
  id,
  agent_id,
  member_id,
  commission_amount,
  coverage_type,
  status,
  payment_status,
  created_at
FROM agent_commissions 
ORDER BY created_at DESC 
LIMIT 1;