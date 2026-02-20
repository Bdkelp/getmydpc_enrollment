# Recurring Commission System - Implementation Summary

## What Was Implemented

### 1. **Commission Payouts Table** (Monthly Tracking)
- New table: `commission_payouts`
- Tracks each individual monthly commission payment
- Supports both **direct** and **override** commissions
- **Reactive creation**: Payouts created only when member payment is captured

### 2. **Payment Eligible Date Calculation**
- Weeks run **Monday 00:00 → Sunday 23:59**
- Payment eligible on **Friday after week ends**
- Example: Enroll Tuesday → Week ends Sunday → Eligible following Friday
- 14-day grace period automatically enforced

### 3. **Override Commission Support** (Downline/Upline)
- `commission_type`: 'direct' or 'override'
- `override_for_agent_id`: Tracks which downline agent generated the sale
- **Override rates are flexible**: Each agent has their own `override_commission_rate` in users table
- **Configurable per agent**: Override amounts vary by agency, performance level, or hierarchy tier
- **When member payment captured**: Creates payouts for BOTH direct and override commissions

### 4. **Business Rules Enforced**
- ✅ No commission if member cancels within 14 days
- ✅ Full commission if payment captured (no proration)
- ✅ No clawbacks after 14 days
- ✅ Cancel future payouts if member cancels before next payment

---

## Database Schema Changes

### `agent_commissions` (Base Commission Relationship)
```sql
ALTER TABLE agent_commissions ADD:
  - payment_eligible_date TIMESTAMP (Friday after week ends)
  - commission_type TEXT ('direct' or 'override')
  - override_for_agent_id TEXT (FK to users.id)
```

### `commission_payouts` (Monthly Payment Tracking) - NEW TABLE
```sql
CREATE TABLE commission_payouts (
  id SERIAL PRIMARY KEY,
  commission_id INTEGER → agent_commissions.id,
  payout_month DATE (YYYY-MM-01),
  payment_captured_at TIMESTAMP,
  payment_eligible_date TIMESTAMP,
  payout_amount DECIMAL(10,2),
  commission_type TEXT ('direct' or 'override'),
  override_for_agent_id TEXT,
  status TEXT ('pending', 'paid', 'cancelled', 'ineligible'),
  paid_date TIMESTAMP,
  member_payment_id INTEGER,
  epx_transaction_id TEXT,
  batch_id TEXT,
  notes TEXT
);
```

---

## API Usage

### Creating Payouts (EPX Webhook/Callback)
```typescript
import { createPayoutsForMemberPayment } from './services/commission-payout-service';

// When EPX captures a recurring monthly payment:
const result = await createPayoutsForMemberPayment(
  memberId,           // 10
  memberPaymentId,    // 123
  epxTransactionId,   // "TXN-ABC123"
  new Date()          // Payment captured timestamp
);

// Result:
// {
//   direct: [{ id: 1, payout_amount: 40.00, ... }],
//   override: [{ id: 2, payout_amount: 10.00, ... }]
// }
```

### Weekly Payment Batch (Admin Process)
```typescript
import { getEligiblePayouts, markPayoutsAsPaid } from './services/commission-payout-service';

// Get all payouts eligible for this Friday:
const eligiblePayouts = await getEligiblePayouts(new Date());

// Process payments to agents...

// Mark as paid:
await markPayoutsAsPaid(
  payoutIds,
  new Date(),
  'BATCH-2026-02-28' // Batch identifier
);
```

---

## Migration Files

1. **`20260220_add_payment_eligible_date.sql`**
   - Adds payment_eligible_date to agent_commissions
   - Backfills dates for existing commissions

2. **`20260220_fix_member_10_plan.sql`**
   - Updates member 10 to Member/Spouse Plus
   - Updates commission to $40.00

3. **`20260220_add_commission_type_override.sql`**
   - Adds commission_type and override_for_agent_id
   - Updates existing records to 'direct'

4. **`20260220_create_commission_payouts.sql`**
   - Creates commission_payouts table
   - Backfills payouts from existing commissions

---

## Example Data Flow

