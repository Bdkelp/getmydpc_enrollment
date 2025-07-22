-- Enable Row Level Security on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollment_modifications ENABLE ROW LEVEL SECURITY;

-- Create policies for users table
-- Admins can see all users
CREATE POLICY "Admins can view all users" ON public.users
  FOR SELECT
  USING (auth.uid() IN (
    SELECT id FROM public.users WHERE role = 'admin'
  ));

-- Users can view their own record
CREATE POLICY "Users can view own record" ON public.users
  FOR SELECT
  USING (auth.uid() = id);

-- Admins can update all users
CREATE POLICY "Admins can update all users" ON public.users
  FOR UPDATE
  USING (auth.uid() IN (
    SELECT id FROM public.users WHERE role = 'admin'
  ));

-- Users can update their own record
CREATE POLICY "Users can update own record" ON public.users
  FOR UPDATE
  USING (auth.uid() = id);

-- Service role can do everything (for backend operations)
CREATE POLICY "Service role bypass" ON public.users
  FOR ALL
  USING (auth.role() = 'service_role');

-- Create policies for leads table
-- Admins can see all leads
CREATE POLICY "Admins can view all leads" ON public.leads
  FOR ALL
  USING (auth.uid() IN (
    SELECT id FROM public.users WHERE role = 'admin'
  ));

-- Agents can see their assigned leads
CREATE POLICY "Agents can view assigned leads" ON public.leads
  FOR SELECT
  USING (
    auth.uid() = assignedAgentId OR
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'agent')
  );

-- Agents can update their assigned leads
CREATE POLICY "Agents can update assigned leads" ON public.leads
  FOR UPDATE
  USING (auth.uid() = assignedAgentId);

-- Service role bypass
CREATE POLICY "Service role bypass leads" ON public.leads
  FOR ALL
  USING (auth.role() = 'service_role');

-- Create policies for plans table
-- Everyone can view plans (public data)
CREATE POLICY "Everyone can view plans" ON public.plans
  FOR SELECT
  USING (true);

-- Only admins can modify plans
CREATE POLICY "Admins can modify plans" ON public.plans
  FOR ALL
  USING (auth.uid() IN (
    SELECT id FROM public.users WHERE role = 'admin'
  ));

-- Service role bypass
CREATE POLICY "Service role bypass plans" ON public.plans
  FOR ALL
  USING (auth.role() = 'service_role');

-- Create policies for subscriptions table
-- Admins can see all subscriptions
CREATE POLICY "Admins can view all subscriptions" ON public.subscriptions
  FOR ALL
  USING (auth.uid() IN (
    SELECT id FROM public.users WHERE role = 'admin'
  ));

-- Users can see their own subscriptions
CREATE POLICY "Users can view own subscriptions" ON public.subscriptions
  FOR SELECT
  USING (auth.uid() = userId);

-- Agents can view subscriptions they enrolled
CREATE POLICY "Agents can view enrolled subscriptions" ON public.subscriptions
  FOR SELECT
  USING (auth.uid() = enrolledByAgentId);

-- Service role bypass
CREATE POLICY "Service role bypass subscriptions" ON public.subscriptions
  FOR ALL
  USING (auth.role() = 'service_role');

-- Create policies for payments table
-- Admins can see all payments
CREATE POLICY "Admins can view all payments" ON public.payments
  FOR ALL
  USING (auth.uid() IN (
    SELECT id FROM public.users WHERE role = 'admin'
  ));

-- Users can see their own payments
CREATE POLICY "Users can view own payments" ON public.payments
  FOR SELECT
  USING (auth.uid() = userId);

-- Service role bypass
CREATE POLICY "Service role bypass payments" ON public.payments
  FOR ALL
  USING (auth.role() = 'service_role');

-- Create policies for family_members table
-- Admins can see all family members
CREATE POLICY "Admins can view all family members" ON public.family_members
  FOR ALL
  USING (auth.uid() IN (
    SELECT id FROM public.users WHERE role = 'admin'
  ));

-- Users can see their own family members
CREATE POLICY "Users can view own family members" ON public.family_members
  FOR SELECT
  USING (auth.uid() = userId);

-- Service role bypass
CREATE POLICY "Service role bypass family members" ON public.family_members
  FOR ALL
  USING (auth.role() = 'service_role');

-- Create policies for lead_activities table
-- Admins can see all activities
CREATE POLICY "Admins can view all lead activities" ON public.lead_activities
  FOR ALL
  USING (auth.uid() IN (
    SELECT id FROM public.users WHERE role = 'admin'
  ));

-- Agents can see activities for their leads
CREATE POLICY "Agents can view lead activities" ON public.lead_activities
  FOR SELECT
  USING (
    auth.uid() = agentId OR
    leadId IN (SELECT id FROM public.leads WHERE assignedAgentId = auth.uid())
  );

-- Agents can create activities for their leads
CREATE POLICY "Agents can create lead activities" ON public.lead_activities
  FOR INSERT
  USING (
    auth.uid() = agentId AND
    leadId IN (SELECT id FROM public.leads WHERE assignedAgentId = auth.uid())
  );

-- Service role bypass
CREATE POLICY "Service role bypass lead activities" ON public.lead_activities
  FOR ALL
  USING (auth.role() = 'service_role');

-- Create policies for enrollment_modifications table
-- Admins can see all modifications
CREATE POLICY "Admins can view all enrollment modifications" ON public.enrollment_modifications
  FOR ALL
  USING (auth.uid() IN (
    SELECT id FROM public.users WHERE role = 'admin'
  ));

-- Service role bypass
CREATE POLICY "Service role bypass enrollment modifications" ON public.enrollment_modifications
  FOR ALL
  USING (auth.role() = 'service_role');