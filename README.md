# DPC Enrollment Platform

**Production-ready DPC (Direct Primary Care) enrollment platform** with split-deployment architecture, integrated payment processing, and automated commission tracking.

## 🔗 Quick Links

- **Live Site:** https://enrollment.getmydpc.com
- **Backend API:** DigitalOcean App Platform
- **Database:** Supabase PostgreSQL
- **Repository:** https://github.com/Bdkelp/getmydpc_enrollment

## 📋 Tech Stack

### Frontend (DigitalOcean Static App)
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **Routing**: Wouter (lightweight React Router alternative)
- **State Management**: TanStack Query (React Query) + Zustand
- **Forms**: React Hook Form + Zod validation
- **UI Components**: Shadcn/ui + Tailwind CSS
- **Authentication**: Supabase Auth (client)

### Backend (DigitalOcean)
- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **Build**: esbuild (fast TypeScript compilation)
- **ORM**: Drizzle (schema only - queries use direct SQL)
- **Authentication**: Supabase Auth (JWT verification)
- **Logging**: Custom structured JSONL logger

### Database & Services
- **Primary Database**: Supabase PostgreSQL
- **Authentication**: Supabase Auth
- **Payment Processing**: EPX Hosted Checkout (Google reCAPTCHA v3)
- **Email**: SendGrid
- **File Storage**: Local filesystem (logs)

## 🏗️ Architecture Overview

### Deployment Pattern (Split Architecture)
```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (DigitalOcean Static App)                         │
│  ├─ React App (enrollment.getmydpc.com)                     │
│  ├─ Static Assets served from DigitalOcean build            │
│  └─ API calls → DigitalOcean backend base URL               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Backend (DigitalOcean App Platform)                        │
│  ├─ Express API                                             │
│  ├─ EPX Payment Integration + reCAPTCHA v3                  │
│  ├─ Commission Calculator                                   │
│  └─ Structured Logging                                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Supabase                                                   │
│  ├─ PostgreSQL (users, members, leads, payments)            │
│  ├─ Auth (JWT tokens, user management)                      │
│  └─ Row Level Security (RLS policies)                       │
└─────────────────────────────────────────────────────────────┘
```

### Critical Architecture Rules
1. **Never assume same-origin**: Frontend and backend are separate deployments
2. **All API calls**: Use `client/src/lib/apiClient.ts` with `API_BASE_URL`
3. **Database queries**: Always use `server/storage.ts` functions (NOT direct Drizzle ORM)
4. **CORS**: Production origins configured in `server/index.ts`
5. **Authentication**: JWT tokens from Supabase Auth, verified server-side

## Development Setup

### Prerequisites

- Node.js 18+ and npm
- Git
- Code editor (VS Code recommended)
- DigitalOcean CLI (optional, for backend debugging)

### Initial Setup

```bash
# Clone repository
git clone https://github.com/Bdkelp/getmydpc_enrollment.git
cd getmydpc_enrollment

# Install root dependencies (backend)
npm install

# Install frontend dependencies
cd client
npm install
cd ..
```

### Environment Configuration

#### Backend (DigitalOcean)

Create `.env` in project root:

```env
# Database
DATABASE_URL=postgresql://postgres.[project]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
SUPABASE_URL=https://[project].supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...

# EPX Payment Processing
EPX_TERMINAL_PROFILE_ID=b1561c80-e81d-453f-9d05-a264dc96b88d
EPX_PUBLIC_KEY=eyAidGVybWluYWxQcm9maWxlSWQiOiAiYjE1NjFjODAtZTgxZC00NTNmLTlkMDUtYTI2NGRjOTZiODhkIiB9
EPX_MAC_KEY=[from EPX]
EPX_ENVIRONMENT=sandbox

# Google reCAPTCHA v3 (Required by EPX)
RECAPTCHA_SECRET_KEY=[from Google Console]
RECAPTCHA_SCORE_THRESHOLD=0.5
EPX_LOG_DIR=./logs/epx

# Email (SendGrid)
SENDGRID_API_KEY=[from SendGrid]
FROM_EMAIL=noreply@getmydpc.com

# Application
FRONTEND_URL=http://localhost:5173
PORT=3000
NODE_ENV=development

# Role overrides (comma-separated allow list of emails that should have full admin visibility)
FULL_ACCESS_EMAILS=owner@example.com,ops@example.com
```

#### Frontend (DigitalOcean Static App)

Create `client/.env`:

```env
VITE_API_URL=http://localhost:3000
VITE_SUPABASE_URL=https://[project].supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbG...
VITE_RECAPTCHA_SITE_KEY=6LflwiQgAAAAAC8yO38mzv-g9a9QiR91Bw4y62ww
```

`FULL_ACCESS_EMAILS` lets you keep a user's stored role as `admin` while still granting full super-admin permissions at runtime. List the emails that should always have unrestricted access, separated by commas. The backend elevates those accounts automatically during authentication.

### Running Locally

```bash
# Development (runs both frontend and backend concurrently)
npm run dev

# Backend only (port 3000)
npm run dev:server

# Frontend only (port 5173)
cd client
npm run dev
```

### Database Migrations

```bash
# Push schema changes to Supabase
npm run db:push

# Generate migration files (optional)
npm run db:generate
```

### Building for Production

```bash
# Build both frontend and backend
npm run build:all

# Build backend only
npm run build

# Build frontend only
npm run build:client

# Test production build locally
npm run start
```

## 📖 How the Application Works

### User Journey Overview

#### 1. Public User (No Authentication)

