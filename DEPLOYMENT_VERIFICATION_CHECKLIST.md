# Deployment Verification Checklist

## Pre-Deployment Verification

### 1. Code Integration ✅

- [x] `server/services/certification-logger.ts` created
- [x] `server/routes/epx-hosted-routes.ts` enhanced with logging
- [x] `server/scripts/generate-cert-logs.ts` created
- [x] `server/scripts/export-cert-logs.ts` created
- [x] `server/scripts/seed-users.ts` created
- [x] `package.json` updated with new npm scripts
- [x] Documentation files created

### 2. NPM Scripts ✅

Verify scripts added to `package.json`:
```bash
npm run cert:generate-test-logs
npm run cert:export-logs
npm run seed:users
```

### 3. Imports & Dependencies ✅

All required imports available:
- ✅ `fs` (Node.js file system) - for log file storage
- ✅ `path` (Node.js path utilities) - for directory management
- ✅ Express Router - for new API endpoints
- ✅ `supabaseClient` - for user creation
- ✅ `neonDb` - for database operations

---

## Testing Procedures

### Test 1: Certification Logging

**Setup:**
```bash
# 1. Add to .env
ENABLE_CERTIFICATION_LOGGING=true
EPX_ENVIRONMENT=sandbox

# 2. Restart server
npm run dev
```

**Generate Test Logs:**
```bash
npm run cert:generate-test-logs
```

**Expected Output:**
```
✅ Created test transaction 1 (payment-creation)
✅ Created test transaction 2 (callback-processing)
✅ Created test transaction 3 (payment-creation)

Files created:
   ✓ TEST_1234567890_001_payment-creation.txt
   ✓ TEST_1234567890_002_callback-processing.txt
   ✓ TEST_1234567890_003_payment-creation.txt
```

**Verify Files:**
```bash
ls -la logs/certification/raw-requests/
# Should show 3 .txt files
```

**Check Content:**
```bash
cat logs/certification/raw-requests/TEST_*.txt
# Should contain:
# - Transaction ID
# - Customer ID (masked)
# - Amount
# - Request/Response headers and bodies
# - Sensitive data masked
```

**Export Logs:**
```bash
npm run cert:export-logs
```

**Expected Output:**
```
✅ Export successful!

📄 File Details:
   Filename: EPX_CERTIFICATION_EXPORT_2024-01-15.txt
   Location: logs/certification/summaries/EPX_CERTIFICATION_EXPORT_2024-01-15.txt
   Size: XX.XX KB
```

---

### Test 2: User Seeding

**Run Script:**
```bash
npm run seed:users
```

**Expected Output:**
```
👥 Starting user seeding...

📝 Creating admin: admin1@getmydpc.com
   ✅ Auth user created: [user-id]
   ✅ Database record created

📝 Creating admin: admin2@getmydpc.com
   ✅ Auth user created: [user-id]
   ✅ Database record created

📝 Creating admin: admin3@getmydpc.com
   ✅ Auth user created: [user-id]
   ✅ Database record created

📝 Creating agent: agent1@getmydpc.com
   ✅ Auth user created: [user-id]
   ✅ Database record created

📝 Creating agent: agent2@getmydpc.com
   ✅ Auth user created: [user-id]
   ✅ Database record created

✨ SEEDING COMPLETE

✅ Successfully created/updated 5 users:

   ADMIN        | MPP0001 | admin1@getmydpc.com
   ADMIN        | MPP0002 | admin2@getmydpc.com
   ADMIN        | MPP0003 | admin3@getmydpc.com
   AGENT        | MPP0004 | agent1@getmydpc.com
   AGENT        | MPP0005 | agent2@getmydpc.com

📝 User Credentials:
   Email: admin1@getmydpc.com
   Password: AdminPass123!@#
   Role: admin
   Agent #: MPP0001

   Email: admin2@getmydpc.com
   Password: AdminPass123!@#
   Role: admin
   Agent #: MPP0002

   [... etc ...]
```

