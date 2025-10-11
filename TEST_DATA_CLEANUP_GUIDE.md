# Test Data Cleanup Guide

## Overview

This guide covers cleaning test enrollment data while preserving system functionality and EPX transaction visibility.

---

## 📋 Two Cleanup Strategies

### **Strategy 1: Keep Last 20 for EPX** (Recommended First)
- **File**: `clean_test_data_keep_last_20.sql`
- **Purpose**: Remove old test data while keeping 20 most recent enrollments
- **Why**: EPX wants to see recent transactions for visibility/verification
- **When**: Run now to clean up bulk of test data

### **Strategy 2: Complete Cleanup** (Production Launch)
- **File**: `clean_all_test_data_production.sql`
- **Purpose**: Remove ALL test data for production launch
- **Why**: Start with clean database for real customers
- **When**: After EPX reviews, before going live

---

## 🎯 What Gets Cleaned

### Data Types Cleaned:
- ❌ **Test Member Users**: Users with role='member' or 'user' (fake customers)
- ❌ **Test Subscriptions**: Healthcare plan enrollments
- ❌ **Test Payments**: Payment records linked to test subscriptions
- ❌ **Test Commissions**: Agent commission records for test enrollments
- ❌ **Test Family Members**: Dependent records linked to test enrollments

### Data Types PRESERVED:
- ✅ **Agents**: All users with role='agent'
- ✅ **Admins**: All users with role='admin' or 'super_admin'
- ✅ **Plans**: Healthcare plan definitions
- ✅ **System Configuration**: All settings, lookups, etc.

---

## 📊 Current State (As of October 2025)