```
┌─────────────────────────────────────────────────────────────┐
│ LANDING PAGE (/)                                            │
│ ├─ Hero section with DPC benefits                          │
│ ├─ Plan comparison table                                   │
│ ├─ Lead capture form (optional - for interested visitors)  │
│ └─ "Enroll Now" CTA button                                 │
└─────────────────────────────────────────────────────────────┘
                            ↓ Click "Enroll Now"
┌─────────────────────────────────────────────────────────────┐
│ REGISTRATION FORM (Multi-Step Wizard)                       │
│                                                             │
│ Step 1: Personal Information                                │
│ ├─ First Name, Last Name, Email                            │
│ ├─ Phone Number, Date of Birth                             │
│ └─ Gender, Marital Status                                   │
│                                                             │
│ Step 2: Address Information                                 │
│ ├─ Street Address, City, State, ZIP                        │
│ └─ Billing Address (option to use same)                    │
│                                                             │
│ Step 3: Plan Selection                                      │
│ ├─ Choose DPC plan (Individual/Family)                     │
│ ├─ Review pricing                                           │
│ ├─ Optional: Add dependents (family plans)                 │
│ └─ Agent Code (if referred by agent)                       │
│                                                             │
│ Data stored in sessionStorage during flow                   │
└─────────────────────────────────────────────────────────────┘
                            ↓ Click "Continue to Payment"
┌─────────────────────────────────────────────────────────────┐
│ PAYMENT PAGE (/payment)                                     │
│                                                             │
│ 1. Retrieves enrollment data from sessionStorage           │
│ 2. Displays order summary                                   │
│ 3. EPXHostedPayment component loads                        │
│    ├─ Loads Google reCAPTCHA v3 script                     │
│    ├─ Executes grecaptcha.execute('hosted_checkout')       │
│    ├─ Stores token in component state                      │
│    └─ Calls backend: POST /api/epx/hosted/create-payment   │
│                                                             │
│ 4. Backend response includes:                               │
│    ├─ Transaction ID (order number)                         │
│    ├─ EPX Public Key                                        │
│    ├─ EPX script URL (post.js)                             │
│    └─ Session configuration                                 │
│                                                             │
│ 5. EPX form displays (hosted by EPX):                      │
│    ├─ Card Number input                                    │
│    ├─ Expiry Date (MMYY)                                   │
│    ├─ CVV                                                  │
│    ├─ Billing Name                                         │
│    └─ Billing Address (pre-filled or editable)            │
└─────────────────────────────────────────────────────────────┘
                            ↓ User clicks "Process Payment"
┌─────────────────────────────────────────────────────────────┐
│ EPX PROCESSING (External)                                   │
│ ├─ EPX validates reCAPTCHA token                           │
│ ├─ EPX processes card payment                              │
│ ├─ EPX approves or declines transaction                    │
│ └─ EPX calls backend: POST /api/epx/hosted/callback        │
└─────────────────────────────────────────────────────────────┘
                            ↓ Payment Approved
┌─────────────────────────────────────────────────────────────┐
│ BACKEND PROCESSING (/api/epx/hosted/callback)              │
│                                                             │
│ 1. Verify callback signature (security)                     │
│ 2. Update payment status to 'completed'                     │
│ 3. Create member record in database:                        │
│    ├─ member_id (UUID)                                     │
│    ├─ Personal information from enrollment                 │
│    ├─ Plan details (plan_id, is_family)                   │
│    └─ enrolled_by_agent_id (if agent code provided)       │
│                                                             │
│ 4. Calculate agent commission:                              │
│    ├─ Use commissionCalculator.ts                          │
│    ├─ Determine rate based on plan type                    │
│    └─ Create commission record (status='pending_capture')  │
│                                                             │
│ 5. Mark commission payment captured:                        │
│    ├─ 14-day grace period starts                           │
│    └─ Commission becomes payable after grace period        │
│                                                             │
│ 6. Log all events to EPX logger (JSONL)                    │
│ 7. Send confirmation email (SendGrid)                       │
└─────────────────────────────────────────────────────────────┘
                            ↓ Success callback fires
┌─────────────────────────────────────────────────────────────┐
│ CONFIRMATION PAGE (/confirmation)                           │
│ ├─ Success message                                          │
│ ├─ Transaction ID display                                   │
│ ├─ Next steps instructions                                  │
│ └─ Contact information                                      │
└─────────────────────────────────────────────────────────────┘
```

#### 2. Agent User Journey

```
┌─────────────────────────────────────────────────────────────┐
│ LOGIN PAGE (/login)                                         │
│ ├─ Email + Password form                                    │
│ └─ Submits to: POST /api/auth/login                        │
└─────────────────────────────────────────────────────────────┘
                            ↓ Supabase Auth verifies
┌─────────────────────────────────────────────────────────────┐
│ AGENT DASHBOARD (/agent-dashboard)                          │
│                                                             │
│ Tabs:                                                       │
│ ├─ Leads                                                    │
│ │  ├─ View assigned leads (GET /api/leads)                 │
│ │  ├─ Create new lead (POST /api/leads)                    │
│ │  └─ Update lead status (PUT /api/leads/:id)              │
│ │                                                           │
│ ├─ Enrollments                                              │
│ │  ├─ View enrollments by agent (GET /api/enrollments)     │
│ │  ├─ Filter by date, status, plan                         │
│ │  └─ Export to CSV (future)                               │
│ │                                                           │
│ ├─ Commissions                                              │
│ │  ├─ View commission history (GET /api/commissions)       │
│ │  ├─ Filter by status (pending, paid)                     │
│ │  ├─ See payout dates                                     │
│ │  └─ Total earnings summary                               │
│ │                                                           │
│ └─ Profile                                                  │
│    ├─ Agent information (agent_number, upline)             │
│    └─ Edit profile settings                                │
└─────────────────────────────────────────────────────────────┘
```

#### 3. Admin User Journey

```
┌─────────────────────────────────────────────────────────────┐
│ ADMIN DASHBOARD (/admin-dashboard)                          │
│                                                             │
│ Tabs:                                                       │
│ ├─ Users                                                    │
│ │  ├─ View all users (GET /api/users)                      │
│ │  ├─ Approve/reject agents (PUT /api/users/:id/approve)   │
│ │  ├─ Change roles (admin, agent, user)                    │
│ │  └─ Deactivate accounts                                  │
│ │                                                           │
│ ├─ Members                                                  │
│ │  ├─ View all enrollments (GET /api/members)              │
│ │  ├─ Search by name, email, plan                          │
│ │  ├─ View payment history                                 │
│ │  └─ Export member data                                   │
│ │                                                           │
│ ├─ Commissions                                              │
│ │  ├─ View all commissions (GET /api/commissions/all)      │
│ │  ├─ Approve payouts                                      │
│ │  ├─ Commission reports by date range                     │
│ │  └─ Export payout statements                             │
│ │                                                           │
│ ├─ Reports                                                  │
│ │  ├─ Revenue dashboard                                    │
│ │  ├─ Agent performance metrics                            │
│ │  ├─ Lead conversion funnel                               │
│ │  └─ Custom report builder (future)                       │
│ │                                                           │
│ └─ EPX Logs                                                 │
│    ├─ View recent payment logs (GET /api/epx/logs/recent)  │
│    ├─ Filter by phase (create-payment, callback, etc.)     │
│    ├─ Export logs for EPX certification                    │
│    └─ Download JSONL files                                 │
└─────────────────────────────────────────────────────────────┘
```

### Backend Request Flow (Technical)

#### Authentication Flow

