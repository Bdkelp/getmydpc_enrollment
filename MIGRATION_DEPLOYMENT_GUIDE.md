# Safe Commission Migration - Deployment Guide

## 🚨 ZERO DOWNTIME APPROACH

This migration ensures your current commission system keeps working while we build the new clean one alongside it.

## Phase 1: Create New Table (SAFE - No Code Changes)

### Step 1: Run SQL Migration
```sql
-- Run this in Supabase SQL Editor
-- This creates the new table WITHOUT touching the old one
```

Execute the file: `server/scripts/phase1-safe-migration.sql`

**Result**: 
- ✅ New `agent_commissions` table created
- ✅ Old `commissions` table still works  
- ✅ All current functionality preserved
- ✅ Real-time enabled on new table

### Step 2: Verify Migration
```sql
-- Check both tables exist
SELECT 'agent_commissions' as table_name, COUNT(*) as records FROM agent_commissions
UNION ALL  
SELECT 'commissions' as table_name, COUNT(*) as records FROM commissions;

-- Check real-time enabled
SELECT tablename FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
AND tablename IN ('commissions', 'agent_commissions');
```

**Expected**: Both tables exist, both have real-time enabled

## Phase 2: Test New System (SAFE - Parallel Testing)

### Step 3: Create Test Commission in New Table
```sql
-- Insert test record to verify new table works
INSERT INTO agent_commissions (
  agent_id, member_id, commission_amount, plan_cost, 
  plan_name, coverage_type, status, payment_status
) VALUES (
  (SELECT id FROM users WHERE role = 'agent' LIMIT 1),
  (SELECT id FROM members WHERE status = 'active' LIMIT 1),
  50.00, 200.00, 'MyPremierPlan', 'Individual', 'pending', 'unpaid'
);
```

### Step 4: Verify New Table Structure
```sql
-- Test querying new table with joins
SELECT 
  ac.*,
  u.first_name as agent_name,
  m.first_name as member_name
FROM agent_commissions ac
JOIN users u ON ac.agent_id = u.id  
JOIN members m ON ac.member_id = m.id
LIMIT 1;
```

**Expected**: Query returns data with proper joins

## Phase 3: Gradual Code Migration (SAFE - One Endpoint at a Time)

### Step 5: Update One API Endpoint to Use New Table

Start with the simplest endpoint: `/api/agent/commission-stats`

```typescript
// In routes.ts - Update commission stats endpoint
app.get('/api/agent/commission-stats', authMiddleware, async (req: any, res: any) => {
  try {
    const agentId = req.user.id;
    
    // NEW: Query from agent_commissions table
    const { data: commissions, error } = await supabase
      .from('agent_commissions')
      .select('commission_amount, payment_status')
      .eq('agent_id', agentId);
      
    if (error) throw error;
    
    const totalEarned = commissions.reduce((sum, c) => sum + parseFloat(c.commission_amount), 0);
    const totalPaid = commissions
      .filter(c => c.payment_status === 'paid')
      .reduce((sum, c) => sum + parseFloat(c.commission_amount), 0);
    const totalPending = totalEarned - totalPaid;
    
    res.json({ totalEarned, totalPaid, totalPending });
    
  } catch (error) {
    console.error('Commission stats error:', error);
    res.status(500).json({ error: 'Failed to fetch commission stats' });
  }
});
```

### Step 6: Test Single Endpoint
- Test agent commission stats endpoint
- If it works, continue to next endpoint
- If it fails, revert to old table query

### Step 7: Update Commission List Endpoint

```typescript
// Update /api/agent/commissions to use new table
app.get('/api/agent/commissions', authMiddleware, async (req: any, res: any) => {
  try {
    const agentId = req.user.id;
    const { startDate, endDate } = req.query;
    
    let query = supabase
      .from('commission_details_v2') // Use the view for easier data
      .select('*')
      .eq('agent_id', agentId);
      
    if (startDate) query = query.gte('enrollment_date', startDate);
    if (endDate) query = query.lte('enrollment_date', endDate);
    
    const { data, error } = await query.order('enrollment_date', { ascending: false });
    
    if (error) throw error;
    res.json(data);
    
  } catch (error) {
    console.error('Commission list error:', error);
    res.status(500).json({ error: 'Failed to fetch commissions' });  
  }
});
```

