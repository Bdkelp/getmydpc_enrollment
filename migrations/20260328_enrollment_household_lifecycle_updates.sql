-- Enrollment household + lifecycle updates
-- 1) Keep group member history via explicit terminated timestamp and status support
-- 2) Capture relationship and household numbering on staged group members
-- 3) Persist stable household numbering for family members

ALTER TABLE public.group_members
  ADD COLUMN IF NOT EXISTS relationship VARCHAR(20) DEFAULT 'primary',
  ADD COLUMN IF NOT EXISTS household_base_number VARCHAR(24),
  ADD COLUMN IF NOT EXISTS household_member_number VARCHAR(32),
  ADD COLUMN IF NOT EXISTS dependent_suffix INTEGER,
  ADD COLUMN IF NOT EXISTS terminated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_group_members_household_base_number
  ON public.group_members(household_base_number);

CREATE INDEX IF NOT EXISTS idx_group_members_household_member_number
  ON public.group_members(household_member_number);

ALTER TABLE public.family_members
  ADD COLUMN IF NOT EXISTS household_base_number VARCHAR(24),
  ADD COLUMN IF NOT EXISTS customer_number VARCHAR(32),
  ADD COLUMN IF NOT EXISTS dependent_suffix INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_family_members_customer_number_unique
  ON public.family_members(customer_number)
  WHERE customer_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_family_members_primary_suffix_unique
  ON public.family_members(primary_member_id, dependent_suffix)
  WHERE dependent_suffix IS NOT NULL;

ALTER TABLE public.family_members
  DROP CONSTRAINT IF EXISTS family_members_dependent_suffix_check;

ALTER TABLE public.family_members
  ADD CONSTRAINT family_members_dependent_suffix_check
  CHECK (dependent_suffix IS NULL OR dependent_suffix >= 1);
