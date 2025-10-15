# ADMIN & AGENT DASHBOARD FIX - ENROLLMENTS VIEW

## Problem
- Admin dashboard "All Enrollments" tab showing old test data from Supabase `users` table
- Agent view showing old enrollments that don't exist anymore
- New enrollments in Neon `members` table not appearing

## Root Cause
The enrollment listing functions were querying the **Supabase `users` table** where members were stored in the old architecture. With the new member/user separation:
- **Members** are stored in **Neon `members` table**
- **Agents/Admins** are stored in **Supabase `users` table**

The admin and agent dashboards were still looking at the wrong table.

## Solution Implemented

### Updated Functions (server/storage.ts)

#### 1. `getAllEnrollments()` - For Admin Dashboard
**Before:**
```typescript
let sql = "SELECT * FROM users WHERE role IN ('user', 'member')";
```

**After:**
```typescript
// Query members table from Neon database (not Supabase users table)
let sql = "SELECT * FROM members WHERE status = 'active'";
```

Now queries:
- **Neon `members` table** instead of Supabase users
- Filters by `status = 'active'`
- Orders by `created_at DESC` (newest first)
- Maps member data to User format for compatibility

#### 2. `getEnrollmentsByAgent()` - For Agent Dashboard
**Added new function** (was missing):
```typescript
export async function getEnrollmentsByAgent(
  agentId: string, 
  startDate?: string, 
  endDate?: string
): Promise<User[]>
```

Queries:
- **Neon `members` table** filtered by `enrolled_by_agent_id`
- Shows only members enrolled by specific agent
- Supports date filtering
- Orders by `created_at DESC`

## What This Fixes

### Admin Dashboard (`/admin/enrollments`)
✅ Now shows only **real members** from Neon database
✅ Shows **customer numbers** (MPP20250001, etc.)
✅ Shows **agent tracking** (which agent enrolled them)
✅ Old test data from Supabase users table **no longer appears**

### Agent Dashboard (`/agent/enrollments`)
✅ Now shows only **members enrolled by that agent**
✅ Filtered by `enrolled_by_agent_id`
✅ Shows commission-eligible enrollments
✅ Old test data **no longer appears**

## Data Mapping
The functions map Neon member fields to User format:
- `customer_number` → `customerNumber`
- `first_name` → `firstName`
- `last_name` → `lastName`
- `enrolled_by_agent_id` → `enrolledByAgentId`
- `agent_number` → `agentNumber`
- `status = 'active'` → `isActive = true`
- `role` = 'member' (hardcoded)

## Testing Steps

### 1. Check Current State
Before creating new enrollments, dashboards should now be empty or show only Tara Hamilton:
```bash
node check-member.mjs
```

### 2. Clear Test Data (Optional)
```bash
node clear-test-member.mjs
```

### 3. Create New Test Enrollment
1. Login as agent: `agent1@example.com`
2. Go to: `/registration`
3. Complete enrollment form
4. Submit and verify success

### 4. Verify Admin Dashboard
1. Login as admin
2. Go to: `/admin/enrollments`
3. Should see the new enrollment with:
   - Customer number (MPP20250002)
   - Agent number (MPP0002)
   - All member details

### 5. Verify Agent Dashboard
1. Login as agent: `agent1@example.com`
2. Go to: `/agent/enrollments`
3. Should see only enrollments by this agent
4. Check commission tracking

## Database Tables

### Neon `members` Table (Source of Truth for Enrollments)
- `id` - Primary key
- `customer_number` - Unique identifier (MPP20250001)
- `first_name`, `last_name`, `email`, `phone`
- `agent_number` - Agent who should get commission
- `enrolled_by_agent_id` - Supabase user ID of enrolling agent
- `status` - 'active', 'inactive', 'cancelled'
- `created_at`, `updated_at`

### Supabase `users` Table (Agents & Admins Only)
- `id` - Primary key (used as enrolled_by_agent_id)
- `email`, `first_name`, `last_name`
- `role` - 'agent' or 'admin'
- `agent_number` - Agent identifier (MPP0002)

## Files Modified
- `server/storage.ts`:
  - Updated `getAllEnrollments()` to query Neon members table
  - Added `getEnrollmentsByAgent()` function
  - Added `getEnrollmentsByAgent` to storage exports

## Expected Behavior After Fix

### Empty Dashboards (Initial State)
- Admin enrollments: Empty or only Tara Hamilton
- Agent enrollments: Empty or only their enrollments

### After New Enrollment
- **Admin sees**: All members from all agents
- **Agent sees**: Only members they enrolled
- **Both show**: Customer numbers, agent tracking, real enrollment data

### Old Test Data
- Old Supabase user enrollments: **No longer appear**
- Only Neon members table data is shown
- Clean slate for fresh testing

## Next Steps
1. Deploy changes to production
2. Test with new enrollment
3. Verify commission creation works
4. Verify admin/agent views show correct data
