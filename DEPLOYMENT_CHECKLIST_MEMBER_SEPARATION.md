# Deployment Checklist - Member/User Separation & Agent Numbers

## 🎯 Overview
This deployment separates enrolled healthcare members from authenticated users (agents/admins) and ensures agent numbers are properly tracked throughout the system.

---

## 📋 Pre-Deployment Checklist

### 1. Backup Database
```bash
# Backup entire Neon database
pg_dump -U [username] -h [neon-host] -d [database] > backup_pre_member_separation_$(date +%Y%m%d).sql

# Backup just users table (most critical)
pg_dump -U [username] -h [neon-host] -d [database] -t users > users_backup_$(date +%Y%m%d).sql
```

### 2. Verify Current State
```sql
-- Count members vs staff
SELECT role, COUNT(*) as count FROM users GROUP BY role ORDER BY role;

-- Expected output:
-- role   | count
-- -------+-------
-- member | 70-85  (these will be migrated to members table)
-- agent  | 2-3
-- admin  | 3-5

-- Check for users WITHOUT agent numbers (agents/admins should have them)
SELECT id, email, role, agent_number 
FROM users 
WHERE role IN ('agent', 'admin', 'super_admin') 
  AND agent_number IS NULL;

-- Check subscriptions
SELECT COUNT(*) as total_subscriptions FROM subscriptions;

-- Check payments
SELECT COUNT(*) as total_payments FROM payments;

-- Check commissions
SELECT COUNT(*) as total_commissions FROM commissions;
```

---

## 🚀 Deployment Steps

### Step 1: Run Schema Migration (5-10 minutes)

```sql
-- Run the migration script:
-- File: member_user_separation_migration.sql

-- This will:
-- 1. Create members table
-- 2. Add member_id columns to subscriptions, payments, commissions, family_members
-- 3. Migrate member records from users to members
-- 4. Update all foreign key references
-- 5. Create backward compatibility view

-- Execute in Neon SQL Editor or via psql:
psql -U [username] -h [neon-host] -d [database] -f member_user_separation_migration.sql
```

### Step 2: Verify Migration Success

```sql
-- Count migrated members
SELECT COUNT(*) as migrated_members FROM members;
-- Expected: 70-85 (should match member count from users table)

-- Count remaining users (should be staff only)
SELECT role, COUNT(*) as count FROM users GROUP BY role ORDER BY role;
-- Expected: Only agent, admin, super_admin (NO "member" or "user")

-- Verify subscriptions linked to members
SELECT COUNT(*) as member_subscriptions 
FROM subscriptions 
WHERE member_id IS NOT NULL;
-- Expected: ~70-85

-- Verify payments linked to members
SELECT COUNT(*) as member_payments 
FROM payments 
WHERE member_id IS NOT NULL;
-- Expected: Should match successful payments

-- Check for orphaned records (should be 0)
SELECT COUNT(*) FROM subscriptions WHERE user_id IS NULL AND member_id IS NULL;
SELECT COUNT(*) FROM payments WHERE user_id IS NULL AND member_id IS NULL;
SELECT COUNT(*) FROM commissions WHERE user_id IS NULL AND member_id IS NULL;
-- All should return 0

-- Verify agent numbers populated in members
SELECT COUNT(*) as members_with_agent_number 
FROM members 
WHERE agent_number IS NOT NULL;
```

### Step 3: Deploy Code Changes

#### A. Schema File (Already Updated)
- `shared/schema.ts` - Updated with members table and member_id fields

#### B. Backend Changes
- `server/storage.ts` - Auto-generates agent numbers on user creation
- `server/routes.ts` - Captures agent_number in commission creation

#### C. Deploy to Railway
```bash
# From project root
git add .
git commit -m "Member/User separation + Agent number tracking"
git push origin main

# Railway will auto-deploy
# Monitor deployment logs for any errors
```

### Step 4: Delete Member Records from Users Table ⚠️

**ONLY DO THIS AFTER VERIFYING MIGRATION SUCCESS**