**Verify Users in Database:**
```sql
SELECT email, role, agent_number, is_active, email_verified 
FROM users 
WHERE email LIKE '%@getmydpc.com'
ORDER BY created_at DESC;
```

**Expected Result:**
```
email                    | role   | agent_number | is_active | email_verified
-------------------------|--------|--------------|-----------|---------------
admin1@getmydpc.com      | admin  | MPP0001      | true      | true
admin2@getmydpc.com      | admin  | MPP0002      | true      | true
admin3@getmydpc.com      | admin  | MPP0003      | true      | true
agent1@getmydpc.com      | agent  | MPP0004      | true      | true
agent2@getmydpc.com      | agent  | MPP0005      | true      | true
```

---

### Test 3: Login with New Users

**Test Admin Login:**
1. Navigate to `http://localhost:3000/login` (or your app URL)
2. Email: `admin1@getmydpc.com`
3. Password: `AdminPass123!@#`
4. Expected: ✅ Successfully logged in, admin dashboard visible
5. Check: Role shows "Admin", Agent # shows "MPP0001"

**Test Agent Login:**
1. Log out and log back in
2. Email: `agent1@getmydpc.com`
3. Password: `AgentPass123!@#`
4. Expected: ✅ Successfully logged in, agent dashboard visible
5. Check: Role shows "Agent", Agent # shows "MPP0004"

---

### Test 4: Real Transaction Logging

**Setup:**
1. Server running with `ENABLE_CERTIFICATION_LOGGING=true`
2. Users created via `npm run seed:users`

**Procedure:**
1. Log in as `admin1@getmydpc.com`
2. Navigate to payment page
3. Fill out enrollment form
4. Select plan and proceed to payment
5. Complete test payment ($10.00 recommended)
   - Test card: `4111 1111 1111 1111`
   - Exp: `12/25`
   - CVC: `123`

**Verify Logging:**
```bash
ls -la logs/certification/raw-requests/
# Should show new files from real transaction
```

**Check Content:**
```bash
# View latest transaction
ls -ltr logs/certification/raw-requests/ | tail -1
cat logs/certification/raw-requests/[latest-file].txt
```

Expected content:
- Real transaction ID
- Amount from payment
- Customer ID (masked)
- Email (masked)
- Complete request/response flow

---

### Test 5: API Endpoints

**Test Status Endpoint:**
```bash
curl http://localhost:3000/api/epx/certification/toggle
```

**Expected Response:**
```json
{
  "success": true,
  "currentState": true,
  "environment": "sandbox",
  "note": "Certification logging is currently ENABLED"
}
```

**Test Summary Endpoint:**
```bash
curl http://localhost:3000/api/epx/certification/summary
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "totalLogs": 6,
    "logFiles": ["TEST_...001.txt", "TEST_...002.txt", ...],
    "rawLogsDir": "/path/to/logs/certification/raw-requests"
  },
  "message": "Total certification logs: 6"
}
```

**Test Export Endpoint:**
```bash
curl -X POST http://localhost:3000/api/epx/certification/export
```

**Expected Response:**
```json
{
  "success": true,
  "message": "All certification logs exported",
  "filepath": "/path/to/logs/certification/summaries/EPX_CERTIFICATION_EXPORT_2024-01-15.txt"
}
```

---

### Test 6: File Structure Verification

**Verify Directory Structure:**
```bash
tree logs/certification/
```

**Expected Output:**
```
logs/certification/
├── raw-requests/
│   ├── TEST_1234567890_001_payment-creation.txt
│   ├── TEST_1234567890_002_callback-processing.txt
│   ├── TEST_1234567890_003_payment-creation.txt
│   └── [real transaction logs]
└── summaries/
    └── EPX_CERTIFICATION_EXPORT_2024-01-15.txt
```

---

### Test 7: Idempotency (Run seed:users twice)

