# Commission System Debug Plan

## Current Status: Commissions not showing up after enrollment

## Possible Issues:

### 1. **Code Not Deployed**
- New commission service files are only local
- Railway is running old code without new commission logic
- **Solution**: Push code to Railway deployment

### 2. **Database Connection Issue**
- New `agent_commissions` table exists but app can't access it
- RLS policies blocking access
- **Test**: Try direct Supabase query

### 3. **Function Call Chain Broken**
- Enrollment → createCommissionWithCheck → createCommissionDualWrite
- One step in the chain is failing silently
- **Test**: Add console.log statements

### 4. **Import/Module Issues**  
- commission-service.ts import path wrong
- TypeScript compilation errors
- **Check**: Build/compile errors

## Debugging Steps:

### Step 1: Check Railway Deployment Status
- Are the new files deployed?
- Check Railway logs for errors
- Verify build succeeded

### Step 2: Test Database Access
Run in Supabase SQL Editor:
```sql
-- Test if table is accessible
SELECT COUNT(*) FROM agent_commissions;

-- Test if we can insert manually
INSERT INTO agent_commissions (agent_id, member_id, commission_amount, coverage_type)
VALUES ('test-agent', 'test-member', 100.00, 'aca');

-- Check if record appears
SELECT * FROM agent_commissions ORDER BY created_at DESC LIMIT 1;
```

### Step 3: Check Application Logs
- Look for "[Commission Dual-Write]" log messages
- Check for import errors
- Verify createCommissionWithCheck is being called

### Step 4: Test API Endpoints Directly
- Test: `POST /api/test-commission` 
- Test: `GET /api/test-commission-count`
- Should show if basic commission creation works

## Quick Fix Strategy:

If deployment is the issue:
1. Commit all files
2. Push to Railway
3. Check deployment logs
4. Test enrollment again

If database access is the issue:
1. Check RLS policies
2. Verify table permissions
3. Test direct database access

If function chain is broken:
1. Add more logging
2. Test each step individually
3. Fix broken link in chain

## Next Action:
**Check Railway deployment status and logs first**