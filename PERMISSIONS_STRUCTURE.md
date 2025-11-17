# Role-Based Access Control (RBAC) Structure

## Overview

The DPC Enrollment Platform implements a **hierarchical permission system** with three role levels and agent downline support.

## Role Hierarchy

```
super_admin (Michael Keener)
    └── Full access to ALL data and operations
    └── Can view and edit super_admins, admins, and agents
    └── Can view and edit ALL members

admin (Travis, Richard S., Joaquin)
    └── Full access to admin and agent data
    └── CANNOT view or edit super_admin accounts
    └── Can view and edit ALL members
    └── Can view and edit ALL agents

agent (Steven, Ana, Sean, Richard P.)
    └── Can view OWN data + DOWNLINE agents (if has downline)
    └── Can edit ONLY own data (NOT downline)
    └── Can view members enrolled by self + downline agents
    └── Can enroll new members
```

## Data Separation

### Users Table (Staff with Login Access)
- **Contains:** Admins and agents ONLY
- **Access:** Login credentials via Supabase Auth
- **Roles:** `super_admin`, `admin`, `agent`
- **Purpose:** Platform staff management

### Members Table (DPC Enrollees)
- **Contains:** Healthcare customers/enrollees
- **Access:** NO login access (payment-only interaction)
- **Purpose:** Customer enrollment and billing
- **Note:** Members are NOT users unless they are also staff (e.g., agent self-enrolls)

## Permission Matrix

### User Data Access

| Role | Can View | Can Edit |
|------|----------|----------|
| **super_admin** | All users (super_admin, admin, agent) | All users |
| **admin** | All admins + all agents (NOT super_admin) | All admins + all agents (NOT super_admin) |
| **agent** | Self + downline agents | Self ONLY |

### Member Data Access

| Role | Can View | Can Edit |
|------|----------|----------|
| **super_admin** | All members | All members |
| **admin** | All members | All members |
| **agent** | Members enrolled by self + downline | Members enrolled by self + downline |

### Commission Data Access

| Role | Can View | Can Edit |
|------|----------|----------|
| **super_admin** | All commissions | All commissions (overrides, payouts) |
| **admin** | All commissions | All commissions (overrides, payouts) |
| **agent** | Own commissions + downline commissions | Own banking info ONLY |

## Agent Hierarchy (Downline Structure)

### Database Fields
- `upline_agent_id`: Reference to parent agent
- `hierarchy_level`: Depth in hierarchy (0 = top-level agent)
- `can_receive_overrides`: Boolean flag
- `override_commission_rate`: Override rate from downline

### Downline Rules

1. **Viewing Downline**
   - Agents can VIEW all agents in their downline tree (recursive)
   - Example: If Agent A has Agent B, and Agent B has Agent C:
     - Agent A can view Agent B and Agent C
     - Agent B can view Agent C
     - Agent C can view only self

2. **Editing Permissions**
   - Agents can EDIT only themselves
   - Agents CANNOT edit downline agents
   - Only admins can edit agent hierarchy

3. **Member Access via Downline**
   - Agents can view members enrolled by self
   - Agents can view members enrolled by downline agents
   - Example: Agent A's downline Agent B enrolls Member X:
     - Agent B can see Member X (direct enrollment)
     - Agent A can see Member X (enrolled by downline)

4. **Commission Overrides**
   - Upline agents receive override commissions from downline enrollments
   - Override rate set by admin
   - Only applies if `can_receive_overrides = true`

## Implementation

### Middleware Functions

Located in: `server/middleware/permissions.ts`

#### Role Checking
```typescript
isAdmin(role)          // true for admin OR super_admin
isSuperAdmin(role)     // true for super_admin only
isAgent(role)          // true for agent only
```

#### Hierarchy Queries
```typescript
getDownlineAgents(agentId)  // Returns array of all downline agent IDs (recursive)
hasDownline(agentId)        // Returns true if agent has any downline
```

#### Access Control
```typescript
canViewUser(viewerId, viewerRole, targetId, targetRole)
canEditUser(editorId, editorRole, targetId, targetRole)
canViewMember(viewerId, viewerRole, memberId)
```

#### Data Filtering
```typescript
filterUsersByPermissions(viewerId, viewerRole, users)
filterMembersByPermissions(viewerId, viewerRole, members)
getAccessibleUserIds(userId, userRole)
getAccessibleMemberIds(userId, userRole)
```

#### Route Middleware
```typescript
requireSuperAdmin()      // 403 if not super_admin
requireAdmin()           // 403 if not admin or super_admin
requireAuth()            // 403 if not authenticated
canAccessUserData()      // Check view permission for req.params.userId
canModifyUserData()      // Check edit permission for req.params.userId
```

### Usage in Routes

#### Super Admin Only Routes
```typescript
app.get('/api/admin/system-settings', requireSuperAdmin, async (req, res) => {
  // Only super_admin can access
});
```

#### Admin Level Routes
```typescript
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  // admin OR super_admin can access
  const users = await storage.getAllUsers();
  
  // Filter based on role
  const filtered = await filterUsersByPermissions(
    req.user.id,
    req.user.role,
    users.users
  );
  
  res.json({ users: filtered });
});
```

