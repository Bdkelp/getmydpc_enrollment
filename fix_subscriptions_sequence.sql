-- Fix subscriptions table auto-increment sequence
-- Problem: Sequence is out of sync with actual max ID in table
-- Error: duplicate key value violates unique constraint "subscriptions_pkey"

-- Step 1: Check current state
SELECT 
  (SELECT MAX(id) FROM subscriptions) as max_id_in_table,
  (SELECT last_value FROM subscriptions_id_seq) as sequence_current_value,
  (SELECT nextval('subscriptions_id_seq')) as sequence_next_value;

-- Step 2: Reset the sequence to the correct value
-- This sets the sequence to MAX(id) + 1
SELECT setval('subscriptions_id_seq', (SELECT COALESCE(MAX(id), 0) + 1 FROM subscriptions), false);

-- Step 3: Verify the fix
SELECT 
  (SELECT MAX(id) FROM subscriptions) as max_id_in_table,
  (SELECT last_value FROM subscriptions_id_seq) as sequence_current_value;

-- Expected result: sequence_current_value should be max_id_in_table + 1

-- Step 4: Test by checking what the next ID would be (without consuming it)
SELECT currval('subscriptions_id_seq') as current_seq_value;
