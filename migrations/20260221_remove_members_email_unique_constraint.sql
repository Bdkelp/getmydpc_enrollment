-- Migration: Remove UNIQUE constraint from members.email
-- Date: 2026-02-21
-- Purpose: Allow household members to share the same email address
-- Reason: Members do not authenticate via the platform - email is for communication only
-- Multiple family members in the same household may use one shared email

-- Drop the UNIQUE constraint on members.email
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_email_key;

-- Add index for performance (non-unique) since email is frequently queried
CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);

-- Add comment to document this change
COMMENT ON COLUMN members.email IS 'Email address for communication (NOT unique - household members may share email). Members do not authenticate.';
