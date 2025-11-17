# User Seeding Script - Final Configuration

## Overview
Updated `server/scripts/seed-users.ts` to safely transition from generic test accounts to real team members.

## What Will Happen When You Run `npm run seed:users`

### Step 1: Remove Old Test Agents (3 users)
These generic test agent accounts will be **DELETED** from Supabase:
- ❌ `mdkeener@gmail.com`
- ❌ `tmatheny77@gmail.com`
- ❌ `sarah.johnson@mypremierplans.com`

### Step 2: Preserve Existing Admins (2 users)
**NO CHANGES** - These accounts remain intact:
- ✅ `michael@mypremierplans.com` (Super Admin) - Password NOT changed
- ✅ `travis@mypremierplans.com` (Admin) - Password NOT changed

### Step 3: Update Admin Accounts (2 users)
These accounts will be updated with new phone numbers:
- 🔄 `richard@mypremeirplans.com` (Richard Salinas) 
  - Role: Admin (MPP0003)
  - Phone: 210-274-8633
  - New Password: GetMyDPC2025!Secure

- 🔄 `joaquin@mypremierplans.com` (Joaquin Davila)
  - Role: Admin (MPP0004)
  - Phone: 832-732-9323
  - New Password: GetMyDPC2025!Secure

### Step 4: Add New Agent Accounts (4 users)
Real team members will be created:

- ✨ `svillarreal@cyariskmanagement.com` (Steven Villarreal)
  - Role: Agent (MPP0005)
  - Phone: 210-286-0669
  - Password: GetMyDPC2025!Secure

- ✨ `addsumbalance@gmail.com` (Ana Vasquez)
  - Role: Agent (MPP0006)
  - Phone: 956-221-2464
  - Password: GetMyDPC2025!Secure

- ✨ `sean@sciahealthins.com` (Sean Casados)
  - Role: Agent (MPP0007)
  - Phone: 720-584-6097
  - Password: GetMyDPC2025!Secure

- ✨ `penningtonfinancialservices@gmail.com` (Richard Pennington)
  - Role: Agent (MPP0008)
  - Phone: 832-997-9323
  - Password: GetMyDPC2025!Secure

## Final User Count
- **Super Admin**: 1 (Michael)
- **Admins**: 3 (Michael, Travis, Richard S., Joaquin)
- **Agents**: 4 (Steven, Ana, Sean, Richard P.)
- **Total Active Users**: 8

## Password Reset on First Login
All users (except Michael & Travis who keep their existing passwords) will have `requiresPasswordChange` flag set to force password change on first login.

## How to Run

```bash
npm run seed:users
```

### Important Notes
1. **Requires dependencies**: Run `npm install` first if needed
2. **Requires environment variables**: `.env` must have:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `DATABASE_URL`

3. **No rollback**: Script will permanently delete old test accounts
4. **Idempotent**: Safe to run multiple times (existing users will be updated)

## Verification After Running

1. ✅ Check Supabase Auth - should see 8 users
2. ✅ Check Supabase Database - users table should have 8 records
3. ✅ Test login with Michael's existing account (unchanged)
4. ✅ Test login with new agent accounts
5. ✅ Verify roles are correctly assigned

## Questions Before Running?
- Confirm Michael (super admin) account details
- Confirm Travis (admin) account details
- Ready to delete old test agents?