**Run Script Again:**
```bash
npm run seed:users
```

**Expected Output:**
```
⚠️  User already exists in auth, fetching...
✅ Using existing auth user: [user-id]
✅ Database record updated

[... repeats for all 5 users ...]
```

**Verify:**
- ✅ No duplicate users created
- ✅ Existing users reused
- ✅ Database records updated
- ✅ Same credentials still work

---

## Pre-Production Checklist

Before deploying to production:

### Code Quality
- [ ] TypeScript compiles without errors: `npm run check`
- [ ] No console errors when running: `npm run dev`
- [ ] All imports resolve correctly
- [ ] No hardcoded credentials in code

### Configuration
- [ ] `.env` file configured with correct values
- [ ] `ENABLE_CERTIFICATION_LOGGING` set appropriately
- [ ] `EPX_ENVIRONMENT` matches deployment environment
- [ ] Database connection string correct
- [ ] Supabase credentials valid

### Testing
- [ ] ✅ Certification logging generates test logs
- [ ] ✅ User seeding creates all 5 users
- [ ] ✅ Users can log in with provided credentials
- [ ] ✅ API endpoints respond correctly
- [ ] ✅ Real transaction logging works
- [ ] ✅ File structure created as expected
- [ ] ✅ Sensitive data properly masked
- [ ] ✅ Export functionality works

### Documentation
- [ ] README updated with new commands
- [ ] CERTIFICATION_LOGGING_GUIDE.md reviewed
- [ ] SETUP_GUIDE_CERTIFICATION_AND_USERS.md reviewed
- [ ] Team has access to documentation
- [ ] Processor contact information available

### Deployment
- [ ] Test environment deployment successful
- [ ] Production environment ready
- [ ] Backup procedures in place
- [ ] Monitoring configured
- [ ] Rollback plan documented

### Post-Deployment
- [ ] Monitor for errors: `npm run dev`
- [ ] Verify logs being created
- [ ] Test user login flows
- [ ] Generate and review certification logs
- [ ] Submit logs to processor if required

---

## Troubleshooting Matrix

| Issue | Cause | Solution |
|-------|-------|----------|
| Logs directory not created | Script not run | Run `npm run cert:generate-test-logs` |
| Users not visible in dashboard | Seed script didn't run | Run `npm run seed:users` |
| Login fails with new users | Email not verified | Check database `email_verified = true` |
| Sensitive data not masked | Logging disabled | Verify `ENABLE_CERTIFICATION_LOGGING=true` |
| Export file empty | No logs generated | Run `npm run cert:generate-test-logs` first |
| Permission errors | Directory permissions | Run with appropriate permissions |
| Database errors | Connection issue | Check `.env` DATABASE_URL |
| Auth errors | Supabase issue | Verify SUPABASE_URL and SUPABASE_ANON_KEY |

---

## Success Criteria

✅ **All tests pass:**
- Certification logs generated and formatted correctly
- User seeding creates all 5 users
- Users can log in with provided credentials
- API endpoints respond as expected
- File structure created correctly
- Sensitive data masked properly
- Export functionality works
- Real transaction logging functional
- No errors in console
- TypeScript compiles cleanly

✅ **Documentation complete:**
- CERTIFICATION_LOGGING_GUIDE.md
- SETUP_GUIDE_CERTIFICATION_AND_USERS.md
- IMPLEMENTATION_SUMMARY.md
- QUICK_REFERENCE.md
- This checklist

✅ **Ready for production:**
- All tests passing
- Documentation reviewed
- Team trained
- Monitoring configured
- Backup procedures ready

---

**Verification Date:** _____________
**Verified By:** _____________
**Environment:** [ ] Dev [ ] Staging [ ] Production
**Status:** ✅ READY / ⚠️ ISSUES FOUND

---

## Notes & Issues

```
[Space for recording any issues found during verification]




```

---

**Last Updated:** January 2024
**Version:** 1.0
**Status:** Complete
