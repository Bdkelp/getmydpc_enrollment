-- Fix the prevent_admin_commission trigger function
-- The issue: function uses camelCase (agentId, userId) but table has snake_case (agent_id, user_id)

-- Drop and recreate the function with correct column names
DROP FUNCTION IF EXISTS prevent_admin_commission() CASCADE;

CREATE OR REPLACE FUNCTION prevent_admin_commission()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if the agent is an admin
    IF EXISTS (
        SELECT 1
        FROM users
        WHERE id = NEW.agent_id  -- FIXED: was NEW."agentId"
        AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Cannot create commission for admin users (agent role check). Agent ID: %', NEW.agent_id;
    END IF;

    -- Check if the enrolled user is an admin
    IF EXISTS (
        SELECT 1
        FROM users
        WHERE id = NEW.user_id  -- FIXED: was NEW."userId"
        AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Cannot create commission when enrolling user is admin (user role check). User ID: %', NEW.user_id;
    END IF;

    -- If neither is admin, allow the insert
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER trigger_prevent_admin_commission
    BEFORE INSERT ON commissions
    FOR EACH ROW
    EXECUTE FUNCTION prevent_admin_commission();

-- Test message
SELECT 'Commission trigger fixed! Column names now use snake_case (agent_id, user_id)' AS status;