### Enrollment (Invia Agent MPP0001 (who has upline MPP0999)
   - System looks up MPP0001's record:
     * upline_agent_id: MPP0999
     * override_commission_rate: $15.00 (configured per agent)
   
2. Create agent_commissions records:
   - Direct commission: $40/month (agent MPP0001)
   - Override commission: $15/month (upline agent MPP0999) ← Uses agent's rate
   
3. First payment captured → Create 2 payout records:
   commission_payouts:
     - id: 1, commission_id: 100, payout_month: '2026-02-01', 
       amount: 40.00, commission_type: 'direct', status: 'pending'
     - id: 2, commission_id: 101, payout_month: '2026-02-01',
       amount: 15.00, commission_type: 'direct', status: 'pending'
     - id: 2, commission_id: 101, payout_month: '2026-02-01',
       amount: 10.00, commission_type: 'override', status: 'pending'
```

### Monthly Recurring5
```
3. Month 2 payment captured → Create 2 more payouts:
   commission_payouts:
     - id: 3, payout_month: '2026-03-01', amount: 40.00, type: 'direct'
     - id: 4, payout_month: '2026-03-01', amount: 10.00, type: 'override'
```

### Weekly Payment Batch (Every Friday)
```
4. Admin runs batch:
   - Query: status='pending' AND payment_eligible_date <= TODAY
   - Find: Payouts #1, #2 (eligible this Friday)
   - Pay agents: $40 → MPP0001, $15 → MPP0999
   - Update: status='paid', batch_id='BATCH-2026-02-28'
```

---

## Admin Dashboard Queries

### This Week's Payouts (Friday Batch)
```sql
SELECT * FROM commission_payouts
WHERE status = 'pending'
  AND payment_eligible_date <= '2026-02-28'
ORDER BY agent_id, payout_month;
```

### Agent Statement (Month-by-Month)
```sql
SELECT 
  payout_month,
  commission_type,
  COUNT(*) as member_count,
  SUM(payout_amount) as total_amount,
  status
FROM commission_payouts cp
JOIN agent_commissions ac ON cp.commission_id = ac.id
WHERE ac.agent_id = 'agent-uuid'
GROUP BY payout_month, commission_type, status
ORDER BY payout_month DESC;
```

### Override Commissions Report
```sql
SELECT 
  cp.*,
  ac.agent_id as upline_agent_id,
  u.agent_number as upline_agent_number,
  ac.override_for_agent_id as downline_agent_id
FROM commission_payouts cp
JOIN agent_commissions ac ON cp.commission_id = ac.id
JOIN users u ON ac.agent_id = u.id
WHERE cp.commission_type = 'override'
  AND cp.payout_month = '2026-02-01';
```

---

## Testing Checklist

- [ ] Run all 4 migration files in Supabase SQL Editor
- [ ] Verify member 10 shows "Member/Spouse Plus" in admin panel
- [ ] Verify member 10 commission is $40.00
- [ ] Check commission_payouts table has backfilled data
- [ ] Test: Create new enrollment with downline agent (should create 2 commissions)
- [ ] Test: Simulate EPX payment capture (should create 2 payouts)
- [ ] Test: Query eligible payouts for this Friday
- [ ] Test: Mark payouts as paid (batch processing)
- [ ] Verify admin UI shows direct and override payouts separately

---

## Next Development Tasks

1. **Update EPX Callback** (HIGH PRIORITY)
   - Modify EPX webhook handler to call `createPayoutsForMemberPayment()`
   - Ensure it's called for BOTH initial and recurring payments

2. **Admin UI Updates**
   - Add "Commission Type" column (Direct/Override)
   - Add "Override For" column (downline agent)
   - Filter by commission type
   - Show weekly payment batch preview

3. **Agent Dashboard**
   - Show monthly breakdown (Feb: $560, Mar: $600, etc.)
   - Separate direct vs override earnings
   - Show "Next Payout Date" (upcoming Friday)

4. **Scheduled Jobs**
   - Weekly payment batch automation (runs every Friday)
   - Email notifications to agents with payout details

5. **Reports**
   - Agent hierarchy report (who's under whom)
   - Override commission totals by upline agent
   - Monthly recurring revenue projections
