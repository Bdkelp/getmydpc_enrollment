# Member/User Separation - Current Status

## 📋 Executive Summary

**Goal:** Separate enrolled healthcare members (customers) from authenticated users (agents/admins)
- **Users** = Agents and admins with login access to the app
- **Members** = Enrolled healthcare customers (NO login access, data only)

## ✅ What's Been Completed

### 1. Database Schema (✅ DONE)
- **`members` table created** in `shared/schema.ts`
  - Stores enrolled healthcare customers
  - Includes customer_number, personal info, employment data
  - Has enrollment tracking (enrolled_by_agent_id, agent_number)
  - Separate from authentication system

- **Related tables updated** to reference members:
  - `subscriptions` - has `member_id` field (nullable)
  - `payments` - has `member_id` field (nullable)
  - `commissions` - has `member_id` field (nullable)
  - `family_members` - has `primary_member_id` field (nullable)

### 2. Migration Scripts (✅ DONE)
- **`member_user_separation_migration.sql`** - Full production migration script
- **`MEMBER_USER_SEPARATION_PLAN.md`** - Complete implementation plan
- **`DEPLOYMENT_CHECKLIST_MEMBER_SEPARATION.md`** - Step-by-step deployment guide

### 3. Documentation (✅ DONE)
- Clear separation documented
- Migration path defined
- Rollback procedures created
- Testing checklist prepared

## ❌ What's NOT Complete

### 1. Database Migration (❌ NOT RUN)
**Status:** Migration script exists but **HAS NOT been executed** on production database

**Evidence:**
- `server/storage.ts` still queries `users` table for members:
  ```typescript
  WHERE u.role IN ('user', 'member')  // Still using users table!
  ```
- No `members` table data being queried
- Subscriptions still link to `user_id` not `member_id`

**What needs to happen:**
```sql
-- Run the migration script to:
-- 1. Create members table in database
-- 2. Copy member records from users table
-- 3. Update all foreign key references
-- 4. Delete member records from users table
```

### 2. Code Updates (❌ NOT COMPLETE)
**Status:** Code still treats members as users with a role

**Files that need updating:**

#### `server/storage.ts`
Currently:
```typescript
// ❌ Still using users table for members
export async function getMembersOnly() {
  const usersResult = await query(
    `SELECT u.* FROM users u
     WHERE u.role IN ('user', 'member')`  // WRONG!
  );
}
```

Should be:
```typescript
// ✅ Use members table
export async function getMembersOnly() {
  const membersResult = await query(
    `SELECT m.* FROM members m
     WHERE m.is_active = true
     ORDER BY m.enrollment_date DESC`
  );
}

// ✅ Add member-specific functions
export async function createMember(data: MemberData) {
  // Insert into members table (NO Supabase auth)
}

export async function getMember(id: number) {
  // Query members table
}

export async function updateMember(id: number, data: Partial<MemberData>) {
  // Update members table
}
```

#### `server/routes.ts`
Currently:
```typescript
// ❌ Registration creates users with "member" role
router.post('/api/registration', async (req, res) => {
  const user = await storage.createUser({
    role: 'member',  // WRONG!
    ...
  });
});
```

Should be:
```typescript
// ✅ Registration creates members (no auth)
router.post('/api/registration', async (req, res) => {
  const member = await storage.createMember({
    // NO Supabase auth creation!
    // NO role field
    ...
  });
});
```

#### Authentication Middleware
Currently:
```typescript
// ❌ Allows member logins
if (user.role === 'member') {
  // Members can still potentially log in
}
```

Should be:
```typescript
// ✅ Block member emails from logging in
if (user.role !== 'agent' && user.role !== 'admin' && user.role !== 'super_admin') {
  throw new Error('Only agents and admins can log into this application');
}

// ✅ Check if email belongs to a member
const member = await storage.getMemberByEmail(email);
if (member) {
  throw new Error('Members cannot log into this application. Please contact your agent.');
}
```

### 3. Frontend Updates (❌ NOT COMPLETE)
**Status:** UI still shows "Users" and allows member logins

**Files that need updating:**

#### `client/src/pages/admin.tsx`
- Change "Users" to "Agents" and "Members" tabs
- Show different columns for each
- Remove "Login" column from members view

#### `client/src/hooks/useAuth.tsx`
- Add check to block member emails from logging in
- Show appropriate error message

#### Registration Forms
- Update to create members, not users
- Remove any authentication-related fields

## 📊 Current Data State

### Users Table
**Currently contains:**
- Agents (role = 'agent')
- Admins (role = 'admin')  
- Super Admins (role = 'super_admin')
- **❌ MEMBERS (role = 'member' or 'user')** ← Should NOT be here!

### Members Table
**Currently contains:**
- **❌ EMPTY** - Migration hasn't been run

## 🎯 What Needs to Happen Next

### Phase 1: Database Migration (1-2 hours)
```bash
# 1. Backup database
pg_dump DATABASE_URL > backup_before_member_separation.sql

# 2. Run migration
psql DATABASE_URL -f member_user_separation_migration.sql

# 3. Verify migration
psql DATABASE_URL -c "SELECT COUNT(*) FROM members;"  # Should show ~70-85 records
psql DATABASE_URL -c "SELECT role, COUNT(*) FROM users GROUP BY role;"  # Should only show agent/admin
```

### Phase 2: Update Storage Layer (2-3 hours)
1. Add `createMember()`, `getMember()`, `getMemberByEmail()`, `updateMember()` functions
2. Update `getMembersOnly()` to query `members` table
3. Update enrollment functions to create members, not users
4. Update all queries joining subscriptions/payments to use member_id

### Phase 3: Update API Routes (2-3 hours)
1. `/api/registration` - create member instead of user
2. `/api/agent/enrollment` - create member instead of user
3. `/api/admin/members` - query members table
4. Block member emails from `/api/auth/login`

### Phase 4: Update Frontend (1-2 hours)
1. Separate "Agents" and "Members" tabs
2. Update auth hook to block member logins
3. Fix terminology throughout UI

### Phase 5: Testing (2-3 hours)
1. Test agent login ✓
2. Test admin login ✓
3. Test member email BLOCKED from login ✓
4. Test member enrollment ✓
5. Test member data display ✓
6. Test subscriptions linked correctly ✓
7. Test commissions tracked correctly ✓

## 🚨 Why This Matters

### Security Issues (Current State)
- ❌ Members have user accounts (potential login access)
- ❌ Member emails exist in Supabase Auth
- ❌ No clear separation of concerns
- ❌ Confused data model (user vs member)

### Benefits (After Migration)
- ✅ Members **CANNOT** log into the app
- ✅ Clear separation: users = staff, members = customers
- ✅ Better HIPAA compliance
- ✅ Reduced attack surface
- ✅ Cleaner codebase
- ✅ Easier to maintain

## 📝 Decision Required

**Do you want to proceed with the migration?**

Options:
1. **Run the migration now** - Complete the separation
2. **Test migration on copy first** - Safer approach
3. **Wait** - Keep current mixed approach

The migration script and plan are **ready to execute** - we just need to pull the trigger.

---

**Last Updated:** 2025-10-14
**Status:** Schema ready, migration scripts ready, code updates needed
**Blocker:** Migration has not been executed on production database
