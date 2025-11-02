# Admin User Creation Feature - Visual Overview

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                          ADMIN DASHBOARD                         │
│                      /admin/pages/admin.tsx                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              Quick Actions Section                        │  │
│  │  ┌──────────────────────────────────────────────────────┐ │  │
│  │  │ [Create User Account] ← NEW BUTTON (BLUE)           │ │  │
│  │  │ [Enroll Member] [View Enrollments] [Leads] [Roles]  │ │  │
│  │  └──────────────────────────────────────────────────────┘ │  │
│  │                      ↓ Click                              │  │
│  └──────────────────────┼──────────────────────────────────┘  │
│                         │                                       │
│                    OPENS DIALOG                                 │
│                         ↓                                       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  ┌─ AdminCreateUserDialog ─────────────────────────────┐ │  │
│  │  │                                                      │ │  │
│  │  │  Create User Account                               │ │  │
│  │  │  ┌──────────────────────────────────────────────┐  │ │  │
│  │  │  │ Email: [____________]                       │  │ │  │
│  │  │  │ First Name: [____________]                  │  │ │  │
│  │  │  │ Last Name: [____________]                   │  │ │  │
│  │  │  │ Role: [Admin ▼] [Agent ▼] [User ▼]         │  │ │  │
│  │  │  │ ☑ Generate temporary password               │  │ │  │
│  │  │  │                                              │  │ │  │
│  │  │  │ [Cancel] [Create Account →]                 │  │ │  │
│  │  │  └──────────────────────────────────────────────┘  │ │  │
│  │  └──────────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                          ↓
                    API CALL (POST)
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│         POST /api/admin/create-user (supabase-auth.ts)           │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. Check Admin Authentication ✓                                │
│  2. Validate Input (email, name, role) ✓                        │
│  3. Check Email Uniqueness ✓                                    │
│  4. Create in Supabase Auth ✓                                   │
│  5. Create Database Record with created_by ✓                   │
│  6. Generate Temporary Password ✓                               │
│  7. Return Success Response ✓                                   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
              ↓                    ↓                 ↓
         SUPABASE AUTH        DATABASE            RESPONSE
         (Create User)        (users table)       (with password)
              ↓                    ↓                 ↓
         UUID Created         record with       Success Message
                              created_by        + Password shown
                              field set

                    ↓↓↓ SUCCESS ↓↓↓

┌─────────────────────────────────────────────────────────────────┐
│             Admin Users Page (/admin/pages/admin-users.tsx)      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  User Table with NEW "Created By" Column:                        │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ User | Role | Agent # | Status | Created By | Joined     │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │ John │ Agent│ MPP001  │ Active │ Michael  │ Nov 2      │ │
│  │ Doe  │      │         │        │ Admin    │ 2025       │ │
│  │      │      │         │        │ (michael@...) │         │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │ Jane │ Admin│ MPP002  │ Active │ Travis   │ Nov 2      │ │
│  │ Smith│      │         │        │ Admin    │ 2025       │ │
│  │      │      │         │        │ (travis@...) │          │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  Shows creator name and email for each admin-created user        │
│  Shows "Self-registered" for users who signed up publicly        │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘

```

## Data Flow

```
ADMIN CREATES USER
    ↓
Dialog Form Submitted
    ↓ Validation ✓
Email Check ✓
    ↓
POST /api/admin/create-user
    ↓
Server Validation
├─ Is Admin? → 403 if NO
├─ Email Valid? → 400 if NO
└─ Email Unique? → 409 if EXISTS
    ↓
Create Supabase Auth User
    ↓
Create Database User Record
    ├─ id: (from Supabase)
    ├─ email: (from request)
    ├─ firstName: (from request)
    ├─ lastName: (from request)
    ├─ role: (from request)
    ├─ createdBy: (admin ID) ← AUDIT TRAIL
    ├─ isActive: true
    ├─ approvalStatus: approved
    └─ emailVerified: true
    ↓
Generate Temporary Password
    ↓
Return Success Response
├─ user object
├─ temporaryPassword (if generated)
└─ adminCreatedBy info
    ↓
Frontend Success Toast
    ↓
Dialog Closes
    ↓
User List Refreshes
    ↓
NEW USER VISIBLE with "Created By" info
```

## Database Schema Addition

```typescript
// shared/schema.ts
export const users = pgTable("users", {
  // ... existing fields ...
  
  // NEW FIELD for Admin User Creation
  createdBy: varchar("created_by"),  // UUID of admin who created this user
                                      // NULL if user self-registered
  
  // ... rest of fields ...
});

// Enables audit trail queries:
// SELECT * FROM users WHERE created_by = 'admin-uuid'
// SELECT * FROM users WHERE created_by IS NULL  (self-registered)
```

## Component Hierarchy

```
Admin Dashboard (admin.tsx)
├── Stats Section
├── Quick Actions Section
│   ├── [Create User Account] ← NEW
│   ├── [Enroll Member]
│   ├── [View Enrollments]
│   ├── [Manage Leads]
│   └── [Manage Roles]
│
└── AdminCreateUserDialog (admin-create-user-dialog.tsx)
    ├── Header
    ├── Success Message (conditional)
    ├── Error Message (conditional)
    ├── Form
    │   ├── Email Input
    │   ├── First Name Input
    │   ├── Last Name Input
    │   ├── Role Selector
    │   └── Generate Password Checkbox
    └── Footer
        ├── [Cancel]
        └── [Create Account]