## Phase 4: Update Commission Creation (CRITICAL)

### Step 8: Update Commission Creation to Dual-Write

```typescript
// Update the createCommissionWithCheck function
async function createCommissionWithCheck(
  agentId: string | null,
  subscriptionId: number,
  memberId: number,
  planName: string,
  memberType: string
) {
  try {
    const agent = agentId ? await storage.getUser(agentId) : null;
    if (agent?.role === "admin") {
      return { skipped: true, reason: "admin_no_commission" };
    }

    const commissionResult = calculateCommission(planName, memberType);
    if (!commissionResult) {
      return { skipped: true, reason: "no_commission_rate" };
    }

    // NEW: Write to both tables during migration
    // Write to OLD table (keeps system working)
    const oldCommission = await storage.createCommission({
      agentId: agentId || "HOUSE",
      agentNumber: agent?.agentNumber || 'HOUSE',
      subscriptionId,
      userId: null,
      memberId: memberId,
      planName,
      planType: memberType,
      planTier: getPlanTierFromName(planName),
      commissionAmount: commissionResult.commission,
      totalPlanCost: commissionResult.totalCost,
      status: "pending",
      paymentStatus: "unpaid",
    });

    // ALSO write to NEW table
    const { error: newError } = await supabase
      .from('agent_commissions')
      .insert({
        agent_id: agentId || "HOUSE",
        member_id: memberId,
        subscription_id: subscriptionId,
        commission_amount: commissionResult.commission,
        plan_cost: commissionResult.totalCost,
        plan_name: planName,
        coverage_type: memberType,
        status: 'pending',
        payment_status: 'unpaid'
      });

    if (newError) {
      console.warn('Failed to write to new commission table:', newError);
      // Don't fail - old table succeeded
    }

    return { success: true, commission: oldCommission };

  } catch (error) {
    console.error("Error creating commission:", error);
    return { error: error.message };
  }
}
```

## Phase 5: Verify Everything Works

### Step 9: End-to-End Testing
1. **Agent enrolls member** → Check both tables get commission record
2. **EPX payment succeeds** → Check both tables update payment_status  
3. **Agent views commissions** → Should see data from new table
4. **Admin views analytics** → Should see commission data

### Step 10: Monitor for Issues
- Check logs for any new table errors
- Verify commission counts match between tables
- Test real-time updates work

## Phase 6: Cleanup (AFTER EVERYTHING WORKS)

### Step 11: Remove Old Table (Only After Full Testing)
```sql
-- ONLY run this after weeks of successful operation
DROP TABLE commissions CASCADE;
```

### Step 12: Remove Dual-Write Code
- Remove old commission functions
- Remove dual-write logic  
- Clean up imports

## Rollback Plan

**If anything breaks at any phase:**

### Phase 1-2 Issues:
```sql
DROP TABLE agent_commissions CASCADE;
```
No impact on existing system.

### Phase 3-4 Issues:
Change endpoint queries back to old table:
```typescript
// Rollback: Change back to old table
const commissions = await storage.getAgentCommissions(agentId);
```

### Phase 5 Issues:
1. Stop dual-writing to new table
2. Revert all endpoints to old table
3. System continues working normally

## Success Criteria

✅ **No downtime** during migration  
✅ **All existing functionality** works throughout  
✅ **Real-time updates** work on new table  
✅ **Commission creation** works end-to-end  
✅ **Payment status updates** work via EPX callbacks  
✅ **Agent and admin dashboards** show correct data  

This approach ensures we can build and test the new clean commission system without risking the existing functionality.