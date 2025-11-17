# User Setup Guide - 8 Test Users

## Overview
This app requires proper user setup with distinct roles for testing:
- **Admins**: Full access to admin dashboard, commission management, agent oversight
- **Agents**: Can enroll members, track personal commissions, download reports
- **Members**: Not users in the app - they are only contacts enrolled by agents

## Current Role Assignment Logic
The system automatically assigns roles based on email address in `server/auth/supabaseAuth.ts`:

```typescript
// Admin emails (4 total)
const adminEmails = [
  'michael@mypremierplans.com',
  'travis@mypremierplans.com',
  'richard@mypremierplans.com',
  'joaquin@mypremierplans.com'
];

// Agent emails (4 total) 
const agentEmails = [
  'mdkeener@gmail.com',
  'tmatheny77@gmail.com',
  'svillarreal@cyariskmanagement.com'
  // Need to add 1 more agent email
];

// Any other email defaults to "member"
```

## 8 Test Users Setup

### Admin Users (4 total)

| Email | Name | Password | Role | Purpose |
|-------|------|----------|------|---------|
| michael@mypremierplans.com | Michael A. | Admin123! | Admin | Primary admin - commission oversight |
| travis@mypremierplans.com | Travis M. | Admin123! | Admin | Secondary admin - agent management |
| richard@mypremierplans.com | Richard H. | Admin123! | Admin | Tertiary admin - reporting |
| joaquin@mypremierplans.com | Joaquin R. | Admin123! | Admin | Tertiary admin - payout processing |

### Agent Users (4 total)

| Email | Name | Password | Role | Purpose |
|-------|------|----------|------|---------|
| mdkeener@gmail.com | Mark D. Keener | Agent123! | Agent | Top performer agent |
| tmatheny77@gmail.com | Trent M. | Agent123! | Agent | Mid-tier performer |
| svillarreal@cyariskmanagement.com | Steve V. | Agent123! | Agent | Regional agent |
| sarah.johnson@mypremierplans.com | Sarah J. | Agent123! | Agent | NEW - Fourth agent |

## How to Create Users

### Option 1: Via Supabase Dashboard (Recommended for First Time)

1. Go to Supabase Console → Authentication → Users
2. Click "Add User"
3. Enter email and password
4. User metadata can be set to:
   ```json
   {
     "firstName": "FirstName",
     "lastName": "LastName",
     "email": "user@email.com"
   }
   ```
5. Check "Auto confirm user" to skip email verification
6. Click "Create User"

**Repeat for all 8 emails above.**

### Option 2: Via Login Endpoint (App-Based)

1. Open the app at `https://enrollment.getmydpc.com`
2. Click "Sign Up" or go to registration page
3. Enter email, password, first name, last name
4. Submit registration
5. System will automatically assign role based on email pattern
6. Account will be in "pending" approval status (update via Supabase if needed)

### Option 3: Via API (For Automated Testing)

```bash
# Register a new user
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "Password123!",
    "firstName": "First",
    "lastName": "Last"
  }'
```

## User Database Schema

When a user authenticates, these fields are stored in the `users` table:

```typescript
interface User {
  id: string;                      // Supabase auth.uid
  email: string;                   // User email
  firstName: string;               // First name
  lastName: string;                // Last name
  emailVerified: boolean;           // Email confirmation status
  role: "admin" | "agent" | "member"; // Auto-assigned role
  profileImageUrl?: string;         // Optional profile image
  isActive: boolean;                // Account status
  approvalStatus: "pending" | "approved" | "rejected"; // Admin approval
  lastLoginAt?: Date;               // Last login timestamp
  createdAt: Date;                  // Account creation date
  updatedAt: Date;                  // Last update date
}
```

## Important Notes

### Auto-Assignment on Login
When a user logs in:
1. Supabase authenticates with email/password
2. System checks if user exists in `users` table
3. If not found, system creates user with auto-assigned role
4. Role is determined by `determineUserRole(email)` function
5. Default status: `isActive: true`, `approvalStatus: "pending"`

### Role Permissions
- **Admin**: Can access `/admin/*` routes, manage commissions, view all agents, process payouts
- **Agent**: Can access `/agent/*` routes, enroll members, view personal commissions
- **Member**: Gets "No Dashboard Access" message (members don't need app access currently)

### Email Pattern Matching
The system uses **exact email matching** - emails must match EXACTLY:
- ✅ `michael@mypremierplans.com` → Admin
- ❌ `Michael@mypremierplans.com` → Member (wrong case)
- ❌ `michael.a@mypremierplans.com` → Member (different format)

**Be precise when creating users!**

## Testing Workflow

### 1. Create All 8 Users
Use Supabase Dashboard or API to create users (see "How to Create Users" above)

### 2. Test Admin Workflow
- Login as `michael@mypremierplans.com` / `Admin123!`
- Should see admin dashboard
- Should see "Commission Management" section
- Should see all agents' data

### 3. Test Agent Workflow
- Login as `mdkeener@gmail.com` / `Agent123!`
- Should see agent dashboard
- Should see personal commission totals (MTD/YTD/Lifetime/Pending)
- Should be able to export commission report
- Should see recent enrollments

### 4. Verify Role Assignment
- Check browser console or network tab after login
- Response should show `role: "admin"` or `role: "agent"`
- Database should have correct role in users table

## Adding More Users Later

To add a new agent later:
1. Create user in Supabase with email ending in `@mypremierplans.com` or add to `agentEmails` array
2. If custom email, add to `agentEmails` array in `server/auth/supabaseAuth.ts`
3. Redeploy backend
4. User will automatically get "agent" role on first login

To add a new admin later:
1. Add email to `adminEmails` array in `server/auth/supabaseAuth.ts`
2. Redeploy backend
3. User will automatically get "admin" role on first login

## Troubleshooting

### User Gets Wrong Role
- Check email matches exactly (case-sensitive)
- Check email is in correct array in `supabaseAuth.ts`
- Check Supabase user table for role assignment
- Try clearing browser cache and logging out/in again

### User Cannot Login
- Confirm account was created in Supabase → Authentication → Users
- Confirm "Auto Confirm User" was checked (or manually confirm)
- Check email/password are correct
- Check user is not deactivated (`isActive: false`)

### User Gets "Account Pending Approval"
- This is normal for new users created via registration
- Admin can approve by updating `approvalStatus` to "approved" in users table
- Auto-created users via login get approved immediately

## Current Status

**Total Users Configured:** 7 + 1 (need to add)
- ✅ 4 Admin emails configured
- ✅ 3 Agent emails configured  
- ⚠️ 4th Agent email needed: `sarah.johnson@mypremierplans.com`

**Next Steps:**
1. Add `sarah.johnson@mypremierplans.com` to `agentEmails` array in `server/auth/supabaseAuth.ts`
2. Create all 8 users in Supabase Dashboard
3. Test login workflow for each user
4. Verify role assignment and dashboard access
5. Update this guide with test results
