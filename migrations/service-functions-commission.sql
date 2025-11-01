-- Alternative Approach: Service Role Client Configuration
-- If RLS continues to cause issues, we can create service-only functions

-- Create a function that runs with SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION create_commission_service(
    p_agent_id TEXT,
    p_member_id TEXT,
    p_lead_id TEXT DEFAULT NULL,
    p_enrollment_id TEXT DEFAULT NULL,
    p_commission_amount DECIMAL(10,2),
    p_coverage_type TEXT,
    p_policy_number TEXT DEFAULT NULL,
    p_carrier TEXT DEFAULT NULL,
    p_commission_percentage DECIMAL(5,2) DEFAULT NULL,
    p_base_premium DECIMAL(10,2) DEFAULT NULL,
    p_status TEXT DEFAULT 'pending',
    p_payment_status TEXT DEFAULT 'unpaid',
    p_epx_commission_id TEXT DEFAULT NULL,
    p_epx_transaction_id TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_paid_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_id UUID;
BEGIN
    INSERT INTO agent_commissions (
        agent_id, member_id, lead_id, enrollment_id,
        commission_amount, coverage_type, policy_number, carrier,
        commission_percentage, base_premium, status, payment_status,
        epx_commission_id, epx_transaction_id, notes, paid_at
    ) VALUES (
        p_agent_id, p_member_id, p_lead_id, p_enrollment_id,
        p_commission_amount, p_coverage_type, p_policy_number, p_carrier,
        p_commission_percentage, p_base_premium, p_status, p_payment_status,
        p_epx_commission_id, p_epx_transaction_id, p_notes, p_paid_at
    ) RETURNING id INTO new_id;
    
    RETURN new_id;
END;
$$;

-- Create a function to get commissions that bypasses RLS
CREATE OR REPLACE FUNCTION get_agent_commissions_service(p_agent_id TEXT DEFAULT NULL)
RETURNS TABLE (
    id UUID,
    agent_id TEXT,
    member_id TEXT,
    lead_id TEXT,
    enrollment_id TEXT,
    commission_amount DECIMAL(10,2),
    coverage_type TEXT,
    policy_number TEXT,
    carrier TEXT,
    commission_percentage DECIMAL(5,2),
    base_premium DECIMAL(10,2),
    status TEXT,
    payment_status TEXT,
    epx_commission_id TEXT,
    epx_transaction_id TEXT,
    notes TEXT,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF p_agent_id IS NULL THEN
        -- Return all commissions
        RETURN QUERY SELECT * FROM agent_commissions ORDER BY created_at DESC;
    ELSE
        -- Return commissions for specific agent
        RETURN QUERY SELECT * FROM agent_commissions WHERE agent_commissions.agent_id = p_agent_id ORDER BY created_at DESC;
    END IF;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION create_commission_service TO authenticated;
GRANT EXECUTE ON FUNCTION get_agent_commissions_service TO authenticated;