
-- Check if leads table exists and create if missing
DO $$ 
BEGIN
    -- Check if leads table exists
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'leads') THEN
        -- Create leads table
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
            "createdAt" TIMESTAMP DEFAULT NOW(),
            "updatedAt" TIMESTAMP DEFAULT NOW()
        );
        
        RAISE NOTICE 'Created leads table';
    ELSE
        RAISE NOTICE 'Leads table already exists';
    END IF;
    
    -- Check if lead_activities table exists
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'lead_activities') THEN
        -- Create lead_activities table
        CREATE TABLE lead_activities (
            id SERIAL PRIMARY KEY,
            "leadId" INTEGER REFERENCES leads(id) ON DELETE CASCADE,
            "agentId" VARCHAR(255),
            "activityType" VARCHAR(50),
            notes TEXT,
            "createdAt" TIMESTAMP DEFAULT NOW()
        );
        
        RAISE NOTICE 'Created lead_activities table';
    ELSE
        RAISE NOTICE 'Lead_activities table already exists';
    END IF;
END $$;

-- Show current leads
SELECT COUNT(*) as total_leads FROM leads;
SELECT * FROM leads ORDER BY "createdAt" DESC LIMIT 10;
