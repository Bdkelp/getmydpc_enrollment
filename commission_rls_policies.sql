
-- Enable Row Level Security on commissions table
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

-- Create policies for commissions table

-- 1. Agents can only view their own commissions
CREATE POLICY "Agents can view own commissions" ON public.commissions
  FOR SELECT
  USING (
    auth.uid() = "agentId" AND
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'agent')
  );

-- 2. Admins can view all commissions
CREATE POLICY "Admins can view all commissions" ON public.commissions
  FOR SELECT
  USING (
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'admin')
  );

-- 3. Admins can insert new commissions
CREATE POLICY "Admins can insert commissions" ON public.commissions
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'admin')
  );

-- 4. Admins can update all commissions
CREATE POLICY "Admins can update commissions" ON public.commissions
  FOR UPDATE
  USING (
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'admin')
  );

-- 5. Admins can delete commissions
CREATE POLICY "Admins can delete commissions" ON public.commissions
  FOR DELETE
  USING (
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'admin')
  );

-- 6. Service role bypass for backend operations
CREATE POLICY "Service role bypass commissions" ON public.commissions
  FOR ALL
  USING (auth.role() = 'service_role');

-- Create policies for agent member management

-- 7. Agents can view users they enrolled or are assigned to manage
CREATE POLICY "Agents can view assigned users" ON public.users
  FOR SELECT
  USING (
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'agent') AND
    (
      "enrolledByAgentId" = auth.uid() OR
      id IN (
        SELECT "userId" FROM public.commissions WHERE "agentId" = auth.uid()
      )
    )
  );

-- 8. Agents can update member information for their assigned users (excluding sensitive fields)
CREATE POLICY "Agents can update assigned user info" ON public.users
  FOR UPDATE
  USING (
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'agent') AND
    (
      "enrolledByAgentId" = auth.uid() OR
      id IN (
        SELECT "userId" FROM public.commissions WHERE "agentId" = auth.uid()
      )
    )
  )
  WITH CHECK (
    -- Prevent agents from modifying critical system fields
    OLD.id = NEW.id AND
    OLD.email = NEW.email AND
    OLD.role = NEW.role AND
    OLD."approvalStatus" = NEW."approvalStatus" AND
    OLD."isActive" = NEW."isActive" AND
    OLD."createdAt" = NEW."createdAt" AND
    OLD."enrolledByAgentId" = NEW."enrolledByAgentId"
  );

-- Create policies for subscription management by agents

-- 9. Agents can view subscriptions for their assigned users
CREATE POLICY "Agents can view assigned user subscriptions" ON public.subscriptions
  FOR SELECT
  USING (
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'agent') AND
    "userId" IN (
      SELECT id FROM public.users 
      WHERE "enrolledByAgentId" = auth.uid()
      OR id IN (
        SELECT "userId" FROM public.commissions WHERE "agentId" = auth.uid()
      )
    )
  );

-- 10. Agents can update subscription plans/tiers for their assigned users (excluding payment dates)
CREATE POLICY "Agents can update assigned user subscriptions" ON public.subscriptions
  FOR UPDATE
  USING (
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'agent') AND
    "userId" IN (
      SELECT id FROM public.users 
      WHERE "enrolledByAgentId" = auth.uid()
      OR id IN (
        SELECT "userId" FROM public.commissions WHERE "agentId" = auth.uid()
      )
    )
  )
  WITH CHECK (
    -- Prevent agents from modifying payment timing and critical fields
    OLD.id = NEW.id AND
    OLD."userId" = NEW."userId" AND
    OLD."createdAt" = NEW."createdAt" AND
    OLD."nextBillingDate" = NEW."nextBillingDate" AND
    OLD."currentPeriodStart" = NEW."currentPeriodStart" AND
    OLD."currentPeriodEnd" = NEW."currentPeriodEnd" AND
    OLD."stripeSubscriptionId" = NEW."stripeSubscriptionId"
  );

-- Create policies for family member management by agents

-- 11. Agents can view family members for their assigned users
CREATE POLICY "Agents can view assigned user family members" ON public.family_members
  FOR SELECT
  USING (
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'agent') AND
    "primaryUserId" IN (
      SELECT id FROM public.users 
      WHERE "enrolledByAgentId" = auth.uid()
      OR id IN (
        SELECT "userId" FROM public.commissions WHERE "agentId" = auth.uid()
      )
    )
  );

-- 12. Agents can add family members for their assigned users
CREATE POLICY "Agents can add family members for assigned users" ON public.family_members
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'agent') AND
    "primaryUserId" IN (
      SELECT id FROM public.users 
      WHERE "enrolledByAgentId" = auth.uid()
      OR id IN (
        SELECT "userId" FROM public.commissions WHERE "agentId" = auth.uid()
      )
    )
  );

-- 13. Agents can update family members for their assigned users
CREATE POLICY "Agents can update family members for assigned users" ON public.family_members
  FOR UPDATE
  USING (
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'agent') AND
    "primaryUserId" IN (
      SELECT id FROM public.users 
      WHERE "enrolledByAgentId" = auth.uid()
      OR id IN (
        SELECT "userId" FROM public.commissions WHERE "agentId" = auth.uid()
      )
    )
  );

-- Create audit function for agent actions
CREATE OR REPLACE FUNCTION log_agent_actions()
RETURNS TRIGGER AS $$
BEGIN
  -- Log agent modifications to user data
  IF TG_TABLE_NAME = 'users' AND NEW IS DISTINCT FROM OLD THEN
    INSERT INTO public.audit_log (
      table_name,
      user_id,
      action,
      accessed_user_id,
      timestamp,
      details
    ) VALUES (
      TG_TABLE_NAME,
      auth.uid(),
      'UPDATE',
      NEW.id,
      NOW(),
      jsonb_build_object(
        'modified_by_agent', true,
        'old_values', to_jsonb(OLD),
        'new_values', to_jsonb(NEW)
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for agent action logging
CREATE TRIGGER log_agent_user_updates
  AFTER UPDATE ON public.users
  FOR EACH ROW
  WHEN (auth.uid() IN (SELECT id FROM public.users WHERE role = 'agent'))
  EXECUTE FUNCTION log_agent_actions();

CREATE TRIGGER log_agent_subscription_updates
  AFTER UPDATE ON public.subscriptions
  FOR EACH ROW
  WHEN (auth.uid() IN (SELECT id FROM public.users WHERE role = 'agent'))
  EXECUTE FUNCTION log_agent_actions();

-- Add comments for documentation
COMMENT ON POLICY "Agents can view own commissions" ON public.commissions IS 'Agents can only view commissions where they are the assigned agent';
COMMENT ON POLICY "Admins can view all commissions" ON public.commissions IS 'Admins have full read access to all commission records';
COMMENT ON POLICY "Agents can view assigned users" ON public.users IS 'Agents can view users they enrolled or have commissions for';
COMMENT ON POLICY "Agents can update assigned user info" ON public.users IS 'Agents can update demographic info but not system fields for their assigned users';
COMMENT ON FUNCTION log_agent_actions() IS 'Logs all agent modifications to user and subscription data for audit purposes';
