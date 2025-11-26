# Commission Agent Number Tracking Fix

## Problem
Commissions were being tracked only by `agent_id` (UUID) instead of `agent_number` (MPP00001, MPP00009, etc.), making it difficult to identify which agent earned each commission in reports and dashboards.

## Solution
Added `agent_number` field to the commission system for proper agent tracking.

## Changes Made

### 1. Database Schema
- **File**: `ADD_AGENT_NUMBER_TO_COMMISSIONS.sql`
- Added `agent_number` column to `agent_commissions` table
- Created index for performance: `idx_agent_commissions_agent_number`
- Backfills existing records from users table

### 2. TypeScript Schema
- **File**: `shared/clean-commission-schema.ts`
- Added `agentNumber` field to schema definition
- Added index for `agentNumber` field

### 3. Commission Service
- **File**: `server/commission-service.ts`
- Updated `AgentCommission` interface to include `agent_number`
- Modified `createCommissionDualWrite` to store agent_number

### 4. Routes
- **File**: `server/routes.ts`
- Updated `createCommissionWithCheck` to include agent_number in commission data
- Agent number is fetched from agent profile and stored with commission

### 5. Storage Functions
- **File**: `server/storage.ts`
- Updated `getAgentCommissionsNew` to:
  - Fetch agent_number from users table
  - Return agent_number in formatted response (prefers stored value, falls back to lookup)
- Updated `getAllCommissionsNew` to include agent_number in all commission queries

## Database Migration Required

**IMPORTANT**: You must run the SQL migration in Supabase to add the column:

1. Go to Supabase SQL Editor
2. Run the contents of `ADD_AGENT_NUMBER_TO_COMMISSIONS.sql`
3. Verify the results show:
   - Column added successfully
   - Existing records backfilled with agent numbers
   - Stats showing total vs. backfilled commissions

### Migration SQL
```sql
-- Add agent_number column to agent_commissions table
ALTER TABLE agent_commissions 
ADD COLUMN IF NOT EXISTS agent_number TEXT;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_agent_commissions_agent_number 
ON agent_commissions(agent_number);

-- Backfill agent_number from users table
UPDATE agent_commissions ac
SET agent_number = u.agent_number
FROM users u
WHERE ac.agent_id = u.id::text
  AND ac.agent_number IS NULL
  AND u.agent_number IS NOT NULL;
```

## How It Works Now

### Commission Creation
When a new enrollment is created:
1. System gets agent profile to retrieve `agent_number` (e.g., "MPP00001")
2. Creates commission with both `agent_id` (UUID) and `agent_number`
3. Stores commission in `agent_commissions` table

### Commission Queries
When viewing commissions:
1. System fetches commissions from database
2. Returns `agentNumber` field in response
3. Uses stored `agent_number` if available
4. Falls back to looking up from users table if missing

### Data Structure
```typescript
{
  id: 123,
  agent_id: "uuid-here",
  agent_number: "MPP00001",  // ← NEW FIELD
  member_id: "456",
  commission_amount: 40.00,
  status: "pending",
  payment_status: "unpaid",
  // ... other fields
}
```

## Verification Steps

After deployment and migration:

1. **Check existing commissions**:
   ```sql
   SELECT id, agent_id, agent_number, commission_amount, created_at
   FROM agent_commissions
   ORDER BY created_at DESC
   LIMIT 20;
   ```

2. **Create a test enrollment**:
   - Login as agent with agent_number (e.g., MPP00009)
   - Create new enrollment
   - Verify commission shows agent_number in database

3. **Check commission dashboard**:
   - View agent commissions page
   - Verify agent_number appears in commission list
   - Confirm correct agent numbers for all commissions

## Benefits

✅ **Better Reporting**: Easily identify which agent earned each commission  
✅ **Audit Trail**: Track commissions by human-readable agent numbers  
✅ **Simplified Queries**: Filter/group commissions by agent number  
✅ **Override Tracking**: Future feature to track upline overrides by agent_number  
✅ **Data Integrity**: Maintains both UUID and agent_number for flexibility  

## Next Steps

1. **Run migration SQL** in Supabase (see `ADD_AGENT_NUMBER_TO_COMMISSIONS.sql`)
2. **Test deployment** - DigitalOcean will auto-deploy code changes
3. **Verify backfill** - Check that existing commissions have agent_number populated
4. **Monitor production** - Ensure new commissions include agent_number
5. **Update reports** - Modify any commission reports to display agent_number

## Files Modified

- `shared/clean-commission-schema.ts` - Schema definition
- `server/commission-service.ts` - Service layer
- `server/routes.ts` - Commission creation logic
- `server/storage.ts` - Query functions (2 locations)
- `ADD_AGENT_NUMBER_TO_COMMISSIONS.sql` - Database migration (NEW)

## Commit
```
commit 5b9d29a
Add agent_number tracking to commission system
```

---
**Status**: ✅ Code deployed to GitHub, awaiting Supabase migration  
**Impact**: Low risk - additive change, no breaking changes  
**Rollback**: Safe - column can be dropped if needed without data loss
