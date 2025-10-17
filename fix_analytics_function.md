# Analytics Function Fix

## Problem
The `getComprehensiveAnalytics` function is querying **Supabase** tables (users, subscriptions) but the actual member data is in the **Neon database** (members table). This is why analytics shows all zeros.

## Solution
Query from Neon database tables:
- `members` table (instead of users/subscriptions)
- `commissions` table (already correct)
- `plans` table (already correct)
- `users` table filtered by `role='agent'` for agents

## Key Changes Needed

### 1. Data Sources
```typescript
// OLD (wrong):
const { data: allUsersData } = await supabase.from('users').select('*');
const { data: allSubscriptionsData } = await supabase.from('subscriptions').select('*');

// NEW (correct):
const membersResult = await query('SELECT * FROM members WHERE is_active = true');
const agentsResult = await query('SELECT * FROM users WHERE role = $1', ['agent']);
```

### 2. Member Counting
```typescript
// OLD (wrong):
const actualMembers = allUsers.filter(user => user.role === 'member');
const activeSubscriptions = allSubscriptions.filter(sub => sub.status === 'active');

// NEW (correct):
const activeMembers = allMembers.filter(member => member.status === 'active');
const totalMonthlyRevenue = allMembers.reduce((total, m) => total + parseFloat(m.total_monthly_price || 0), 0);
```

### 3. Plan Breakdown
```typescript
// OLD (wrong):
const planSubscriptions = allSubscriptions.filter(sub => sub.planId === plan.id);

// NEW (correct):
const planMembers = allMembers.filter(m => m.plan_id === plan.id && m.status === 'active');
const planRevenue = planMembers.reduce((total, m) => total + parseFloat(m.total_monthly_price || 0), 0);
```

### 4. Recent Enrollments
```typescript
// OLD (wrong):
const user = allUsers.find(u => u.id === sub.userId);

// NEW (correct):
const recentEnrollments = allMembers
  .filter(m => m.created_at && new Date(m.created_at) >= cutoffDate)
  .map(m => ({
    id: m.id.toString(),
    firstName: m.first_name,
    lastName: m.last_name,
    email: m.email,
    planName: allPlans.find(p => p.id === m.plan_id)?.name || '',
    amount: parseFloat(m.total_monthly_price || 0),
    enrolledDate: m.created_at,
    status: m.status
  }));
```

## File Location
`server/storage.ts` - Line ~2917 (`getComprehensiveAnalytics` function)

## Testing
After fix, analytics should show:
- Total Members: 12 (current member count)
- Monthly Revenue: Sum of all total_monthly_price values
- Active Subscriptions: Count of members with status='active'
- Plan breakdown with actual member counts per plan