```typescript
// 1. User submits login credentials
POST /api/auth/login
Body: { email: "agent@example.com", password: "password123" }

// 2. Backend validates with Supabase Auth
const { data, error } = await supabase.auth.signInWithPassword({ email, password });

// 3. Backend retrieves user from database
const dbUser = await storage.getUser(data.user.id);

// 4. Backend returns JWT token + user data
Response: {
  user: { id, email, firstName, lastName, role },
  session: { access_token, refresh_token },
  dbUser: { ...userDetails }
}

// 5. Frontend stores token in localStorage
localStorage.setItem('supabase.auth.token', session.access_token);

// 6. Subsequent requests include token in Authorization header
GET /api/enrollments
Headers: { Authorization: "Bearer eyJhbGciOiJIUzI1..." }

// 7. Backend middleware verifies token
async function authenticateToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  const { data: { user } } = await supabase.auth.getUser(token);
  req.user = user; // Attach to request
  next();
}
```

#### Payment Processing Flow (Detailed)

```typescript
// 1. Frontend creates payment session
POST /api/epx/hosted/create-payment
Body: {
  amount: 95.00,
  customerId: "member-uuid-123",
  customerEmail: "user@example.com",
  customerName: "John Doe",
  planId: "individual-monthly",
  captchaToken: "03AGdBq2..." // reCAPTCHA v3 token
}

// 2. Backend verifies reCAPTCHA
const result = await verifyRecaptcha(captchaToken, 'hosted_checkout');
if (!result.success || result.score < 0.5) {
  return res.status(400).json({ error: 'Captcha verification failed' });
}

// 3. Backend creates EPX session
const orderNumber = Date.now().toString().slice(-10);
const sessionResponse = hostedCheckoutService.createCheckoutSession(
  amount, orderNumber, customerEmail, customerName, billingAddress
);

// 4. Backend creates payment record (status='pending')
await storage.createPayment({
  memberId: customerId,
  amount: amount.toString(),
  status: 'pending',
  transactionId: orderNumber,
  metadata: { planId, customerEmail }
});

// 5. Backend logs event
logEPX({ level: 'info', phase: 'create-payment', message: 'Session created', data: { orderNumber } });

// 6. Backend returns session config
Response: {
  success: true,
  transactionId: orderNumber,
  publicKey: "eyAidGVybWluYWxQcm9maWxlSWQi...",
  scriptUrl: "https://hosted.epxuap.com/post.js",
  environment: "sandbox"
}

// 7. Frontend loads EPX script and displays form
<script src="https://hosted.epxuap.com/post.js"></script>
<form id="EpxCheckoutForm">
  <input name="PAN" />
  <input name="Expire" />
  <input name="CVV" />
  <input type="hidden" name="PublicKey" value="..." />
  <input type="hidden" name="Captcha" value="03AGdBq2..." />
</form>

// 8. User submits payment via EPX
window.Epx.sendPost(); // Calls EPX servers directly

// 9. EPX processes payment and calls callback
POST /api/epx/hosted/callback
Body: {
  status: "approved",
  transactionId: "1234567890",
  authCode: "AUTH123",
  amount: 95.00
}

// 10. Backend updates payment status
await storage.updatePayment(payment.id, {
  status: 'completed',
  authorizationCode: 'AUTH123'
});

// 11. Backend creates member record
const member = await storage.createMember({
  email: customerEmail,
  firstName, lastName,
  plan_id: planId,
  enrolled_by_agent_id: agentId
});

// 12. Backend calculates commission
const commissionAmount = calculateCommission(planId, memberType, isFamily);
await storage.createCommission({
  agent_id: agentId,
  member_id: member.id,
  amount: commissionAmount,
  status: 'pending_capture'
});

// 13. Backend marks commission payment captured (14-day grace period starts)
await storage.markCommissionPaymentCaptured(member.id, orderNumber, orderNumber);

// 14. Frontend redirects to confirmation
window.location.href = `/confirmation?transaction=${orderNumber}&amount=95.00`;
```

### EPX Certification Toolkit

Use the admin-only endpoint `POST /api/epx/certification/server-post` (authenticate with your Supabase token) to generate the `requestPayload` and `rawResponse/responseFields` samples EPX requires. The payload supports:

- `tranType`: `CCE1`, `CCE2`, `V`, or `R` (sale, MIT, void, refund)
- `paymentTransactionId` or `transactionId`: optional pointers to an existing payment so the service can reuse its amount/AUTH_GUID
- `authGuid`, `memberId`, `amount`, `description`, `aciExt`, `cardEntryMethod`, `industryType`: optional overrides

Each call returns the exact `request.fields`, `request.payload`, `response.fields`, and `response.raw` values for submission, and the certification logger also stores the entry for later export.

### Database Schema Relationships

```
users (agents/admins)
├── id (UUID, primary key)
├── email (unique)
├── role (super_admin, admin, agent)
├── agent_number (MPP0001, MPP0002, etc.)
├── upline_id (FK to users.id) ───┐
└── [other fields]                 │
                                   │ Agent Hierarchy
members (DPC enrollees)            │
├── id (UUID, primary key)         │
├── email                          │
├── plan_id (FK to plans.id)       │
├── enrolled_by_agent_id ──────────┘ Refers to agent
└── [other fields]

payments
├── id (UUID, primary key)
├── member_id (FK to members.id) ─────┐ Billing/plan management
├── user_id (FK to users.id) ─────────┤ Agent commission tracking
├── transaction_id (EPX transaction)  │
├── status (pending, completed)       │
└── [other fields]                    │
                                      │
agent_commissions                     │
├── id (UUID, primary key)            │
├── agent_id (FK to users.id) ────────┘
├── member_id (FK to members.id) ─────┘
├── enrollment_id (reference)
├── amount (commission $)
├── status (pending_capture, pending_payout, paid)
├── payment_captured_date
├── payout_eligible_date (payment_captured_date + 14 days)
└── payout_date (when paid)

leads
├── id (UUID, primary key)
├── email
├── assigned_agent_id (FK to users.id)
├── status (new, contacted, converted, lost)
└── [other fields]
```

## 🚧 Known Issues & Work In Progress

### Active Development

#### ✅ Recently Completed

- [x] EPX Hosted Checkout integration
- [x] Google reCAPTCHA v3 implementation (client + server)
- [x] Structured JSONL logging system for EPX payments
- [x] Server-side reCAPTCHA token verification
- [x] Split-deployment architecture (DigitalOcean App Platform static + API services)
- [x] Commission calculation system
- [x] Agent hierarchy support
- [x] Role-based access control (RBAC)

#### 🔄 In Progress (Not Yet Complete)

##### 1. **Frontend reCAPTCHA Token Transmission**

**Status**: Client generates token, but not yet passed to backend in create-payment request

**What's Done**:

- ✅ Client-side reCAPTCHA script loading
- ✅ Token acquisition via `grecaptcha.execute()`
- ✅ Server-side verification function ready

**What's Needed**:

