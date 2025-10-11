# Production Readiness Roadmap
**Goal:** Fix all critical issues to "go for launch"  
**Date:** October 10, 2025  
**Status:** Issues identified, systematic fixes in progress

---

## 🚨 CRITICAL BLOCKERS (Must Fix Before Launch)

### ✅ COMPLETED: Issue #0 - createSubscription Was a Stub
- **Problem:** Function returned input without database insertion
- **Impact:** 81+ users created with 0 subscriptions, no commissions tracked
- **Fix:** Implemented real Supabase insert with proper snake_case schema
- **Status:** FIXED & DEPLOYED (commit aa40fd6)
- **Next:** Verify with new test enrollment

---

## 🔥 PHASE 1: VERIFY CORE FUNCTIONALITY (Current Focus)

### Issue #1: Verify Subscriptions Are Actually Creating
**Priority:** CRITICAL  
**Current State:**
- Database shows 22 subscriptions exist (up from 0)
- But need to verify they're properly linked to users
- New enrollments should now create subscriptions

**Action Items:**
1. Create ONE test enrollment (final.test@gmail.com)
2. Check Railway logs for `[Storage] ✅ Subscription created successfully: <id>`
3. Verify subscription appears in database with correct user_id
4. If successful, proceed to Phase 2

**Success Criteria:**
- ✅ New enrollment creates subscription in database
- ✅ Subscription.user_id matches user.id
- ✅ Commission auto-created with subscription_id
- ✅ No schema errors in logs

---

### Issue #2: Fix 'All Enrollments' Tab - Empty Data
**Priority:** CRITICAL  
**Current State:**
- Only some members show up in enrollments list
- Actions button shows "no enrollment data available"
- 22 subscriptions exist but aren't displaying

**Root Cause (Suspected):**
- Query joining users to subscriptions may use wrong column names
- Snake_case vs camelCase mismatch in queries
- May be filtering out members who have subscriptions

**Action Items:**
1. Find the "All Enrollments" query in code (likely in routes.ts or storage.ts)
2. Check if it's using snake_case (user_id) or camelCase (userId)
3. Verify join conditions between users and subscriptions tables
4. Add logging to see what data is being returned
5. Fix query to use correct column names

**Files to Check:**
- `server/routes.ts` - enrollment endpoints
- `server/storage.ts` - getEnrollments() or similar function
- Look for queries with `.from('users').join('subscriptions')`

**Success Criteria:**
- ✅ All 83 members appear in enrollments list
- ✅ Each member shows their subscription details
- ✅ Actions button opens with enrollment data (plan, amount, status)

---

### Issue #3: Fix 'Manage Leads' Tab - Changes Don't Save
**Priority:** HIGH  
**Current State:**
- Can assign agent to lead (UI updates)
- Can change lead status (UI updates)
- BUT changes don't persist (revert on refresh)

**Root Cause (Suspected):**
- updateLead function may use wrong column names
- Database update failing silently
- No error logging to catch the issue

**Action Items:**
1. Find updateLead function in storage.ts
2. Check column names (snake_case vs camelCase)
3. Add error logging and console.log for debugging
4. Test update in Railway logs
5. Verify database schema for leads table

**Files to Check:**
- `server/storage.ts` - updateLead() function
- `server/routes.ts` - PUT /api/leads/:id endpoint

**Success Criteria:**
- ✅ Lead status changes persist after refresh
- ✅ Agent assignments save to database
- ✅ Changes visible in Railway logs
- ✅ No schema errors

---

