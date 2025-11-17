# Users Table Cleanup Plan

**Date:** November 17, 2025  
**Purpose:** Remove member-specific columns from users table (staff only)

## Current Problem

The users table contains many member-specific fields that were originally designed when the app treated users as members. Now that we have proper separation (users = staff, members = customers), these fields are unnecessary for the users table.

## Column Analysis

### ✅ KEEP - Core Staff Fields (Required)

#### Identity & Authentication
- `id` - Primary key (Supabase Auth UUID)
- `email` - Login email
- `firstName`, `lastName`, `middleName` - Staff name
- `phone` - Contact number
- `role` - super_admin, admin, agent
- `agentNumber` - MPP0001, MPP0002, etc. (REQUIRED)

#### Profile & Contact
- `profileImageUrl` - Staff profile photo
- `address`, `address2`, `city`, `state`, `zipCode` - Staff address
- `dateOfBirth` - Optional staff info
- `gender` - Optional staff info

#### Agent Hierarchy (NEW - CRITICAL)
- `uplineAgentId` - Parent agent reference
- `hierarchyLevel` - Depth in hierarchy
- `canReceiveOverrides` - Override eligibility
- `overrideCommissionRate` - Override percentage

#### Admin/Approval
- `isActive` - Account status
- `approvalStatus` - pending, approved, rejected, suspended
- `approvedAt`, `approvedBy` - Approval tracking
- `rejectionReason` - If rejected
- `emailVerified`, `emailVerifiedAt` - Email verification
- `createdBy` - Admin who created (audit trail)

#### Security/Bot Detection
- `registrationIp` - Bot detection
- `registrationUserAgent` - Bot detection
- `suspiciousFlags` - Bot detection flags

#### Session Tracking
- `lastLoginAt` - Last login timestamp
- `lastActivityAt` - Last activity timestamp

#### Banking (Commission Payouts)
- `bankName` - For commission deposits
- `routingNumber` - ABA routing number
- `accountNumber` - Account number
- `accountType` - checking/savings
- `accountHolderName` - Name on account

#### Timestamps
- `createdAt`, `updatedAt` - Standard timestamps

### ❌ REMOVE - Member-Specific Fields (Not Needed for Staff)

#### Stripe Fields (NOT USED - We use EPX, members pay not staff)
- `stripeCustomerId` - ❌ Members pay, not staff
- `stripeSubscriptionId` - ❌ Members have subscriptions, not staff