```typescript
// In client/src/components/EPXHostedPayment.tsx
// Add captchaToken to the request body when calling create-payment endpoint
const response = await apiClient.post('/api/epx/hosted/create-payment', {
  amount,
  customerId,
  customerEmail,
  // ... other fields ...
  captchaToken: captchaToken  // ⬅️ ADD THIS
});
```

**Impact**: Currently server logs warning but allows payment (fail-open behavior)

##### 2. **EPX Domain Whitelisting**

**Status**: reCAPTCHA implemented but domain not yet whitelisted by EPX

**What's Needed**:

- [ ] Obtain DigitalOcean static IP address for EPX whitelisting
- [ ] Provide domain to EPX: `enrollment.getmydpc.com`
- [ ] Confirm EPX adds domain to reCAPTCHA whitelist
- [ ] Test in production environment

**DigitalOcean Setup Tasks**:

```bash
# If using DigitalOcean Droplet:
# 1. Create Droplet with reserved/floating IP
# 2. Configure DNS A record: enrollment.getmydpc.com → IP
# 3. Set up SSL certificate (Let's Encrypt)
# 4. Configure firewall (allow 80/443, restrict others)
# 5. Get IP: dig +short enrollment.getmydpc.com
# 6. Send IP + domain to EPX for whitelisting
```

**DigitalOcean App Platform outbound IP helper**:

```bash
# Get the outbound IP used by the running app
curl https://getmydpc-enrollment-gjk6m.ondigitalocean.app/api/check-ip
# Share this IP with EPX when refreshing ACL rules
```

##### 3. **EPX Server Post API Integration**

**Status**: Server Post MIT flow active; legacy Recurring Billing API code removed per EPX guidance.

**Files**:

- `server/routes/epx-hosted-routes.ts` – hosted checkout callbacks plus `/api/epx/test-recurring` MIT admin tooling
- `server/routes/finalize-registration.ts` – saves BRIC tokens + metadata needed for downstream MIT pulls
- `server/services/epx-payment-service.ts` – low-level Server Post client + logging helpers

**Notes**:

- `/api/epx/test-recurring` (admin only) now generates MIT request/response samples for certification.
- Hosted Checkout still handles the first payment; subsequent billing is performed through explicit MIT submissions (manual or scripted) using stored AUTH_GUID tokens.

##### 4. **Commission Payout Automation**

**Status**: Commission calculation complete; payout workflow manual

**Current State**:

- ✅ Commission calculated on enrollment
- ✅ 14-day grace period tracked
- ✅ Dashboard shows pending commissions
- ⏳ Admin must manually mark as paid

**Planned Enhancement**:

- Automated payout eligibility detection
- Integration with payment processor for agent payouts
- Automated email notifications to agents
- Payout history and statements

##### 5. **Email Verification Flow**

**Status**: SendGrid configured, verification URL generated, but flow incomplete

**Current Behavior**:

- Users can register without verifying email
- Verification email sent but not required for access

**Needed**:

- Enforce email verification before first login
- Resend verification email functionality
- Email verification success/error pages
- Update RLS policies to check `email_verified` field

##### 6. **Agent Downline/Upline Management**

**Status**: Schema supports hierarchy but UI incomplete

**Database Ready**:

- `users.upline_id` field exists
- Storage functions handle hierarchy

**UI Needed**:

- Agent can view their downline agents
- Commission splits for upline/downline
- Recruitment tracking
- Multi-level commission calculations

#### 🐛 Known Issues

##### High Priority

1. **Enrollment Visibility**
   - **Issue**: Some enrollments not appearing in agent dashboard immediately
   - **Root Cause**: `is_active` filter removed; may need different query optimization
   - **Workaround**: Enrollments eventually appear; check database directly if urgent
   - **Fix Planned**: Add real-time refresh or webhook from payment callback

2. **TypeScript Warnings in EPX Server Post**
   - **Issue**: `epx-routes.ts` has TypeScript compilation warnings
   - **Impact**: Build succeeds but logs warnings
   - **Workaround**: Warnings ignored; Server Post currently disabled
   - **Fix Planned**: Refactor service to match new logging pattern

##### Medium Priority

3. **Session Storage Persistence**
   - **Issue**: Enrollment data lost if user refreshes during payment flow
   - **Impact**: User must restart enrollment if browser refreshed
   - **Workaround**: Warn users not to refresh page
   - **Fix Planned**: Save partial enrollments to database with status='incomplete'

4. **Commission Report Export**
   - **Issue**: No CSV export for commission reports
   - **Impact**: Admins must manually copy data for accounting
   - **Fix Planned**: Add export button to admin dashboard

5. **Role Change Requires Re-login**
   - **Issue**: If admin changes user role, user must log out and back in
   - **Impact**: JWT token not refreshed automatically
   - **Fix Planned**: Implement token refresh endpoint or force logout on role change

##### Low Priority

6. **Mobile Responsiveness**
   - **Issue**: Some admin tables not fully responsive on mobile
   - **Impact**: Admins typically use desktop; minor inconvenience
   - **Fix Planned**: Improve table layouts for small screens

7. **Payment Form Validation**
   - **Issue**: EPX validates card, but no client-side validation before submission
   - **Impact**: User sees EPX error after submission
   - **Fix Planned**: Add Luhn algorithm validation, expiry date checks

## 🎯 Planned Upgrades & Roadmap

### Q1 2026

#### Phase 1: Complete reCAPTCHA Integration

- [ ] Add `captchaToken` to frontend create-payment request
- [ ] Obtain DigitalOcean static IP for EPX domain whitelisting
- [ ] Submit domain to EPX for whitelisting
- [ ] Test production payments with real reCAPTCHA
- [ ] Produce sample request/response for EPX certification

#### Phase 2: Enhanced Logging & Monitoring

- [ ] Add Server Post API logging to EPX logger
- [ ] Implement log rotation/archival for large files
- [ ] Add Prometheus metrics export (optional)
- [ ] Set up error alerting (email/Slack on payment failures)
- [ ] Create admin log viewer UI (replace direct file access)

#### Phase 3: Payment & Enrollment Improvements

- [ ] Save partial enrollments to database (prevent data loss on refresh)
- [ ] Add enrollment resume functionality
- [ ] Implement payment retry logic for failed transactions
- [ ] Add refund workflow for admins
- [ ] Create member portal (view enrollment, update payment method)

### Q2 2026

#### Phase 4: Commission System Enhancements

- [ ] Automated payout processing integration
- [ ] Multi-level commission splits (upline/downline)
- [ ] Commission statement generation (PDF)
- [ ] Agent recruitment dashboard
- [ ] Commission forecasting and analytics

#### Phase 5: Reporting & Analytics

