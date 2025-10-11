# Execute Test Data Cleanup - Step-by-Step Guide

## 🎯 Objective
Run `clean_test_data_keep_last_20.sql` to remove old test data while keeping the 20 most recent enrollments for EPX visibility.

---

## 📋 Pre-Execution Checklist

Before running the cleanup:

- [ ] You have access to your Neon Console (https://console.neon.tech)
- [ ] You know which project/database contains the enrollment data
- [ ] You've reviewed the cleanup script (`clean_test_data_keep_last_20.sql`)
- [ ] You're ready to proceed with deletion

---

## 🚀 Execution Steps

### Step 1: Access Neon Console

1. Go to **https://console.neon.tech**
2. Sign in to your account
3. Select your **getmydpc** project (or the project with your enrollment database)

### Step 2: Open SQL Editor

1. In your Neon project dashboard, look for **"SQL Editor"** in the left sidebar
2. Click to open the SQL Editor
3. Make sure you're connected to the correct database (usually shown at the top)

### Step 3: Copy the Cleanup Script

1. Open the file: `clean_test_data_keep_last_20.sql` in VS Code
2. **Select ALL content** (Ctrl+A)
3. **Copy** (Ctrl+C)

### Step 4: Paste and Review

1. **Paste** the script into the Neon SQL Editor (Ctrl+V)
2. **Scroll through** to see what it will do:
   - Shows BEFORE counts
   - Identifies 20 newest enrollments to KEEP
   - Deletes older data
   - Shows AFTER counts
   - Runs verification checks

### Step 5: Execute the Script

1. Click the **"Run"** or **"Execute"** button in the SQL Editor
2. **Wait** for execution to complete (should take 10-30 seconds)
3. **Review the output** in the results panel

### Step 6: Verify Results

Look for these confirmations in the output:

✅ **Expected Output:**
```
BEFORE CLEANUP - Data Counts
member_users: 81 (or similar)
total_subscriptions: [some number]
...

KEEPING THESE 20 ENROLLMENTS
[Shows 20 rows with most recent enrollments]

DELETING THESE ENROLLMENTS
count_to_delete: [number of old records]
...

Commissions deleted: [number]
Payments deleted: [number]
Family members deleted: [number]
Subscriptions deleted: [number]
Member users deleted: [number]

AFTER CLEANUP - Data Counts
subscriptions_remaining: 20
...

Verification: Should have exactly 20 subscriptions
actual_count: 20
status: ✅ PASS

Orphan Check: Payments without subscription
orphaned_payments: 0
status: ✅ PASS

Orphan Check: Commissions without subscription
orphaned_commissions: 0
status: ✅ PASS

✅ TEST DATA CLEANUP COMPLETE!
```

### Step 7: Confirm Success

All verification checks should show:
- ✅ PASS - exactly 20 subscriptions remain
- ✅ PASS - 0 orphaned payments
- ✅ PASS - 0 orphaned commissions

---

## ⚠️ If Something Goes Wrong

### If you see errors:
1. **Don't panic** - read the error message
2. **Common errors:**
   - "table does not exist" → Wrong database selected
   - "permission denied" → Need admin access
   - "foreign key violation" → Script should handle this, but stop and review

### If results look wrong:
1. **Check the BEFORE counts** - do they match expectations?
2. **Review what's being kept** - are the 20 newest correct?
3. **If unsure, STOP** - don't proceed with deletion

### Rollback Options:
If you need to undo (and you haven't created a backup):
- Neon has automatic backups - you can restore from a point-in-time
- Go to your Neon project → **Backups** → **Restore**

---

## 📊 What Gets Deleted

### ❌ DELETED (older than 20 most recent):
- Old subscriptions
- Related payments
- Related commissions
- Related family members
- Member user accounts (if no subscriptions left)

### ✅ KEPT (20 most recent):
- 20 newest subscriptions (by `created_at`)
- Their payments
- Their commissions
- Their family members
- Their member user accounts

### ✅ ALWAYS PRESERVED:
- All agents (role='agent')
- All admins (role='admin', 'super_admin')
- All plans
- System configuration

---

## 🎯 After Cleanup

### Immediate Verification:
```sql
-- Run these queries in SQL Editor to verify:

-- Should be exactly 20
SELECT COUNT(*) as subscription_count FROM subscriptions;

-- Should be 20 or fewer (some might share users)
SELECT COUNT(*) as member_count FROM users WHERE role IN ('member', 'user');

-- Should have no orphans (0 for both)
SELECT COUNT(*) as orphaned_payments FROM payments 
WHERE subscription_id NOT IN (SELECT id FROM subscriptions);

SELECT COUNT(*) as orphaned_commissions FROM commissions 
WHERE subscription_id NOT IN (SELECT id FROM subscriptions);

-- Agents should still exist (should show your agents)
SELECT role, COUNT(*) as count FROM users 
WHERE role IN ('agent', 'admin', 'super_admin') 
GROUP BY role;
```

### Notify EPX:
- Let EPX know cleanup is complete
- Tell them the 20 most recent enrollments are preserved
- They can verify transaction visibility

### Test System:
1. Log in as an agent
2. View the enrollment list (should see 20)
3. Check that commissions are visible
4. Verify no errors in the application

---

## 📝 Documentation

After successful cleanup, update your records:
- Note the date/time of cleanup
- Record how many records were deleted
- Confirm 20 enrollments kept for EPX
- Mark this task complete

---

## 🔄 Next Steps

Once cleanup is verified:

1. ✅ Test data cleaned (keeping last 20)
2. ➡️ **Next Issue**: Role-Based Dashboard Implementation
3. ➡️ **Future**: Run `clean_all_test_data_production.sql` when EPX approves

---

## ❓ Troubleshooting

### "I don't see SQL Editor in Neon"
- Look for "Query" or "SQL" in the sidebar
- Or try the "Console" or "Database" section
- Different Neon UI versions have different names

### "Script is taking too long"
- With 81 member records, should complete in under 1 minute
- If > 2 minutes, something may be wrong - check Neon logs

### "I want to test first"
- You can run just the verification queries (STEP 0) first
- See what data exists before committing to deletion

### "Can I undo this?"
- If you haven't created a manual backup, Neon has automatic backups
- You can restore from any point in time (usually 7-30 days retention)
- Go to Backups → Restore → Select timestamp before cleanup

---

## ✅ Success Criteria

Cleanup is successful when:
- [x] Script completes without errors
- [x] Exactly 20 subscriptions remain
- [x] All verification checks show ✅ PASS
- [x] 0 orphaned records
- [x] Agents/admins preserved
- [x] EPX can see their 20 transactions
- [x] Application works normally

---

**Ready to execute?** Follow the steps above to run the cleanup in Neon Console! 🚀
