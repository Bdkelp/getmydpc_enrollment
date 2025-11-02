# Admin User Creation Feature

## Overview

This feature allows admin users to create user accounts directly from within the application's admin dashboard. It includes:

1. **Backend endpoint** to create users with admin authentication
2. **Audit trail** tracking which admin created each user and when
3. **Frontend UI** dialog for creating users in the admin dashboard
4. **Automatic role assignment** with override capability

## Implementation Plan

### Phase 1: Database Schema Update

**Add `created_by` field to users table**

```sql
-- Add created_by field to track which admin created the user
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by VARCHAR(255);

-- Add index for efficient audit trail queries
CREATE INDEX IF NOT EXISTS idx_users_created_by ON public.users (created_by);
```

This field stores the UUID of the admin user who created the account, enabling full audit trail capabilities.

### Phase 2: Backend Endpoint Implementation

**New endpoint: `POST /api/admin/create-user`**

**Requirements:**
- Admin authentication required (user.role === 'admin')
- Request body:
  ```typescript
  {
    email: string;           // Required, must be unique
    firstName: string;       // Required
    lastName: string;        // Required
    password: string;        // Optional - if not provided, generate random or send verification email
    role: 'admin' | 'agent'; // Required - allow admins to create other admins/agents
    sendInviteEmail?: boolean; // Optional - default true
  }
  ```

**Response:**
```typescript
{
  success: boolean;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    createdAt: Date;
    createdBy: string; // Admin ID who created this user
  };
  message?: string;
  error?: string;
}
```

**Implementation steps:**
1. Verify admin authentication
2. Validate input (email format, required fields)
3. Check email uniqueness (not already in users or Supabase Auth)
4. Create Supabase Auth user
5. Create database user record with `created_by = req.user.id`
6. If `sendInviteEmail` is true, send welcome/invitation email
7. Return created user data

**Error handling:**
- 401: Not authenticated
- 403: User is not admin (insufficient permissions)
- 400: Invalid input (missing required fields, invalid email format)
- 409: Email already exists
- 500: Server error

### Phase 3: Frontend UI Components

**Update: `client/src/pages/admin.tsx`**

Add a new button in the "Quick Actions" section:
```
Create User Account
```

**New modal dialog: `client/src/components/admin-create-user-dialog.tsx`**

Features:
- Email input with validation
- First name input
- Last name input
- Role selector (Admin / Agent)
- Send invite email checkbox (default checked)
- Generate temporary password option (optional)
- Success/error toast notifications
- Loading state during submission

**Form validation:**
- Email must be valid format
- Email must not exist already
- First/Last name required
- Role required

**After successful creation:**
- Show success toast with user details
- Clear form
- Refresh admin users list
- Show option to copy user ID or send email invite

### Phase 4: Integration

**Update: `client/src/pages/admin-users.tsx`**

Add a "Created by" column showing which admin created each user:
- Display admin's name
- Hover to show timestamp
- Filter/search by creator (optional enhancement)

**Update: `client/src/components/admin-stats.tsx`**

Add metric for users created by current admin:
- "Users Created by Me: X"
- "Last User Created: X days ago"

## Database Schema Changes

```typescript
// In shared/schema.ts - users table

// Add to users table definition:
createdBy: varchar("created_by"), // UUID of admin who created this user
```

## Permissions & Security

- **Only admins** can use the admin creation endpoint
- **Audit trail**: All user creations tracked with:
  - Creator admin ID
  - Creation timestamp
  - IP address (already tracked in registrationIp)
- **Email uniqueness**: Verified against both Supabase Auth and database
- **Password**: Can be set by admin or auto-generated
- **Invite emails**: Optional, send welcome email to new user

## Audit Trail Queries

**Who created a user?**
```sql
SELECT users.email, users.first_name, users.last_name, 
       creators.first_name as created_by_name,
       users.created_at
FROM users
LEFT JOIN users creators ON users.created_by = creators.id
WHERE users.email = 'user@example.com';
```

