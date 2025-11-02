# Admin User Creation - Quick Start Guide

## What We Built

Admins can now create user accounts directly from the app dashboard with these capabilities:

### ✅ Key Features
- **Create Admin Accounts**: Promote trusted users to admin status
- **Create Agent Accounts**: Generate agent accounts with commission access
- **Create User Accounts**: Set up basic user accounts
- **Audit Trail**: Automatically tracks WHO created each account and WHEN
- **Password Management**: Generate secure temporary passwords automatically
- **Email Validation**: Prevents duplicate accounts
- **Role Control**: Explicit role selection (admin/agent/user)

## How to Use

### Step 1: Login as Admin
- Use one of the 4 pre-configured admins:
  - michael@mypremierplans.com
  - travis@mypremierplans.com
  - richard@mypremierplans.com
  - joaquin@mypremierplans.com

### Step 2: Open Admin Dashboard
- Navigate to `/admin` or click admin link in sidebar
- Look for **"Quick Actions"** section

### Step 3: Create Account
1. Click **"Create User Account"** button (blue, left-most button)
2. Fill in the dialog:
   - **Email**: User's email address
   - **First Name**: User's first name
   - **Last Name**: User's last name
   - **Role**: Select Admin, Agent, or User
   - **Generate Password**: Checked by default (generates secure password)
3. Click **"Create Account"**

### Step 4: Share with User
- If password was generated, copy it from the success message
- Share password securely with the new user
- User can change password after first login

## What Happens Behind the Scenes

1. **Authentication**: Verifies you're an admin
2. **Validation**: Checks email format and uniqueness
3. **Supabase**: Creates user in Supabase Auth system
4. **Database**: Creates user record with your ID as creator
5. **Audit Trail**: Records that YOU created this account
6. **Notification**: Shows success message with user details

## Viewing Audit Trail

### In Admin Dashboard
- Go to `/admin/users` to see all users
- New **"Created By"** column shows:
  - Admin's name if created by admin
  - "Self-registered" if user signed up via public form

### In Database (SQL)
```sql
-- Find all users created by an admin
SELECT email, role, created_at 
FROM users 
WHERE created_by = 'admin-uuid-here'
ORDER BY created_at DESC;

-- See who created each account
SELECT u.email, creators.first_name as created_by
FROM users u
LEFT JOIN users creators ON u.created_by = creators.id
WHERE u.created_by IS NOT NULL;
```

## API Endpoint

**Endpoint**: `POST /api/admin/create-user`

**Headers**:
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Body**:
```json
{
  "email": "newuser@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "role": "agent",
  "password": "optional-password-here"
}
```

**Response** (Success):
```json
{
  "success": true,
  "message": "User account created successfully",
  "user": {
    "id": "uuid",
    "email": "newuser@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "agent",
    "createdAt": "2025-11-02T20:10:04Z",
    "createdBy": "admin-uuid"
  },
  "temporaryPassword": "BlueRaven42!",
  "adminCreatedBy": {
    "id": "admin-uuid",
    "email": "michael@mypremierplans.com",
    "name": "Michael Admin"
  }
}
```

**Error Responses**:
- `401`: Not authenticated (missing token)
- `403`: Not an admin (insufficient permissions)
- `400`: Invalid input (missing fields, invalid email)
- `409`: Email already exists
- `500`: Server error

## Test Scenarios

### Test 1: Create an Agent
✅ Click "Create User Account"
✅ Email: test.agent@example.com
✅ First: Test, Last: Agent
✅ Role: Agent
✅ Generate Password: Checked
✅ Click Create
✅ Success! Password shown
✅ Check `/admin/users` - new agent appears with "Created by" info

### Test 2: Create an Admin
✅ Same as above but Role: Admin
✅ New admin can access admin dashboard

### Test 3: Duplicate Email Prevention
✅ Try creating user with existing email
✅ Should show error: "Email already exists"

### Test 4: Invalid Email
✅ Enter invalid email (no @, no domain, etc.)
✅ Should show error: "Invalid email format"

### Test 5: Non-Admin Access
✅ Login as agent
✅ Try to access `/api/admin/create-user`
✅ Should get 403: "Only admins can create user accounts"

## Files Changed

### New Files
- `client/src/components/admin-create-user-dialog.tsx` - Dialog component
- `migrations/add-created-by-audit-trail.sql` - Database migration

### Modified Files
- `shared/schema.ts` - Added created_by field
- `server/routes/supabase-auth.ts` - Added create-user endpoint
- `client/src/pages/admin.tsx` - Added button & dialog
- `client/src/pages/admin-users.tsx` - Added "Created By" column

## Database Schema

```typescript
// In users table:
createdBy: varchar("created_by")
// Stores UUID of admin who created this user
// NULL if user self-registered
```

## Sample Temporary Passwords

The system generates strong, memorable passwords like:
- BlueRaven42!
- GreenEagle99@
- BrightPhoenix33#
- SwiftTiger77$

Format: `Adjective + Noun + Number + SpecialChar`

## Permissions Matrix

| Action | Admin | Agent | User |
|--------|-------|-------|------|
| Create Users | ✅ | ❌ | ❌ |
| View All Users | ✅ | ❌ | ❌ |
| Change Roles | ✅ | ❌ | ❌ |
| See Created By | ✅ | ✅ | ✅ |
| Admin Dashboard | ✅ | ❌ | ❌ |

## Security Features

- ✅ Admin authentication required
- ✅ Email uniqueness across Supabase and database
- ✅ Invalid email formats rejected
- ✅ Auto-verified emails for admin-created accounts
- ✅ Comprehensive error handling
- ✅ Audit trail for compliance
- ✅ Strong temporary passwords

## Public Registration Still Works

- Public users can still self-register via landing page `/registration`
- Self-registered accounts show "Self-registered" in Created By column
- Public registration has reCAPTCHA v3 + rate limiting protection
- Independent from admin creation feature

## Questions?

Refer to:
- **Full Documentation**: `ADMIN_USER_CREATION.md`
- **Implementation Details**: `ADMIN_USER_CREATION_IMPLEMENTATION.md`
- **API Reference**: See backend endpoint implementation
- **Test Accounts**: `TEST_ACCOUNTS.md`

