# Setup Guide: Certification Logging & User Seeding

This document provides step-by-step instructions for:
1. **Payment Processor Certification Logging** - Capture raw EPX request/response data
2. **User Account Setup** - Add 3 admin and 2 agent test users

---

## Part 1: Payment Processor Certification Logging

### Quick Start (5 minutes)

#### Step 1: Enable Certification Logging
```bash
# Edit your .env file and add:
ENABLE_CERTIFICATION_LOGGING=true
EPX_ENVIRONMENT=sandbox
```

#### Step 2: Restart Server
```bash
npm run dev
```

#### Step 3: Generate Test Logs (Optional)
```bash
npm run cert:generate-test-logs
```

This creates 3 sample transactions. Check the output:
```
✅ Created test transaction 1 (payment-creation)
✅ Created test transaction 2 (callback-processing)
✅ Created test transaction 3 (payment-creation)
```

#### Step 4: Export for Submission
```bash
npm run cert:export-logs
```

Output:
```
✅ Export successful!

📄 File Details:
   Filename: EPX_CERTIFICATION_EXPORT_2024-01-15.txt
   Location: logs/certification/summaries/EPX_CERTIFICATION_EXPORT_2024-01-15.txt
   Size: 45.23 KB
```

#### Step 5: Review & Submit
1. Open the .txt file from step 4
2. Verify all sensitive data is masked
3. Send to processor: `certification@epx.com` (or your processor contact)

### What Gets Logged

**Each transaction log includes:**
- Raw HTTP request (headers + body)
- Raw HTTP response (headers + body)
- Processing time
- Timestamp
- Environment (sandbox/production)
- Masked sensitive fields

**Example:**
```
Transaction ID: TEST_1234567890_001
Amount: $99.99
Environment: SANDBOX
Processing Time: 245ms

REQUEST:
  POST /api/epx/hosted/create-payment
  Headers: [content-type, user-agent, ...]
  Body: {amount, customerId (masked), customerEmail (masked), ...}

RESPONSE:
  Status: 200 OK
  Headers: [content-type, ...]
  Body: {success, transactionId, sessionId, ...}
```

### Sensitive Data Auto-Masking

The system automatically masks:
- ✅ Card numbers (first 4 + last 4 visible)
- ✅ CVV, CVC, PIN (fully masked)
- ✅ Auth codes, MACs, API keys (first 4 + last 4 visible)
- ✅ Customer IDs, emails (partially masked)
- ✅ Authorization headers, cookies

Each log file shows "SENSITIVE DATA MASKED" section listing what was masked.

### API Endpoints

After enabling certification logging, these endpoints are available:

```bash
# Check logging status
curl http://localhost:3000/api/epx/certification/toggle

# Get logs summary
curl http://localhost:3000/api/epx/certification/summary

# View report
curl http://localhost:3000/api/epx/certification/report

# Export all logs
curl -X POST http://localhost:3000/api/epx/certification/export
```

### File Structure

```
logs/
└── certification/
    ├── raw-requests/           # Individual transaction logs
    │   ├── TEST_1234567_001.txt
    │   ├── TEST_1234567_002.txt
    │   └── ...
    └── summaries/              # Compiled exports
        ├── EPX_CERTIFICATION_EXPORT_2024-01-15.txt
        └── EPX_CERTIFICATION_EXPORT_2024-01-16.txt
```

### Real Transaction Logging

Once enabled, real transactions are logged automatically:

1. User completes payment on enrollment page
2. Transaction automatically logged to `logs/certification/raw-requests/`
3. Use `npm run cert:export-logs` to compile for submission

### Troubleshooting

**Logs not being created?**
```bash
# Verify logging is enabled
curl http://localhost:3000/api/epx/certification/toggle

# Check directory exists
ls -la logs/certification/raw-requests/

# Verify .env setting
grep ENABLE_CERTIFICATION_LOGGING .env

# Restart server after changing .env
npm run dev
```

**Permission errors?**
```bash
# Linux/Mac
chmod -R 755 logs/

# Windows PowerShell
Get-Acl "logs" | Set-Acl -Path "logs"
```

---

## Part 2: User Account Setup

### Quick Start (5 minutes)

#### Step 1: Run Seeding Script
```bash
npm run seed:users
```

#### Step 2: Verify Output
Look for success messages:
```
✅ Auth user created: [user-id]
✅ Database record created
```

#### Step 3: Check Summary
```
✨ SEEDING COMPLETE

✅ Successfully created/updated 5 users:

   ADMIN        | MPP0001 | admin1@getmydpc.com
   ADMIN        | MPP0002 | admin2@getmydpc.com
   ADMIN        | MPP0003 | admin3@getmydpc.com
   AGENT        | MPP0004 | agent1@getmydpc.com
   AGENT        | MPP0005 | agent2@getmydpc.com
```

#### Step 4: Test Login
Use these credentials:

```
Admin Users:
  Email: admin1@getmydpc.com
  Password: AdminPass123!@#
  Role: Admin
  Agent #: MPP0001

  Email: admin2@getmydpc.com
  Password: AdminPass123!@#
  Role: Admin
  Agent #: MPP0002

  Email: admin3@getmydpc.com
  Password: AdminPass123!@#
  Role: Admin
  Agent #: MPP0003

Agent Users:
  Email: agent1@getmydpc.com
  Password: AgentPass123!@#
  Role: Agent
  Agent #: MPP0004

  Email: agent2@getmydpc.com
  Password: AgentPass123!@#
  Role: Agent
  Agent #: MPP0005
```

### What Gets Created

