# 🎯 CURRENT STATUS & NEXT STEPS

**Last Updated:** October 14, 2025

## ✅ What's Been Done

1. **Database Migration Script Created**
   - ✅ `fresh_start_migration.sql` - Complete, ready to run
   - ✅ Wipes all member/user data (keeps 2 agents + 3 admins)
   - ✅ Creates members table with proper CHAR field sizes
   - ✅ Includes validation constraints for data quality
   - ✅ Helper functions for customer number generation

2. **Cleanup Script Created**
   - ✅ `cleanup.ps1` - Removes 22 outdated files
   - ✅ `CLEANUP_RECOMMENDATION.md` - Lists what to delete

## ❌ What Still Needs to Be Done

### 1. Run Database Migration (30 minutes)
**File:** `fresh_start_migration.sql`  
**Where:** Supabase Dashboard > SQL Editor

This will:
- Delete all test member/user data
- Create proper members table with:
  - `customer_number` CHAR(11) - MPP20250001
  - `phone` CHAR(10) - 5125551234
  - `date_of_birth` CHAR(8) - MMDDYYYY (01151990)
  - `ssn` CHAR(9) - 123456789
  - `state` CHAR(2) - TX, CA
  - `zip_code` CHAR(5) - 78701
  - `gender` CHAR(1) - M, F, O
- Add validation constraints
- Create helper functions

### 2. Update TypeScript Schema (15 minutes)
**File:** `shared/schema.ts`

Change members table from:
```typescript
customerNumber: varchar("customer_number")
phone: varchar("phone")
dateOfBirth: varchar("date_of_birth")
```

To:
```typescript
customerNumber: char("customer_number", { length: 11 })
phone: char("phone", { length: 10 })
dateOfBirth: char("date_of_birth", { length: 8 }) // MMDDYYYY
ssn: char("ssn", { length: 9 })
state: char("state", { length: 2 })
zipCode: char("zip_code", { length: 5 })
gender: char("gender", { length: 1 })
```

### 3. Update Storage Functions (1 hour)
**File:** `server/storage.ts`

Add new functions:
- `createMember()` - Use `generate_customer_number()` SQL function
- `getMember(id)`
- `getMemberByEmail(email)`
- `getAllMembers()`
- `updateMember(id, data)`

Format data properly:
- Phone: Strip to 10 digits (no formatting)
- Dates: Convert to MMDDYYYY format
- SSN: Strip to 9 digits
- State: Uppercase 2-letter code
- Gender: Single char (M/F/O)

### 4. Update API Routes (1 hour)
**File:** `server/routes.ts`

Fix these endpoints:
- `/api/registration` - Create members (not users), NO Supabase auth
- `/api/agent/enrollment` - Create members, validate field formats
- `/api/auth/login` - Block member emails from logging in

### 5. Add Member Email Blocking (30 minutes)
**File:** `server/auth/supabaseAuth.ts`

In `authenticateToken()` middleware:
```typescript
// Check if email belongs to a member
const member = await storage.getMemberByEmail(user.email);
if (member) {
  return res.status(403).json({
    message: 'Members cannot log into this application.',
    isMember: true
  });
}
```

### 6. Run Cleanup Script (5 minutes)
```powershell
.\cleanup.ps1
```

This removes 22 outdated files.

### 7. Test Everything (1 hour)
- ✅ Agent login works
- ✅ Admin login works
- ❌ Member email login BLOCKED
- ✅ Member enrollment creates proper record
- ✅ Phone validates to 10 digits
- ✅ Dates validate to MMDDYYYY
- ✅ Customer numbers auto-generate

## 📋 Quick Start Commands

### Step 1: Run Migration
```
Go to Supabase Dashboard > SQL Editor
Copy & paste fresh_start_migration.sql
Click "Run" (F5)
```

### Step 2: Clean Up Files
```powershell
.\cleanup.ps1
```

### Step 3: Update Code
```
1. Update shared/schema.ts (change varchar to char)
2. Update server/storage.ts (add member functions)
3. Update server/routes.ts (fix endpoints)
4. Update server/auth/supabaseAuth.ts (block members)
```

### Step 4: Test
```
1. Try to enroll a new member
2. Verify customer number auto-generated
3. Verify phone/date formatting works
4. Try to login with member email (should fail)
5. Login with agent/admin (should work)
```

## 🎯 Time Estimate

- Database Migration: 30 min
- Schema Updates: 15 min
- Storage Functions: 1 hour
- API Route Updates: 1 hour
- Auth Blocking: 30 min
- Cleanup: 5 min
- Testing: 1 hour

**Total: ~4.5 hours**

## 🚀 When Complete

You'll have:
- ✅ Clean database (no test data)
- ✅ Proper field sizes with validation
- ✅ Members separate from users
- ✅ Members CAN'T log in
- ✅ Agents/admins CAN log in
- ✅ Auto-generated customer numbers
- ✅ Data quality guaranteed by database constraints

---

**IMPORTANT:** Use ONLY `fresh_start_migration.sql` - ignore the other migration files!
