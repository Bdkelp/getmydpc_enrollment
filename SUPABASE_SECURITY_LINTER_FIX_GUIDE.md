---
description: Guide to fix Supabase security linter errors
applyTo: "Supabase Database"
---

# Supabase Security Linter Fixes

## Overview
The Supabase database has 4 critical security issues that need to be addressed:
1. ❌ View `agent_commissions_with_details` uses SECURITY DEFINER
2. ❌ View `agent_downlines` uses SECURITY DEFINER  
3. ❌ Table `agent_hierarchy_history` has RLS disabled
4. ❌ Table `agent_override_config` has RLS disabled

## Why These Are Problems

### SECURITY DEFINER Views
- Views defined with SECURITY DEFINER run with the **creator's permissions**, not the querying user's
- This **bypasses Row Level Security (RLS)** policies
- **Security risk**: Users can see data they shouldn't have access to
- **Solution**: Remove SECURITY DEFINER so views use caller's permissions

### RLS Disabled Tables
- Public tables without RLS are exposed to PostgREST
- Any authenticated user can potentially access/modify data
- **Security risk**: No row-level access control
- **Solution**: Enable RLS and create appropriate policies

## How to Fix

### Step 1: Access Supabase SQL Editor
1. Go to your Supabase project dashboard
2. Click "SQL Editor" in the left sidebar
3. Click "New Query"

### Step 2: Copy the Fix Script
Copy the entire contents of `SUPABASE_SECURITY_FIXES.sql` from this repository

### Step 3: Paste and Run
1. Paste the SQL script into the SQL Editor
2. Review the SQL carefully
3. Click "Run" to execute all fixes

### Step 4: Verify the Fixes
Run this verification query:

```sql
-- Check RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('agent_hierarchy_history', 'agent_override_config');

-- Check RLS policies exist
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('agent_hierarchy_history', 'agent_override_config')
ORDER BY tablename, policyname;
```

Expected results:
- `agent_hierarchy_history` should have `rowsecurity = true`
- `agent_override_config` should have `rowsecurity = true`
- Both tables should have multiple policies listed (admin read, agent read, admin insert/update/delete)

### Step 5: Re-run Supabase Linter
1. Go to Supabase project dashboard
2. Click "Database" → "Linter" 
3. Check that all 4 errors are now resolved

## Important Notes

### View Definitions
The script includes example view definitions for `agent_commissions_with_details` and `agent_downlines`. 

**YOU MUST:**
1. Find the original view definitions in your Supabase project
2. Copy their SELECT statements
3. Replace the example SELECT in the script with your actual SELECT
4. Keep everything else (remove SECURITY DEFINER clause)

To find original view definitions:
1. Go to Supabase "Table Editor"
2. Look for the views in the left sidebar
3. Click on the view name
4. Look for "View definition" or "SQL" tab

### RLS Policy Testing
After enabling RLS:
1. Test that your application still works
2. Verify that agents can only see their own data
3. Verify that admins can see all data
4. Test from authenticated and unauthenticated contexts

### Rollback If Needed
If something breaks:
1. Disable RLS on affected tables
2. Drop the problematic views
3. Recreate views WITH SECURITY DEFINER (temporary)
4. Debug the issue
5. Try again

## Security Best Practices Applied

✅ **Principle of Least Privilege**: Users only see data they're authorized to see  
✅ **Defense in Depth**: RLS policies + view permissions combined  
✅ **Caller's Permissions**: Views use querying user's role, not creator's  
✅ **Audit Trail**: Tables properly secured for compliance  

## Related Files
- `SUPABASE_SECURITY_FIXES.sql` - Complete SQL fix script
- `TECH_STACK_AND_ENVIRONMENTS.md` - System architecture and security overview
- `DEPLOYMENT_CHECKLIST.md` - Security verification checklist

## Verification Checklist
- [ ] All 4 security errors fixed in Supabase Linter
- [ ] App still functions normally after fixes
- [ ] Agents can only see their own commissions/hierarchies
- [ ] Admins can see all data
- [ ] No data leaks or access control bypasses
- [ ] Performance is acceptable (RLS doesn't cause slowdowns)