**Before Cleanup:**
- 81 test member records in users table (security risk - shouldn't have login)
- Multiple test subscriptions with fake data
- Test payments and commissions
- Fake SSNs, emails, DOB, demographics

**After Strategy 1 (Keep Last 20):**
- 20 most recent enrollments preserved for EPX
- ~61+ older test records deleted
- All related payments/commissions cleaned
- EPX can still see recent transaction flow

**After Strategy 2 (Complete Cleanup):**
- 0 member records
- 0 subscriptions
- 0 payments
- 0 commissions
- Database ready for production enrollments

---

## 🚀 Strategy 1: Keep Last 20 Enrollments

### Step 1: Review Current Data

```sql
-- See what exists now
SELECT COUNT(*) as total_subscriptions FROM subscriptions;
SELECT COUNT(*) as total_member_users FROM users WHERE role IN ('member', 'user');
SELECT COUNT(*) as total_payments FROM payments;
SELECT COUNT(*) as total_commissions FROM commissions;

-- See oldest enrollments (will be deleted)
SELECT id, user_id, plan_name, created_at 
FROM subscriptions 
ORDER BY created_at ASC 
LIMIT 10;

-- See newest enrollments (will be kept)
SELECT id, user_id, plan_name, created_at 
FROM subscriptions 
ORDER BY created_at DESC 
LIMIT 20;
```

### Step 2: Run Cleanup Script

**Using Neon Console:**
1. Go to Neon Dashboard → Your Project
2. Click "SQL Editor" tab
3. Copy contents of `clean_test_data_keep_last_20.sql`
4. Paste and click "Run"
5. Review output - should show:
   - Before counts
   - What's being deleted
   - After counts
   - Verification checks (all should show ✅ PASS)

**Expected Output:**
```
BEFORE CLEANUP - Data Counts
member_users: 81
total_subscriptions: 65
total_payments: 45
total_commissions: 30
...

KEEPING THESE 20 ENROLLMENTS
[Shows 20 most recent by created_at]

DELETING THESE ENROLLMENTS
count_to_delete: 45
...

Commissions deleted: 25
Payments deleted: 35
Family members deleted: 5
Subscriptions deleted: 45
Member users deleted: 61

AFTER CLEANUP - Data Counts
member_users_remaining: 20
subscriptions_remaining: 20
payments_remaining: 20
commissions_remaining: 20
...

✅ TEST DATA CLEANUP COMPLETE!
```

### Step 3: Verify Results

```sql
-- Should have exactly 20 subscriptions
SELECT COUNT(*) FROM subscriptions; -- Expected: 20

-- Should have 20 or fewer member users (some might share users)
SELECT COUNT(*) FROM users WHERE role IN ('member', 'user'); -- Expected: ≤20

-- No orphaned records
SELECT COUNT(*) FROM payments 
WHERE subscription_id NOT IN (SELECT id FROM subscriptions); -- Expected: 0

SELECT COUNT(*) FROM commissions 
WHERE subscription_id NOT IN (SELECT id FROM subscriptions); -- Expected: 0

-- Agents still exist
SELECT COUNT(*) FROM users WHERE role IN ('agent', 'admin', 'super_admin'); -- Expected: 5+
```

### Step 4: Test EPX Visibility

1. Have EPX log in to their admin panel
2. Verify they can see the last 20 transactions
3. Check transaction IDs, amounts, dates are visible
4. Confirm they're satisfied with data visibility

---

## 🎯 Strategy 2: Complete Cleanup (After EPX Approval)

### Step 1: Create Backup

**CRITICAL: Always backup before complete cleanup!**

**Using Neon Console:**
1. Go to Neon Dashboard → Your Project
2. Click "Backups" tab
3. Click "Create Backup"
4. Name: "Before Complete Test Data Cleanup"
5. Wait for backup to complete

**Or using pg_dump (if you have CLI access):**
```bash
pg_dump -h <neon-host> -U <user> -d getmydpc -F c -b -v -f backup_before_cleanup.dump
```

### Step 2: Review Script

Open `clean_all_test_data_production.sql` and verify:
- DELETE statements are commented out (safety feature)
- You understand what will be deleted
- Backup exists

### Step 3: Uncomment and Run

1. Uncomment the DELETE statements in the script:
   ```sql
   -- BEFORE (safe):
   -- DELETE FROM commissions;
   
   -- AFTER (will execute):
   DELETE FROM commissions;
   ```

2. Run the modified script in Neon SQL Editor

3. Verify output shows 0 remaining records:
   ```
   member_users_remaining: 0
   subscriptions_remaining: 0
   payments_remaining: 0
   commissions_remaining: 0
   ```

### Step 4: Reset Sequences (Optional)

If you want IDs to start from 1 for production:

```sql
ALTER SEQUENCE subscriptions_id_seq RESTART WITH 1;
ALTER SEQUENCE payments_id_seq RESTART WITH 1;
ALTER SEQUENCE commissions_id_seq RESTART WITH 1;
ALTER SEQUENCE family_members_id_seq RESTART WITH 1;
```

### Step 5: Production Verification

```sql
-- No member data
SELECT COUNT(*) FROM subscriptions; -- Expected: 0
SELECT COUNT(*) FROM payments; -- Expected: 0
SELECT COUNT(*) FROM commissions; -- Expected: 0
SELECT COUNT(*) FROM users WHERE role='member'; -- Expected: 0

-- Staff preserved
SELECT role, COUNT(*) FROM users 
WHERE role IN ('agent', 'admin', 'super_admin') 
GROUP BY role;
-- Expected: Shows your agents/admins

-- Plans preserved
SELECT COUNT(*) FROM plans; -- Expected: 3+ plans
```

---

## 🔄 Rollback Plan

### If Strategy 1 Goes Wrong:

The script includes verification queries. If you see unexpected results:

1. **Stop immediately** - Don't run more SQL
2. Check what was deleted:
   ```sql
   SELECT * FROM subscriptions ORDER BY created_at DESC;
   ```
3. If needed, restore from your last Neon backup

### If Strategy 2 Goes Wrong:

**Using Neon Backup:**
1. Go to Neon Dashboard → Backups
2. Find your "Before Complete Test Data Cleanup" backup
3. Click "Restore"
4. Select "Restore to new branch" (safer) or "Restore in place"
5. Update Railway DATABASE_URL if using new branch

**Using pg_dump backup:**
```bash
# Drop and recreate schema
psql -h <host> -U <user> -d getmydpc -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Restore
pg_restore -h <host> -U <user> -d getmydpc -v backup_before_cleanup.dump
```

---

## 📝 Post-Cleanup Checklist

### After Strategy 1 (Keep Last 20):
- [ ] Verified exactly 20 subscriptions remain
- [ ] No orphaned payments/commissions
- [ ] EPX confirmed they can see transactions
- [ ] Agents/admins still have access
- [ ] Test enrollment still works

### After Strategy 2 (Complete Cleanup):
- [ ] All test data removed (0 subscriptions, 0 members)
- [ ] Agents/admins preserved and functional
- [ ] Plans still exist
- [ ] Test enrollment creates commission correctly
- [ ] Payment processing works
- [ ] EPX integration tested with real enrollment
- [ ] Monitoring/alerts configured
- [ ] Production launch checklist completed

---

## ⚠️ Important Notes

### Timing Considerations:

1. **Strategy 1**: Run anytime, low risk
   - Can run during business hours
   - Minimal impact on testing
   - Keeps EPX happy

2. **Strategy 2**: Plan carefully
   - Run during maintenance window
   - Coordinate with EPX
   - Test thoroughly before production traffic
   - Have rollback plan ready

### Data Relationships:

Tables are cleaned in this order to respect foreign keys:
1. `commissions` (references subscriptions)
2. `payments` (references subscriptions)
3. `family_members` (references users)
4. `subscriptions` (references users)
5. `users` (only members with no subscriptions)

### Member/User Separation Impact:

**IMPORTANT**: After running the member/user separation migration:
- Strategy 1 should target `members` table instead of `users` where `role='member'`
- Update scripts to use `member_id` instead of `user_id`
- Modify cleanup script accordingly

---

## 🎯 Recommended Workflow

### Phase 1: Now
1. ✅ Run Strategy 1 (keep last 20)
2. ✅ Verify with EPX
3. ✅ Continue development/testing

### Phase 2: Before Production Launch
1. ✅ Run member/user separation migration
2. ✅ Get EPX final approval
3. ✅ Create backup
4. ✅ Run Strategy 2 (complete cleanup)
5. ✅ Test with one real enrollment
6. ✅ Go live!

---

## 📞 Need Help?

If you encounter issues:

1. **Check verification queries** in the script output
2. **Review Neon logs** for error messages
3. **Don't panic** - backups exist for a reason
4. **Restore from backup** if needed
5. **Test changes** in development first

---

## ✅ Success Indicators

### Strategy 1 Success:
- Script completes with "✅ TEST DATA CLEANUP COMPLETE!"
- Exactly 20 subscriptions remain
- All verification checks show ✅ PASS
- No orphaned records
- EPX can see their transactions

### Strategy 2 Success:
- All test data counts show 0
- Agents/admins preserved
- Plans preserved
- First real enrollment works perfectly
- Commission created automatically
- Payment processes through EPX
- No errors in Railway logs

---

**Last Updated**: October 10, 2025  
**Status**: Ready for Strategy 1 execution  
**Next Milestone**: Strategy 2 after EPX approval