- [ ] Custom report builder for admins
- [ ] CSV/Excel export for all data tables
- [ ] Revenue dashboard with charts
- [ ] Agent performance metrics
- [ ] Lead conversion funnel analytics

#### Phase 6: Security & Compliance

- [ ] Enforce email verification before login
- [ ] Add two-factor authentication (2FA) for admins
- [ ] Implement audit log for all data changes
- [ ] Add HIPAA compliance documentation
- [ ] Penetration testing and security audit

### Future Considerations

- **SMS Notifications**: Twilio integration for enrollment confirmations
- **CRM Integration**: Sync with HubSpot/Salesforce
- **Mobile App**: React Native app for agents
- **API Access**: RESTful API for third-party integrations
- **White-Label**: Multi-tenant support for other DPC providers
- **International**: Multi-currency and localization support

## 🔐 User Roles & Access Control

| Role | Access Level | Permissions |
|------|-------------|-------------|
| `super_admin` | Full Platform | All admin + agent functions, system config, user management |
| `admin` | Management | User approval, data viewing, reporting, commission oversight |
| `agent` | Sales & Leads | Lead creation, commission viewing, enrollment tracking |
| Members | None | Payment-only interaction (no login required) |

### Role Assignment

- **Admins**: `michael@mypremierplans.com`, `travis@mypremierplans.com`, etc.
- **Agents**: Assigned during user creation; receive agent number (MPP0001, MPP0002, etc.)
- **Members**: Created during enrollment flow; no authentication

## 💳 Payment Processing (EPX Hosted Checkout)

### Integration Overview

- **Provider**: EPX (Electronic Payment Exchange)
- **Method**: Hosted Checkout (EPX-hosted payment form)
- **Security**: Google reCAPTCHA v3 bot protection
- **Environment**: Sandbox (testing) / Production
- **Compliance**: PCI DSS Level 1 (EPX handles card data)

### Payment Flow

```mermaid
User Registration → EPX Hosted Checkout → reCAPTCHA v3 → Payment → Callback → Member Creation → Commission Calculation
```

1. User completes enrollment form (client-side)
2. Frontend acquires reCAPTCHA v3 token via `grecaptcha.execute()`
3. Frontend sends token + payment details to backend `/api/epx/hosted/create-payment`
4. Backend verifies reCAPTCHA token server-side
5. Backend creates EPX session and returns form config
6. User enters card details in EPX-hosted form
7. EPX processes payment and calls `/api/epx/hosted/callback`
8. Backend creates member record and calculates agent commission
9. User redirected to confirmation page

### Google reCAPTCHA v3

- **Site Key** (client): `6LflwiQgAAAAAC8yO38mzv-g9a9QiR91Bw4y62ww` (EPX-provided)
- **Secret Key** (server): Set in `RECAPTCHA_SECRET_KEY` env variable
- **Score Threshold**: 0.5 (configurable via `RECAPTCHA_SCORE_THRESHOLD`)
- **Action**: `hosted_checkout`
- **Domain Whitelist**: `enrollment.getmydpc.com` (production) + localhost (dev)

### EPX Configuration Files

- `server/services/epx-hosted-checkout-service.ts`: Main integration service
- `server/routes/epx-hosted-routes.ts`: API endpoints + reCAPTCHA verification
- `client/src/components/EPXHostedPayment.tsx`: Payment form component
- `server/utils/recaptcha.ts`: Shared reCAPTCHA verification utility
- `server/services/epx-payment-logger.ts`: Structured JSONL logging

### EPX Logging System

**Purpose**: Capture request/response samples for EPX certification and debugging

**Features**:

- Structured JSONL format (one JSON object per line)
- Phases: `create-payment`, `callback`, `recaptcha`, `status`, `server-post`
- In-memory buffer (200 recent events)
- Daily file rotation: `logs/epx/epx-YYYY-MM-DD.jsonl`
- Recent logs API: `GET /api/epx/logs/recent?limit=50`

**Log Event Structure**:

```json
{
  "timestamp": "2025-11-25T10:30:45.123Z",
  "level": "info",
  "phase": "create-payment",
  "message": "Payment session created",
  "data": { "transactionId": "1234567890", "amount": 95.00 }
}
```

## 📊 Database Architecture

### Dual Database Pattern

- **Supabase Auth**: User authentication, JWT tokens
- **Supabase PostgreSQL**: All business data (users, members, leads, payments, commissions)
- **Connection**: Direct SQL via `neonDb.ts` (NOT Drizzle ORM queries)

### Key Tables

#### `users` (Agents/Admins)

- Authentication-enabled accounts
- Fields: `id`, `email`, `firstName`, `lastName`, `role`, `agent_number`, `upline_id`
- Role-based access control

#### `members` (DPC Enrollees)

- No authentication (payment-only)
- Fields: `id`, `email`, `firstName`, `lastName`, `plan_id`, `enrolled_by_agent_id`
- Linked to payments and subscriptions

#### `leads`

- Pre-enrollment contact forms
- Fields: `id`, `email`, `firstName`, `lastName`, `phone`, `assigned_agent_id`, `status`

#### `payments`

- Transaction records
- Fields: `id`, `member_id`, `user_id`, `amount`, `status`, `transaction_id`, `metadata`
- `member_id`: Billing/plan management
- `user_id`: Agent commission tracking

#### `agent_commissions`

- Commission tracking and payouts
- Fields: `id`, `agent_id`, `member_id`, `enrollment_id`, `amount`, `status`, `payout_date`
- 14-day grace period before payout eligibility

### Schema Files

- **Definitions**: `shared/schema.ts` (Drizzle ORM types only)
- **Queries**: `server/storage.ts` (direct SQL - NEVER use Drizzle queries)
- **Migrations**: `npm run db:push` (Drizzle Kit)

**⚠️ CRITICAL**: Always use `storage.ts` functions for database operations. Direct Drizzle ORM queries cause TypeScript issues.

## 🚀 Deployment

### Continuous Deployment (Auto)

DigitalOcean App Platform handles both the backend service and the static frontend bundle on every push to `main`.

1. Push to `main` branch
2. DigitalOcean rebuilds the project (backend via `npm run build`, frontend via `npm run build:client`)
3. Health check: `GET https://getmydpc-enrollment-gjk6m.ondigitalocean.app/api/health`
4. Static assets served at `https://enrollment.getmydpc.com`

**Backend Build Command**: `npm run build` (esbuild)  
**Backend Start Command**: `npm start` or `node dist/index.js`  
**Frontend Output Directory**: `client/dist`  
**Port**: Provided by DigitalOcean App Platform via `PORT`

### Manual Deployment

```bash
# Trigger a new deployment
doctl apps create-deployment <app-id>

# Inspect status/logs
doctl apps list
doctl apps logs <app-id>
```

### Pre-Deployment Checklist

