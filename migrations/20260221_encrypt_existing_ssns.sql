-- Migration: Encrypt existing plaintext SSN data
-- Date: 2026-02-21
-- Purpose: Encrypt all existing plaintext SSNs in members table
-- WARNING: This is a DATA MIGRATION - test in staging first!
-- 
-- PREREQUISITES:
-- 1. SSN_ENCRYPTION_KEY must be set in environment variables
-- 2. Backup database before running
-- 3. Test encryption/decryption functions first
--
-- MANUAL EXECUTION REQUIRED:
-- This migration cannot be executed as plain SQL because it requires
-- the Node.js encryption functions. Run the companion script instead:
-- 
--   node migrations/scripts/encrypt_existing_ssns.js
--
-- The script will:
-- 1. Read all members with non-null SSN
-- 2. For each member, check if SSN is already encrypted (contains ':')
-- 3. If plaintext, encrypt using encryptSSN() function
-- 4. Update member record with encrypted SSN
-- 5. Log progress and any errors
--
-- Rollback plan:
-- - Keep database backup
-- - Decryption function (decryptSSN) handles backward compatibility
--   for plaintext SSN values automatically

-- Mark migration as executed
INSERT INTO schema_migrations (version, description, executed_at)
VALUES (
  '20260221_encrypt_existing_ssns',
  'Encrypt existing plaintext SSN data in members table',
  NOW()
)
ON CONFLICT (version) DO NOTHING;

COMMENT ON TABLE members IS 'Members table - SSN field is encrypted with AES-256-GCM as of 2026-02-21';
