-- Add missing columns to the leads table in Supabase
-- Run this in your Supabase SQL Editor

-- Add source column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'leads' 
        AND column_name = 'source'
    ) THEN
        ALTER TABLE leads ADD COLUMN source VARCHAR(50) DEFAULT 'contact_form';
        RAISE NOTICE 'Added source column';
    ELSE
        RAISE NOTICE 'source column already exists';
    END IF;
END $$;

-- Add assigned_agent_id column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'leads' 
        AND column_name = 'assigned_agent_id'
    ) THEN
        ALTER TABLE leads ADD COLUMN assigned_agent_id VARCHAR(255);
        RAISE NOTICE 'Added assigned_agent_id column';
    ELSE
        RAISE NOTICE 'assigned_agent_id column already exists';
    END IF;
END $$;

-- Add notes column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'leads' 
        AND column_name = 'notes'
    ) THEN
        ALTER TABLE leads ADD COLUMN notes TEXT;
        RAISE NOTICE 'Added notes column';
    ELSE
        RAISE NOTICE 'notes column already exists';
    END IF;
END $$;

-- Add updated_at column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'leads' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE leads ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
        RAISE NOTICE 'Added updated_at column';
    ELSE
        RAISE NOTICE 'updated_at column already exists';
    END IF;
END $$;

-- Show the updated table structure
SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'leads'
ORDER BY ordinal_position;
