
-- Fix RLS policies for leads table to allow public submissions
BEGIN;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow public lead creation" ON leads;
DROP POLICY IF EXISTS "Allow authenticated users to view leads" ON leads;
DROP POLICY IF EXISTS "Allow admins and agents to manage leads" ON leads;

-- Allow anonymous users to INSERT leads (for contact forms)
CREATE POLICY "Allow public lead creation" ON leads
  FOR INSERT 
  TO anon, authenticated
  WITH CHECK (true);

-- Allow authenticated users to view leads based on role
CREATE POLICY "Allow authenticated users to view leads" ON leads
  FOR SELECT 
  TO authenticated
  USING (
    -- Admins can see all leads
    (SELECT auth.jwt() ->> 'user_metadata' -> 'role') = 'admin'
    OR
    -- Agents can see leads assigned to them or unassigned leads
    (
      (SELECT auth.jwt() ->> 'user_metadata' -> 'role') = 'agent'
      AND (
        assigned_agent_id IS NULL 
        OR assigned_agent_id = auth.uid()::text
      )
    )
  );

-- Allow admins and agents to update/delete leads
CREATE POLICY "Allow admins and agents to manage leads" ON leads
  FOR ALL
  TO authenticated
  USING (
    (SELECT auth.jwt() ->> 'user_metadata' -> 'role') IN ('admin', 'agent')
  )
  WITH CHECK (
    (SELECT auth.jwt() ->> 'user_metadata' -> 'role') IN ('admin', 'agent')
  );

-- Fix lead_activities RLS policies
DROP POLICY IF EXISTS "Allow authenticated users to manage lead activities" ON lead_activities;

CREATE POLICY "Allow authenticated users to manage lead activities" ON lead_activities
  FOR ALL
  TO authenticated
  USING (
    -- Admins can manage all activities
    (SELECT auth.jwt() ->> 'user_metadata' -> 'role') = 'admin'
    OR
    -- Agents can manage activities for their leads or activities they created
    (
      (SELECT auth.jwt() ->> 'user_metadata' -> 'role') = 'agent'
      AND (
        agent_id = auth.uid()::text
        OR EXISTS (
          SELECT 1 FROM leads 
          WHERE leads.id = lead_activities.lead_id 
          AND (leads.assigned_agent_id = auth.uid()::text OR leads.assigned_agent_id IS NULL)
        )
      )
    )
  )
  WITH CHECK (
    (SELECT auth.jwt() ->> 'user_metadata' -> 'role') IN ('admin', 'agent')
  );

COMMIT;
