# Member vs User Separation - Implementation Plan

## Problem Statement
Currently, members (enrolled healthcare customers) are being created as users with Supabase authentication credentials. This creates a security risk as members can potentially log into the enrollment app.

## Solution Architecture

### Current State
- **users table**: Contains both staff (agents/admins) AND enrolled members
- **role field**: "member", "agent", "admin"
- **Supabase Auth**: Creates auth records for ALL users including members

### Target State
- **users table**: ONLY staff with login access (agents, admins, super admin)
- **members table**: Enrolled healthcare customers (NO authentication)
- **Supabase Auth**: ONLY creates auth records for staff

## Implementation Steps

### 1. Schema Changes (shared/schema.ts)
- ✅ Keep `users` table for agents/admins only
- ✅ Remove "member" role from valid roles
- ✅ Valid roles: "agent", "admin", "super_admin"
- ✅ Ensure agentNumber is required for all user types
- ✅ Add lastLoginAt tracking

### 2. Create Members Table Migration
```sql
-- Create members table (separate from users)
CREATE TABLE IF NOT EXISTS members (
  id SERIAL PRIMARY KEY,
  customer_number VARCHAR(255) UNIQUE NOT NULL,
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  middle_name VARCHAR(255),
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(50),
  date_of_birth DATE,
  gender VARCHAR(20),
  ssn VARCHAR(11) ENCRYPTED,
  address TEXT,
  address2 TEXT,
  city VARCHAR(100),
  state VARCHAR(2),
  zip_code VARCHAR(10),
  emergency_contact_name VARCHAR(255),
  emergency_contact_phone VARCHAR(50),
  
  -- Employment info
  employer_name VARCHAR(255),
  division_name VARCHAR(255),
  member_type VARCHAR(50), -- employee, spouse, dependent
  date_of_hire DATE,
  plan_start_date DATE,
  
  -- Enrollment tracking
  enrolled_by_agent_id VARCHAR(255) REFERENCES users(id),
  enrollment_date TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  status VARCHAR(50) DEFAULT 'active', -- active, cancelled, suspended
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX idx_members_customer_number ON members(customer_number);
CREATE INDEX idx_members_enrolled_by ON members(enrolled_by_agent_id);
CREATE INDEX idx_members_email ON members(email);
```

### 3. Update Subscriptions Table
```sql
-- Add member_id to subscriptions (alongside user_id)
ALTER TABLE subscriptions ADD COLUMN member_id INTEGER REFERENCES members(id);
ALTER TABLE subscriptions ALTER COLUMN user_id DROP NOT NULL;
-- Ensure at least one is set
ALTER TABLE subscriptions ADD CONSTRAINT check_user_or_member 
  CHECK ((user_id IS NOT NULL AND member_id IS NULL) OR (user_id IS NULL AND member_id IS NOT NULL));
```

### 4. Update Payments Table
```sql
-- Add member_id to payments (alongside user_id)
ALTER TABLE payments ADD COLUMN member_id INTEGER REFERENCES members(id);
ALTER TABLE payments ALTER COLUMN user_id DROP NOT NULL;
-- Ensure at least one is set
ALTER TABLE payments ADD CONSTRAINT check_payment_user_or_member 
  CHECK ((user_id IS NOT NULL AND member_id IS NULL) OR (user_id IS NULL AND member_id IS NOT NULL));
```

### 5. Update Commissions Table
```sql
-- Add member_id to commissions (userId is actually the enrolled member)
ALTER TABLE commissions ADD COLUMN member_id INTEGER REFERENCES members(id);
ALTER TABLE commissions ALTER COLUMN user_id DROP NOT NULL;
-- Ensure at least one is set
ALTER TABLE commissions ADD CONSTRAINT check_commission_user_or_member 
  CHECK ((user_id IS NOT NULL AND member_id IS NULL) OR (user_id IS NULL AND member_id IS NOT NULL));
```

### 6. Data Migration Script
```sql
-- Copy member records from users to members table
INSERT INTO members (
  customer_number, first_name, last_name, middle_name, email, phone,
  date_of_birth, gender, ssn, address, address2, city, state, zip_code,
  emergency_contact_name, emergency_contact_phone, employer_name, division_name,
  member_type, date_of_hire, plan_start_date, enrolled_by_agent_id,
  enrollment_date, is_active, created_at, updated_at
)
SELECT 
  'MPP' || EXTRACT(YEAR FROM created_at) || id as customer_number,
  first_name, last_name, middle_name, email, phone,
  date_of_birth::DATE, gender, ssn, address, address2, city, state, zip_code,
  emergency_contact_name, emergency_contact_phone, employer_name, division_name,
  member_type, date_of_hire::DATE, plan_start_date::DATE, enrolled_by_agent_id,
  created_at as enrollment_date, is_active, created_at, updated_at
FROM users
WHERE role = 'member' OR role = 'user';

-- Update subscriptions to reference members instead of users
UPDATE subscriptions s
SET member_id = m.id, user_id = NULL
FROM members m
INNER JOIN users u ON u.id = s.user_id AND (u.role = 'member' OR u.role = 'user')
WHERE m.email = u.email;

-- Update payments to reference members
UPDATE payments p
SET member_id = m.id, user_id = NULL
FROM members m
INNER JOIN users u ON u.id = p.user_id AND (u.role = 'member' OR u.role = 'user')
WHERE m.email = u.email;

-- Update commissions to reference members
UPDATE commissions c
SET member_id = m.id, user_id = NULL
FROM members m
INNER JOIN users u ON u.id = c.user_id AND (u.role = 'member' OR u.role = 'user')
WHERE m.email = u.email;

-- DELETE member records from users table (AFTER migration verified)
-- DELETE FROM users WHERE role = 'member' OR role = 'user';
```

### 7. Code Changes

#### storage.ts
- Add `createMember()`, `getMember()`, `updateMember()` functions
- Update `createSubscription()` to accept memberId
- Update queries to join on members table instead of users for member data

#### routes.ts
- `/api/auth/register` - ONLY for agents/admins (no member registration)
- `/api/enroll` - Create member record (NO Supabase auth)
- `/api/agent/enrollment` - Create member record (not user)
- Update all member queries to use members table

#### middleware
- Add check: Only allow login if `role IN ('agent', 'admin', 'super_admin')`
- Block login attempts from member emails

### 8. Frontend Changes

#### Auth Context
- Update to reject authentication for non-staff roles
- Show error: "Members cannot log into this app"

#### Agent Dashboard
- Display "Members" not "Users"
- Update terminology throughout

## Testing Checklist

- [ ] Agents can log in
- [ ] Admins can log in
- [ ] Members CANNOT log in
- [ ] Member emails show proper error message
- [ ] Agents can enroll new members
- [ ] Member subscriptions link correctly
- [ ] Payments track to members
- [ ] Commissions track to members
- [ ] Agent dashboard shows member data
- [ ] Admin can see all members
- [ ] Customer numbers generate correctly

## Rollback Plan
If issues occur, keep backup of users table with members before deletion.

## Security Benefits
✅ Members cannot access enrollment app
✅ Member data separate from authentication
✅ Clear separation of concerns
✅ Reduced attack surface
✅ Better HIPAA compliance
