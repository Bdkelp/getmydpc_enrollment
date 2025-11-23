# Supabase Database Cleanup Steps

**Date**: November 22, 2025  
**Purpose**: Clean up old commissions table and test data, keeping only 3 real memberships

---

## ⚠️ IMPORTANT: Run These Steps in Supabase SQL Editor

### Step 1: Identify Your 3 Real Memberships

Run this query first to see which members to keep:

```sql
SELECT id, email, first_name, last_name, customer_number, status, created_at 
FROM members 
WHERE status = 'active' 
ORDER BY created_at DESC 
LIMIT 10;
```

**Write down the emails or IDs of your 3 real members!**

---

### Step 2: Delete Test Data (Customize for Your Members)

```sql
-- Delete test leads
DELETE FROM leads 
WHERE email LIKE '%test%' 
   OR email LIKE '%example%'
   OR first_name LIKE '%Test%';

-- Delete ALL data from old commissions table (being removed)
DELETE FROM commissions;

-- Delete test members (UPDATE THIS - add your 3 real member emails)
DELETE FROM members 
WHERE email NOT IN (
  'real-member-1@email.com',  -- REPLACE WITH ACTUAL EMAIL
  'real-member-2@email.com',  -- REPLACE WITH ACTUAL EMAIL
  'real-member-3@email.com'   -- REPLACE WITH ACTUAL EMAIL
);

-- Delete test users/agents (UPDATE THIS - keep real admins/agents)
DELETE FROM users 
WHERE email NOT IN (
  'travis@mypremierplans.com',
  'joaquin@mypremierplans.com',
  'richard@cyariskmanagement.com',
  'mdkeener@gmail.com',
  'mkeener@lonestarenotary.com',
  'bdkelp@gmail.com',
  'tmatheny77@gmail.com',
  'svillarreal@cyariskmanagement.com'
  -- Add any other real agent emails
);

-- Clean up orphaned records
DELETE FROM agent_commissions 
WHERE member_id NOT IN (SELECT id::text FROM members);

DELETE FROM agent_commissions 
WHERE agent_id NOT IN (SELECT id FROM users);

DELETE FROM subscriptions 
WHERE user_id NOT IN (SELECT id FROM users)
  AND member_id NOT IN (SELECT id FROM members);

DELETE FROM login_sessions 
WHERE user_id NOT IN (SELECT id FROM users);
```

---

### Step 3: Drop Old Commissions Table

```sql
-- Drop indexes
DROP INDEX IF EXISTS idx_commissions_member_id;
DROP INDEX IF EXISTS idx_commissions_agent_number;
DROP INDEX IF EXISTS idx_commissions_agent_id;
DROP INDEX IF EXISTS idx_commissions_user_id;
DROP INDEX IF EXISTS idx_commissions_subscription_id;

-- Drop the table (CASCADE removes foreign key constraints)
DROP TABLE IF EXISTS commissions CASCADE;
```

---

### Step 4: Verify Cleanup

```sql
-- Check remaining data counts
SELECT 
  (SELECT COUNT(*) FROM members) AS members_count,
  (SELECT COUNT(*) FROM users) AS users_count,
  (SELECT COUNT(*) FROM agent_commissions) AS agent_commissions_count,
  (SELECT COUNT(*) FROM leads) AS leads_count,
  (SELECT COUNT(*) FROM subscriptions) AS subscriptions_count;

-- List remaining members (should be 3)
SELECT id, email, first_name, last_name, customer_number, status, created_at 
FROM members 
ORDER BY created_at DESC;

-- List remaining users (agents/admins)
SELECT id, email, first_name, last_name, role, agent_number, is_active 
FROM users 
ORDER BY created_at DESC;

-- List remaining commissions in new table
SELECT id, agent_id, member_id, commission_amount, payment_status, created_at 
FROM agent_commissions 
ORDER BY created_at DESC;
```

---

## ✅ Expected Results After Cleanup

- **members table**: Exactly 3 active members
- **users table**: Only real agents and admins (no test accounts)
- **agent_commissions table**: Only commissions for the 3 real members
- **commissions table**: DELETED (table no longer exists)
- **leads table**: No test leads
- **subscriptions table**: Only subscriptions for real members

---

## 🔄 What Changed in the Code

The application now uses:
- ✅ **agent_commissions** - Primary commission table
- ✅ **agent_commissions_with_details** - View for enriched queries
- ❌ **commissions** - REMOVED (old legacy table)

All commission-related functions in `server/storage.ts` now use `agent_commissions` table.

---

## 🚨 Safety Notes

1. **Before running**: Make sure you've identified your 3 real memberships
2. **Customize the DELETE queries**: Update email lists to match YOUR data
3. **No rollback needed**: The code changes are already committed and deployed
4. **Test after cleanup**: Log into admin dashboard and verify commission data displays correctly

---

## 📝 Optional: Reset Auto-Increment IDs

If you want clean sequential IDs after cleanup:

```sql
SELECT setval('members_id_seq', (SELECT MAX(id) FROM members));
SELECT setval('leads_id_seq', (SELECT MAX(id) FROM leads));
```

---

**Status**: Code changes deployed ✅ | Database cleanup pending ⏳
