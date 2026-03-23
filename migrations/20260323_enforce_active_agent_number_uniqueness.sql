-- Enforce unique agent numbers among ACTIVE agent accounts
-- This prevents duplicate commission attribution keys for active field agents.

-- Normalize stored values before enforcing uniqueness.
UPDATE users
SET agent_number = UPPER(TRIM(agent_number))
WHERE agent_number IS NOT NULL;

-- Fail fast if duplicates still exist among active agents.
DO $$
BEGIN
  IF EXISTS (
    SELECT UPPER(agent_number)
    FROM users
    WHERE role = 'agent'
      AND is_active = true
      AND agent_number IS NOT NULL
    GROUP BY UPPER(agent_number)
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add unique index: duplicate active agent_number values exist. Resolve duplicates first.';
  END IF;
END $$;

-- Enforce uniqueness only for active agents.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_active_agent_number_unique
ON users (UPPER(agent_number))
WHERE role = 'agent'
  AND is_active = true
  AND agent_number IS NOT NULL;
