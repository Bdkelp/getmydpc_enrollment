
-- Database safety trigger to prevent admin commission creation
-- This creates a function and trigger to prevent commission inserts for admin users

-- Create the function that checks for admin role
CREATE OR REPLACE FUNCTION prevent_admin_commission()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if the agent is an admin
    IF EXISTS (
        SELECT 1 
        FROM users 
        WHERE id = NEW."agentId" 
        AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Cannot create commission for admin users (agent role check). Agent ID: %', NEW."agentId";
    END IF;
    
    -- Check if the enrolled user is an admin
    IF EXISTS (
        SELECT 1 
        FROM users 
        WHERE id = NEW."userId" 
        AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Cannot create commission when enrolling user is admin (user role check). User ID: %', NEW."userId";
    END IF;
    
    -- If neither is admin, allow the insert
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_prevent_admin_commission ON commissions;
CREATE TRIGGER trigger_prevent_admin_commission
    BEFORE INSERT ON commissions
    FOR EACH ROW
    EXECUTE FUNCTION prevent_admin_commission();

-- Add a comment to document the safety measure
COMMENT ON FUNCTION prevent_admin_commission() IS 'Safety function to prevent commission creation for admin users';
COMMENT ON TRIGGER trigger_prevent_admin_commission ON commissions IS 'Prevents commission inserts when agent or enrolled user has admin role';
