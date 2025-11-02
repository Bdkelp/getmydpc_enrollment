# Supabase Security Fixes - Execution Checklist

## Pre-Execution ✅
- [x] View definitions verified with pg_get_viewdef()
- [x] SQL script syntax validated
- [x] All type casting issues fixed (auth.uid()::text)
- [x] All column reference issues fixed (agent_id instead of upline_agent_id)
- [x] Error handling in place (DROP POLICY IF EXISTS)
- [x] View ownership commands included (ALTER VIEW OWNER TO postgres)

## Execution Phase ⏳
- [ ] Copy SUBABASE_SECURITY_FIXES.sql (all 197 lines)
- [ ] Paste into Supabase SQL Editor
- [ ] Click Execute button
- [ ] Wait for "Query successful" messages
- [ ] Screenshot the verification results

## Post-Execution Verification ⏳
- [ ] Verification Query 1: RLS enabled on both tables (should show "t" for both)
  ```
  agent_hierarchy_history   | t
  agent_override_config     | t
  ```

- [ ] Verification Query 2: All 10 policies created
  ```
  Count: 10 policies (5 per table)
  All with PERMISSIVE = true
  All with correct USING/WITH CHECK clauses
  ```

- [ ] Verification Query 3: Views have NO SECURITY DEFINER
  ```
  agent_commissions_with_details | No "SECURITY DEFINER" in pg_get_viewdef() output
  agent_downlines                | No "SECURITY DEFINER" in pg_get_viewdef() output
  ```

## Supabase Linter Verification ⏳
- [ ] Go to Supabase Dashboard → Database → Security
- [ ] Run Linter
- [ ] Confirm all 4 errors are RESOLVED
- [ ] Expected result: 0 errors

## Code Deployment ⏳ (After Linter shows 0 errors)
- [ ] Deploy server/routes.ts (7 locations fixed)
- [ ] Deploy server/storage.ts (3 locations fixed)
- [ ] Test application
- [ ] Confirm users display correctly in admin panel

## Success Criteria
✅ All verification queries pass
✅ Linter shows 0 errors
✅ Views have no SECURITY DEFINER in definition
✅ RLS policies protect both tables
✅ Code deployed to production
✅ Users display in admin panel

---

## Script Contents Summary
- Lines 1-42: FIX 1 - agent_commissions_with_details view
- Lines 44-54: FIX 2 - agent_downlines view  
- Lines 56-57: View ownership changes (new!)
- Lines 59-126: FIX 3 - agent_hierarchy_history RLS
- Lines 128-188: FIX 4 - agent_override_config RLS
- Lines 190-197: Verification queries (3 SELECT statements)

---

## If Issues Occur

### Linter still shows SECURITY DEFINER errors
- [ ] Check if views are actually owned by postgres (should be after ALTER VIEW OWNER)
- [ ] Verify pg_get_viewdef() shows no SECURITY DEFINER
- [ ] Linter might have cache - try clearing browser cache and refreshing

### RLS policies not showing in verification query
- [ ] Check if ALTER TABLE ENABLE ROW LEVEL SECURITY succeeded
- [ ] Verify DROP POLICY IF EXISTS messages appeared without errors
- [ ] All 10 CREATE POLICY statements should show "Query successful"

### Views not returning data
- [ ] Views should work exactly as before (we only removed SECURITY DEFINER)
- [ ] RLS policies only restrict to admins/agents - not affecting view structure
- [ ] Test with admin account first

---

## Notes
- This script is idempotent (can be run multiple times safely)
- DROP POLICY IF EXISTS prevents "already exists" errors
- Ownership change to postgres removes linter false positives
- All changes are verified with 3 SQL queries at the end
