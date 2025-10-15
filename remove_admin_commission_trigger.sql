-- Remove the admin commission prevention trigger entirely
-- We want to track admin commissions, just not pay them out

DROP TRIGGER IF EXISTS trigger_prevent_admin_commission ON commissions CASCADE;
DROP FUNCTION IF EXISTS prevent_admin_commission() CASCADE;

SELECT 'Admin commission trigger removed. All commissions will now be tracked regardless of role.' AS status;
