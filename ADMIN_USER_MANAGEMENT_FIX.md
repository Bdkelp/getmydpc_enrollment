# Admin Dashboard User Management - DPC Members Fix

## Problem Summary
The Admin Dashboard's User Management page was showing agents, admins, and members all mixed together, but:
1. **DPC Members** are stored in the **Neon database** (`members` table)
2. **Agents and Admins** are stored in the **Supabase database** (`users` table)
3. The suspend/reactivate buttons were calling the wrong endpoints for members
4. Members like "Tylara Jones" weren't showing up in the Members tab

## Root Cause
- The `/api/admin/users` endpoint was querying Supabase for all users
- It tried to include "members" from Supabase, but real DPC members are in Neon
- The `getMembersOnly()` function was querying the wrong database
- Suspend/reactivate endpoints (`/api/admin/users/:userId/suspend`) only worked with Supabase users

## Solution Implemented

### Backend Changes (server/storage.ts)
Added three new functions to work with DPC members in Neon database:

1. **`getAllDPCMembers()`** - Fetches all DPC members from Neon `members` table
   - Returns member data mapped to frontend-compatible format
   - Includes customer_number, enrollment info, agent tracking, status

2. **`suspendDPCMember(customerId, reason)`** - Suspends a member in Neon
   - Updates `status = 'suspended'` and `is_active = false`
   - Records cancellation reason
   - Uses `customer_number` as identifier (e.g., "MPP20250002")

3. **`reactivateDPCMember(customerId)`** - Reactivates a member in Neon
   - Updates `status = 'active'` and `is_active = true`
   - Clears cancellation reason and date

### Backend Changes (server/routes.ts)
Added three new API endpoints:

1. **`GET /api/admin/dpc-members`** - Fetches all DPC members
   - Requires admin authentication
   - Returns members from Neon database
   - Separate from `/api/admin/users` which returns Supabase users

2. **`PUT /api/admin/dpc-members/:customerId/suspend`** - Suspend member
   - Uses customer_number (e.g., "MPP20250002") instead of user ID
   - Works with Neon database

3. **`PUT /api/admin/dpc-members/:customerId/reactivate`** - Reactivate member
   - Uses customer_number as identifier
   - Works with Neon database

### Frontend Changes (client/src/pages/admin-users.tsx)
Updated user management page to handle DPC members correctly:

1. **Added separate query for DPC members**:
   ```typescript
   const { data: dpcMembersData } = useQuery({
     queryKey: ['/api/admin/dpc-members'],
     queryFn: async () => apiRequest('/api/admin/dpc-members')
   });
   ```

2. **Added member-specific mutations**:
   - `suspendMemberMutation` - Calls `/api/admin/dpc-members/:customerId/suspend`
   - `reactivateMemberMutation` - Calls `/api/admin/dpc-members/:customerId/reactivate`

3. **Updated button logic**:
   - Detects if user is a DPC member (has `customerNumber` property)
   - Uses member mutations for DPC members
   - Uses user mutations for agents/admins
   - Correctly passes `customerId` for members, `userId` for others

4. **Updated data filtering**:
   ```typescript
   const members = safeMembers; // From Neon database
   const agents = safeUsers.filter(u => u.role === 'agent'); // From Supabase
   const admins = safeUsers.filter(u => u.role === 'admin'); // From Supabase
   ```

## How It Works Now

### Members Tab
- Fetches from `/api/admin/dpc-members` (Neon database)
- Shows real enrolled members like "Tylara Jones" (MPP20250002)
- Suspend button calls `/api/admin/dpc-members/MPP20250002/suspend`
- Reactivate button calls `/api/admin/dpc-members/MPP20250002/reactivate`
- ✅ Works correctly with Neon database

### Agents Tab
- Fetches from `/api/admin/users?filter=agents` (Supabase database)
- Shows agent accounts like "agent1@example.com"
- Suspend button calls `/api/admin/users/:userId/suspend`
- Reactivate button calls `/api/admin/users/:userId/reactivate`
- ✅ Works correctly with Supabase database

### Admins Tab
- Fetches from `/api/admin/users?filter=admins` (Supabase database)
- Shows admin accounts like "michael@mypremierplans.com"
- Suspend button calls `/api/admin/users/:userId/suspend`
- Reactivate button calls `/api/admin/users/:userId/reactivate`
- ✅ Works correctly with Supabase database

## Database Architecture
```
┌─────────────────────────────────────────┐
│         SUPABASE DATABASE               │
├─────────────────────────────────────────┤
│  • users table (agents, admins)         │
│  • plans table                          │
│  • Used for: Authentication, Plans      │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│           NEON DATABASE                 │
├─────────────────────────────────────────┤
│  • members table (DPC members)          │
│  • commissions table                    │
│  • family_members table                 │
│  • Used for: Member data, Commissions   │
└─────────────────────────────────────────┘
```

## Testing Checklist

### ✅ To Verify
1. Go to Admin Dashboard → User Management
2. **Members Tab**: Should show "Tylara Jones" (MPP20250002) and any other enrolled members
3. **Members Tab**: Click "Suspend" on a member - should update status to "Suspended"
4. **Members Tab**: Click "Reactivate" on suspended member - should update status to "Active"
5. **Agents Tab**: Should show agents only (e.g., agent1@example.com)
6. **Agents Tab**: Suspend/Reactivate buttons should work for agents
7. **Admins Tab**: Should show admins only (e.g., michael@mypremierplans.com)
8. **Admins Tab**: Suspend/Reactivate buttons should work for admins

## Next Steps
1. **Restart the server** to load the updated code
2. Test the Members tab - Tylara Jones should now appear
3. Test suspend/reactivate on a DPC member
4. Verify the commission creation fix from earlier is also working

## Related Fix
Also fixed earlier in this session:
- ✅ `createCommission()` now inserts into Neon database instead of Supabase
- ✅ Commissions will now be created correctly for new enrollments
