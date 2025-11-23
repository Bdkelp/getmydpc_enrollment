-- ============================================
-- VERIFY EXISTING USERS EMAIL ADDRESSES
-- ============================================
-- This script marks all existing users as email verified
-- so they are not locked out when email verification is enabled.
--
-- Run this ONCE in Supabase SQL Editor before deploying
-- email verification changes to production.
-- ============================================

-- Update all existing users to mark email as verified
UPDATE users
SET 
  email_verified = true,
  email_verified_at = COALESCE(email_verified_at, created_at, NOW())
WHERE email_verified = false OR email_verified IS NULL;

-- Verify the update
SELECT 
  COUNT(*) as total_users,
  COUNT(CASE WHEN email_verified = true THEN 1 END) as verified_users,
  COUNT(CASE WHEN email_verified = false OR email_verified IS NULL THEN 1 END) as unverified_users
FROM users;

-- Show updated users
SELECT 
  id,
  email,
  first_name,
  last_name,
  role,
  email_verified,
  email_verified_at,
  created_at
FROM users
ORDER BY created_at DESC;
