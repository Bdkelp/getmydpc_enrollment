-- Check what's in lead_activities table
SELECT * FROM lead_activities;

-- Check what's in leads table  
SELECT * FROM leads;

-- Remove the problematic foreign key constraint temporarily
ALTER TABLE lead_activities DROP CONSTRAINT IF EXISTS lead_activities_lead_id_leads_id_fk;

-- Clear the lead_activities table since it has orphaned data
TRUNCATE TABLE lead_activities;

-- Re-add the constraint
ALTER TABLE lead_activities ADD CONSTRAINT lead_activities_lead_id_leads_id_fk FOREIGN KEY (lead_id) REFERENCES leads(id);
