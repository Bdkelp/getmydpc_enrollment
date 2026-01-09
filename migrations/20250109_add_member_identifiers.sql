-- Expand customer_number to fit prefixed alphanumeric IDs
ALTER TABLE members
  ALTER COLUMN customer_number TYPE varchar(24);

-- Add human-readable member identifier used for external references
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS member_public_id varchar(24);

-- Backfill existing rows (test data) with deterministic values if needed
UPDATE members
SET member_public_id = CONCAT('MEMB-', TO_CHAR(COALESCE(updated_at, NOW()), 'YYMM'), '-', LPAD(id::text, 4, '0'))
WHERE member_public_id IS NULL;

-- Enforce constraints after backfill
ALTER TABLE members
  ALTER COLUMN member_public_id SET NOT NULL;

ALTER TABLE members
  ADD CONSTRAINT IF NOT EXISTS members_member_public_id_key UNIQUE (member_public_id);
