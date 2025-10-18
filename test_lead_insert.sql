-- Test if leads table accepts NULL assignedAgentId
-- This will test the public lead submission

-- First, check the table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'leads'
ORDER BY ordinal_position;

-- Try to insert a test lead with NULL assignedAgentId
INSERT INTO leads ("firstName", "lastName", email, phone, message, source, status, "assignedAgentId", "createdAt", "updatedAt")
VALUES ('Test', 'User', 'test@example.com', '1234567890', 'Test message', 'contact_form', 'new', NULL, NOW(), NOW())
RETURNING *;

-- Check if it was inserted
SELECT * FROM leads WHERE email = 'test@example.com' ORDER BY "createdAt" DESC LIMIT 1;

-- Clean up test data
DELETE FROM leads WHERE email = 'test@example.com';
