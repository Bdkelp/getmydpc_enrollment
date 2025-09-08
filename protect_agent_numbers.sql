
-- Database trigger to protect agent number modifications
-- Only allows admin users to modify agent numbers

CREATE OR REPLACE FUNCTION protect_agent_number_changes()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if agent number is being modified
    IF OLD."agentNumber" IS DISTINCT FROM NEW."agentNumber" THEN
        -- Check if the current user is an admin
        IF NOT EXISTS (
            SELECT 1 
            FROM public.users 
            WHERE id = auth.uid() 
            AND role = 'admin'
        ) THEN
            RAISE EXCEPTION 'Only administrators can modify agent numbers. This is critical for commission tracking.';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to protect agent number modifications
DROP TRIGGER IF EXISTS trigger_protect_agent_numbers ON public.users;
CREATE TRIGGER trigger_protect_agent_numbers
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION protect_agent_number_changes();

-- Add documentation
COMMENT ON FUNCTION protect_agent_number_changes() IS 'Critical function to prevent non-admin users from modifying agent numbers, which are essential for commission tracking';
COMMENT ON TRIGGER trigger_protect_agent_numbers ON public.users IS 'Ensures only administrators can assign or modify agent numbers for commission tracking integrity';
