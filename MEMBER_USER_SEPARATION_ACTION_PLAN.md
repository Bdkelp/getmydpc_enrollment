# Member/User Separation - Action Plan

## Current Situation Summary

### Database Architecture
**You're using a DUAL system:**
- **Supabase Auth** - Handles user authentication (login/logout/sessions)
- **Supabase PostgreSQL** - Direct database connection for all data operations
- **File `neonDb.ts`** - Misleading name! It's a generic PostgreSQL pool that connects to Supabase

**This is GOOD architecture** - you get Supabase auth + direct SQL access.

### Configuration Status
- ✅ **Production (Railway)**: DATABASE_URL and Supabase vars are configured
- ❌ **Local Development**: Environment variables not set (normal - you test on Railway)
- ✅ **Schema**: `members` table defined in `shared/schema.ts`
- ❌ **Database**: Migration NOT run yet (members table doesn't exist with data)
- ❌ **Code**: Still queries `users` table for members

## The Problem (Critical)

**Members, agents, and admins are all in the `users` table:**

```sql
-- Current state (WRONG):
users table:
  - role='member' or 'user' = Healthcare customers (70-85 records)
  - role='agent' = Sales agents
  - role='admin' = Administrators
```

**Security issues:**
- ❌ Members have records that could potentially allow login
- ❌ No clear separation between customers and staff
- ❌ Code treats members as "users with a role" instead of separate entities

**What should happen:**

```sql
-- Target state (CORRECT):
users table:
  - role='agent' = Sales agents ONLY
  - role='admin' = Administrators ONLY
  - role='super_admin' = Super admin ONLY

members table (NEW):
  - Healthcare customers (NO login access)
  - Separate from authentication system
  - No role field (they're all members)
```

## Step-by-Step Action Plan

### Phase 1: Run Database Migration (30 minutes)

**You need to run this in Supabase Dashboard:**

1. **Login to Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your project

2. **Open SQL Editor**
   - Click "SQL Editor" in left sidebar
   - Click "New query"

3. **Run the Migration**
   - Open file: `member_user_separation_migration.sql`
   - Copy ALL contents (it's ~500 lines)
   - Paste into Supabase SQL Editor
   - Click "Run" (or press F5)

4. **Verify Migration**
   Run these queries to confirm:
   ```sql
   -- Should show 70-85 members
   SELECT COUNT(*) as member_count FROM members;
   
   -- Should show 0 members
   SELECT COUNT(*) as member_count FROM users WHERE role IN ('member', 'user');
   
   -- Should show agents and admins only
   SELECT role, COUNT(*) FROM users GROUP BY role;
   ```

**What this migration does:**
- Creates `members` table
- Copies member records from `users` to `members`
- Updates all foreign keys (subscriptions, payments, commissions)
- Deletes member records from `users` table
- Adds constraints to ensure data integrity

### Phase 2: Update Code (2-3 hours)

After migration is complete, update the code in this order:

#### 1. Update `server/storage.ts`

**Add member-specific functions:**
```typescript
// Create a new member (no authentication)
export async function createMember(memberData: {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  // ... other fields
  enrolledByAgentId: string;
  agentNumber: string;
}): Promise<Member> {
  const customerNumber = await generateCustomerNumber();
  
  const result = await query(`
    INSERT INTO members (
      customer_number, first_name, last_name, email, phone,
      enrolled_by_agent_id, agent_number, enrollment_date
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    RETURNING *
  `, [
    customerNumber,
    memberData.firstName,
    memberData.lastName,
    memberData.email,
    memberData.phone,
    memberData.enrolledByAgentId,
    memberData.agentNumber
  ]);
  
  return mapMemberFromDB(result.rows[0]);
}

export async function getMember(memberId: number): Promise<Member | null> {
  const result = await query(
    'SELECT * FROM members WHERE id = $1',
    [memberId]
  );
  return result.rows[0] ? mapMemberFromDB(result.rows[0]) : null;
}

export async function getMemberByEmail(email: string): Promise<Member | null> {
  const result = await query(
    'SELECT * FROM members WHERE email = $1',
    [email]
  );
  return result.rows[0] ? mapMemberFromDB(result.rows[0]) : null;
}

export async function getAllMembers(
  limit = 50,
  offset = 0
): Promise<{ members: Member[]; totalCount: number }> {
  // Count total
  const countResult = await query('SELECT COUNT(*) FROM members');
  const totalCount = parseInt(countResult.rows[0].count);
  
  // Get members with subscriptions
  const result = await query(`
    SELECT m.*, 
      s.id as sub_id, s.status as sub_status, s.plan_id, s.amount,
      p.name as plan_name
    FROM members m
    LEFT JOIN subscriptions s ON m.id = s.member_id
    LEFT JOIN plans p ON s.plan_id = p.id
    WHERE m.is_active = true
    ORDER BY m.enrollment_date DESC
    LIMIT $1 OFFSET $2
  `, [limit, offset]);
  
  const members = result.rows.map(mapMemberFromDB);
  
  return { members, totalCount };
}

function mapMemberFromDB(row: any): Member {
  return {
    id: row.id,
    customerNumber: row.customer_number,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    // ... map other fields
    enrolledByAgentId: row.enrolled_by_agent_id,
    agentNumber: row.agent_number,
    enrollmentDate: row.enrollment_date,
    isActive: row.is_active,
    status: row.status
  };
}
```

**Update `getMembersOnly()`:**
```typescript
export async function getMembersOnly(
  limit = 50,
  offset = 0
): Promise<{ users: User[]; totalCount: number }> {
  // NOW query members table instead of users
  const { members, totalCount } = await getAllMembers(limit, offset);
  
  // Return as 'users' for backward compatibility
  // TODO: Rename this function to getMembersWithSubscriptions
  return {
    users: members as any, // Type compatibility
    totalCount
  };
}
```

#### 2. Update `server/routes.ts`

**Fix registration endpoint:**
```typescript
router.post('/api/registration', async (req, res) => {
  try {
    const { email, firstName, lastName, phone, planId, enrolledByAgentId, agentNumber } = req.body;
    
    // Check if member already exists
    const existing = await storage.getMemberByEmail(email);
    if (existing) {
      return res.status(400).json({ message: 'Member already exists' });
    }
    
    // Create member (NOT user) - NO Supabase auth
    const member = await storage.createMember({
      firstName,
      lastName,
      email,
      phone,
      enrolledByAgentId,
      agentNumber,
      // ... other fields
    });
    
    // Create subscription
    const subscription = await storage.createSubscription({
      memberId: member.id, // Use memberId, not userId
      planId,
      status: 'pending',
      amount: planAmount
    });
    
    res.json({ success: true, member, subscription });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Registration failed' });
  }
});
```

**Fix agent enrollment endpoint:**
```typescript
router.post('/api/agent/enrollment', authenticateToken, async (req: AuthRequest, res) => {
  // Ensure user is agent
  if (req.user!.role !== 'agent') {
    return res.status(403).json({ message: 'Agent access required' });
  }
  
  try {
    const memberData = req.body;
    
    // Create member (NOT user)
    const member = await storage.createMember({
      ...memberData,
      enrolledByAgentId: req.user!.id,
      agentNumber: req.user!.agentNumber
    });
    
    res.json({ success: true, member });
  } catch (error) {
    console.error('Enrollment error:', error);
    res.status(500).json({ message: 'Enrollment failed' });
  }
});
```

#### 3. Add Authentication Blocking

**Update `server/auth/supabaseAuth.ts`:**
```typescript
export async function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }
    
    // Verify with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    
    // Get user from database
    const dbUser = await storage.getUserByEmail(user.email!);
    
    if (!dbUser) {
      return res.status(401).json({ message: 'User not found' });
    }
    
    // ⚠️ CRITICAL: Block non-staff logins
    if (dbUser.role !== 'agent' && dbUser.role !== 'admin' && dbUser.role !== 'super_admin') {
      return res.status(403).json({
        message: 'Access denied. Only agents and administrators can log into this application.'
      });
    }
    
    req.user = dbUser;
    next();
  } catch (error) {
    res.status(500).json({ message: 'Authentication failed' });
  }
}
```

**Add member email blocking in login:**
```typescript
router.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  // Check if email belongs to a member
  const member = await storage.getMemberByEmail(email);
  if (member) {
    return res.status(403).json({
      message: 'Members cannot log into this application. Please contact your agent for assistance.',
      isMember: true
    });
  }
  
  // Continue with normal login for agents/admins
  // ...
});
```

### Phase 3: Test Everything (1 hour)

1. **Test Agent Login** ✅
   - Should work normally

2. **Test Admin Login** ✅
   - Should work normally

3. **Test Member Email Login** ❌
   - Should be BLOCKED with error message

4. **Test Member Enrollment** ✅
   - Should create record in `members` table
   - Should NOT create Supabase auth account

5. **Test Data Display** ✅
   - Admin dashboard should show members from `members` table
   - Subscriptions should link correctly
   - Commissions should track correctly

## Files to Modify

1. ✅ `server/storage.ts` - Add member functions, update getMembersOnly
2. ✅ `server/routes.ts` - Fix registration and enrollment endpoints
3. ✅ `server/auth/supabaseAuth.ts` - Add authentication blocking
4. ✅ `client/src/pages/admin.tsx` - Update to show "Members" instead of "Users"
5. ✅ `client/src/hooks/useAuth.tsx` - Add member login blocking

## Success Criteria

- ✅ Members table populated with customer data
- ✅ Users table contains ONLY agents and admins
- ✅ Member emails BLOCKED from logging in
- ✅ New enrollments create members (not users)
- ✅ Subscriptions link to member_id
- ✅ Commissions track correctly
- ✅ Admin dashboard shows members separately
- ✅ No security vulnerabilities

## Rollback Plan

If something goes wrong:

```sql
-- Rollback: Copy members back to users
INSERT INTO users (
  id, email, first_name, last_name, role, /* other fields */
)
SELECT 
  customer_number, email, first_name, last_name, 'member', /* other fields */
FROM members;

-- Update foreign keys back
UPDATE subscriptions SET user_id = member_id, member_id = NULL WHERE member_id IS NOT NULL;
UPDATE payments SET user_id = member_id, member_id = NULL WHERE member_id IS NOT NULL;
UPDATE commissions SET user_id = member_id, member_id = NULL WHERE member_id IS NOT NULL;
```

## Next Steps

**To proceed, you need to:**

1. ✅ Review this plan
2. ❌ Run migration in Supabase Dashboard (Step 1)
3. ❌ Update code files (Step 2)
4. ❌ Test everything (Step 3)
5. ❌ Deploy to Railway
6. ❌ Monitor for 24 hours

**Ready to start?** Say "let's run the migration" and I'll guide you through each step.

---

**Last Updated:** 2025-10-14  
**Status:** Plan ready, awaiting execution  
**Critical:** This must be done to ensure members cannot access the application
