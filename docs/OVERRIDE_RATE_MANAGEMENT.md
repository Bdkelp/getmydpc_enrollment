# Override Commission Rate Management Guide

## How Override Rates Work

Override commission amounts are **configurable per agent** in the system. Each agent can have a different override rate based on their:
- Agency structure
- Performance level
- Hierarchy tier
- Custom agreements

## Setting Override Rates

### 1. **Via Admin UI** (Recommended)
When creating or editing an agent in the admin panel:
```
Agent Details:
  - Upline Agent: [Select from dropdown]
  - Override Commission Rate: $___.__
```

### 2. **Via SQL** (For bulk updates)
```sql
-- Set individual agent's override rate
UPDATE users
SET override_commission_rate = 15.00,
    upline_agent_id = 'upline-agent-uuid'
WHERE id = 'agent-uuid';

-- Set all agents under a specific manager
UPDATE users
SET override_commission_rate = 12.00
WHERE upline_agent_id = 'manager-uuid';

-- Set by performance tier
UPDATE users
SET override_commission_rate = CASE
  WHEN performance_tier = 'platinum' THEN 20.00
  WHEN performance_tier = 'gold' THEN 15.00
  WHEN performance_tier = 'silver' THEN 10.00
  ELSE 5.00
END
WHERE role = 'agent';
```

## Example Agency Structures

### Agency A - Flat Rate
```
Manager: John Smith
  ├─ Agent A: override_rate = $10.00
  ├─ Agent B: override_rate = $10.00
  └─ Agent C: override_rate = $10.00
```

### Agency B - Performance-Based
```
Regional Manager: Jane Doe
  ├─ Agent D (Top Producer): override_rate = $25.00
  ├─ Agent E (Experienced): override_rate = $15.00
  └─ Agent F (New): override_rate = $8.00
```

### Agency C - Multi-Level
```
National Director: Bob Johnson ($5 override on all downline)
  └─ Regional Manager: Alice Brown ($10 override on direct downline)
      ├─ Agent G: override_rate = $10.00 → Manager gets $10
      └─ Agent H: override_rate = $10.00 → Manager gets $10
                                         → Director gets $5
```

## Commission Flow Example

### Scenario: Agent enrolls a Member/Spouse Plus member ($40 direct commission)

**Agent Record:**
```json
{
  "id": "agent-123",
  "agent_number": "MPP0001",
  "upline_agent_id": "manager-456",
  "override_commission_rate": 12.50
}
```

**Commissions Created:**
1. **Direct Commission**
   - Agent: MPP0001
   - Amount: $40.00 (from plan rate)
   - Type: direct

2. **Override Commission**
   - Agent: manager-456
   - Amount: $12.50 ← **From agent's override_commission_rate field**
   - Type: override
   - Override For: MPP0001

**Monthly Payouts:**
Every month when payment is captured:
- MPP0001 gets $40.00
- Manager-456 gets $12.50

## Changing Override Rates

### When To Update
- Agent gets promoted
- Performance tier changes
- Agency restructuring
- Contract renegotiation

### Impact on Existing Commissions
- **Existing commission records**: NOT changed (preserves historical data)
- **New enrollments**: Use new rate
- **Ongoing payouts**: Continue at original rate

### To Apply New Rate to Existing Members (Rare)
```sql
-- Update all commissions for a specific agent
UPDATE agent_commissions
SET commission_amount = 18.00
WHERE agent_id = 'manager-uuid'
  AND commission_type = 'override'
  AND member_id IN (
    SELECT member_id FROM agent_commissions 
    WHERE agent_id = 'downline-agent-uuid'
  );

-- Note: This affects ALL future payouts for these members
```

## Override Rate Validation

### Business Rules
- Minimum: $0.00 (no override)
- Maximum: $100.00 (prevent errors)
- Precision: 2 decimal places ($12.50, not $12.505)
- Can be zero: Agent has no upline or upline doesn't get override

### Database Constraint
```sql
ALTER TABLE users
ADD CONSTRAINT check_override_rate 
CHECK (override_commission_rate >= 0 AND override_commission_rate <= 100);
```

## Reporting

### Check Agent's Override Rate
```sql
SELECT 
  agent_number,
  first_name,
  last_name,
  override_commission_rate,
  upline_agent_id
FROM users
WHERE id = 'agent-uuid';
```

### See All Downline Agents
```sql
SELECT 
  u.agent_number,
  u.first_name,
  u.last_name,
  u.override_commission_rate,
  u.upline_agent_id,
  upline.agent_number as upline_agent_number
FROM users u
LEFT JOIN users upline ON u.upline_agent_id = upline.id
WHERE u.role = 'agent'
  AND u.upline_agent_id IS NOT NULL
ORDER BY upline.agent_number, u.override_commission_rate DESC;
```

### Calculate Manager's Total Override Income
```sql
SELECT 
  manager.agent_number,
  manager.first_name,
  manager.last_name,
  COUNT(DISTINCT cp.id) as total_payouts,
  SUM(cp.payout_amount) as total_override_earnings
FROM users manager
JOIN agent_commissions ac ON ac.agent_id = manager.id
JOIN commission_payouts cp ON cp.commission_id = ac.id
WHERE ac.commission_type = 'override'
  AND cp.payout_month >= '2026-01-01'
GROUP BY manager.id, manager.agent_number, manager.first_name, manager.last_name
ORDER BY total_override_earnings DESC;
```

## Important Notes

1. **Override amounts are stored with the downline agent**, not the upline
2. **Each agent can have only ONE upline** (no multiple managers)
3. **Override rates can be $0** (upline doesn't get paid, but hierarchy is tracked)
4. **Changing an agent's override rate does NOT affect existing commissions**
5. **Multi-level overrides require separate commission records** at each level
