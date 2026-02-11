-- Add admin/test controls for memberships
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS is_test_member boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS archive_reason text;

-- Ensure legacy rows have explicit false value
UPDATE members SET is_test_member = false WHERE is_test_member IS NULL;