```sql
-- Review members to be deleted (VERIFY FIRST!)
SELECT id, email, first_name, last_name, role, created_at
FROM users
WHERE role = 'member' OR role = 'user'
ORDER BY created_at DESC;

-- Count before deletion
SELECT COUNT(*) FROM users WHERE role IN ('member', 'user');

-- DELETE (POINT OF NO RETURN - ENSURE BACKUP EXISTS!)
DELETE FROM users WHERE role = 'member' OR role = 'user';

-- Verify only staff remain
SELECT role, COUNT(*) as count FROM users GROUP BY role;
-- Expected output:
-- role        | count
-- ------------+-------
-- admin       | 3-5
-- agent       | 2-3
-- super_admin | 0-1
```

---

## 🔍 Post-Deployment Verification

### 1. Test Agent Login
- [ ] Agents can log in successfully
- [ ] Agent dashboard loads
- [ ] Agent can see their enrollments
- [ ] Agent numbers display correctly (format: MPPAG251154)

### 2. Test Admin Login
- [ ] Admins can log in successfully
- [ ] Admin dashboard loads
- [ ] Admin can see all members
- [ ] Admin can see all agents
- [ ] Admin numbers display correctly (format: MPPSA251154)

### 3. Test Member Login (Should FAIL)
- [ ] Members CANNOT log in
- [ ] Proper error message displayed
- [ ] No security vulnerabilities

### 4. Test New Enrollment
```bash
# Test enrollment workflow:
1. Agent logs in
2. Creates new member enrollment
3. Processes payment
4. Verify:
   - Member created in members table (NOT users)
   - Subscription linked to member_id
   - Payment linked to member_id
   - Commission created with agent_number
   - Agent number captured correctly
```

### 5. Verify Commission Tracking
```sql
-- Check recent commissions have agent_number
SELECT id, agent_id, agent_number, plan_name, commission_amount, created_at
FROM commissions
ORDER BY created_at DESC
LIMIT 10;

-- All should have agent_number populated

-- Verify commission totals by agent number
SELECT 
  agent_number,
  COUNT(*) as enrollment_count,
  SUM(commission_amount) as total_commission,
  SUM(total_plan_cost) as total_revenue
FROM commissions
WHERE agent_number IS NOT NULL
GROUP BY agent_number
ORDER BY total_commission DESC;
```

### 6. Verify Data Integrity
```sql
-- Check for data inconsistencies
SELECT 'Orphaned Subscriptions' as check_type, COUNT(*) as count
FROM subscriptions WHERE user_id IS NULL AND member_id IS NULL
UNION ALL
SELECT 'Orphaned Payments', COUNT(*)
FROM payments WHERE user_id IS NULL AND member_id IS NULL
UNION ALL
SELECT 'Orphaned Commissions', COUNT(*)
FROM commissions WHERE user_id IS NULL AND member_id IS NULL
UNION ALL
SELECT 'Members without Email', COUNT(*)
FROM members WHERE email IS NULL OR email = ''
UNION ALL
SELECT 'Agents without Agent Number', COUNT(*)
FROM users WHERE role IN ('agent', 'admin') AND agent_number IS NULL;

-- All counts should be 0
```

---

## 🔄 Agent Number Auto-Generation

### How It Works
- **Format**: `MPP + RoleCode + Year + SSN Last 4`
- **Examples**:
  - Super Admin: `MPPSA251154` (MPP + SA + 25 + 1154)
  - Agent: `MPPAG251154` (MPP + AG + 25 + 1154)
  
### When Generated
1. **On User Creation** - When agent/admin account created with SSN
2. **Automatic** - No manual intervention needed
3. **Unique** - Based on SSN last 4 digits (collision unlikely)

### Where Used
- **Users Table**: `agent_number` column
- **Members Table**: `agent_number` column (captured at enrollment)
- **Commissions Table**: `agent_number` column (for reporting)

### Testing Agent Number Generation
```sql
-- Test creating a new agent with SSN
INSERT INTO users (id, email, first_name, last_name, role, ssn, is_active)
VALUES (
  'test-agent-123',
  'test.agent@mypremierplans.com',
  'Test',
  'Agent',
  'agent',
  '123-45-6789', -- SSN
  true
);

-- Check if agent_number was generated
SELECT id, email, role, agent_number FROM users WHERE id = 'test-agent-123';
-- Expected: agent_number = MPPAG256789

-- Clean up test
DELETE FROM users WHERE id = 'test-agent-123';
```

---

## 🐛 Troubleshooting