- [ ] All environment variables set in DigitalOcean App Platform
- [ ] Database migrations applied (`npm run db:push`)
- [ ] EPX credentials configured and tested
- [ ] reCAPTCHA secret key and site key configured
- [ ] SendGrid API key set for email notifications
- [ ] CORS origins include production domains
- [ ] Run production cleanup: `.\cleanup_for_production.ps1` (if script exists)
- [ ] Test health endpoints: `/api/health` (backend)
- [ ] Verify payments in EPX sandbox before production switch

### Health Monitoring

**Backend Health Check**:

```bash
curl https://your-digitalocean-app.ondigitalocean.app/api/health
```

Expected response:

```json
{
  "status": "healthy",
  "timestamp": "2025-11-25T10:30:45.123Z",
  "uptime": 123456,
  "environment": "production"
}
```

## 📁 Project Structure & File Guide

```plaintext
getmydpc_enrollment/
├── client/                          # Frontend (React + Vite) - Built and served via DigitalOcean
│   ├── src/
│   │   ├── components/             # Reusable UI components
│   │   │   ├── ui/                # Shadcn/ui base components (Button, Input, etc.)
│   │   │   ├── EPXHostedPayment.tsx   # 💳 Payment form with reCAPTCHA v3
│   │   │   ├── MemberRegistrationForm.tsx  # Multi-step enrollment wizard
│   │   │   ├── LeadForm.tsx       # Public lead capture form
│   │   │   └── ProtectedRoute.tsx # Auth guard for protected pages
│   │   ├── pages/                 # Route components (Wouter router)
│   │   │   ├── landing.tsx        # 🏠 Public homepage (no auth)
│   │   │   ├── payment.tsx        # 💰 Payment flow (member + agent data)
│   │   │   ├── confirmation.tsx   # ✅ Post-payment success page
│   │   │   ├── admin-dashboard.tsx   # 👨‍💼 Admin view (user mgmt, reports)
│   │   │   ├── agent-dashboard.tsx   # 👤 Agent view (leads, commissions)
│   │   │   ├── login.tsx          # 🔐 Authentication page
│   │   │   └── register.tsx       # 📝 New agent registration
│   │   ├── lib/                   # Utilities and API client
│   │   │   ├── apiClient.ts       # 🔌 Axios wrapper for DigitalOcean backend
│   │   │   ├── utils.ts           # Helper functions (formatting, validation)
│   │   │   └── queryClient.ts     # TanStack Query configuration
│   │   ├── hooks/                 # Custom React hooks
│   │   │   ├── use-auth.ts        # Authentication state management
│   │   │   ├── use-toast.ts       # Toast notification hook
│   │   │   └── use-enrollment.ts  # Enrollment flow state
│   │   ├── assets/                # Images, icons, static files
│   │   ├── App.tsx                # Main app component (routing setup)
│   │   ├── main.tsx               # Entry point (React.render)
│   │   └── index.css              # Global Tailwind styles
│   ├── public/                    # Static assets served by Vite
│   │   └── avatars/              # User profile images
│   ├── vite.config.ts            # Vite build config (path aliases, plugins)
│   ├── tailwind.config.cjs       # Tailwind CSS theme customization
│   ├── tsconfig.json             # TypeScript config (strict mode)
│   └── package.json              # Frontend dependencies
│
├── server/                         # Backend (Express + TypeScript) - Deployed to DigitalOcean
│   ├── routes/                    # API endpoints (all prefixed with /api)
│   │   ├── epx-hosted-routes.ts  # 💳 EPX Hosted Checkout + reCAPTCHA
│   │   │                         # POST /api/epx/hosted/create-payment
│   │   │                         # POST /api/epx/hosted/callback
│   │   │                         # GET  /api/epx/logs/recent
│   │   ├── admin-database.ts     # 👨‍💼 Admin data management endpoints
│   │   ├── admin-logs.ts         # 📊 Admin logging and audit trails
│   │   ├── supabase-auth.ts      # 🔐 Authentication routes
│   │   │                         # POST /api/auth/login
│   │   │                         # POST /api/auth/register
│   │   │                         # POST /api/auth/logout
│   │   │                         # GET  /api/auth/me
│   │   └── dev-utilities.ts      # 🛠️ Development helper endpoints
│   ├── services/                  # Business logic layer
│   │   ├── epx-hosted-checkout-service.ts  # EPX payment integration
│   │   ├── epx-payment-logger.ts          # 📝 Structured JSONL logging
│   │   ├── commission-service.ts          # Commission calculation engine
│   │   └── email.ts              # SendGrid email notifications
│   ├── auth/                      # Authentication & authorization
│   │   ├── supabaseAuth.ts       # JWT verification middleware (authenticateToken)
│   │   └── authService.ts        # Auth helper functions
│   ├── lib/                       # Database connections
│   │   ├── supabaseClient.ts     # Supabase client initialization
│   │   └── neonDb.ts             # PostgreSQL connection (connects to Supabase)
│   ├── utils/                     # Shared utilities
│   │   └── recaptcha.ts          # 🤖 reCAPTCHA v3 server-side verification
│   ├── middleware/                # Express middleware
│   │   └── permissions.ts        # Role-based access control (RBAC)
│   ├── index.ts                   # 🚀 Express app entry point + CORS config
│   ├── routes.ts                  # 🛣️ Main API route aggregator
│   ├── storage.ts                 # 🗄️ Database query functions (USE THIS, NOT Drizzle!)
│   ├── commissionCalculator.ts   # 💰 Commission rates and calculations
│   ├── db.ts                      # Drizzle ORM connection (schema only)
│   ├── vite.ts                    # Vite dev server integration
│   └── package.json              # Backend dependencies
│
├── shared/                         # Shared TypeScript types (used by both client/server)
│   ├── schema.ts                  # Drizzle ORM schema definitions
│   └── clean-commission-schema.ts # Commission-specific types
│
├── logs/                           # Application logs (gitignored)
│   └── epx/                       # EPX payment logs (JSONL format)
│       └── epx-2025-11-25.jsonl  # Daily rotating log files
│
├── migrations/                     # Drizzle database migrations (SQL)
│   └── 0000_initial_schema.sql
│
├── .github/                        # GitHub configuration
│   └── copilot-instructions.md   # AI coding agent instructions
│
├── package.json                    # Root dependencies (backend + scripts)
├── tsconfig.json                   # Root TypeScript config
├── client.tsconfig.json            # Client-specific TS config
├── .env                            # Environment variables (gitignored)
├── .gitignore                      # Git ignore rules
└── README.md                       # 📖 This file
```

### 🔍 Where to Find Key Functionality

#### 🏠 Landing Page & Public Forms

