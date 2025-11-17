# Testing Guide - Supabase-Only System

## Overview
All operations now use **Supabase only** (Neon has been removed). This guide covers testing the complete enrollment and commission tracking system.

---

## Prerequisites

1. **Supabase Setup**
   - Run RLS migrations in Supabase SQL Editor:
     - `migrations/fix-all-rls-security-issues.sql`
     - `migrations/allow-public-lead-submission.sql`

2. **Environment Variables**
   - Ensure `.env` has correct Supabase credentials:
     ```
     SUPABASE_URL=your_supabase_url
     SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
     ```

3. **Test Agent Account**
   - Email: `mkeener@lonestarenotary.com`
   - Password: See `TEST_ACCOUNTS.md`
   - Role: `agent`

---

## Test 1: Lead Form Submission (Public - No Auth)

**Purpose**: Verify public can submit leads without authentication

**Script**: `test-lead-form.ps1`

```powershell
.\test-lead-form.ps1
```

**Expected Result**:
- ✅ Lead submitted successfully
- ✅ Lead appears in Supabase `leads` table
- ✅ No authentication required

**Troubleshooting**:
- Ensure RLS migration `allow-public-lead-submission.sql` is applied
- Check server logs for errors
- Verify leads table exists in Supabase

---

## Test 2: Agent Login

**Purpose**: Verify agent authentication works

**Steps**:
1. Go to `/agent/login`
2. Login with test agent credentials
3. Should redirect to agent dashboard

**Expected Result**:
- ✅ Successful login
- ✅ JWT token stored
- ✅ Redirected to dashboard at `/agent/dashboard`

---

## Test 3: Complete Enrollment Flow

**Purpose**: Verify member creation and commission tracking

**Steps**:
1. Go to enrollment page: `/enroll?agent=mkeener@lonestarenotary.com`
2. Fill out enrollment form:
   - First Name: Test
   - Last Name: Member
   - Email: testmember@example.com
   - Phone: 555-0199
   - DOB: 1990-01-01
   - Select a plan (e.g., Individual Plan)
3. Complete payment information
4. Submit enrollment

**Expected Result**:
- ✅ Member created in Supabase `users` table
- ✅ Subscription created in Supabase `subscriptions` table
- ✅ Commission created in Supabase `agent_commissions` table
- ✅ All IDs match (no foreign key errors)

**Verification Queries** (Run in Supabase SQL Editor):

```sql
-- Check member was created
SELECT id, email, first_name, last_name, role 
FROM users 
WHERE email = 'testmember@example.com';

-- Check subscription was created
SELECT id, user_id, plan_id, status 
FROM subscriptions 
WHERE user_id = (SELECT id FROM users WHERE email = 'testmember@example.com');

-- Check commission was created
SELECT * 
FROM agent_commissions 
WHERE member_id = (SELECT id::text FROM users WHERE email = 'testmember@example.com');
```

---

## Test 4: Agent Dashboard - View Commissions

**Purpose**: Verify agent can see their commissions

**Steps**:
1. Login as `mkeener@lonestarenotary.com`
2. Go to `/agent/dashboard`
3. Check "Commissions" section

**Expected Result**:
- ✅ Commission appears in list
- ✅ Shows correct member name
- ✅ Shows correct commission amount
- ✅ Shows correct status (pending/paid)

**API Endpoint**: `GET /api/agent/commissions`

**Test with cURL**:
```bash
curl -X GET http://localhost:5000/api/agent/commissions \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Test 5: Agent Stats

**Purpose**: Verify agent stats are calculated correctly

**Steps**:
1. Login as agent
2. Check dashboard stats:
   - Total Enrollments
   - Pending Commissions
   - Paid Commissions

**Expected Result**:
- ✅ Stats reflect actual data in Supabase
- ✅ Counts match database queries

**Verification Query**:
```sql
-- Agent stats
SELECT 
    COUNT(DISTINCT ac.member_id) as total_enrollments,
    COUNT(CASE WHEN ac.status = 'pending' THEN 1 END) as pending_commissions,
    COUNT(CASE WHEN ac.status = 'paid' THEN 1 END) as paid_commissions,
    SUM(CASE WHEN ac.status = 'pending' THEN ac.amount ELSE 0 END) as pending_amount,
    SUM(CASE WHEN ac.status = 'paid' THEN ac.amount ELSE 0 END) as paid_amount
