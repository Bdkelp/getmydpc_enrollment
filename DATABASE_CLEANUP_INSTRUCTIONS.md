# 🗄️ Database Cleanup Instructions

**Status**: Ready to Execute  
**Target Database**: Supabase (GetMyDPC Enrollment)  
**Expected Outcome**: Keep 5 demo enrollments, delete 100+ test records

---

## ⚠️ IMPORTANT BEFORE YOU START

1. **Create a Database Backup** - This is CRITICAL
   - In Supabase dashboard: Settings → Backups → Create backup
   - Wait for backup to complete (usually 1-2 minutes)
   - Verify backup shows in the list

2. **Notify Team Members** - If needed
   - Brief downtime during cleanup (< 2 minutes)
   - No user data is affected (only test data)

3. **Review Database Statistics** - Before running cleanup
   - Check current enrollment count
   - Verify data integrity first

---

## 📊 Pre-Cleanup Verification

### Run This Query First

In Supabase SQL Editor, run:

```sql
-- See current state
SELECT 'Enrollments' as table_name, COUNT(*) as record_count FROM enrollments
UNION ALL
SELECT 'Members', COUNT(*) FROM members
UNION ALL
SELECT 'Commissions', COUNT(*) FROM agent_commissions
UNION ALL
SELECT 'Activities', COUNT(*) FROM user_activity;

-- Show top 10 enrollments (most recent)
SELECT id, member_name, email, plan, status, created_at 
FROM enrollments 
ORDER BY created_at DESC 
LIMIT 10;
```

**Expected Results**:
- Hundreds of enrollments
- Thousands of members
- Thousands of commissions
- Thousands of activities

These will be cleaned to just 5 demo enrollments plus recent activity.

---

## 🔄 Cleanup Execution

### Option 1: Using Supabase SQL Editor (Recommended)

1. **Open Supabase Dashboard**
   - Go to your GetMyDPC Enrollment project
   - Click "SQL Editor" on the left
   - Click "New Query"

2. **Copy the Cleanup Script**
   - Open the file: `database-cleanup-production.sql`
   - Copy ALL the contents

3. **Paste into Supabase**
   - In Supabase SQL Editor, select all (Ctrl+A)
   - Delete existing content
   - Paste the cleanup script contents
   - Do NOT click Run yet!

4. **Review the Script**
   - Read through the comments
   - Verify the logic looks correct
   - Confirm you understand what will be deleted

5. **Execute**
   - Click "Run" button
   - Wait for completion (usually 30-60 seconds)
   - Watch for any error messages

6. **Review Results**
   - Script will display summary at end
   - Should show:
     - Enrollments remaining: 5
     - Commission records: Fewer than before
     - Orphaned records: 0 (if integrity ok)

### Option 2: Using psql CLI

If you prefer command line:

```bash
# Get your Supabase connection details from:
# Supabase Dashboard → Settings → Database → Connection String

psql "your_connection_string_here" -f database-cleanup-production.sql

# Or step-by-step:
psql "postgresql://user:password@host:5432/postgres"
```

Then in psql prompt:

```sql
\i database-cleanup-production.sql
```

---

## ✅ Post-Cleanup Verification

### Run This Query After Cleanup

```sql
-- Verify cleanup results
SELECT 'After Cleanup' as status, COUNT(*) FROM enrollments;

-- Show remaining 5 enrollments
SELECT id, member_name, email, plan, status 
FROM enrollments 
ORDER BY created_at DESC;

-- Check for referential integrity
SELECT 'Orphaned Commissions', COUNT(*) FROM agent_commissions 
WHERE enrollment_id NOT IN (SELECT id FROM enrollments)
UNION ALL
SELECT 'Orphaned Members', COUNT(*) FROM members 
WHERE enrollment_id NOT IN (SELECT id FROM enrollments);

-- Show activity statistics
SELECT 'Recent Activity (30 days)', COUNT(*) FROM user_activity 
WHERE created_at > NOW() - INTERVAL '30 days';
```

**Expected Results**:
- Enrollments: 5
- Orphaned Commissions: 0
- Orphaned Members: 0
- Recent Activity: Should be minimal (only last 30 days)

---

## 📋 What Gets Cleaned

### ✅ BEFORE (Typical State)
```
Enrollments:          500+ test records
Members:              2000+ test records
Commissions:          10000+ test records
User Activities:      50000+ test records
Agents:               Multiple test agents
Sessions:             Old sessions
```