- **Landing Page**: `client/src/pages/landing.tsx`
- **Lead Form**: `client/src/components/LeadForm.tsx`
- **API Endpoint**: `/api/public/leads` (handled by `server/routes.ts`)

#### 🔐 Authentication Flow

1. **Login Page**: `client/src/pages/login.tsx`
2. **Auth Hook**: `client/src/hooks/use-auth.ts`
3. **Backend Routes**: `server/routes/supabase-auth.ts`
4. **Middleware**: `server/auth/supabaseAuth.ts` (`authenticateToken` function)
5. **Protected Routes**: `client/src/components/ProtectedRoute.tsx`

#### 💳 Payment & Enrollment Flow

1. **Registration Form**: `client/src/components/MemberRegistrationForm.tsx`
   - Multi-step wizard (personal info → address → plan selection)
   - Stores data in sessionStorage during flow
2. **Payment Page**: `client/src/pages/payment.tsx`
   - Retrieves enrollment data from sessionStorage
   - Passes to EPXHostedPayment component
3. **Payment Component**: `client/src/components/EPXHostedPayment.tsx`
   - Loads Google reCAPTCHA v3 script
   - Acquires token via `grecaptcha.execute()`
   - Submits to EPX via `Epx.sendPost()`
4. **Backend Payment Creation**: `server/routes/epx-hosted-routes.ts`
   - POST `/api/epx/hosted/create-payment`
   - Verifies reCAPTCHA token server-side
   - Creates payment record in database
5. **EPX Callback**: `server/routes/epx-hosted-routes.ts`
   - POST `/api/epx/hosted/callback`
   - Updates payment status
   - Creates member record
   - Calculates agent commission
6. **Confirmation**: `client/src/pages/confirmation.tsx`
   - Displays success message with transaction details

#### 👨‍💼 Admin Dashboard

- **Frontend**: `client/src/pages/admin-dashboard.tsx`
- **Backend Routes**: `server/routes/admin-database.ts`, `server/routes/admin-logs.ts`
- **Features**:
  - User management (approve/reject agents)
  - View all enrollments
  - Commission reports
  - System logs
  - EPX payment logs

#### 👤 Agent Dashboard

- **Frontend**: `client/src/pages/agent-dashboard.tsx`
- **Backend Routes**: `server/routes.ts` (agent-specific endpoints)
- **Features**:
  - View assigned leads
  - Commission tracking
  - Personal enrollments
  - Downline management (if applicable)

#### 💰 Commission System

1. **Calculator**: `server/commissionCalculator.ts`
   - `calculateCommission(planName, memberType, isFamily)`
   - Returns commission amount based on plan type
2. **Service**: `server/services/commission-service.ts`
   - Commission payout processing
   - 14-day grace period logic
3. **Database**: `agent_commissions` table
   - Fields: agent_id, member_id, amount, status, payout_date
4. **Tracking**: `server/storage.ts`
   - `markCommissionPaymentCaptured()` - records payment capture
   - Commission becomes eligible for payout 14 days after capture

#### 🗄️ Database Operations

**⚠️ CRITICAL**: Always use `server/storage.ts` functions, NEVER direct Drizzle queries!

```typescript
// ✅ CORRECT
import { storage } from './storage';
const members = await storage.getAllMembers();
const user = await storage.getUser(userId);

// ❌ WRONG - Will cause TypeScript issues
import { db } from './db';
const members = await db.select().from(members); // DON'T DO THIS
```

**Key Storage Functions**:

- **Users**: `createUser()`, `getUser()`, `getUserByEmail()`, `updateUser()`
- **Members**: `createMember()`, `getAllMembers()`, `getMember()`, `updateMember()`
- **Leads**: `createLead()`, `getLeads()`, `updateLead()`, `assignLeadToAgent()`
- **Payments**: `createPayment()`, `getPaymentByTransactionId()`, `updatePayment()`
- **Commissions**: `createCommission()`, `getCommissionsByAgent()`, `markCommissionPaymentCaptured()`

#### 📊 Logging System

**EPX Payment Logging**:

- **Service**: `server/services/epx-payment-logger.ts`
- **Function**: `logEPX({ level, phase, message, data })`
- **Phases**: `create-payment`, `callback`, `recaptcha`, `status`, `server-post`
- **Storage**: `logs/epx/epx-YYYY-MM-DD.jsonl` (daily rotation)
- **API**: GET `/api/epx/logs/recent?limit=50` (recent logs for debugging)

**Log Structure**:

```json
{
  "timestamp": "2025-11-25T10:30:45.123Z",
  "level": "info",
  "phase": "create-payment",
  "message": "Payment session created",
  "data": { "transactionId": "1234567890", "amount": 95.00 }
}
```

#### 🔄 Data Flow Examples

**New Enrollment (End-to-End)**:

```
1. User fills MemberRegistrationForm → Data saved to sessionStorage
2. User clicks "Continue to Payment" → Redirects to /payment
3. Payment page loads → Retrieves data from sessionStorage
4. EPXHostedPayment component:
   - Loads reCAPTCHA script
   - Executes grecaptcha to get token
   - POSTs to /api/epx/hosted/create-payment (includes token)
5. Backend verifies reCAPTCHA → Creates payment record → Returns EPX config
6. User enters card details → EPX processes payment
7. EPX calls /api/epx/hosted/callback → Backend:
   - Updates payment status to 'completed'
   - Creates member record in database
   - Calculates agent commission
   - Creates commission record
8. User redirected to /confirmation → Success message displayed
```

**Agent Commission Tracking**:

```
1. Payment captured → storage.markCommissionPaymentCaptured()
2. Commission record created with status='pending_capture'
3. After 14 days → Commission eligible for payout (status='pending_payout')
4. Admin approves → Commission paid (status='paid', payout_date set)
5. Agent views in dashboard → Commission appears in earnings
```

## 🔧 Common Development Tasks

### Database Operations

```bash
# Push schema changes to Supabase
npm run db:push

# Generate migration files
npm run db:generate

# Check Supabase connection
npm run check:supabase
```

### Testing EPX Integration

```bash
# View recent EPX logs
curl http://localhost:3000/api/epx/logs/recent?limit=20

# Check EPX service health
curl http://localhost:3000/api/epx/hosted/health

# Test payment creation (requires auth token)
curl -X POST http://localhost:3000/api/epx/hosted/create-payment \
  -H "Content-Type: application/json" \
  -d '{"amount": 95.00, "customerId": "123", "customerEmail": "test@example.com"}'
```

### 🧰 Super Admin EPX Toolbox (Training Guide)

The admin dashboard now exposes three payment controls under **Manual EPX Transactions** and **Membership Cancellation**. These run against whichever EPX environment your env vars point to (currently `sandbox`).

