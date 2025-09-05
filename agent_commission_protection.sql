
-- Additional protection to prevent agents from modifying commission amounts or payment status
-- Only admins should be able to modify commission financial details

-- Create function to protect commission financial data
CREATE OR REPLACE FUNCTION protect_commission_financials()
RETURNS TRIGGER AS $$
BEGIN
    -- If the user is an agent, prevent modification of financial fields
    IF auth.uid() IN (SELECT id FROM public.users WHERE role = 'agent') THEN
        -- Prevent agents from modifying commission amounts or payment status
        IF OLD."commissionAmount" IS DISTINCT FROM NEW."commissionAmount" OR
           OLD."totalPlanCost" IS DISTINCT FROM NEW."totalPlanCost" OR
           OLD."paymentStatus" IS DISTINCT FROM NEW."paymentStatus" OR
           OLD."paidDate" IS DISTINCT FROM NEW."paidDate" OR
           OLD."status" IS DISTINCT FROM NEW."status" THEN
            RAISE EXCEPTION 'Agents cannot modify commission financial details. Agent ID: %', auth.uid();
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to protect commission financial data
DROP TRIGGER IF EXISTS trigger_protect_commission_financials ON commissions;
CREATE TRIGGER trigger_protect_commission_financials
    BEFORE UPDATE ON commissions
    FOR EACH ROW
    EXECUTE FUNCTION protect_commission_financials();

-- Create function to protect subscription billing dates from agent modification
CREATE OR REPLACE FUNCTION protect_subscription_billing()
RETURNS TRIGGER AS $$
BEGIN
    -- If the user is an agent, prevent modification of billing dates and payment info
    IF auth.uid() IN (SELECT id FROM public.users WHERE role = 'agent') THEN
        -- Preserve critical billing and payment fields
        IF OLD."nextBillingDate" IS DISTINCT FROM NEW."nextBillingDate" OR
           OLD."currentPeriodStart" IS DISTINCT FROM NEW."currentPeriodStart" OR
           OLD."currentPeriodEnd" IS DISTINCT FROM NEW."currentPeriodEnd" OR
           OLD."stripeSubscriptionId" IS DISTINCT FROM NEW."stripeSubscriptionId" OR
           OLD."stripeCustomerId" IS DISTINCT FROM NEW."stripeCustomerId" THEN
            RAISE EXCEPTION 'Agents cannot modify billing dates or payment information. Agent ID: %', auth.uid();
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to protect subscription billing data
DROP TRIGGER IF EXISTS trigger_protect_subscription_billing ON subscriptions;
CREATE TRIGGER trigger_protect_subscription_billing
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION protect_subscription_billing();

-- Create view for agents to see their commission summary (read-only)
CREATE OR REPLACE VIEW agent_commission_summary AS
SELECT 
    c."agentId",
    u."firstName" || ' ' || u."lastName" as agent_name,
    u."agentNumber",
    COUNT(c.id) as total_commissions,
    COUNT(CASE WHEN c."paymentStatus" = 'paid' THEN 1 END) as paid_commissions,
    COUNT(CASE WHEN c."paymentStatus" = 'unpaid' THEN 1 END) as unpaid_commissions,
    COALESCE(SUM(c."commissionAmount"), 0) as total_commission_amount,
    COALESCE(SUM(CASE WHEN c."paymentStatus" = 'paid' THEN c."commissionAmount" ELSE 0 END), 0) as total_paid_amount,
    COALESCE(SUM(CASE WHEN c."paymentStatus" = 'unpaid' THEN c."commissionAmount" ELSE 0 END), 0) as total_unpaid_amount,
    MIN(c."createdAt") as first_commission_date,
    MAX(c."createdAt") as latest_commission_date
FROM commissions c
JOIN users u ON c."agentId" = u.id
WHERE u.role = 'agent'
GROUP BY c."agentId", u."firstName", u."lastName", u."agentNumber";

-- Grant access to the view
GRANT SELECT ON agent_commission_summary TO authenticated;

-- Add RLS to the view
ALTER VIEW agent_commission_summary ENABLE ROW LEVEL SECURITY;

-- Agents can only see their own summary
CREATE POLICY "Agents can view own commission summary" ON agent_commission_summary
  FOR SELECT
  USING (auth.uid() = "agentId");

-- Admins can see all summaries
CREATE POLICY "Admins can view all commission summaries" ON agent_commission_summary
  FOR SELECT
  USING (auth.uid() IN (SELECT id FROM users WHERE role = 'admin'));

-- Comments for documentation
COMMENT ON FUNCTION protect_commission_financials() IS 'Prevents agents from modifying commission financial details - only admins can adjust amounts and payment status';
COMMENT ON FUNCTION protect_subscription_billing() IS 'Prevents agents from modifying subscription billing dates and payment information';
COMMENT ON VIEW agent_commission_summary IS 'Read-only view providing commission summary data for agents';
