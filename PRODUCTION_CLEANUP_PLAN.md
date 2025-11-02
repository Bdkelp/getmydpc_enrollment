# Production Cleanup & Data Scrubbing Plan

## 🎯 Objectives

1. Remove unnecessary development/debug files
2. Clean up test enrollments (keep only 5)
3. Scrub all test data from database
4. Prepare codebase for production deployment

---

## 📁 Files to Remove

### Debug & Archive Files (DELETE)
- ❌ `archive/` - Entire folder (old documentation)
- ❌ `attached_assets/` - Entire folder (50+ pasted snippets and debug files)
- ❌ `migrations/` - Most migration files (keep only production schema)

### Cleanup & Debug Scripts (DELETE)
- ❌ `cleanup_for_production.ps1`
- ❌ `cleanup-obsolete-files.ps1`
- ❌ `deploy-fix.ps1`
- ❌ `test-lead-form.ps1`
- ❌ `verify-commission-backfill.ps1`

### Debug SQL Files (DELETE)
- ❌ `check-agent-commissions-schema.sql`
- ❌ `check-missing-commissions.sql`
- ❌ `debug-agent-data.sql`
- ❌ `fix-orphaned-enrollments.sql`
- ❌ All debug scripts in `server/scripts/`

### Unnecessary Documentation (DELETE)
- ❌ `ADMIN_USER_CREATION_IMPLEMENTATION.md` (keep quick guide only)
- ❌ `CLEANUP_PLAN.md` (this is a dev file)
- ❌ `PRODUCTION_ERROR_FIXES.md` (archived, errors fixed)
- ❌ `FORCE_REBUILD.md`
- ❌ `NEON_REMOVAL_PLAN.md`
- ❌ `EPX_INTEGRATION_STATUS.md`
- ❌ `EPX_SERVER_POST_IMPLEMENTATION_CHECKLIST.md`
- ❌ `RAILWAY_STATIC_IP_GUIDE.md`

### Keep Essential Documentation
- ✅ `README_DOCUMENTATION.md` - Master index
- ✅ `DEPLOYMENT_GUIDE.md` - Deployment instructions
- ✅ `DEPLOYMENT_CHECKLIST.md` - Pre-deploy checklist
- ✅ `USER_SETUP_GUIDE.md` - User management
- ✅ `ADMIN_USER_CREATION_QUICK_GUIDE.md` - Admin creation
- ✅ `TEST_ACCOUNTS.md` - Test user credentials
- ✅ `COMMISSION_STRUCTURE.md` - Commission rates
- ✅ `COMMISSION_PAYOUT_MANAGEMENT.md` - Payout process
- ✅ `COMMISSION_TESTING_GUIDE.md` - Testing commissions
- ✅ `TESTING_GUIDE.md` - General testing
- ✅ `AGENT_PERMISSIONS.md` - Permission structure
- ✅ `SECURITY_HIPAA_COMPLIANCE.md` - HIPAA info
- ✅ `SECURITY_BOT_PROTECTION.md` - Bot protection
- ✅ `RECAPTCHA_SETUP.md` - reCAPTCHA config
- ✅ `PROJECT_STATUS_FINAL.md` - Final status
- ✅ `PRODUCTION_CHECKLIST.md` - Final checklist

---

## 🗄️ Database Cleanup

### Step 1: Identify Test Enrollments
```sql
-- Find all enrollments (we'll keep 5, delete the rest)
SELECT id, member_name, email, created_at, status 
FROM enrollments 
ORDER BY created_at DESC;
```

### Step 2: Keep Top 5 Recent/Valid Test Enrollments
- Identify 5 representative test enrollments to keep as demo data
- These should have:
  - Complete member information
  - Valid commission records
  - Different plan types (Base, Plus, Elite, RxValet)

### Step 3: Delete All Other Test Data
```sql
-- Delete enrollments (keeping 5)
DELETE FROM enrollments WHERE id NOT IN (
  SELECT id FROM enrollments ORDER BY created_at DESC LIMIT 5
);

-- Delete orphaned records
DELETE FROM agent_commissions 
WHERE enrollment_id NOT IN (SELECT id FROM enrollments);

DELETE FROM members 
WHERE enrollment_id NOT IN (SELECT id FROM enrollments);

-- Clean up sessions & activity
DELETE FROM user_activity;
DELETE FROM sessions;
```

### Step 4: Clean Member Data
- Scrub personal information from demo enrollments
- Use placeholder names: "Test Member 1-5"
- Use placeholder emails: "test.member.1@test.local" etc.
- Keep commission structures intact for demo

### Step 5: Archive Test Users (Optional)
- Keep 4 test admins and 4 test agents for ongoing testing
- Or use separate test environment

---

## 📋 Production Verification

### Database Checks
- [ ] Verify 5 test enrollments remain
- [ ] Verify all commissions link to valid enrollments
- [ ] Verify all members link to valid enrollments
- [ ] Verify no sensitive test data remains
- [ ] Verify referential integrity

### Code Checks
- [ ] No hardcoded test credentials
- [ ] No debug endpoints enabled
- [ ] No console.log statements
- [ ] Error handling comprehensive
- [ ] Logging configured for production

### Deployment Checks
- [ ] All .env variables configured
- [ ] Database migrations run
- [ ] Frontend builds without errors
- [ ] API endpoints tested
- [ ] reCAPTCHA configured
- [ ] Rate limiting active

---

## 🚀 Execution Steps

### Phase 1: File Cleanup
1. Delete `archive/` folder
2. Delete `attached_assets/` folder
3. Delete all unnecessary migration files
4. Delete all debug/cleanup scripts
5. Delete unnecessary documentation
6. Verify git status

### Phase 2: Database Cleanup
1. Backup current database (Supabase snapshot)
2. Identify 5 test enrollments to keep
3. Run cleanup SQL queries
4. Scrub member PII from test records
5. Verify data integrity
6. Test application with cleaned data

### Phase 3: Code Verification
1. Search for hardcoded test values
2. Search for debug console.logs
3. Verify environment variables
4. Test all endpoints
5. Verify security measures

### Phase 4: Final Verification
1. Run production checklist
2. Verify deployment configuration
3. Test on staging if available
4. Ready for production deployment

---

## 📊 Expected Results

**Before Cleanup:**
- 100+ documentation/debug files
- 50+ migration files
- 50+ pasted debug snippets
- Hundreds of test enrollments
- Thousands of test activities

**After Cleanup:**
- 15 essential documentation files
- 1-2 final schema migration files
- No debug files or snippets
- 5 demo enrollments
- Clean database ready for production

---

## ⚠️ Important Notes

- **Backup First**: Always backup database before deletion
- **Test Locally**: Test cleanup scripts locally first
- **Keep Test Users**: Keep test user accounts for future testing
- **Archive Migrations**: Keep old migrations in version control for reference
- **Keep Documentation**: Keep all essential production documentation

---

## ✅ Completion Checklist

- [ ] File cleanup complete
- [ ] Database cleanup complete
- [ ] Code verification complete
- [ ] All tests passing
- [ ] Production checklist verified
- [ ] Ready for deployment

---

**Status**: Ready for execution  
**Date**: November 2, 2025  
**Target**: Production cleanup before Railway deployment
