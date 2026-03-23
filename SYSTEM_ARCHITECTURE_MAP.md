# Production Enrollment Platform — System Architecture Map

**Document Date**: March 18, 2026  
**Platform**: DPC Enrollment Platform (getmydpc.com)  
**Status**: Discovery-Only (No modifications recommended)

---

## TABLE OF CONTENTS

1. [System Architecture Map](#section-1--system-architecture-map)
2. [Payment Flow Map](#section-2--payment-flow-map)
3. [Billing Related Components](#section-3--billing-related-components)
4. [Token Related Components](#section-4--token-related-components)
5. [Background Processing Components](#section-5--background-processing-components)
6. [Database Relationship Map](#database-relationship-map)
7. [Key Environment Dependencies](#key-environment-dependencies)

---

## SECTION 1 — System Architecture Map

### Core System Components

#### ENROLLMENT TIER (Frontend)
- **Framework**: React 18 + TypeScript + Vite
- **Deployed On**: DigitalOcean Static App
- **Primary Function**: Member enrollment form → payment authorization → membership setup
- **Authentication**: Supabase Auth (JWT tokens)
- **Communication**: REST API calls to backend via `client/src/lib/apiClient.ts`

#### PAYMENT TIER (Backend API)
- **Framework**: Express.js + Node.js TypeScript
- **Deployed On**: DigitalOcean App Platform
- **Primary Services**:
  - `epx-hosted-checkout-service.ts` → EPX Hosted Checkout configuration & callbacks
  - `epx-payment-service.ts` → EPX recurring billing (Server Post API)
  - `payment-service.ts` → Mock payment provider for testing
  - `epx-payment-logger.ts` → Payment transaction logging (JSONL format)
  - `certification-logger.ts` → Compliance logging for payment data audit trail

#### DATA TIER (Supabase PostgreSQL)
- **Hosting**: AWS via Supabase
- **Authentication**: Supabase Auth (JWT tokens)
- **Data Protection**: Row-Level Security (RLS) policies on all sensitive tables
- **Admin Dashboard Queries**: Neon DB for reporting layer

#### EXTERNAL INTEGRATIONS
- **North EPX** (Payment Processor)
  - Hosted Checkout (user-facing payment form)
  - Server Post API (recurring billing charges)
  - BRIC tokenization (secure payment token storage)
  - Supported Methods: CreditCard + ACH (bank account)
- **SendGrid** (Email notifications)
- **Google reCAPTCHA v3** (Fraud detection & bot prevention)

---

### Enrollment Flow Diagram

```
Member Registration
    ↓
Personal Info Input
  ├─ Name, DOB, SSN, Phone
  ├─ Address, Email
  └─ Plan Selection

    ↓
Premium Calculation
  ├─ Base plan cost
  ├─ Discount codes applied
  └─ Total monthly price

    ↓
reCAPTCHA v3 Check
  └─ Fraud score verification (threshold: 0.5)

    ↓
EPX Hosted Checkout (Iframe/Redirect)
  ├─ Card/ACH Entry
  ├─ EPX Payment Capture
  └─ Return: AUTH_GUID (payment token)

    ↓
Payment Callback Handler
  ├─ File: epx-hosted-routes.ts
  ├─ Extract AUTH_GUID from EPX response
  ├─ Create Payment Record in `payments` table
  ├─ Generate BRIC Token (encrypted AUTH_GUID)
  └─ Create Payment Token Record

    ↓
Commission Calculation & Tracking
  ├─ Calculate commission_amount based on coverage_type
  ├─ Create agent_commissions record (relationship)
  └─ Trigger commission_payouts record (monthly tracking)

    ↓
Membership Activation (Scheduled)
  ├─ Set status: pending_activation
  ├─ Calculate membership_start_date
  └─ Schedule activation via membership-activation-service

    ↓
Email Notifications
  ├─ Enrollment confirmation → Member
  ├─ Payment confirmation → Member
  ├─ Commission notification → Agent
  └─ Lead/admin notifications
```

---

## SECTION 2 — Payment Flow Map

### Complete Payment Journey: SIGNUP → CHECKOUT → RETURN → RECORD → ACTIVATION

#### Phase 1: SIGNUP (Frontend)
**Location**: `client/src` React components

```
User Action:
  ├─ Submit enrollment form
  ├─ Data validation:
  │   ├─ Email format & uniqueness
  │   ├─ Age check (18+)
  │   ├─ SSN validation (9 digits)
  │   ├─ Phone validation (10 digits)
  │   └─ Zip code (5 digits)
  └─ Create temporary member record (status: pending_checkout)

Data Collected:
  ├─ first_name, last_name
  ├─ date_of_birth (MMDDYYYY)
  ├─ ssn (will be encrypted)
  ├─ phone (will be formatted to 10 digits)
  ├─ email
  ├─ address fields
  ├─ plan_id (determines coverage_type & pricing)
  └─ agent_number (if referred)
```

#### Phase 2: HOSTED CHECKOUT (EPX)
**Location**: `POST /api/epx/hosted/session`

```
Backend Response:
  ├─ publicKey (base64 encoded terminal profile)
  ├─ scriptUrl ("https://hosted.epx.com/post.js")
  ├─ buttonScriptUrl ("https://hosted.epx.com/button.js")
  ├─ sessionId (order number for tracking)
  ├─ environment (sandbox or production)
  └─ captchaMode (recaptcha-v3)

Frontend Rendering:
  ├─ Include EPX post.js script
  ├─ Display EPX payment form (iframe or hosted)
  ├─ User enters:
  │   ├─ Card number (or bank account details for ACH)
  │   ├─ Expiry date (card only)
  │   ├─ CVV (card only)
  │   └─ Billing zip code
  └─ EPX performs network transaction → AUTH_GUID returned
```

#### Phase 3: RETURN (Client-side Callback)
**Location**: Browser-side JavaScript callback

```
EPX Callback (Success):
  ├─ Captures AUTH_GUID from EPX response
  ├─ Extracts transaction details:
  │   ├─ transactionId (EPX transaction ID)
  │   ├─ amount (charged amount)
  │   ├─ status (approved/declined)
  │   └─ message (result description)
  └─ POST to /api/epx/hosted/callback

EPX Callback (Failure):
  ├─ Captures decline reason
  ├─ Display error message to user
  └─ Allow retry with different payment method
```

#### Phase 4: RECORD (Backend Processing)
**File**: `server/routes/epx-hosted-routes.ts`

```
POST /api/epx/hosted/callback Handler:

1. Validation & Extraction:
   ├─ Extract AUTH_GUID from multiple possible payload locations
   ├─ Verify authenticity via certification logger
   └─ Log to epx_payment_logger (JSONL format)

2. Payment Record Creation:
   ├─ Query or create `payments` table record:
   │   ├─ member_id (from session)
   │   ├─ transaction_id (EPX transaction ID)
   │   ├─ amount (payment amount)
   │   ├─ currency ('USD')
   │   ├─ status ('succeeded' or 'failed')
   │   ├─ payment_method_type (CreditCard or ACH)
   │   ├─ epx_auth_guid_encrypted (encrypted AUTH_GUID)
   │   ├─ created_at (payment timestamp)
   │   └─ updated_at (current timestamp)
   └─ Log payment capture event

3. Token Generation & Storage:
   ├─ Decrypt AUTH_GUID for handling
   ├─ Store in `payment_tokens` table:
   │   ├─ bric_token (encrypted AUTH_GUID)
   │   ├─ member_id (FK)
   │   ├─ payment_method_type (CreditCard/ACH)
   │   ├─ card_last_four or bank_account_last_four
   │   ├─ card_type, expiry_month, expiry_year (card only)
   │   ├─ bank_routing_number, bank_account_type (ACH only)
   │   ├─ is_active (true)
   │   ├─ is_primary (true)
   │   └─ created_at
   └─ Update members table:
       ├─ payment_token = BRIC token reference
       ├─ payment_method_type = CreditCard/ACH
       └─ status = pending_activation

4. Commission Payout Creation:
   ├─ Query ALL commissions for member (direct + override types)
   ├─ For each commission, create `commission_payouts` record:
   │   ├─ commission_id (FK to agent_commissions)
   │   ├─ payout_month (current month, first day)
   │   ├─ payment_captured_at (current timestamp)
   │   ├─ payment_eligible_date (Friday after week payment captured)
   │   ├─ payout_amount (commission amount)
   │   ├─ commission_type (direct or override)
   │   ├─ override_for_agent_id (if override type)
   │   ├─ member_payment_id (FK to payments)
   │   ├─ epx_transaction_id (for tracking)
   │   ├─ status ('ineligible' - within 14-day grace period)
   │   └─ created_at
   └─ Log commission payout creation

5. Email Notifications:
   ├─ Enrollment Confirmation → Member
   ├─ Payment Confirmation → Member
   ├─ Commission Notification → Agent
   └─ Admin Alerts (if applicable)
```

#### Phase 5: ACTIVATION (Background Job)
**File**: `server/services/membership-activation-service.ts`

```
Daily Cron Job: activatePendingMemberships()

Trigger:
  └─ Runs daily (typically morning)

Process:
  ├─ Query members with status = 'pending_activation'
  ├─ For each member:
  │   ├─ Check if membership_start_date <= TODAY
  │   ├─ If eligible:
  │   │   ├─ Update status → 'active'
  │   │   ├─ Set is_active → true
  │   │   ├─ Set updated_at → now
  │   │   ├─ Log activation event
  │   │   └─ Send welcome email
  │   └─ If not eligible:
  │       └─ Log daysUntilStart for monitoring
  └─ Return activation stats (activated count, errors)
```

### Payment Statuses Through Lifecycle

| Status | Table | Location | Meaning | Next Step |
|--------|-------|----------|---------|-----------|
| `pending_checkout` | members | Signup | Pre-payment | EPX checkout |
| `pending_activation` | members | Payment recorded | Awaiting start date | Start date arrives |
| `active` | members | Activation complete | Membership live | Recurring charges begin |
| `archived` | members | Admin action | Historical member | No charges |
| `cancelled` | members | Member request | Cancelled | No more charges |
| `pending` | commission_payouts | Payment captured | Awaiting eligible date | Grace period ends |
| `ineligible` | commission_payouts | Grace period | Can't pay yet (clawback risk) | Grace period ends |
| `approved` | payments | EPX approved | Credit card approved | Process for commission |
| `declined` | payments | EPX declined | Payment failed | Retry or fallback |
| `succeeded` | payments | Completed | Payment captured | Commission payout |
| `failed` | payments | Manual mark | Admin failure mark | Admin review |

---

## SECTION 3 — Billing Related Components

### Billing Database Tables

#### MEMBERS Table
**Primary table for member data**

```sql
Column Name          | Type              | Purpose
─────────────────────┼──────────────────┼────────────────────────────────
id                   | INT (PK)          | Primary key
customer_number      | VARCHAR(24)       | Public customer ID
member_public_id     | VARCHAR(24)       | External reference (unique)
first_name           | VARCHAR           | Member first name
last_name            | VARCHAR           | Member last name
email                | VARCHAR (unique)  | Contact email
date_of_birth        | CHAR(8)           | Format: MMDDYYYY (8 digits)
phone                | CHAR(10)          | Formatted to 10 digits only
ssn                  | VARCHAR (encrypted) | Encrypted with AES-256-CBC
total_monthly_price  | DECIMAL(10,2)     | Plan cost (recurring amount)
plan_price           | DECIMAL(10,2)     | Base plan price
discount_codes       | JSONB             | Applied discount codes
plan_id              | INT               | Selected plan reference
membership_start_date| TIMESTAMP         | When membership activates
enrollment_date      | TIMESTAMP         | When member signed up
status               | VARCHAR           | pending_checkout, pending_activation, active, archived, cancelled
is_active            | BOOLEAN           | Membership active flag
payment_token        | VARCHAR (encrypted)| BRIC token for recurring
payment_method_type  | VARCHAR           | CreditCard or ACH
bank_routing_number  | VARCHAR(9)        | ABA routing number (ACH only)
bank_account_number  | VARCHAR (encrypted)| Bank account number (ACH only)
bank_account_type    | VARCHAR           | 'Checking' or 'Savings' (ACH only)
bank_account_holder_name | VARCHAR       | Name on bank account
bank_account_last_four   | VARCHAR(4)   | Last 4 of account (display only)
agent_number         | VARCHAR           | Referring agent ID
agent_id             | VARCHAR           | Referring agent UUID
created_at           | TIMESTAMP         | Record creation time
updated_at           | TIMESTAMP         | Last update time
```

#### PAYMENTS Table
**Tracks individual payment transactions**

```sql
Column Name          | Type              | Purpose
─────────────────────┼──────────────────┼────────────────────────────────
id                   | INT (PK)          | Primary key
member_id            | INT (FK)          | FK to members
transaction_id       | VARCHAR (unique)  | EPX transaction ID (for lookup)
epx_transaction_id   | VARCHAR (unique)  | Same as transaction_id
amount               | DECIMAL(10,2)     | Payment amount
currency             | VARCHAR           | 'USD'
status               | VARCHAR           | pending, succeeded, failed, declined
payment_method_type  | VARCHAR           | CreditCard or ACH
epx_auth_guid_encrypted | VARCHAR        | Stored AUTH_GUID token (encrypted)
created_at           | TIMESTAMP         | When payment captured
updated_at           | TIMESTAMP         | Last update
```

#### PAYMENT_TOKENS Table
**Secure storage for recurring payment tokens (BRIC from EPX)**

```sql
Column Name          | Type              | Purpose
─────────────────────┼──────────────────┼────────────────────────────────
id                   | INT (PK)          | Primary key
member_id            | INT (FK)          | FK to members (cascade delete)
bric_token           | VARCHAR (unique, encrypted) | EPX BRIC token
payment_method_type  | VARCHAR           | CreditCard or ACH
card_last_four       | VARCHAR(4)        | Visual identifier (not encrypted)
card_type            | VARCHAR           | Visa, Mastercard, Amex, Discover
expiry_month         | VARCHAR(2)        | MM format (card only)
expiry_year          | VARCHAR(4)        | YYYY format (card only)
original_network_trans_id | VARCHAR      | Original auth code (critical for recurring)
bank_routing_number  | VARCHAR(9)        | ABA routing number (ACH only)
bank_account_last_four | VARCHAR(4)     | Last 4 of account (ACH only)
bank_account_type    | VARCHAR           | Checking or Savings (ACH only)
bank_name            | VARCHAR           | Bank name (derived from routing)
is_active            | BOOLEAN           | Token is active
is_primary           | BOOLEAN           | Default token for charges
created_at           | TIMESTAMP         | Record creation
last_used_at         | TIMESTAMP         | Last charge timestamp
expires_at           | TIMESTAMP         | Token expiry (if applicable)
```

#### BILLING_SCHEDULE Table
**Tracks recurring billing configuration**

```sql
Column Name          | Type              | Purpose
─────────────────────┼──────────────────┼────────────────────────────────
id                   | INT (PK)          | Primary key
member_id            | INT (FK)          | FK to members (cascade delete)
payment_token_id     | INT (FK)          | FK to payment_tokens (restrict delete)
amount               | DECIMAL(10,2)     | Recurring amount
frequency            | VARCHAR           | monthly, quarterly, annual
next_billing_date    | TIMESTAMP         | When next charge scheduled
last_billing_date    | TIMESTAMP         | Last charge attempt
last_successful_billing | TIMESTAMP      | Last successful charge
status               | VARCHAR           | active, paused, cancelled
failure_count        | INT               | Consecutive failure count
created_at           | TIMESTAMP         | Record creation
updated_at           | TIMESTAMP         | Last update
```

### Monthly Recurring Charge Process

```
Week 1: Member charged by EPX Server Post API
  ├─ EPX submits recurring transaction request
  ├─ Uses BRIC token from payment_tokens table
  ├─ Backend receives callback with transaction confirmation
  └─ Status: 'succeeded'

Callback Handler:
  ├─ Mark payments record status → 'succeeded'
  ├─ Extract transaction timestamp (payment_captured_at)
  └─ Create commission_payouts records

Grace Period: 14 Days post-capture
  ├─ Commission payout status: 'ineligible'
  ├─ Purpose: Allow clawback if member cancels
  ├─ No payment processing during this window
  └─ Prevents fraud: Payment must clear before commission

Week 2 (Friday after payment week):
  ├─ Calculate payment_eligible_date
  │   └─ = Friday following the payment's week (Mon-Sun)
  ├─ Update commission_payouts status → 'pending'
  └─ Now eligible for weekly batch processing

Weekly Batch (Friday EOD):
  ├─ Query commission_payouts WHERE:
  │   ├─ status = 'pending'
  │   ├─ payment_eligible_date <= TODAY
  │   └─ member.is_active = true
  ├─ Group by agent_id
  ├─ Calculate total commissions per agent
  ├─ Generate weekly payment batch
  ├─ Mark payouts: status → 'paid', paid_date → now
  └─ Create batch_id for week (e.g., "2026-02-28")
```

---

## SECTION 4 — Token Related Components

### Token Lifecycle

#### Initial Token Creation

```
1. Member pays via EPX Hosted Checkout
   ├─ EPX form captures card/ACH details
   ├─ EPX performs network tokenization
   └─ Returns AUTH_GUID

2. AUTH_GUID encrypted and stored
   ├─ Location: payment_tokens.bric_token
   ├─ Encryption: AES-256-CBC
   ├─ Format: iv_hex:encrypted_hex
   └─ Key: ENCRYPTION_KEY environment variable

3. Members table updated
   ├─ member.payment_token = payment_token.id (FK)
   ├─ member.payment_method_type = CreditCard/ACH
   └─ member.status = pending_activation
```

#### Token Storage & Security

**Encryption Implementation** (in `storage.ts`)

```typescript
// Encryption
function encryptPaymentToken(token: string): string {
  const iv = crypto.randomBytes(16);
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex'); // 32 bytes
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

// Decryption
function decryptPaymentToken(encryptedToken: string): string {
  const parts = encryptedToken.split(':');
  const iv = Buffer.from(parts.shift()!, 'hex');
  const encrypted = parts.join(':');
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex'); // 32 bytes
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

#### Token Usage - Recurring Charges

**EPX Server Post API Call**

```
When next_billing_date arrives:
  ├─ Query billing_schedule WHERE next_billing_date <= TODAY
  ├─ For each schedule:
  │   ├─ Fetch payment_token (call decryptPaymentToken to get BRIC)
  │   ├─ Build EPX Server Post request with:
  │   │   ├─ BRIC token (decrypted AUTH_GUID)
  │   │   ├─ amount (from billing_schedule)
  │   │   ├─ member_id, email
  │   │   └─ original_network_trans_id (critical!)
  │   └─ Submit to EPX API
  └─ Process response (success/failure)

Critical Field: original_network_trans_id
  ├─ Tracks authorization from original payment
  ├─ Prevents duplicate charges on same auth
  ├─ Stored in payment_tokens table
  └─ Required by EPX for recurring eligibility
```

#### Token Display & Security

**What's Encrypted (Never displayed)**:
- `payment_tokens.bric_token` (the actual AUTH_GUID)
- `members.payment_token` (reference to BRIC token)
- `members.bank_account_number` (for ACH)

**What's Unencrypted (Display-only)**:
- `payment_tokens.card_last_four` (last 4 digits)
- `payment_tokens.bank_account_last_four` (last 4 digits)
- `payment_tokens.card_type` (Visa, Mastercard, etc.)
- `payment_tokens.expiry_month`, `.expiry_year` (MM/YYYY)
- `payment_tokens.bank_name` (derived from routing)

**In Member Dashboard**:
- Display: "•••• 4242 (Visa)" or "••••4567 (Checking at Chase)"
- Never display: Full card numbers, BRIC tokens, account numbers

#### Token Security Standards

**Encryption Standards**
- Algorithm: AES-256-CBC (Advanced Encryption Standard, 256-bit key)
- Key Size: 256-bit (32 bytes)
- Initialization Vector (IV): Random 16 bytes per record
- Storage Format: `iv_hex:encrypted_hex`
- Key Source: `ENCRYPTION_KEY` environment variable

**Compliance Logging** (File: `services/certification-logger.ts`)

```typescript
Log Events (NOT token values):
  ├─ Purpose: 'billing-update-request', 'payment-capture', 'enrollment'
  ├─ Masked auth GUIDs: First 8 chars only (e.g., "auth_g..." + "****")
  ├─ Timestamp: When event occurred
  ├─ User: Who triggered it
  ├─ Reason: Why (from member/agent)
  └─ No sensitive data in logs

Purpose:
  ├─ Audit trail for compliance
  ├─ PCI DSS requirement (never log full PANs/tokens)
  ├─ Support troubleshooting without exposing secrets
  └─ Admin visibility without security risk
```

**Card Data Masking** (File: `utils/epx-metadata.ts`)

```typescript
masking Rules:
  ├─ AccountNumber, CardNumber, PAN → "****" + last4
  ├─ CVV, CVV2 → "***"
  ├─ ExpirationDate, ExpDate → "****"
  └─ Recurse into nested objects

Usage:
  ├─ Before logging payment requests
  ├─ Before logging EPX responses
  └─ Prevents accidental PAN disclosure in logs
```

---

## SECTION 5 — Background Processing Components

### Scheduled Jobs & Services

#### 1. Membership Activation Scheduler

**File**: `server/services/membership-activation-service.ts`

```
Service: activatePendingMemberships()

Registration in index.ts:
  └─ Runs continuously with daily checks

Trigger Logic:
  ├─ Runs at startup
  ├─ Then repeats every 24 hours
  └─ Or can be manually invoked

Process:
  ├─ Query: members WHERE status = 'pending_activation'
  ├─ For each member:
  │   ├─ Parse membership_start_date from database
  │   ├─ Compare to TODAY
  │   ├─ If membership_start_date <= TODAY:
  │   │   ├─ Update members SET status = 'active', is_active = true
  │   │   ├─ Set updated_at = NOW()
  │   │   ├─ Log "[Membership Activation] ✅ Activated member {id}"
  │   │   └─ Send welcome email (TODO: function uncommented)
  │   └─ Else:
  │       ├─ Calculate daysUntil
  │       └─ Log "[Membership Activation] Not yet ready ({daysUntil} days)"
  └─ Return { activated: count, errors: count }

Output:
  ├─ Logs to console/STDOUT
  ├─ Timing: "[Membership Activation] Completed in {duration}ms"
  └─ Stats: "{activated} activated, {errors} errors"
```

#### 2. Weekly Recap Service

**File**: `server/services/weekly-recap-service.ts`

```
Service: WeeklyRecapService.scheduleWeeklyRecap()

Schedule:
  ├─ First run: Next Monday at 9:00 AM
  ├─ Recurring: Every Monday at 9:00 AM
  └─ Duration: ~1-5 seconds

Data Collection:
  ├─ Previous week date range calculation
  ├─ Query getAllEnrollments(startDate, endDate)
  ├─ Parse enrollment records:
  │   ├─ firstName, lastName, email
  │   ├─ planName, subscriptionAmount
  │   ├─ agentName (if applicable)
  │   ├─ commissionAmount
  │   └─ createdAt
  └─ Build WeeklyRecapData object

Calculations:
  ├─ totalEnrollments = record count
  ├─ totalRevenue = SUM(subscriptionAmount)
  ├─ newMembers array (with plan, amount, agent)
  ├─ agentPerformance:
  │   ├─ GROUP BY agentName
  │   ├─ COUNT enrollments per agent
  │   └─ SUM commissions per agent
  └─ planBreakdown:
      ├─ GROUP BY planName
      ├─ COUNT enrollments per plan
      └─ SUM revenue per plan

Output:
  ├─ Email sent to admin distribution list
  ├─ Subject: "Weekly Recap: {weekOf} enrollments & commission summary"
  ├─ Content: Formatted HTML with:
  │   ├─ New members table
  │   ├─ Agent performance rankings
  │   ├─ Plan breakdown chart
  │   └─ Total revenue & enrollment count
  └─ Error handling: Logs but doesn't fail if email fails
```

#### 3. Commission Payment Eligibility

**File**: `server/services/commission-payout-service.ts`

```
Triggered By: Payment capture via EPX callback

Function: createPayoutsForMemberPayment(memberId, memberPaymentId, epxTransactionId, paymentCapturedAt)

When called:
  ├─ Query agent_commissions WHERE:
  │   ├─ member_id = memberId
  │   ├─ status IN ('pending', 'active')
  │   └─ commission_type IN ('direct', 'override')
  ├─ For each commission found:
  │   ├─ Calculate payoutMonth = DATE_TRUNC('month', paymentCapturedAt)
  │   ├─ Calculate paymentEligibleDate:
  │   │   ├─ Start: DATE_TRUNC('week', paymentCapturedAt + 1 day)
  │   │   ├─ End: + 11 days
  │   │   └─ = Friday following capture week
  │   ├─ Check if payout already exists:
  │   │   ├─ Query WHERE commission_id = ? AND payout_month = ?
  │   │   └─ If exists, skip (idempotent)
  │   ├─ Determine status:
  │   │   ├─ If now >= paymentEligibleDate: status = 'pending'
  │   │   └─ Else: status = 'ineligible'
  │   └─ INSERT into commission_payouts:
  │       ├─ commission_id
  │       ├─ payout_month
  │       ├─ payment_captured_at
  │       ├─ payment_eligible_date
  │       ├─ payout_amount (from commission)
  │       ├─ commission_type (direct or override)
  │       ├─ override_for_agent_id (if override)
  │       ├─ member_payment_id
  │       ├─ epx_transaction_id
  │       ├─ status
  │       └─ notes: "Direct commission" or "Override commission"
  └─ Return { direct: [payouts], override: [payouts] }

14-Day Grace Period:
  ├─ Purpose: Clawback protection
  ├─ If member cancels within 14 days, payout can be cancelled
  ├─ After 14 days: Payment irreversible
  └─ Prevents fraud & protects agents from chargeback risk
```

#### 4. Weekly Commission Batch Processing

**File**: `routes/payment-reconciliation.ts` (manual triggers) + background job

```
Trigger: Friday EOD (manual or automatic)

Query:
  ├─ SELECT * FROM commission_payouts WHERE
  │   ├─ status = 'pending'
  │   ├─ payment_eligible_date <= TODAY
  │   ├─ (optional) agent_id IN (active_agents)
  │   └─ (optional) batch_id IS NULL
  └─ GROUP BY agent_id

Processing:
  ├─ For each agent in result set:
  │   ├─ Calculate totalCommissions = SUM(payout_amount)
  │   ├─ Generate batch_id = DATE.toISOString().split('T')[0]
  │   │   (e.g., "2026-02-28" for Friday batch)
  │   └─ For each payout in agent's batch:
  │       ├─ UPDATE commission_payouts SET
  │       │   ├─ status = 'paid'
  │       │   ├─ paid_date = NOW()
  │       │   └─ batch_id = generated_batch_id
  │       └─ Log "[Batch] Paid {payout.id} → {agent_id}"
  ├─ Log batch summary:
  │   ├─ "Batch {batch_id}: {agentCount} agents, ${totalPaid}"
  │   └─ Timestamp: When batch ran
  └─ Return batch result

Weekly Batch Query (Reconciliation endpoint):
  └─ GET /api/admin/reconciliation/eligible-payouts
      ├─ Shows all pending eligible payouts
      ├─ Grouped by agent
      ├─ Ready for manual processing
      └─ Admin can review before finalizing
```

#### 5. Payment Reconciliation & Diagnostics

**File**: `routes/payment-reconciliation.ts`

```
Endpoint: GET /api/admin/reconciliation/missing-payments

Purpose: Find members with no payment records
  ├─ Detects broken enrollment flows
  ├─ Where commission was created but payment wasn't tracked
  ├─ Indicates missing payment capture or callback failure

Query:
  ├─ SELECT members WHERE
  │   ├─ total_monthly_price > 0 (enrolled)
  │   ├─ NOT EXISTS (SELECT 1 FROM payments WHERE member_id = members.id)
  │   └─ status IN ('active', 'pending_activation', 'archived')
  └─ Include:
      ├─ member_id, customer_number, name, email
      ├─ total_monthly_price (monthly revenue at risk)
      ├─ payment_count (should be > 0, but is 0)
      ├─ commission_count (shows commission was created)
      └─ enrollment_date, membership_start_date

Response:
  ├─ count: Total members with missing payments
  ├─ totalMissingRevenue: Sum of monthly prices
  ├─ members: Array of affected members
  └─ metadata: { severity: 'CRITICAL', queryDate }
```

```
Endpoint: GET /api/admin/reconciliation/missing-tokens

Purpose: Find payments without BRIC tokens
  ├─ These members can't be charged recurring
  ├─ Must retry token capture or use fallback

Query:
  ├─ SELECT members WHERE
  │   ├─ EXISTS (SELECT 1 FROM payments WHERE member_id = members.id)
  │   ├─ payment_token IS NULL
  │   └─ payment_method_type IS NULL
  └─ Include:
      ├─ member_id, customer_number, name, email
      ├─ payment_id, transaction_id (incomplete)
      ├─ payment_amount, status
      └─ last_payment_date

Response:
  ├─ count: Members needing token recovery
  ├─ members: Array of incomplete payments
  └─ metadata: Recovery instructions
```

#### 6. Payment Tracking & Monitoring

**File**: `routes/payment-tracking.ts`

```
Endpoint: GET /api/admin/payments/recent?limit=50&status=succeeded

Purpose: Monitor recent payment activity
  ├─ Last 50-200 payments (configurable)
  ├─ Optional filter by status
  └─ Admin dashboard display

Response: Array of payment records with member details:
  ├─ member_id, customer_number, first_name, last_name, email
  ├─ transaction_id, amount, status
  ├─ payment_method_type (CreditCard/ACH)
  ├─ created_at (payment timestamp)
  └─ Last 4 (from payment_tokens FK)
```

```
Endpoint: GET /api/admin/payments/member/:memberId

Purpose: Payment history for specific member
  ├─ All past & pending payments
  ├─ Ordered by created_at DESC
  └─ Include member details (name, email, customer number)

Response: Array of all payments for member
  ├─ Complete payment records
  ├─ Timestamps & status progression
  └─ Total count
```

```
Endpoint: GET /api/admin/payments/failed?limit=100

Purpose: Find failed/pending payments requiring attention
  ├─ Payments with status IN ('failed', 'declined', 'pending')
  ├─ Oldest first (most urgent)
  └─ Up to 500 records

Response: Array of problem payments
  ├─ member_id, name, email
  ├─ transaction_id, amount
  ├─ failure_reason/message
  ├─ created_at (how long pending)
  └─ Links to member detail for recovery
```

### Commission Calculation Engine

**File**: `server/commissionCalculator.ts`

```typescript
Commission Rate Table:

Coverage Type               | Rate
────────────────────────────┼──────
RX_VALET                    | 30%
MEDICARE_ADVANTAGE          | 15%
MEDICARE_SUPPLEMENT         | 15%
LIS (Low Income Subsidy)    | 10%
ACA                         | 10%
Other                       | 5% (fallback)

Function: calculateCommission(amount, coverageType, agentTier)

Input:
  ├─ amount (base_premium or plan_price)
  ├─ coverageType (aca, medicare_advantage, medicare_supplement, lis, rx_valet, other)
  └─ agentTier (optional, for override)

Output:
  ├─ commission_amount (dollar amount)
  ├─ commission_percentage (rate applied)
  ├─ base_premium (original amount)
  └─ storage record updates

Example:
  Input: amount=$100/month, coverageType='RX_VALET'
  Output: commission_amount=$30 (30% of $100)
```

**Performance Goal Overrides**

```
Table: agent_performance_goals

Fields:
  ├─ agent_id (UUID, PK)
  ├─ plan_tier (e.g., 'platinum', 'gold', 'silver')
  ├─ goal_target_amount (e.g., $500/month target)
  ├─ goal_override_rate (e.g., 0.35 for 35% commission)
  ├─ updated_at (last override date)
  ├─ updated_by (admin who set it)
  └─ RLS: Protected by agent_id

Logic:
  ├─ Check if override exists for agent + plan_tier
  ├─ If exists: Use goal_override_rate instead of base rate
  ├─ Calculate commission using override percentage
  └─ Provides incentives for high performers
```

### Logging & Error Handling

**Structured Logging Format** (File: `services/epx-payment-logger.ts`)

```json
Format: JSONL (JSON Lines)

Example Log Entry:
{
  "level": "info",
  "timestamp": "2026-03-18T14:32:45.123Z",
  "context": "[EPX Payment]",
  "message": "Payment captured successfully",
  "memberId": 12345,
  "transactionId": "epx_trans_abc123",
  "amount": 99.99,
  "status": "approved",
  "cardLast4": "4242",
  "authGuid": "auth_g****" (masked)
}

Log Levels:
  ├─ error: Declined, validation failure, timeout
  ├─ warn: Ambiguous field value, missing optional data
  ├─ info: Successful transactions, callbacks received
  └─ debug: Full request/response (production masked)

Storage:
  ├─ Directory: EPX_LOG_DIR environment variable
  ├─ Default: ./logs/epx/
  ├─ Format: epx-payments-{date}.jsonl (daily rotation)
  └─ Retention: Configure per deployment
```

**Payment Diagnostics Routes** (development/support use)

```
Endpoint: GET /api/debug/payments (all payments)
Endpoint: GET /api/debug/recent-payments (recent 100)
Endpoint: GET /api/epx/recent-logs (recent EPX logs)

Status: Typically DISABLED in production
  ├─ Requires isAtLeastAdmin() authentication
  ├─ Logs contain masked sensitive data
  └─ For support troubleshooting only
```

---

## Database Relationship Map

```
┌──────────────────────────────────────────────────────────┐
│                      MEMBERS (Core)                      │
│  ┌────────────────────────────────────────────────────┐  │
│  │ id (PK)                                            │  │
│  │ customer_number, member_public_id                  │  │
│  │ personal_info (name, DOB, SSN, phone)              │  │
│  │ status (pending_activation → active → archived)    │  │
│  │ membership_start_date, enrollment_date             │  │
│  │ total_monthly_price (plan cost)                    │  │
│  │ payment_token (FK→payment_tokens)                  │  │
│  │ agent_id, agent_number (referring agent)           │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
                            ↓ (1:∞)
        ┌───────────────────┼───────────────────┐
        ↓                   ↓                   ↓

    PAYMENTS         PAYMENT_TOKENS      AGENT_COMMISSIONS
  ┌────────────┐   ┌────────────────┐   ┌────────────────┐
  │ id         │   │ id             │   │ id             │
  │ member_id(FK) │ member_id(FK)   │   │ member_id(FK)  │
  │ amount     │   │ bric_token     │   │ agent_id       │
  │ status     │   │ card_last_four │   │ commission_amt │
  │ trans_id   │   │ is_primary     │   │ status (active)│
  │ created_at │   │ created_at     │   │ created_at     │
  └────────────┘   └────────────────┘   └────────────────┘
        ↓                                       ↓ (1:∞)
        │
        └──→ COMMISSION_PAYOUTS (1:∞)
             ┌──────────────────────┐
             │ id                   │
             │ commission_id(FK)    │
             │ member_payment_id(FK)│
             │ payout_month         │
             │ payment_captured_at  │
             │ payment_eligible_date│
             │ status (ineligible→pending→paid)
             │ batch_id (weekly)    │
             └──────────────────────┘
        
BILLING_SCHEDULE (1:∞)
  ┌──────────────────┐
  │ member_id (FK)   │
  │ payment_token_id │
  │ amount           │
  │ frequency        │
  │ next_billing_date│
  │ status (active)  │
  └──────────────────┘

GROUP_MEMBERS (optional FK)
  ├─ group_id (FK→groups)
  └─ member_id (FK→members, optional)

ADMIN_LOGS
  ├─ member_id (optional FK)
  ├─ action (what changed)
  ├─ by_user (who changed it)
  └─ timestamp
```

---

## Key Environment Dependencies

### Database Configuration
```
DATABASE_URL=postgresql://user:password@host:5432/dbname
SUPABASE_URL=https://[project].supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Payment Processing (EPX)
```
EPX_ENVIRONMENT=sandbox (or production)
EPX_TERMINAL_PROFILE_ID=72c78991-a7c5-4540-a4c8-4523e1981576
EPX_PUBLIC_KEY=eyAidGVybWluYWxQcm9maWxlSWQiOiAi... (base64)
EPX_MAC_KEY=your_mac_key_from_epx (used for HMAC signing)
EPX_LOG_DIR=./logs/epx (payment transaction logs)
```

### Encryption
```
ENCRYPTION_KEY=hex_string_64_chars (for AES-256)
  ├─ Generated with: crypto.randomBytes(32).toString('hex')
  └─ Must be 64 hex characters (32 bytes)
```

### Fraud Detection
```
RECAPTCHA_SECRET_KEY=your_secret_key (from Google Console)
RECAPTCHA_SITE_KEY=your_site_key (frontend config)
RECAPTCHA_SCORE_THRESHOLD=0.5 (0.0-1.0, higher = stricter)
```

### Email Service (SendGrid)
```
SENDGRID_API_KEY=SG.your_api_key...
SENDGRID_FROM_EMAIL=noreply@getmydpc.com
SUPPORT_EMAIL=support@getmydpc.com
ADMIN_NOTIFICATION_EMAILS=admin1@example.com,admin2@example.com (comma-separated)
LEAD_NOTIFICATION_EMAILS=leads@example.com
```

### Application Configuration
```
FRONTEND_URL=https://enrollment.getmydpc.com (or http://localhost:5173 dev)
PORT=8080 (DigitalOcean App Platform sets this)
NODE_ENV=production (or development)
FULL_ACCESS_EMAILS=owner@example.com,ops@example.com (admin whitelist)
ENABLE_CERTIFICATION_LOGGING=true (payment compliance logging)
```

### Neon DB (Dashboard Reporting)
```
NEON_DATABASE_URL=postgresql://... (optional, for reporting layer)
  └─ Used for pre-computed dashboard queries
```

---

## Quick Reference: File Locations

| Component | File Location | Purpose |
|-----------|---------------|---------|
| **Enrollment Flow** | `client/src/pages/EnrollmentFlow.tsx` | Frontend form |
| **EPX Hosted Checkout** | `server/routes/epx-hosted-routes.ts` | Payment callback handler |
| **Payment Recording** | `server/routes/payments.ts` | Payment admin endpoints |
| **Payment Service** | `server/services/payment-service.ts` | Mock payment provider |
| **EPX Integration** | `server/services/epx-payment-service.ts` | Recurring billing |
| **EPX Checkout Service** | `server/services/epx-hosted-checkout-service.ts` | Checkout config |
| **Membership Activation** | `server/services/membership-activation-service.ts` | Daily activation job |
| **Commission Calculation** | `server/commissionCalculator.ts` | Rate computation |
| **Commission Payouts** | `server/services/commission-payout-service.ts` | Monthly payout tracking |
| **Weekly Recap** | `server/services/weekly-recap-service.ts` | Admin digests |
| **Token Storage** | `server/storage.ts` | Encryption/decryption utils |
| **Payment Logger** | `server/services/epx-payment-logger.ts` | JSONL logging |
| **Compliance Logging** | `server/services/certification-logger.ts` | Audit trail |
| **Payment Tracking** | `server/routes/payment-tracking.ts` | Admin monitoring |
| **Reconciliation** | `server/routes/payment-reconciliation.ts` | Missing data detection |
| **ACH Support** | `migrations/20260218_add_ach_payment_support.sql` | ACH schema |
| **Commission Payouts Schema** | `migrations/20260220_create_commission_payouts.sql` | Monthly tracking |
| **Encryption Migration** | `migrations/20260221_encrypt_existing_ssns.sql` | Data protection |

---

## Summary

This production enrollment platform implements:

✅ **Multi-stage payment processing** with EPX Hosted Checkout  
✅ **Recurring monthly subscriptions** with BRIC token storage (encrypted)  
✅ **14-day grace period** for clawback protection  
✅ **Weekly commission batching** based on payment eligible dates  
✅ **Direct & override commissions** for agent downlines  
✅ **Complete audit logging** with JSONL format  
✅ **ACH & CreditCard support** for diverse member preferences  
✅ **Automated membership activation** based on start dates  
✅ **Admin reconciliation tools** for missing payments/tokens  
✅ **PCI DSS compliance** via encryption and masked logging  

All payment tokens are AES-256-CBC encrypted, transaction logs are structured JSONL, and database access is protected via Row-Level Security policies.