FROM agent_commissions ac
WHERE ac.agent_id = 'AGENT_UUID_HERE';
```

---

## Test 6: Admin View All Commissions

**Purpose**: Verify admin can see all commissions

**Steps**:
1. Login as admin
2. Go to admin dashboard
3. View all commissions

**Expected Result**:
- ✅ Admin sees ALL commissions (not just their own)
- ✅ Can filter by agent
- ✅ Can update commission status

---

## Database Verification Checklist

Run these queries in Supabase SQL Editor to verify system health:

### 1. Check RLS is Enabled
```sql
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('users', 'agent_commissions', 'leads', 'subscriptions')
AND schemaname = 'public';
```
**Expected**: All should show `rowsecurity = true`

### 2. Check All Policies Exist
```sql
SELECT tablename, policyname, cmd 
FROM pg_policies 
WHERE tablename IN ('users', 'agent_commissions', 'leads')
ORDER BY tablename, policyname;
```

### 3. Check Foreign Key Relationships
```sql
-- Verify all commissions have valid member_id
SELECT ac.id, ac.member_id, u.email
FROM agent_commissions ac
LEFT JOIN users u ON ac.member_id = u.id::text
WHERE u.id IS NULL;
```
**Expected**: No rows (all commissions should have valid members)

### 4. Check Orphaned Records
```sql
-- Find subscriptions without users
SELECT s.id, s.user_id
FROM subscriptions s
LEFT JOIN users u ON s.user_id = u.id
WHERE u.id IS NULL;
```
**Expected**: No rows

---

## Common Issues & Fixes

### Issue: "Foreign key violation" on commission creation
**Cause**: Member doesn't exist in Supabase
**Fix**: Ensure enrollment creates member in Supabase BEFORE commission

### Issue: Agent can't see their commissions
**Cause**: RLS policy issue or auth token missing
**Fix**: 
1. Check RLS policies are applied
2. Verify JWT token is valid
3. Check agent_id matches in database

### Issue: Lead form returns 403 Forbidden
**Cause**: RLS blocking public insert
**Fix**: Run `migrations/allow-public-lead-submission.sql`

### Issue: Commission shows $0.00
**Cause**: Plan commission structure not defined
**Fix**: Check `plans` table has commission_rate or check commission calculation logic

---

## Success Criteria

✅ **System is working when**:
1. Public can submit leads without auth
2. Members can enroll through agent links
3. Commissions are automatically created on enrollment
4. Agents can view their commissions in dashboard
5. All IDs match across tables (no foreign key errors)
6. RLS policies protect data appropriately
7. Admin can view and manage all commissions

---

## Next Steps After Testing

1. **If tests pass**: System is ready for production
2. **If tests fail**: 
   - Check server logs for errors
   - Verify RLS migrations applied
   - Check environment variables
   - Review Supabase database schema

---

## Production Deployment Checklist

Before going live:
- [ ] All RLS migrations applied
- [ ] Environment variables set correctly
- [ ] Test enrollments working
- [ ] Commission tracking verified
- [ ] Agent dashboard functional
- [ ] Lead form tested
- [ ] Backup strategy in place
- [ ] Monitoring configured
- [ ] Error tracking enabled (Sentry, etc.)
- [ ] SSL certificates valid

---

## Monitoring Queries

Run these periodically to monitor system health:

```sql
-- Daily enrollment count
SELECT DATE(created_at) as date, COUNT(*) as enrollments
FROM users
WHERE role = 'member'
GROUP BY DATE(created_at)
ORDER BY date DESC
LIMIT 7;

-- Commission summary by agent
SELECT 
    u.email as agent_email,
    COUNT(*) as total_commissions,
    SUM(CASE WHEN ac.status = 'pending' THEN ac.amount ELSE 0 END) as pending_amount,
    SUM(CASE WHEN ac.status = 'paid' THEN ac.amount ELSE 0 END) as paid_amount
FROM agent_commissions ac
JOIN users u ON ac.agent_id = u.id::text
GROUP BY u.email
ORDER BY total_commissions DESC;

-- Recent leads
SELECT first_name, last_name, email, created_at
FROM leads
ORDER BY created_at DESC
LIMIT 10;
```

---

**Last Updated**: November 2025
**System Version**: Supabase-Only (Neon Removed)
