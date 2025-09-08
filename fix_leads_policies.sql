-- Fix leads RLS policies for contact form and dashboard access

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "public can create leads" ON public.leads;
DROP POLICY IF EXISTS "read leads (all) for dashboard" ON public.leads;
DROP POLICY IF EXISTS "Allow public lead creation" ON public.leads;
DROP POLICY IF EXISTS "Allow authenticated users to view leads" ON public.leads;

-- Allow anonymous users to INSERT leads (for contact forms)
CREATE POLICY "public can create leads" ON public.leads
  FOR INSERT 
  TO anon, authenticated
  WITH CHECK (true);

-- Allow authenticated users to read leads (for dashboard)
CREATE POLICY "read leads (all) for dashboard" ON public.leads
  FOR SELECT 
  TO authenticated
  USING (true);

-- Allow authenticated users to update/delete leads (for management)
CREATE POLICY "manage leads for authenticated users" ON public.leads
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "delete leads for authenticated users" ON public.leads
  FOR DELETE
  TO authenticated
  USING (true);

-- Verify the policies were created
SELECT 
  'LEADS POLICIES' as table_name,
  policyname,
  cmd as policy_type,
  CASE 
    WHEN cmd = 'INSERT' AND roles::text LIKE '%anon%' THEN '✅ Anonymous insert allowed'
    WHEN cmd = 'SELECT' AND roles::text LIKE '%authenticated%' THEN '✅ Authenticated read allowed'
    WHEN cmd IN ('UPDATE', 'DELETE') THEN '✅ Management allowed'
    ELSE '📋 Other policy'
  END as status
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'leads'
ORDER BY cmd, policyname;
