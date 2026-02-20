# Recurring Commission Tracking Architecture

## Problem Statement
DPC memberships are recurring monthly subscriptions. Agents earn commissions every month as long as the member remains active. We need to:
1. Track recurring monthly commissions (not just one-time at enrollment)
2. Support weekly payment batches (Monday-Sunday weeks, paid on Friday)
3. Track which months have been paid vs. pending vs. future
4. Handle cancellations and clawbacks

## Current State
- `agent_commissions` table: One record per enrollment
- No tracking of individual monthly commission payments
- No way to track which months have been paid

## Proposed Architecture: Commission Payouts Table

### Option 1: Separate Payout Tracking (RECOMMENDED)

#### New Table: `commission_payouts`
```sql
CREATE TABLE commission_payouts (
  id SERIAL PRIMARY KEY,
  commission_id INTEGER NOT NULL REFERENCES agent_commissions(id),
  
  -- Payout Period
  payout_month DATE NOT NULL, -- First day of the month (e.g., 2026-02-01)
  payment_captured_at TIMESTAMP WITH TIME ZONE, -- When member's payment was captured
  payment_eligible_date TIMESTAMP WITH TIME ZONE, -- Friday after week ends
  
  -- Amounts
  payout_amount DECIMAL(10, 2) NOT NULL,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending', -- pending, paid, cancelled, clawed_back
  paid_date TIMESTAMP WITH TIME ZONE,
  
  -- References
  member_payment_id TEXT, -- EPX payment ID or Supabase payment record ID
  batch_id TEXT, -- Weekly payment batch ID
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_commission_payouts_commission_id ON commission_payouts(commission_id);
CREATE INDEX idx_commission_payouts_payout_month ON commission_payouts(payout_month);
CREATE INDEX idx_commission_payouts_status ON commission_payouts(status);
CREATE INDEX idx_commission_payouts_payment_eligible_date ON commission_payouts(payment_eligible_date);
```

#### Workflow:

**1. On Enrollment (Initial Setup)**
- Create one record in `agent_commissions` (the relationship/rate)
- Create first payout in `commission_payouts` for current month

**2. On Monthly Payment Captured**
- When EPX captures a recurring monthly payment:
  - Create new record in `commission_payouts` for that month
  - Calculate `payment_eligible_date` = Friday after the week containing payment date
  - Status = 'pending'

**3. Weekly Payment Processing**
- Every Friday (or on-demand by admin):
  - Query `commission_payouts` WHERE:
    - `status = 'pending'`
    - `payment_eligible_date <= TODAY`
  - Group by agent
  - Generate payment batch
  - Mark payouts as `status = 'paid'`, set `paid_date`

**4. Admin Dashboard Views**
- **This Week's Payouts**: Payouts eligible this Friday
- **Month-to-Date**: All payouts for current month
- **Agent Detail**: All payouts for a specific agent (by month)
- **Unpaid Backlog**: Pending payouts past eligible date

### Benefits:
✅ Clean separation: `agent_commissions` = relationship, `commission_payouts` = monthly payments
✅ Full audit trail of every monthly payment
✅ Easy to query by week, month, agent, or status
✅ Supports clawbacks (cancel specific months)
✅ Supports retroactive adjustments
✅ Weekly batching is straightforward

### Alternative: Single Table Approach
Keep all in `agent_commissions` but add:
- `payout_month` column
- Create new commission record each month
- One row per agent per member per month

**Cons**: 
- Harder to query "show me the commission relationship"
- Redundant data (agent_id, member_id, rate repeated every month)
- More complex joins

## Recommendation: Go with Option 1 (Separate Payouts Table)

### Migration Path:
1. Create `commission_payouts` table
2. Backfill existing enrollments:
   - For each active subscription in `agent_commissions`:
     - Calculate months since enrollment
     - Create payout records for each month
     - Status = 'paid' if past, 'pending' if current/future
3. Add scheduled job (or EPX webhook handler) to create payouts on monthly payment capture

### Weekly Payment Batch Query:
```sql
-- Get all payouts eligible for this week's Friday payment
SELECT 
  cp.id,
  cp.payout_month,
  cp.payout_amount,
  ac.agent_id,
  ac.agent_number,
  u.first_name,
  u.last_name,
  u.email,
  m.customer_number
FROM commission_payouts cp
JOIN agent_commissions ac ON cp.commission_id = ac.id
JOIN users u ON ac.agent_id = u.id
JOIN members m ON ac.member_id = m.id::text
WHERE cp.status = 'pending'
  AND cp.payment_eligible_date <= CURRENT_DATE
ORDER BY ac.agent_id, cp.payout_month;
```

### Questions to Answer:
1. Should we create payout records proactively (at enrollment for all future months) or reactively (when payment captured)?
   - **Recommendation**: Reactively when payment captured (cleaner, no speculation)

2. How many months ahead should we show as "scheduled"?
   - **Recommendation**: Only show payouts where member payment was captured

3. What happens if member cancels mid-month?
   - **Recommendation**: Mark future payouts as 'cancelled', optionally claw back current month

4. Do agents get paid for partial months?
   - **Needs Business Rule**: If member cancels on day 15, do they get half commission?

## Questions for You:
1. When recurring monthly payments come in from EPX, do we get webhook notifications?
2. Are you comfortable with the separate payouts table approach?
3. Should we backfill historical months automatically or let admin create them manually?