#### Buttons & Purpose
- **Run Transaction** – Fires an immediate server-post (SALE/MIT, refund, void) with the stored card token + AUTH_GUID. Use this for adjustments on an existing payment record.
- **Launch Hosted Checkout** – Opens the EPX hosted iframe so the member can enter new card data in real time. Requires `CCE1`/`CCE2`, a member ID, and amount.
- **Membership Cancellation** – Sends the cancellation command to EPX to halt a recurring subscription. It does not refund prior charges.

#### Running a Manual Transaction
1. Enter at least one identifier (member ID, EPX transaction ID, or AUTH GUID) plus the USD amount.
2. Pick the appropriate `TRAN_TYPE`:
   - `CCE1` / `CCE2`: new sale/MIT against an existing authorization
   - `V`: void same-day sale
   - `R`: refund/reversal
3. Optionally add a note (shows in EPX memo fields).
4. Click **Run Transaction** → review the confirmation dialog → confirm to post to `/api/admin/payments/manual-transaction`.
5. Inspect the “Request/Response Snapshot” panel below the form for EPX’s response codes.

#### Launching Hosted Checkout for a Fresh Payment
1. Set the manual form to `CCE1` or `CCE2`, enter the member ID, amount, and a reference note.
2. Click **Launch Hosted Checkout**. Confirm the warning so we can fetch the member + subscription profile.
3. A modal loads the `EPXHostedPayment` component (same as the enrollment flow). Hand control to the member to enter card data.
4. On success we toast the transaction ID and close the modal—no redirect occurs inside the admin view.

Use this flow when the stored card is invalid or you need a card-on-file before creating a brand-new AUTH GUID.

#### Canceling an EPX Subscription
1. Fill either **Subscription ID** (preferred) or a prior **Transaction ID** so the backend can look up the subscription metadata.
2. Provide a short reason (shown in certification logs for audit trails).
3. Submit → confirm the dialog. The route `/api/admin/payments/cancel-subscription` logs the request and forwards it to EPX.
4. Review the response snapshot for `success: true` before notifying the member.

#### Sandbox vs. Production
- Until you swap `EPX_PUBLIC_KEY`, `EPX_TERMINAL_PROFILE_ID`, and `EPX_ENVIRONMENT`, everything runs in sandbox. Feel free to practice against your latest sandbox transactions.
- Recommended drill: run a hosted checkout in sandbox, then refund/void the same transaction using **Run Transaction**, and finally cancel the associated subscription to verify the full toolchain.

### Debugging

```bash
# View DigitalOcean App Platform logs
doctl apps logs <app-id> --tail

# Local server logs with debug output
DEBUG=* npm run dev:server
```

## 📝 Code Conventions & Best Practices

### Backend Patterns

**✅ DO**:

```typescript
// Use storage.ts functions for database queries
const members = await storage.getAllMembers();
const user = await storage.getUser(userId);

// Use structured logging
logEPX({ level: 'info', phase: 'create-payment', message: 'Payment created', data: { id } });

// Verify reCAPTCHA tokens
const result = await verifyRecaptcha(token, 'hosted_checkout');
if (!result.success) return res.status(400).json({ error: 'Captcha failed' });
```

**❌ DON'T**:

```typescript
// Don't use Drizzle ORM queries directly (causes TypeScript issues)
const members = await db.select().from(members); // ❌

// Don't use console.log for important events
console.log('Payment created'); // ❌ Use logEPX() instead
```

### Frontend Patterns

**✅ DO**:

```typescript
// Use apiClient for all API calls
import { apiClient } from '@/lib/apiClient';
const response = await apiClient.post('/api/endpoint', data);

// Use TanStack Query for data fetching
const { data, isLoading } = useQuery({
  queryKey: ['users'],
  queryFn: () => apiClient.get('/api/users')
});

// Use React Hook Form + Zod for forms
const form = useForm<FormData>({ resolver: zodResolver(schema) });
```

**❌ DON'T**:

```typescript
// Don't use fetch() directly
const res = await fetch('/api/endpoint'); // ❌

// Don't assume same-origin (frontend/backend are separate)
const res = await fetch('http://localhost:3000/api/...'); // ❌ Use apiClient
```

### Data Formatting Standards

- **Agent Numbers**: `MPP0001`, `MPP0002`, `MPP0003`, etc.
- **Phone Numbers**: `+1-234-567-8900` (formatted, with country code)
- **Dates**: ISO 8601 format (`2025-11-25T10:30:45.123Z`)
- **Currency**: Always store as string with 2 decimal places (`"95.00"`)
- **Transaction IDs**: 10-digit numeric string (last 10 digits of timestamp)

## 🧪 Testing

### Test Accounts

See project-specific documentation for test login credentials.

### EPX Test Cards

- **Approved**: `4111 1111 1111 1111` (Visa)
- **Declined**: `4000 0000 0000 0002`
- **CVV**: Any 3 digits
- **Expiry**: Any future date (MMYY format)

### reCAPTCHA Testing

- **Development**: Localhost automatically passes (no domain whitelist needed)
- **Production**: Ensure `enrollment.getmydpc.com` whitelisted in Google Console
- **Bypass**: Server accepts missing secret key (fail-open in dev)

## 🐛 Troubleshooting

### Database Issues

- Use `storage.ts` functions, NOT direct Drizzle queries
- Check Supabase connection: `npm run check:supabase`
- Verify `DATABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set

### Payment Issues

- Verify EPX environment variables set (`EPX_PUBLIC_KEY`, `EPX_TERMINAL_PROFILE_ID`)
- Check DigitalOcean outbound IP is whitelisted in EPX ACL
- Review EPX logs: `GET /api/epx/logs/recent`
- Ensure reCAPTCHA secret key configured

### Authentication Issues

- Verify Supabase URLs and keys match in your DigitalOcean environment variables
- Check JWT token format in browser dev tools (Network tab)
- Review role assignments in `users` table
- Ensure RLS policies are correct in Supabase dashboard

### Build Failures

- Check for TypeScript errors: `npm run build`
- Ensure all dependencies installed: `npm install`
- Verify environment variables are set
- Review DigitalOcean build logs for errors

### CORS Errors

- Verify production origins in `server/index.ts` (CORS config)
- Ensure `FRONTEND_URL` env variable is set correctly

## 📞 Support & Contact

**Primary Contact**: Michael (super_admin)  
**Email**: michael@mypremierplans.com

**Development Team**:

- Travis: travis@mypremierplans.com
- Richard: richard@mypremierplans.com

## 📄 License

Proprietary - My Premier Plans LLC

---

**Last Updated**: November 25, 2025  
**Platform Version**: 2.0 (EPX Hosted Checkout + reCAPTCHA v3)
