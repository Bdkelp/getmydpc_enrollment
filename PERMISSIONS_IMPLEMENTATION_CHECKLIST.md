# RBAC Permissions Implementation Checklist

## Completed ✅

- [x] Created comprehensive permissions middleware (`server/middleware/permissions.ts`)
- [x] Fixed super_admin access to admin endpoints
- [x] Updated route comments to clarify users vs members
- [x] Created detailed permissions documentation
- [x] Committed and pushed to main branch

## Next Steps - Route Updates

### High Priority Routes (Immediate)

#### 1. Admin User Management Routes
- [ ] `GET /api/admin/users` - Add permission filtering
  - Current: Returns all users
  - **Update:** Filter by `filterUsersByPermissions()`
  - **Change:** Admin sees admins+agents, super_admin sees all
  
- [ ] `PUT /api/admin/users/:userId` - Add edit permission check
  - **Add:** `canModifyUserData` middleware
  - **Effect:** Prevents admin from editing super_admin accounts

- [ ] `DELETE /api/admin/users/:userId` - Add delete permission check
  - **Add:** `canModifyUserData` middleware
  - **Effect:** Only super_admin can delete super_admins

#### 2. Commission Routes
- [ ] `GET /api/admin/commissions` - Add hierarchical filtering
  - Current: Shows all commissions
  - **Update for agents:** Show only self + downline commissions
  - **Use:** `getAccessibleUserIds()` then filter commissions

- [ ] `GET /api/agent/my-commissions` - Add downline support
  - Current: Shows only own commissions
  - **Update:** Include downline commissions if agent has downline
  - **Use:** `getAccessibleUserIds()` to include downline

#### 3. Member Routes
- [ ] `GET /api/admin/members` - Add agent filtering
  - Current: Shows all members
  - **Update for agents:** Show only members enrolled by self + downline
  - **Use:** `filterMembersByPermissions()`

- [ ] `GET /api/members/:memberId` - Add view permission check
  - **Add:** `canViewMember()` check
  - **Effect:** Agents can only view their enrolled members

### Medium Priority Routes

#### 4. Agent Hierarchy Routes (Already Exist)
- [ ] `GET /api/admin/agents/hierarchy` - Verify permissions
  - **Current:** Requires `authMiddleware`
  - **Update:** Use `requireAdmin` instead
  - **Test:** Ensure agents cannot access

- [ ] `POST /api/admin/agents/update-hierarchy` - Verify permissions
  - **Current:** Requires `authMiddleware`
  - **Update:** Use `requireAdmin` instead
  - **Effect:** Only admins can modify hierarchy

#### 5. Dashboard/Stats Routes
- [ ] `GET /api/admin/stats` - Add hierarchical filtering
  - Current: Shows global stats
  - **Update for agents:** Show stats for self + downline only
  - **Metrics to filter:** Total enrollments, commissions, active members

#### 6. Lead Management Routes
- [ ] `GET /api/leads` - Add assignment filtering
  - **Update for agents:** Show only assigned leads + downline leads
  - **Use:** `getAccessibleUserIds()` to filter assigned agents

### Low Priority Routes

#### 7. Banking/Payout Routes
- [ ] `GET /api/admin/user-banking` - Add filtering
  - **super_admin:** See all banking info
  - **admin:** See all banking info
  - **agent:** See only own banking info

- [ ] `PUT /api/admin/user-banking/:userId` - Add edit permission
  - **agent:** Can only edit own banking info
  - **admin/super_admin:** Can edit anyone's banking info

#### 8. Audit Log Routes
- [ ] `GET /api/admin/logs` - Add filtering
  - **super_admin:** All logs
  - **admin:** All logs except super_admin actions
  - **agent:** Only own actions + downline actions

## Code Patterns to Use

### Pattern 1: Filter Users by Permission
```typescript
import { filterUsersByPermissions } from './middleware/permissions';

app.get('/api/admin/users', requireAuth, async (req: AuthRequest, res) => {
  const allUsers = await storage.getAllUsers();
  
  // Filter based on role permissions
  const filtered = await filterUsersByPermissions(
    req.user!.id,
    req.user!.role,
    allUsers.users
  );
  
  res.json({ users: filtered });
});
```

### Pattern 2: Check Edit Permission
```typescript
import { canEditUser } from './middleware/permissions';

app.put('/api/users/:userId', requireAuth, async (req: AuthRequest, res) => {
  const targetId = req.params.userId;
  
  // Check if user can edit this target
  const allowed = await canEditUser(
    req.user!.id,
    req.user!.role,
    targetId
  );
  
  if (!allowed) {
    return res.status(403).json({ message: 'Access denied' });
  }
  
  await storage.updateUser(targetId, req.body);
  res.json({ success: true });
});
```

### Pattern 3: Use Middleware
```typescript
import { requireAdmin, canModifyUserData } from './middleware/permissions';

// Only admin/super_admin can access
app.get('/api/admin/settings', requireAdmin, async (req, res) => {
  // ...
});

// Check if user can modify target user
app.put('/api/users/:userId', requireAuth, canModifyUserData, async (req, res) => {
  // Middleware already verified permission
  await storage.updateUser(req.params.userId, req.body);
  res.json({ success: true });
});
```

