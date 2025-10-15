# Supabase Schema Audit & Fixes

## Date: January 14, 2025

## Problem Discovered
The code was using a schema that didn't match the actual Supabase `users` table structure, causing login failures and data insertion errors.

## Actual Supabase `users` Table Schema

### ✅ Columns That EXIST:
```
- email (PRIMARY KEY, unique)
- username
- first_name
- last_name
- phone
- role
- agent_number
- is_active
- created_at
```

### ❌ Columns That DO NOT EXIST (causing errors):
```
- id (table uses email as primary key)
- approval_status
- approved_at
- approved_by
- email_verified
- email_verified_at
- profile_image_url
- last_login_at
- updated_at
- password_hash (might exist but not returned in SELECT)
- Social login fields (google_id, facebook_id, twitter_id, etc.)
- Other metadata fields
```

## Fixes Applied

### ✅ FIXED: `getUserByEmail()` function
- **Issue**: Was trying to SELECT `id` column that doesn't exist
- **Fix**: 
  - Changed `SELECT` to use `SELECT *` for all available columns
  - Added fallback: `id: data.id || data.email` in `mapUserFromDB()`
  - Now uses email as the user identifier

### ✅ FIXED: `createUser()` function
- **Issue**: Was trying to INSERT columns that don't exist (id, approval_status, email_verified, profile_image_url, social IDs)
- **Fix**:
  - Removed `id` field from INSERT (table uses email as PK)
  - Removed all non-existent columns from INSERT statement
  - Only inserts: email, username, first_name, last_name, phone, role, agent_number, is_active, created_at
  - Added logging to track what's being inserted

### ✅ FIXED: `updateUser()` function
- **Issue**: Was using SQL UPDATE with columns that don't exist
- **Fix**:
  - Switched from raw SQL to Supabase client
  - Only updates columns that exist: first_name, last_name, phone, role, is_active, agent_number
  - Ignores updates for: lastLoginAt, approvalStatus, approvedAt, approvedBy, profileImageUrl, social IDs
  - Uses email as identifier instead of id

### ✅ FIXED: `getUser()` function
- **Issue**: Was using SQL query with `WHERE id = $1`
- **Fix**: Now delegates to `getUserByEmail(id)` since id is actually email

### ✅ FIXED: `mapUserFromDB()` function
- **Issue**: Mapped `id` as `data.id` which was always undefined
- **Fix**: Changed to `id: data.id || data.email` to use email as fallback identifier

## Functions That Still Need Attention

### ⚠️ NEEDS FIX: `getPendingUsers()`
**Location**: server/storage.ts:1543
**Issue**: Queries `.eq('approvalStatus', 'pending')` but column doesn't exist
**Options**:
1. Remove this function entirely (no approval workflow in Supabase)
2. Return empty array
3. Return all users (no filtering by approval status)
**Recommendation**: Return empty array for now, implement approval in Neon DB only

### ⚠️ NEEDS FIX: `approveUser()`
**Location**: server/storage.ts:1580
**Issue**: Tries to update `approvalStatus: 'approved'` which doesn't exist
**Recommendation**: Skip Supabase update, only update Neon DB

### ⚠️ NEEDS FIX: `rejectUser()`
**Location**: server/storage.ts:1600
**Issue**: Tries to update `approvalStatus: 'rejected'` which doesn't exist
**Recommendation**: Skip Supabase update, only update Neon DB

## Database Strategy

### Two Databases in Use:
1. **Supabase** - Limited schema, used for authentication and basic user info
2. **Neon PostgreSQL** - Full schema with all columns including approval_status, last_login_at, etc.

### Recommended Approach:
- **Supabase**: Only store minimal user data (email, name, phone, role, agent_number)
- **Neon**: Store complete user records with all metadata, approval status, login tracking, etc.
- **Login Flow**: 
  1. Authenticate with Supabase (email/password)
  2. Fetch full user record from Neon by email
  3. Check approval status in Neon
  4. Track login in Neon

## Testing Checklist

### ✅ Completed:
- [x] getUserByEmail works with Supabase schema
- [x] createUser works with Supabase schema
- [x] updateUser works with Supabase schema
- [x] getUser works with Supabase schema
- [x] Login successfully creates user if doesn't exist

### 🔄 In Progress:
- [ ] Test login with existing user
- [ ] Test role updates
- [ ] Test agent number generation

### ❌ Not Started:
- [ ] Fix getPendingUsers to work without approval_status
- [ ] Fix approveUser to skip Supabase update
- [ ] Fix rejectUser to skip Supabase update
- [ ] Test admin approval workflow
- [ ] Test user suspension/reactivation

## Next Steps

1. **Wait for Railway deployment** to complete with current fixes
2. **Test login** with michael@mypremierplans.com
3. **Verify user creation** works in Supabase
4. **Fix remaining functions** (getPendingUsers, approveUser, rejectUser)
5. **Document dual-database strategy** for future development
6. **Consider migrating fully to Neon** and removing Supabase dependency

## Notes

- Supabase RLS policies might be limiting which columns are returned
- Some columns might exist but aren't selected due to permissions
- Consider refreshing Supabase schema cache if columns were recently added
- Email is used as the primary identifier throughout the system now