### Issue #4: Fix 'User Management' Tab - No DPC Details
**Priority:** HIGH  
**Current State:**
- 83 members show in list
- All show "active" with joined dates ✅
- BUT: No plan, no agent info
- "View DPC Details" shows "no enrollment data available"
- "Login" column appears (shouldn't be there for members)

**Root Cause (Suspected):**
- getUserEnrollmentDetails query not joining subscriptions properly
- Members not linked to their subscriptions
- May be querying wrong table or using wrong column names

**Action Items:**
1. Find getUserEnrollmentDetails or similar function
2. Check if it's joining users to subscriptions with correct column names
3. Verify it's also joining to plans table to get plan name
4. Check if it's joining to commissions to get agent info
5. Add proper LEFT JOIN to show members even without subscriptions

**Files to Check:**
- `server/storage.ts` - getUserEnrollmentDetails(), getDPCDetails()
- Look for queries joining users, subscriptions, plans, commissions

**Success Criteria:**
- ✅ Members show plan name (e.g., "MyPremier Plus Family")
- ✅ Members show enrolling agent (if applicable)
- ✅ "View DPC Details" shows full enrollment information
- ✅ Subscription status displays correctly

---

### Issue #5: Remove 'Login' Column from Members Table
**Priority:** MEDIUM  
**Current State:**
- Members table shows "Login" column
- Members should NOT have login access (only agents/admins)
- This is UI-only issue (column shouldn't display)

**Root Cause:**
- UI component rendering all user columns
- Needs to filter out login-related columns for members view

**Action Items:**
1. Find User Management table component (likely client/src/pages/admin or similar)
2. Add conditional logic to hide login column for members
3. Alternatively: Use separate view for members vs agents/admins

**Success Criteria:**
- ✅ Login column hidden in members view
- ✅ Login column still visible in agents/admins view

---

## 🔧 PHASE 2: DATA CLEANUP & MIGRATION

### Issue #6: Clean Orphaned Test Users
**Priority:** HIGH (after Phase 1)  
**Current State:**
- 81+ users exist with no subscriptions
- These are from before createSubscription was fixed
- Need to delete to avoid confusion

**Action Items:**
1. Verify createSubscription fix works (Phase 1, Issue #1)
2. Run verification query to confirm orphaned users
3. Execute cleanup script or SQL:
   ```sql
   DELETE FROM users 
   WHERE role IN ('member', 'user') 
   AND id NOT IN (SELECT DISTINCT user_id FROM subscriptions);
   ```
4. Keep last 20 for EPX visibility (optional)

**Files to Use:**
- `clean_all_test_data_production.sql`
- Or modified version of `run_cleanup.js`

**Success Criteria:**
- ✅ Only users WITH subscriptions remain
- ✅ Clean database for production launch

---

### Issue #7: Deploy Member/User Separation Migration
**Priority:** MEDIUM (after cleanup)  
**Current State:**
- Schema ready, migration SQL ready
- Members should be in separate `members` table
- Currently mixed in `users` table

**Blocked By:**
- Issues #1-#5 (need working subscriptions first)

**Action Items:**
1. Complete Phase 1 fixes
2. Review `member_user_separation_migration.sql`
3. Test migration on copy of database (optional)
4. Execute migration in production
5. Update queries to use members table

**Success Criteria:**
- ✅ Members table populated
- ✅ Users table contains only agents/admins
- ✅ Foreign keys maintained
- ✅ All queries updated to new schema

---

## ✅ PHASE 3: VERIFY FEATURES WORK

### Issue #8: Test Agent Number Auto-Generation
**Priority:** HIGH  
**Current State:**
- Code deployed (Issue #2 from original list)
- Format: MPP + SA/AG + year + last 4 SSN
- UNTESTED due to subscription issues

**Action Items:**
1. Create test enrollment with agent role
2. Verify agent_number appears in users table
3. Verify agent_number captured in commissions table
4. Test format: MPPSA251154 or MPPAG251154

**Success Criteria:**
- ✅ Agent numbers auto-generate on user creation
- ✅ Format correct (MPP + role code + year + last 4 SSN)
- ✅ Stored in users.agent_number
- ✅ Referenced in commissions.agent_number

---

### Issue #9: Test Commission Creation & Rates
**Priority:** HIGH  
**Current State:**
- Commission rates fixed ($9-$40)
- Code deployed (Issue #3 from original list)
- UNTESTED due to subscription issues

**Action Items:**
1. Create test enrollments with different plans:
   - Basic Individual ($9)
   - Basic Family ($17)
   - Plus Individual ($20)
   - Elite Family ($40)
2. Verify commissions auto-created
3. Verify rates match plan/coverage
4. Check commissions table for entries

**Success Criteria:**
- ✅ Commissions auto-create on enrollment
- ✅ Rates correct for each plan/coverage combo
- ✅ Linked to subscription_id
- ✅ Agent_number captured

---

## 🎨 PHASE 4: UI/UX IMPROVEMENTS

### Issue #10: Role-Based Dashboard Views
**Priority:** MEDIUM  
**Scope:**
- Agent: See only their enrollments, commissions, members
- Admin: See all agents, can enroll, modify members, reports
- Super Admin: Full access + user management

**Action Items:**
1. Identify dashboard query functions
2. Add role-based filtering:
   - If role=agent: WHERE agent_id = currentUser.id
   - If role=admin: WHERE 1=1 (all data)
   - If role=super_admin: Include user management
3. Update UI to hide/show features based on role
4. Test each role thoroughly

**Success Criteria:**
- ✅ Agents see only their data
- ✅ Admins see all data
- ✅ Super Admins have full access

---

### Issue #11: Login Tracking & Activity Logs
**Priority:** LOW  
**Scope:**
- Track last login timestamp
- Show login history in admin view
- Activity audit trail

**Action Items:**
1. Use login_sessions table
2. Update last_login on authentication
3. Create admin view for activity logs
4. Add audit trail for sensitive actions

---

### Issue #12: Revenue Tracking Dashboard
**Priority:** LOW  
**Scope:**
- Aggregate payment data
- Show trends, totals, by-plan breakdown
- Filter by date range

**Action Items:**
1. Create revenue aggregation queries
2. Build dashboard UI component
3. Add date range filters
4. Restrict to Admin/Super Admin roles

---

### Issue #13: Tab Navigation Audit
**Priority:** LOW  
**Scope:**
- Test all navigation tabs
- Fix broken links
- Ensure data flows correctly

**Action Items:**
1. Systematically test each tab
2. Document issues found
3. Fix navigation bugs
4. Verify data consistency across views

---

## 📋 EXECUTION PLAN

### **TODAY (Oct 10) - Critical Blockers:**
1. ✅ Fix createSubscription (DONE)
2. 🔄 Verify subscriptions creating (Issue #1) - IN PROGRESS
3. ⚠️ Fix All Enrollments tab (Issue #2)
4. ⚠️ Fix Manage Leads tab (Issue #3)
5. ⚠️ Fix User Management tab (Issue #4)

### **Tomorrow - Data Cleanup:**
6. Clean orphaned users (Issue #6)
7. Deploy member/user separation (Issue #7)

### **Next - Feature Verification:**
8. Test agent numbers (Issue #8)
9. Test commissions (Issue #9)

### **Later - Polish:**
10. Role-based dashboards (Issue #10)
11. Login tracking (Issue #11)
12. Revenue dashboard (Issue #12)
13. Navigation audit (Issue #13)

---

## 🎯 CURRENT FOCUS

**Right Now:** Complete Issue #1 (Verify subscriptions creating)
- Create ONE test enrollment: final.test@gmail.com
- Check Railway logs for success message
- Confirm subscription in database

**Then:** Fix the three critical dashboard tabs (Issues #2-#4)
- All require finding and fixing query functions
- All likely have snake_case vs camelCase issues
- Systematic approach: Find query → Check schema → Fix → Test

---

## 📝 NOTES

### Schema Convention Discovery:
- **Database uses snake_case:** user_id, plan_id, start_date, end_date, created_at
- **Application uses camelCase:** userId, planId, startDate, endDate, createdAt
- **Pattern:** Convert camelCase → snake_case for DB queries, convert back for returns

### Working Functions (Reference):
- ✅ `getUserSubscriptions()` - Uses snake_case correctly
- ✅ `updateSubscription()` - Uses snake_case correctly
- ✅ `createSubscription()` - NOW FIXED (uses snake_case)
- ✅ `getUserSubscription()` - NOW FIXED (uses snake_case)

### Files to Focus On:
- `server/storage.ts` - All database queries
- `server/routes.ts` - API endpoints
- Client pages (for UI fixes)

---

**End of Roadmap**  
**Next Action:** Test enrollment to verify Issue #1, then proceed to Issues #2-#4