### ✅ AFTER (Production Ready)
```
Enrollments:          5 demo records
Members:              5-10 demo members
Commissions:          5-20 demo commissions
User Activities:      Recent activities only (30 days)
Agents:               Test agents remain for future testing
Sessions:             Recent sessions only (7 days)
```

---

## 🔒 Demo Data After Cleanup

The 5 remaining enrollments will have:

- **Member Names**: "Demo Member 1-5" with plan type
- **Email**: demo.member.1@demo.local (changed from real emails)
- **Phone**: (555) 001-0001 through (555) 001-0005
- **Address**: 123 Demo St, Demo City
- **Employer**: Demo Company
- **Commissions**: Preserved with correct calculations
- **Status**: "completed" (typical test state)

---

## 🚨 Troubleshooting

### If You Get an Error

**Error: "Function does not exist"**
- Solution: Your Supabase schema may be different
- Try running the simpler cleanup instead (see Alternative below)

**Error: "Permission denied"**
- Solution: You may need to use the service role key
- In Supabase, switch to service role before running

**Error: "Constraint violation"**
- Solution: Referential integrity issue
- Verify all foreign keys are valid before running
- Contact support if needed

### Alternative: Simple Cleanup (If Complex Script Fails)

If the main script fails, you can run a simpler version:

```sql
-- Simpler version - just delete data
DELETE FROM agent_commissions 
WHERE enrollment_id NOT IN (
  SELECT id FROM enrollments ORDER BY created_at DESC LIMIT 5
);

DELETE FROM members 
WHERE enrollment_id NOT IN (
  SELECT id FROM enrollments ORDER BY created_at DESC LIMIT 5
);

DELETE FROM enrollments 
WHERE id NOT IN (
  SELECT id FROM enrollments ORDER BY created_at DESC LIMIT 5
);

DELETE FROM user_activity WHERE created_at < NOW() - INTERVAL '7 days';
```

---

## 🔄 Rollback (If Something Goes Wrong)

If cleanup causes issues:

1. **Restore from Backup**
   - In Supabase: Settings → Backups
   - Find the backup you created before cleanup
   - Click "Restore"
   - Wait for restoration to complete

2. **Verify Restoration**
   - Run the pre-cleanup verification query
   - Confirm data is restored
   - Test application

3. **Alternative Approach**
   - Contact support for assistance
   - We can manually identify problematic data
   - Run cleanup with safer options

---

## 📞 Support

If you encounter issues:

1. **Check error message** - Read it carefully, it often explains the problem
2. **Review the cleanup script** - Ensure it matches your schema
3. **Verify your database** - Make sure it has the expected tables
4. **Contact support** - With error messages and backup of the script attempt

---

## ✨ Expected Outcomes

### Application Behavior After Cleanup

1. **Admin Dashboard**
   - Will show 5 demo enrollments
   - Commission totals will still calculate correctly
   - All admin functions work normally

2. **Agent Dashboard**
   - Will show their demo commissions
   - Totals (MTD/YTD/Lifetime) will recalculate
   - All export functions work normally

3. **User Registration**
   - New registrations will be added to the cleaned database
   - All validation and workflows function normally
   - Commission tracking starts fresh

4. **Test Workflows**
   - Create new test enrollments
   - Verify commission calculations
   - Test admin functions
   - All work with clean database

---

## 🎯 Next Steps After Cleanup

1. ✅ Verify cleanup completed
2. ✅ Test application locally with cleaned database
3. ✅ Run through PRODUCTION_CHECKLIST.md
4. ✅ Deploy to Railway
5. ✅ Monitor first 24 hours

---

## 📊 Cleanup Statistics

| Metric | Before | After |
|--------|--------|-------|
| Enrollments | 500+ | 5 |
| Members | 2000+ | 5-10 |
| Commissions | 10000+ | 5-20 |
| Activities | 50000+ | Recent only |
| Database Size | Large | Optimized |
| Performance | Slower | Faster |

---

## ✅ Cleanup Checklist

Before running cleanup:
- [ ] Database backup created
- [ ] Team notified
- [ ] Pre-cleanup query verified
- [ ] Understood what will be deleted
- [ ] Have rollback plan (use backup)

After running cleanup:
- [ ] Cleanup completed without errors
- [ ] Post-cleanup queries verified (5 enrollments, 0 orphans)
- [ ] Application tested with cleaned data
- [ ] All features working correctly
- [ ] Ready for production deployment

---

**Status**: Ready to Execute  
**Estimated Duration**: 2-5 minutes  
**Risk Level**: Low (backup available for rollback)  
**Next Action**: Create backup, then run cleanup script

---

**Let's clean this up and get to production! 🚀**