Each user has:
- ✅ Supabase Auth account (email + password)
- ✅ Database record in `users` table
- ✅ Role assignment (admin or agent)
- ✅ Agent number (MPP0001-MPP0005)
- ✅ Email verified
- ✅ Approval status: approved
- ✅ Active status: true

### User Roles

**Admin (MPP0001, MPP0002, MPP0003):**
- View/manage all users
- View/manage agents
- Access admin dashboard
- View analytics and reports
- Manage platform settings

**Agent (MPP0004, MPP0005):**
- Create leads/enrollments
- View their own enrollments
- View commission details
- View performance metrics
- Access agent dashboard

### Verifying Users

#### Check Supabase Auth
```bash
# View created users in Supabase console
# Go to: https://app.supabase.com → Authentication → Users
```

#### Check Database
```bash
# Query users table
SELECT email, role, agent_number, is_active 
FROM users 
WHERE email LIKE '%@getmydpc.com'
ORDER BY created_at DESC;
```

#### Test Login
1. Open `http://localhost:3000/login` (or your frontend URL)
2. Enter admin email and password
3. Verify you're logged in
4. Check user profile shows correct role and agent number

### Modifying Users

**Change a user's role:**
```sql
UPDATE users 
SET role = 'admin' 
WHERE email = 'agent1@getmydpc.com';
```

**Deactivate a user:**
```sql
UPDATE users 
SET is_active = false 
WHERE email = 'agent1@getmydpc.com';
```

**Delete a user (both auth and database):**
```bash
# Would need to use Supabase Auth API + delete from database
# Not recommended for production - use deactivation instead
```

### Troubleshooting

**Script fails with "No such file" error**
```bash
# Ensure you're in the project root
cd /path/to/getmydpc_enrollment

# Try running again
npm run seed:users
```

**Database connection error**
```bash
# Verify .env variables
cat .env | grep -E "SUPABASE|DATABASE"

# Check database is running
npm run db:push  # Should succeed if DB connection works
```

**"User already exists" error**
- This is normal if running script twice
- Script will reuse existing user and update database record
- Look for "✅ Using existing auth user" in output

**Users created but can't log in**
```bash
# Verify email verified status
SELECT email, email_verified, approval_status 
FROM users 
WHERE email = 'admin1@getmydpc.com';

# Should see: email_verified=true, approval_status=approved
```

---

## Integration with Certification Logging

You can use these test users to generate certification logs:

1. **Create test payment as admin:**
   - Log in as `admin1@getmydpc.com`
   - Complete test payment ($10 in sandbox)
   - Auto-logged to certification logs

2. **Create multiple test transactions:**
   ```bash
   # Script creates 3 test transactions
   npm run cert:generate-test-logs
   
   # Real transactions from step 1 added to same logs
   npm run cert:export-logs
   ```

3. **Submit combined logs:**
   - Export has both test + real transactions
   - Ready for processor review

---

## Quick Reference

### Common Commands

```bash
# Development
npm run dev                       # Start server with logging

# Certification Logging
npm run cert:generate-test-logs   # Create 3 sample transactions
npm run cert:export-logs          # Export all logs to .txt file

# User Management
npm run seed:users                # Create 5 test users

# Database
npm run db:push                   # Apply schema changes

# Build
npm run build                     # Build for production
npm run build:client              # Build frontend only
npm run build:all                 # Build frontend + backend
```

### Environment Variables

```bash
# .env file

# Certification Logging
ENABLE_CERTIFICATION_LOGGING=true
EPX_ENVIRONMENT=sandbox

# Database
DATABASE_URL=your_supabase_url
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key

# Server
PORT=3000
NODE_ENV=development
```

---

## Production Deployment Notes

### Certification Logging Production

```bash
# In production .env:
ENABLE_CERTIFICATION_LOGGING=true
EPX_ENVIRONMENT=production

# Real transactions will be logged
# Use npm run cert:export-logs to compile for processor
# Logs stored in logs/certification/raw-requests/
```

### User Seeding Production

**DO NOT use seed script in production!**

Instead:
1. Manually create users via Supabase dashboard
2. Use production user management endpoints
3. Implement proper user onboarding flow

### Best Practices

✅ **Do:**
- Test both logging systems in sandbox first
- Create test users for QA testing
- Export and review logs before submission
- Keep certification logs for audit (30+ days)
- Document all test transactions

❌ **Don't:**
- Run seed:users in production
- Enable certification logging without review
- Submit logs with unmasked sensitive data
- Delete logs without backup
- Mix sandbox and production logs

---

## Support & Next Steps

### Need Help?

1. **Certification Logging:**
   - See: `CERTIFICATION_LOGGING_GUIDE.md`
   - Check: `logs/certification/raw-requests/`
   - Run: `npm run cert:export-logs`

2. **User Management:**
   - Check Supabase dashboard
   - Verify database with SQL query
   - Test login with test credentials

3. **Payment Processing:**
   - Verify EPX credentials in .env
   - Check EPX environment (sandbox/production)
   - Review transaction logs for errors

### Production Checklist

Before deploying to production:

- [ ] Test certification logging in sandbox
- [ ] Export and review sample logs
- [ ] Submit logs to processor for certification
- [ ] Receive processor certification approval
- [ ] Deploy with `ENABLE_CERTIFICATION_LOGGING=true`
- [ ] Create admin/agent users via proper workflow
- [ ] Test real transactions end-to-end
- [ ] Monitor logs directory size
- [ ] Implement log rotation/cleanup

### Contact

For issues or questions:
- GitHub Issues: [your-repo]/issues
- Email: [your-support@email.com]
- Slack: [your-slack-channel]

---

**Last Updated:** January 2024
**Status:** Production Ready
**Tested On:** Node 18+, PostgreSQL 13+, Supabase
