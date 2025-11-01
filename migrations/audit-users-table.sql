-- Complete audit of users table columns
-- This checks ALL columns to identify what's missing

-- First, show ALL columns that currently exist
SELECT 
    column_name, 
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'users' 
ORDER BY ordinal_position;