#### Employment Fields (Member-specific, not staff)
- `employerName` - ❌ This is for MEMBERS who are employed
- `divisionName` - ❌ Member's division at their employer
- `memberType` - ❌ employee, spouse, dependent (member concepts)
- `dateOfHire` - ❌ Member's hire date at their employer
- `planStartDate` - ❌ Member's plan start date
- `ssn` - ❌ Member SSN (staff don't need this)

#### Member Enrollment Tracking
- `enrolledByAgentId` - ❌ This is for tracking which agent enrolled a MEMBER (not applicable to staff users)

#### Emergency Contact (Probably not needed for staff)
- `emergencyContactName` - ⚠️ Optional - could keep for HR purposes
- `emergencyContactPhone` - ⚠️ Optional - could keep for HR purposes

#### Legacy Auth Fields (NOT USED - Supabase handles auth)
- `username` - ❌ Not used (we use email)
- `passwordHash` - ❌ Supabase Auth handles this
- `emailVerificationToken` - ❌ Supabase Auth handles this
- `resetPasswordToken` - ❌ Supabase Auth handles this
- `resetPasswordExpiry` - ❌ Supabase Auth handles this

#### Social Login IDs (NOT IMPLEMENTED)
- `googleId` - ❌ Social login not implemented
- `facebookId` - ❌ Social login not implemented
- `appleId` - ❌ Social login not implemented
- `microsoftId` - ❌ Social login not implemented
- `linkedinId` - ❌ Social login not implemented
- `twitterId` - ❌ Social login not implemented

## Code Usage Check

### Fields Currently Used in Code

**storage.ts** - These fields are mapped but not actively used:
```typescript
// Lines 365-370 - Member-specific fields mapped (but not needed for staff)
employerName: data.employer_name || data.employerName,
divisionName: data.division_name || data.divisionName,
memberType: data.member_type || data.memberType,
ssn: data.ssn,
dateOfHire: data.date_of_hire || data.dateOfHire,
planStartDate: data.plan_start_date || data.planStartDate,

// Lines 374-377 - Auth fields mapped (but Supabase handles auth)
passwordHash: data.password_hash || data.passwordHash,
emailVerificationToken: data.email_verification_token || data.emailVerificationToken,
resetPasswordToken: data.reset_password_token || data.resetPasswordExpiry,

// Lines 380-381 - Stripe fields (not used - we use EPX)
stripeCustomerId: data.stripe_customer_id || data.stripeCustomerId,
stripeSubscriptionId: data.stripe_subscription_id || data.stripeSubscriptionId,

// Lines 382-387 - Social login fields (not implemented)
googleId: data.google_id || data.googleId,
facebookId: data.facebook_id || data.facebookId,
appleId: data.apple_id || data.appleId,
microsoftId: data.microsoft_id || data.microsoftId,
linkedinId: data.linkedin_id || data.linkedinId,
twitterId: data.twitter_id || data.twitterId,
```

**Key Finding:** These fields are only referenced in the mapping functions but never actually used in any business logic. They can be safely removed.

## Safe Removal Process

### Step 1: Update TypeScript Schema
**File:** `shared/schema.ts`

Remove these field definitions from the users table:
```typescript
// REMOVE THESE:
stripeCustomerId: varchar("stripe_customer_id").unique(),
stripeSubscriptionId: varchar("stripe_subscription_id").unique(),
employerName: varchar("employer_name"),
divisionName: varchar("division_name"),
memberType: varchar("member_type"),
ssn: varchar("ssn"),
dateOfHire: varchar("date_of_hire"),
planStartDate: varchar("plan_start_date"),
enrolledByAgentId: varchar("enrolled_by_agent_id"),
username: varchar("username"),
passwordHash: text("password_hash"),
emailVerificationToken: text("email_verification_token"),
resetPasswordToken: text("reset_password_token"),
resetPasswordExpiry: timestamp("reset_password_expiry"),
googleId: varchar("google_id"),
facebookId: varchar("facebook_id"),
appleId: varchar("apple_id"),
microsoftId: varchar("microsoft_id"),
linkedinId: varchar("linkedin_id"),
twitterId: varchar("twitter_id"),
```

**Decision on Emergency Contact:**
- KEEP for now (could be useful for HR/admin purposes)

### Step 2: Update storage.ts Mapping
**File:** `server/storage.ts`

Remove these lines from the `transformUser` function (around lines 365-387):
```typescript
// REMOVE THESE MAPPINGS:
employerName: data.employer_name || data.employerName,
divisionName: data.division_name || data.divisionName,
memberType: data.member_type || data.memberType,
ssn: data.ssn,
dateOfHire: data.date_of_hire || data.dateOfHire,
planStartDate: data.plan_start_date || data.planStartDate,
passwordHash: data.password_hash || data.passwordHash,
emailVerificationToken: data.email_verification_token || data.emailVerificationToken,
resetPasswordToken: data.reset_password_token || data.resetPasswordExpiry,
stripeCustomerId: data.stripe_customer_id || data.stripeCustomerId,
stripeSubscriptionId: data.stripe_subscription_id || data.stripeSubscriptionId,
googleId: data.google_id || data.googleId,
facebookId: data.facebook_id || data.facebookId,
appleId: data.apple_id || data.appleId,
microsoftId: data.microsoft_id || data.microsoftId,
linkedinId: data.linkedin_id || data.linkedinId,
twitterId: data.twitter_id || data.twitterId,
enrolledByAgentId: data.enrolled_by_agent_id || data.enrolledByAgentId,
```

Remove these interface methods:
```typescript
// REMOVE (lines 116-118):
getUserByGoogleId(googleId: string): Promise<User | undefined>;
getUserByFacebookId(facebookId: string): Promise<User | undefined>;
getUserByTwitterId(twitterId: string): Promise<User | undefined>;
```

### Step 3: Update Supabase Database

**IMPORTANT:** Backup database first!

```sql
-- Backup existing data (just in case)
CREATE TABLE users_backup_20251117 AS 
SELECT * FROM users;

-- Drop columns from users table
ALTER TABLE users 
  DROP COLUMN IF EXISTS stripe_customer_id,
  DROP COLUMN IF EXISTS stripe_subscription_id,
  DROP COLUMN IF EXISTS employer_name,
  DROP COLUMN IF EXISTS division_name,
  DROP COLUMN IF EXISTS member_type,
  DROP COLUMN IF EXISTS ssn,
  DROP COLUMN IF EXISTS date_of_hire,
  DROP COLUMN IF EXISTS plan_start_date,
  DROP COLUMN IF EXISTS enrolled_by_agent_id,
  DROP COLUMN IF EXISTS username,
  DROP COLUMN IF EXISTS password_hash,
  DROP COLUMN IF EXISTS email_verification_token,
  DROP COLUMN IF EXISTS reset_password_token,
  DROP COLUMN IF EXISTS reset_password_expiry,
  DROP COLUMN IF EXISTS google_id,
  DROP COLUMN IF EXISTS facebook_id,
  DROP COLUMN IF EXISTS apple_id,
  DROP COLUMN IF EXISTS microsoft_id,
  DROP COLUMN IF EXISTS linkedin_id,
  DROP COLUMN IF EXISTS twitter_id;

-- Verify columns were removed
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'users'
ORDER BY ordinal_position;
```

### Step 4: Add Missing Hierarchy Columns (if needed)

```sql
-- Add agent hierarchy columns if they don't exist
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS upline_agent_id VARCHAR REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS hierarchy_level INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS can_receive_overrides BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS override_commission_rate DECIMAL(5,2) DEFAULT 0;

-- Add index for hierarchy queries
CREATE INDEX IF NOT EXISTS idx_users_upline ON users(upline_agent_id);
CREATE INDEX IF NOT EXISTS idx_users_hierarchy_level ON users(hierarchy_level);
```

### Step 5: Run Database Push

```bash
# Update Drizzle schema to match Supabase
npm run db:push
```

### Step 6: Test Application

- [ ] Login as super_admin (Michael)
- [ ] Login as admin (Travis)
- [ ] Login as agent (Steven)
- [ ] Verify user list displays correctly
- [ ] Verify user profile editing works
- [ ] Verify no TypeScript errors
- [ ] Check banking info still works
- [ ] Check commission calculations work

## Final Users Table Structure

```typescript
export const users = pgTable("users", {
  // Identity
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique(),
  
  // Profile
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  middleName: varchar("middle_name"),
  profileImageUrl: varchar("profile_image_url"),
  phone: varchar("phone"),
  dateOfBirth: varchar("date_of_birth"),
  gender: varchar("gender"),
  
  // Address
  address: text("address"),
  address2: text("address2"),
  city: varchar("city"),
  state: varchar("state"),
  zipCode: varchar("zip_code"),
  
  // Emergency Contact (kept for HR purposes)
  emergencyContactName: varchar("emergency_contact_name"),
  emergencyContactPhone: varchar("emergency_contact_phone"),
  
  // Role & Status
  role: varchar("role").default("agent"), // super_admin, admin, agent
  agentNumber: varchar("agent_number").notNull(), // MPP0001, etc.
  isActive: boolean("is_active").default(true),
  
  // Approval Workflow
  approvalStatus: varchar("approval_status").default("pending"),
  approvedAt: timestamp("approved_at"),
  approvedBy: varchar("approved_by"),
  rejectionReason: text("rejection_reason"),
  
  // Email Verification
  emailVerified: boolean("email_verified").default(false),
  emailVerifiedAt: timestamp("email_verified_at"),
  
  // Security/Bot Detection
  registrationIp: varchar("registration_ip"),
  registrationUserAgent: text("registration_user_agent"),
  suspiciousFlags: jsonb("suspicious_flags"),
  
  // Audit
  createdBy: varchar("created_by"),
  
  // Session Tracking
  lastLoginAt: timestamp("last_login_at"),
  lastActivityAt: timestamp("last_activity_at"),
  
  // Agent Hierarchy
  uplineAgentId: varchar("upline_agent_id").references(() => users.id),
  hierarchyLevel: integer("hierarchy_level").default(0),
  canReceiveOverrides: boolean("can_receive_overrides").default(false),
  overrideCommissionRate: decimal("override_commission_rate", { precision: 5, scale: 2 }).default("0"),
  
  // Banking (Commission Payouts)
  bankName: varchar("bank_name"),
  routingNumber: varchar("routing_number", { length: 9 }),
  accountNumber: varchar("account_number"),
  accountType: varchar("account_type"),
  accountHolderName: varchar("account_holder_name"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

## Benefits of Cleanup

1. **Clearer Data Model** - Users table is strictly for staff
2. **Reduced Confusion** - No member-specific fields in staff table
3. **Better Performance** - Fewer columns to index/query
4. **Easier Maintenance** - Less code to maintain
5. **Type Safety** - TypeScript won't reference non-existent fields
6. **Database Size** - Smaller table size

## Risks & Mitigation

### Risk 1: Data Loss
**Mitigation:** Create backup table before dropping columns

### Risk 2: Code References
**Mitigation:** Search codebase for all field references (already done)

### Risk 3: Breaking Changes
**Mitigation:** Test thoroughly before deploying

### Risk 4: Migration Issues
**Mitigation:** Run in development first, verify production schema

## Rollback Plan

If something breaks:

```sql
-- Restore from backup
DROP TABLE users;
ALTER TABLE users_backup_20251117 RENAME TO users;

-- Or restore individual columns
ALTER TABLE users 
  ADD COLUMN stripe_customer_id VARCHAR,
  ADD COLUMN stripe_subscription_id VARCHAR;
  -- etc.

-- Copy data back from backup
UPDATE users u
SET 
  stripe_customer_id = b.stripe_customer_id,
  stripe_subscription_id = b.stripe_subscription_id
FROM users_backup_20251117 b
WHERE u.id = b.id;
```

## Execution Timeline

1. **Code Changes** (15 minutes)
   - Update schema.ts
   - Update storage.ts
   - Commit changes

2. **Database Backup** (5 minutes)
   - Create backup table
   - Verify backup

3. **Database Changes** (10 minutes)
   - Drop unused columns
   - Add hierarchy columns
   - Create indexes

4. **Testing** (30 minutes)
   - Test all user operations
   - Verify no errors
   - Check data integrity

5. **Deployment** (10 minutes)
   - Push to main
   - Railway auto-deploy
   - Monitor logs

**Total Time:** ~1 hour

## Next Steps

1. Review this plan
2. Get approval to proceed
3. Execute code changes
4. Execute database changes
5. Test thoroughly
6. Deploy to production

---

**Status:** Ready for execution  
**Risk Level:** LOW (fields not actively used)  
**Priority:** MEDIUM (cleanup, not critical)
