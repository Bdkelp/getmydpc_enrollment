-- Fix leads table schema in Supabase
-- Run this SQL in your Supabase SQL Editor

-- Check if leads table exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'leads') THEN
        -- Create leads table with proper camelCase column names (with quotes)
        CREATE TABLE leads (
            id SERIAL PRIMARY KEY,
            "firstName" VARCHAR(255) NOT NULL,
            "lastName" VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL,
            phone VARCHAR(50) NOT NULL,
            message TEXT,
            source VARCHAR(50) DEFAULT 'contact_form',
            status VARCHAR(50) DEFAULT 'new',
            "assignedAgentId" VARCHAR(255),
            notes TEXT,
            "createdAt" TIMESTAMP DEFAULT NOW(),
            "updatedAt" TIMESTAMP DEFAULT NOW()
        );
        
        RAISE NOTICE 'Created leads table with camelCase columns';
    ELSE
        -- Table exists, check if assignedAgentId column exists
        IF NOT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'leads' 
            AND column_name = 'assignedAgentId'
        ) THEN
            -- Add the missing column
            ALTER TABLE leads ADD COLUMN "assignedAgentId" VARCHAR(255);
            RAISE NOTICE 'Added assignedAgentId column to leads table';
        ELSE
            RAISE NOTICE 'leads table already has assignedAgentId column';
        END IF;
        
        -- Also check for notes column
        IF NOT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'leads' 
            AND column_name = 'notes'
        ) THEN
            ALTER TABLE leads ADD COLUMN notes TEXT;
            RAISE NOTICE 'Added notes column to leads table';
        END IF;
    END IF;
END $$;

-- Show leads table structure
SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'leads'
ORDER BY ordinal_position;