### Issue: Migration fails with constraint violation
**Solution**: Check for orphaned foreign key references
```sql
-- Find subscriptions with invalid user_id
SELECT s.* FROM subscriptions s
LEFT JOIN users u ON s.user_id = u.id
WHERE s.user_id IS NOT NULL AND u.id IS NULL;

-- Fix by nullifying or deleting
UPDATE subscriptions SET user_id = NULL WHERE user_id NOT IN (SELECT id FROM users);
```

### Issue: Members can still log in after migration
**Solution**: Members should not have authentication in Supabase
```sql
-- Check if member emails still have Supabase auth
-- (This requires Supabase admin access)

-- Block member logins in middleware
-- Edit server/routes.ts auth middleware to check role
```

### Issue: Agent numbers not generating
**Solution**: Ensure SSN is provided during user creation
```javascript
// In user creation code, ensure SSN is passed:
const user = await storage.createUser({
  email: 'agent@example.com',
  role: 'agent',
  ssn: '123456789', // REQUIRED for agent number generation
  // ... other fields
});

console.log('Generated agent number:', user.agentNumber);
```

### Issue: Commissions missing agent_number
**Solution**: Run backfill query
```sql
-- Backfill agent_number in existing commissions
UPDATE commissions c
SET agent_number = u.agent_number
FROM users u
WHERE c.agent_id = u.id
  AND c.agent_number IS NULL
  AND u.agent_number IS NOT NULL;

-- Verify backfill
SELECT COUNT(*) FROM commissions WHERE agent_number IS NULL;
-- Should be 0 or only 'HOUSE' commissions
```

---

## 📊 Success Metrics

- ✅ **0** members in users table
- ✅ **70-85** records in members table
- ✅ **100%** of subscriptions have member_id or user_id (no orphans)
- ✅ **100%** of payments have member_id or user_id (no orphans)
- ✅ **100%** of commissions have agent_number
- ✅ **100%** of agents have agent_number in format MPPAG######
- ✅ **0** failed login attempts from members
- ✅ **All** tests passing in post-deployment verification

---

## 🔙 Rollback Plan

If critical issues occur:

### Option 1: Restore from Backup (Safest)
```bash
# Restore entire database
psql -U [username] -h [neon-host] -d [database] < backup_pre_member_separation_YYYYMMDD.sql
```

### Option 2: Recreate Members in Users Table
```sql
-- Copy members back to users table from members table
INSERT INTO users (
  id, email, first_name, last_name, middle_name, phone,
  date_of_birth, gender, ssn, address, address2, city, state, zip_code,
  role, is_active, created_at, updated_at
)
SELECT 
  customer_number as id,
  email, first_name, last_name, middle_name, phone,
  date_of_birth, gender, ssn, address, address2, city, state, zip_code,
  'member' as role,
  is_active,
  created_at,
  updated_at
FROM members;

-- Update foreign keys back to users
UPDATE subscriptions SET user_id = member_id, member_id = NULL WHERE member_id IS NOT NULL;
UPDATE payments SET user_id = member_id, member_id = NULL WHERE member_id IS NOT NULL;
UPDATE commissions SET user_id = member_id, member_id = NULL WHERE member_id IS NOT NULL;
```

---

## 📝 Next Steps After Deployment

1. **Clean Test Data** (Issue #4)
   - Keep last 20 enrollments for EPX
   - Delete all other test records
   
2. **Fix Commission Logic** (Issue #3)
   - Verify commission calculations
   - Test commission display in dashboards
   
3. **Role-Based Dashboards** (Issue #5)
   - Implement agent-only view
   - Implement admin view
   - Implement super admin view
   
4. **Login Tracking** (Issue #6)
   - Track last login timestamps
   - Create activity log view

---

## 🎉 Completion Checklist

- [ ] Database backup created
- [ ] Migration script executed successfully
- [ ] Members table populated
- [ ] Foreign keys updated
- [ ] Member records deleted from users table
- [ ] Code deployed to Railway
- [ ] Agent login tested
- [ ] Admin login tested
- [ ] Member login blocked (tested)
- [ ] New enrollment tested
- [ ] Commission tracking verified
- [ ] Agent numbers generating correctly
- [ ] All verification queries passing
- [ ] No orphaned records
- [ ] Monitoring in place for 24 hours
- [ ] Team notified of changes

---

**Deployment Date**: _____________

**Deployed By**: _____________

**Sign-off**: _____________