#### Agent Routes with Downline
```typescript
app.get('/api/agent/commissions', requireAuth, async (req, res) => {
  // Get accessible agent IDs (self + downline)
  const accessibleAgentIds = await getAccessibleUserIds(
    req.user.id,
    req.user.role
  );
  
  // Fetch commissions for all accessible agents
  const commissions = await storage.getCommissions(accessibleAgentIds);
  
  res.json({ commissions });
});
```

#### Protected User Edit Route
```typescript
app.put('/api/users/:userId', requireAuth, canModifyUserData, async (req, res) => {
  // Middleware already verified edit permission
  const userId = req.params.userId;
  await storage.updateUser(userId, req.body);
  res.json({ success: true });
});
```

## Database Schema

### Users Table (Hierarchy Fields)
```sql
CREATE TABLE users (
  id VARCHAR PRIMARY KEY,
  email VARCHAR UNIQUE,
  role VARCHAR DEFAULT 'agent', -- super_admin, admin, agent
  agent_number VARCHAR NOT NULL,
  
  -- Hierarchy fields
  upline_agent_id VARCHAR REFERENCES users(id),
  hierarchy_level INTEGER DEFAULT 0,
  can_receive_overrides BOOLEAN DEFAULT FALSE,
  override_commission_rate DECIMAL(5,2) DEFAULT 0,
  
  -- ... other fields
);
```

### Agent Hierarchy History
```sql
CREATE TABLE agent_hierarchy_history (
  id SERIAL PRIMARY KEY,
  agent_id VARCHAR REFERENCES users(id),
  previous_upline_id VARCHAR REFERENCES users(id),
  new_upline_id VARCHAR REFERENCES users(id),
  changed_by_admin_id VARCHAR REFERENCES users(id),
  reason TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Security Considerations

### SQL Injection Protection
- All queries use Supabase parameterized queries
- No raw SQL string concatenation

### Role Escalation Prevention
- Agents cannot modify their own role
- Agents cannot modify downline roles
- Only super_admin can create/modify super_admin accounts
- Admins cannot access super_admin data

### Data Leakage Prevention
- All list endpoints filter data by permissions
- Individual record endpoints verify access before returning
- Member data is segregated from user data
- Commission data is filtered by agent hierarchy

## Testing Scenarios

### Test 1: Super Admin Access
```
User: Michael (super_admin)
Action: View all users
Expected: See all users including other super_admins, admins, and agents
```

### Test 2: Admin Access
```
User: Travis (admin)
Action: View all users
Expected: See all admins and agents (but NOT Michael - super_admin)
```

### Test 3: Agent Without Downline
```
User: Steven (agent, no downline)
Action: View users
Expected: See only self
Action: View members
Expected: See only members enrolled by self
```

### Test 4: Agent With Downline
```
User: Agent A (has downline: Agent B, Agent C)
Action: View users
Expected: See self + Agent B + Agent C
Action: View members
Expected: See members enrolled by self + Agent B + Agent C
Action: Edit Agent B
Expected: DENIED (can only edit self)
```

### Test 5: Admin Cannot Edit Super Admin
```
User: Travis (admin)
Action: Edit Michael's account
Expected: 403 Forbidden
```

## Future Enhancements

1. **Multi-Level Override Rates**
   - Support different override rates per hierarchy level
   - Example: Direct downline = 5%, 2nd level = 2%

2. **Territory-Based Permissions**
   - Add geographic territory restrictions
   - Agents can only see members in their territory

3. **Time-Based Access**
   - Temporary access grants
   - Role expiration dates

4. **Audit Logging**
   - Log all permission checks
   - Track who accessed what data and when

5. **Commission Split Rules**
   - Custom commission splitting between upline agents
   - Configurable split percentages

## API Endpoints

### Admin Endpoints

#### GET /api/admin/users
- **Access:** admin, super_admin
- **Returns:** Users filtered by role permissions

#### GET /api/admin/agents/hierarchy
- **Access:** admin, super_admin
- **Returns:** Full agent hierarchy tree

#### POST /api/admin/agents/update-hierarchy
- **Access:** admin, super_admin
- **Body:** `{ agentId, uplineId, overrideRate, reason }`
- **Action:** Updates agent's upline and override rate

#### GET /api/admin/commissions
- **Access:** admin, super_admin
- **Returns:** All commissions across all agents

### Agent Endpoints

#### GET /api/agent/my-commissions
- **Access:** agent, admin, super_admin
- **Returns:** Commissions for self + downline (if agent)

#### GET /api/agent/my-members
- **Access:** agent, admin, super_admin
- **Returns:** Members enrolled by self + downline (if agent)

#### GET /api/agent/my-downline
- **Access:** agent, admin, super_admin
- **Returns:** Direct and indirect downline agents

## Summary

This permission structure ensures:
- ✅ Super admins have unrestricted access
- ✅ Admins can manage all operations except super_admin accounts
- ✅ Agents can only view/edit their own data
- ✅ Agents with downline can view (but not edit) downline data
- ✅ Member data is properly segregated from user data
- ✅ Commission data respects hierarchy and enrollment relationships
- ✅ All data access is filtered through permission checks
- ✅ No role escalation or privilege bypass possible