### Pattern 4: Get Accessible IDs
```typescript
import { getAccessibleUserIds } from './middleware/permissions';

app.get('/api/agent/my-commissions', requireAuth, async (req: AuthRequest, res) => {
  // Get all accessible agent IDs (self + downline for agents)
  const accessibleIds = await getAccessibleUserIds(
    req.user!.id,
    req.user!.role
  );
  
  // Fetch commissions for all accessible agents
  const commissions = await storage.getCommissionsByAgentIds(accessibleIds);
  
  res.json({ commissions });
});
```

### Pattern 5: Filter Members
```typescript
import { filterMembersByPermissions } from './middleware/permissions';

app.get('/api/members', requireAuth, async (req: AuthRequest, res) => {
  const allMembers = await storage.getAllMembers();
  
  // Filter based on enrolled_by_agent_id hierarchy
  const filtered = await filterMembersByPermissions(
    req.user!.id,
    req.user!.role,
    allMembers
  );
  
  res.json({ members: filtered });
});
```

## Import Statement

Add to `server/routes.ts`:

```typescript
import {
  isAdmin,
  isSuperAdmin,
  requireAdmin,
  requireSuperAdmin,
  requireAuth,
  canAccessUserData,
  canModifyUserData,
  filterUsersByPermissions,
  filterMembersByPermissions,
  getAccessibleUserIds,
  getAccessibleMemberIds,
  canViewUser,
  canEditUser,
  canViewMember,
} from './middleware/permissions';
```

## Database Requirements

### Existing Fields (Already in Schema)
- ✅ `users.upline_agent_id` - Reference to parent agent
- ✅ `users.hierarchy_level` - Depth in hierarchy
- ✅ `users.can_receive_overrides` - Override eligibility flag
- ✅ `users.override_commission_rate` - Override rate percentage

### Verify in Supabase
```sql
-- Check if hierarchy fields exist
SELECT 
  column_name, 
  data_type 
FROM information_schema.columns 
WHERE table_name = 'users' 
  AND column_name IN (
    'upline_agent_id', 
    'hierarchy_level', 
    'can_receive_overrides', 
    'override_commission_rate'
  );
```

If fields are missing, add them:
```sql
-- Add hierarchy fields to users table
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS upline_agent_id VARCHAR REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS hierarchy_level INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS can_receive_overrides BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS override_commission_rate DECIMAL(5,2) DEFAULT 0;

-- Add index for hierarchy queries
CREATE INDEX IF NOT EXISTS idx_users_upline ON users(upline_agent_id);
```

## Testing Checklist

### Test as Super Admin (Michael)
- [ ] Can view all users including super_admins
- [ ] Can edit all users including super_admins
- [ ] Can view all members
- [ ] Can view all commissions
- [ ] Can modify agent hierarchy

### Test as Admin (Travis)
- [ ] Can view all agents and admins
- [ ] CANNOT view super_admin (Michael)
- [ ] CANNOT edit super_admin account
- [ ] Can view all members
- [ ] Can view all commissions
- [ ] Can modify agent hierarchy

### Test as Agent Without Downline (Steven)
- [ ] Can view only self in users list
- [ ] Can edit only own profile
- [ ] Can view only members enrolled by self
- [ ] Can view only own commissions
- [ ] CANNOT access agent hierarchy routes

### Test as Agent With Downline (Future)
- [ ] Can view self + all downline agents
- [ ] CANNOT edit downline agents
- [ ] Can view members enrolled by self + downline
- [ ] Can view commissions for self + downline
- [ ] Receives override commissions from downline

## Deployment Notes

### Step 1: Verify Database Schema
```bash
# Connect to Supabase and run:
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'users' 
  AND column_name LIKE '%upline%' OR column_name LIKE '%hierarchy%';
```

### Step 2: Update Routes File
```bash
# Import permissions module
# Replace isAdmin() function with imported version
# Add permission filtering to all user/member/commission routes
```

### Step 3: Test Locally
```bash
npm run dev
# Test with different role accounts
# Verify filtering works correctly
```

### Step 4: Deploy to Railway
```bash
git add server/routes.ts
git commit -m "feat: Integrate RBAC permissions into all routes"
git push origin main
# Railway auto-deploys
```

### Step 5: Verify Production
- Log in as each role type
- Verify correct data visibility
- Test edit permissions
- Check commission filtering

## Notes

- The `isAdmin()` helper already exists in `routes.ts` (line ~18)
- Should be replaced with imported version from permissions middleware
- All existing `authenticateToken` should be replaced with `requireAuth`
- All `role !== "admin"` checks should use `!isAdmin(req.user!.role)`
- Member endpoints need NEW filtering logic (not currently implemented)

## Timeline

- **Immediate (Today):** Update high-priority routes
- **This Week:** Update medium-priority routes
- **Next Week:** Update low-priority routes, full testing
- **Deployment:** After all routes updated and tested locally

---

**Created:** November 17, 2025
**Status:** Ready for implementation
**Priority:** HIGH - Affects security and data access