**How many users did an admin create?**
```sql
SELECT COUNT(*) as users_created
FROM users
WHERE created_by = 'admin-id-here';
```

**Recent user creations by admins:**
```sql
SELECT users.email, users.role, 
       creators.first_name as created_by_name,
       users.created_at
FROM users
LEFT JOIN users creators ON users.created_by = creators.id
WHERE users.created_by IS NOT NULL
ORDER BY users.created_at DESC
LIMIT 20;
```

## Email Templates

**Welcome email for admin-created users:**

Subject: Your Account Has Been Created

```
Hello [firstName],

Your account has been created by [admin name] at [company].

Email: [email]
Temporary Password: [password] (if applicable)

To access your account, visit: [login URL]

If you have any questions, please contact support.

Best regards,
[Company Name]
```

## Implementation Checklist

- [ ] Add `created_by` column to users table (migration)
- [ ] Update User type in shared/schema.ts
- [ ] Implement POST /api/admin/create-user endpoint
- [ ] Add permission check (admin only)
- [ ] Add email validation and uniqueness check
- [ ] Create Supabase Auth user
- [ ] Create database user record with created_by
- [ ] Add error handling for all failure scenarios
- [ ] Create AdminCreateUserDialog component
- [ ] Add button to admin dashboard quick actions
- [ ] Update admin-users page to show "Created by" column
- [ ] Add creator stats to admin dashboard
- [ ] Test with multiple admin accounts
- [ ] Test email uniqueness across both systems
- [ ] Test permission checks (non-admins can't use endpoint)
- [ ] Write audit trail query examples
- [ ] Update ADMIN_GUIDE.md documentation
- [ ] Create API documentation entry

## Testing Scenarios

1. **Admin creates agent account**
   - Login as admin
   - Click "Create User Account"
   - Fill form with agent email/name
   - Select "Agent" role
   - Submit
   - Verify user appears in admin-users list with correct "Created by" info

2. **Admin creates another admin account**
   - Repeat but select "Admin" role
   - Verify new admin can login and see admin dashboard

3. **Duplicate email prevention**
   - Try to create user with existing email
   - Should show error: "Email already exists"

4. **Invalid email format**
   - Try invalid email formats
   - Should show validation error

5. **Missing required fields**
   - Submit with empty fields
   - Should show required field errors

6. **Audit trail visibility**
   - In admin-users page, see which admin created each user
   - Hover to see creation timestamp

7. **Permission enforcement**
   - Try to access endpoint as non-admin
   - Should get 403 Forbidden error

## Public Registration vs Admin Creation

- **Public Registration** (landing page):
  - Self-service user signup
  - reCAPTCHA v3 + rate limiting
  - Automatic role based on email
  - Approval status: pending

- **Admin Creation** (from admin dashboard):
  - Controlled by admin
  - No reCAPTCHA needed (already authenticated)
  - Explicit role selection
  - Can auto-approve or set to pending
  - Audit trail of creator

## Future Enhancements

1. **Bulk user import**: CSV upload for creating multiple users at once
2. **User templates**: Save common settings (role, email domain filters)
3. **Expiring invites**: Time-limited invitation links
4. **Backup admin**: Set up secondary admin for critical functions
5. **Audit log viewer**: Beautiful UI to view all user creation activities
6. **Role inheritance**: Parent/child admin hierarchies
7. **Delegated admin**: Allow super-admins to delegate creation authority

## Related Files

- `server/routes/supabase-auth.ts` - Authentication routes (register, login)
- `server/storage.ts` - User CRUD operations
- `shared/schema.ts` - User table schema definition
- `client/src/pages/admin.tsx` - Admin dashboard
- `client/src/pages/admin-users.tsx` - User management page
- `client/src/components/admin-*.tsx` - Admin UI components