```

## API Request/Response

### Request
```json
POST /api/admin/create-user
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "email": "newagent@example.com",
  "firstName": "Sarah",
  "lastName": "Agent",
  "role": "agent",
  "password": null  // Will be generated
}
```

### Success Response (200)
```json
{
  "success": true,
  "message": "User account created successfully",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "newagent@example.com",
    "firstName": "Sarah",
    "lastName": "Agent",
    "role": "agent",
    "createdAt": "2025-11-02T20:10:04.000Z",
    "createdBy": "11111111-1111-1111-1111-111111111111",
    "approvalStatus": "approved",
    "emailVerified": true
  },
  "temporaryPassword": "BlueRaven42!",
  "adminCreatedBy": {
    "id": "11111111-1111-1111-1111-111111111111",
    "email": "michael@mypremierplans.com",
    "name": "Michael Admin"
  }
}
```

### Error Response (409 - Email Exists)
```json
{
  "message": "Email already exists",
  "code": "EMAIL_EXISTS"
}
```

## User Interface States

### Default State
```
┌─ Dialog ──────────────────────────────┐
│ Create User Account              [×]  │
├───────────────────────────────────────┤
│                                       │
│ Email Address *                       │
│ [                            ]        │
│                                       │
│ First Name *                          │
│ [                            ]        │
│                                       │
│ Last Name *                           │
│ [                            ]        │
│                                       │
│ User Role *                           │
│ [Agent ▼]                             │
│ Can view commissions and manage...   │
│                                       │
│ ☑ Generate temporary password        │
│                                       │
│ [Cancel]        [Create Account]     │
└───────────────────────────────────────┘
```

### Loading State
```
│ [Cancel]   [⟳ Creating...]           │  ← Button disabled, spinning
```

### Success State
```
├─────────────────────────────────────┤
│ ✓ User "newagent@example.com"        │
│   created successfully!              │
│                                       │
│   Temporary password: BlueRaven42!   │
│   Please save this password...       │
├─────────────────────────────────────┤
│                                       │
│ [closes in 2 seconds...]             │
```

### Error State
```
├─────────────────────────────────────┤
│ ⚠ Email already exists              │
├─────────────────────────────────────┤
│ Email Address *                      │
│ [newagent@example.com        ] ✗     │
│ Email already exists                 │
│                                       │
│ [Cancel]        [Create Account]     │
```

## Audit Trail Display

### Admin Users Page
```
User              Created By          Joined      Last Login
────────────────────────────────────────────────────────────
Sarah Agent       Michael Admin       Nov 2, 2025 Never
                  michael@myp...

John Admin        Travis Admin        Nov 2, 2025 Nov 2, 4:30pm
                  travis@myp...

Jane User         Self-registered     Nov 1, 2025 Nov 1, 3:15pm
```

## File Dependencies

```
admin.tsx
    ├── imports: AdminCreateUserDialog
    ├── calls: POST /api/admin/create-user
    └── displays: dialog component

admin-users.tsx
    ├── displays: "Created By" column
    ├── queries: /api/admin/users
    └── shows: createdByAdmin info

supabase-auth.ts
    ├── POST /api/admin/create-user endpoint
    ├── imports: storage.createUser()
    ├── calls: supabase.auth.admin.createUser()
    └── stores: created_by in database

admin-create-user-dialog.tsx
    ├── calls: POST /api/admin/create-user
    ├── imports: useAuth, useMutation
    └── shows: success/error messages

schema.ts
    └── defines: createdBy field in users table
```

## Security Flow

```
Request arrives at /api/admin/create-user
    ↓
Extract Authorization token
    ↓
Verify token with Supabase
    ├─ Invalid/Expired? → 401 Unauthorized
    └─ Valid? → Continue
    ↓
Get admin user from database
    ├─ Not found? → 401 Unauthorized
    └─ Found? → Continue
    ↓
Check user.role === 'admin'
    ├─ Not admin? → 403 Forbidden
    └─ Is admin? → Continue
    ↓
Validate input
    ├─ Missing fields? → 400 Bad Request
    ├─ Invalid email? → 400 Bad Request
    └─ Valid? → Continue
    ↓
Check email uniqueness (Supabase + Database)
    ├─ Exists? → 409 Conflict
    └─ Unique? → Continue
    ↓
Create user in Supabase Auth
    ├─ Failed? → 400/500 Error
    └─ Success? → Continue
    ↓
Create user in Database with created_by
    ├─ Failed? → 500 Error
    └─ Success? → Return 200
```

---

This visual overview helps understand the complete flow of the admin user creation feature!

