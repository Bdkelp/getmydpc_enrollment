# DPC Subscription Platform

## Overview

This is a comprehensive Direct Primary Care (DPC) subscription and enrollment platform built with modern web technologies. The application provides multiple enrollment flows, secure payment processing, and comprehensive user management capabilities for patients, agents, employers, and administrators.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and optimized builds
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query for server state management
- **UI Framework**: shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with custom medical-themed color scheme
- **Forms**: React Hook Form with Zod validation

### Backend Architecture
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js for REST API
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Replit Auth with OpenID Connect
- **Session Management**: Express session with PostgreSQL store
- **Payment Processing**: Stripe integration for subscription billing

### Key Components

#### Authentication System
- Replit Auth integration with OpenID Connect
- Role-based access control (user, agent, admin)
- Secure session management with PostgreSQL backing
- Protected routes with middleware validation

#### Database Layer
- **ORM**: Drizzle with type-safe queries
- **Database**: PostgreSQL via Neon serverless
- **Migrations**: Automated schema management
- **Schema**: Comprehensive data model for users, plans, subscriptions, payments, and family members

#### Payment System
- **Current State**: Mock payment system for testing
- **Previous Provider**: Stripe (removed, pivoting to new payment processor)
- **Features**: Placeholder payment form, test subscription creation
- **Note**: Awaiting decision on new payment processor (considering Square Pay)

#### UI/UX Design
- Responsive design with mobile-first approach
- Medical blue color scheme for professional healthcare appearance
- Comprehensive component library with consistent styling
- Multi-step forms with progress indicators
- Toast notifications for user feedback

## Data Flow

### User Registration Flow
1. User accesses registration page
2. Multi-step form collection (personal info, address, plan selection)
3. Form validation with Zod schemas
4. User creation in database
5. Redirect to payment processing

### Payment Flow
1. Stripe payment intent creation on server
2. Client-side payment form with Stripe Elements
3. Payment confirmation and subscription creation
4. Database updates for user and subscription status
5. Redirect to user dashboard

### Authentication Flow
1. Replit Auth OpenID Connect flow
2. User session creation and storage
3. Role-based route protection
4. Automatic session renewal and validation

## Authentication Systems

### Development Environment
- Uses Replit Auth for testing during development
- Automatic role assignment based on email addresses

### Production Environment
- Comprehensive authentication system supporting:
  - Email/Password registration with email verification
  - Social login: Google, Facebook, Twitter, LinkedIn, Microsoft, Apple
  - JWT-based authentication for API access
  - Password reset functionality
  - Session management with PostgreSQL backing

### Authentication Flow
1. **Registration**: Email verification required for password-based accounts
2. **Social Login**: Automatic account linking based on email
3. **Role Assignment**: Automatic based on email domain
4. **Session Management**: Persistent sessions with 7-day expiry

## External Dependencies

### Core Dependencies
- **@neondatabase/serverless**: PostgreSQL database connection
- **drizzle-orm**: Type-safe database ORM
- **@tanstack/react-query**: Server state management
- **react-hook-form & @hookform/resolvers**: Form handling
- **zod**: Schema validation
- **passport & openid-client**: Authentication

### UI Dependencies
- **@radix-ui/***: Accessible UI primitives
- **tailwindcss**: Utility-first CSS framework
- **lucide-react**: Icon library
- **class-variance-authority**: Component variant management

### Development Dependencies
- **vite**: Build tool and dev server
- **typescript**: Type safety
- **tsx**: TypeScript execution for server
- **esbuild**: Production bundling

## Deployment Strategy

### Development Environment
- Vite dev server with HMR for frontend
- tsx for TypeScript server execution
- Automatic database schema synchronization
- Environment variable configuration

### Production Build
- Vite builds optimized client bundle to `dist/public`
- esbuild bundles server code to `dist/index.js`
- Static file serving through Express
- Database migrations via Drizzle Kit

### Environment Configuration
- Database connection via `DATABASE_URL`
- Payment processor keys (to be configured when provider is selected)
- Session secrets for authentication
- Replit-specific configuration for auth

### Scaling Considerations
- Serverless-compatible architecture
- Stateless server design with database-backed sessions
- CDN-ready static asset structure
- Docker/Kubernetes deployment ready

## Role-Based Access Control

### User Roles
- **Admin**: Full system access, can view all enrollments, manage plans, access analytics, access all agent features
  - Admin emails automatically assigned: michael@mypremierplans.com, travis@mypremierplans.com, richard@mypremierplans.com, joaquin@mypremierplans.com
- **Agent**: Can enroll new members, view their own enrollments, track commissions, export enrollment data
  - Agent emails automatically assigned: mdkeener@gmail.com, tmatheny77@gmail.com, svillarreal@cyariskmanagement.com
- **User** (Regular Member): Currently no dashboard access (Phase 1). Future: self-enrollment capability (Phase 2)

### Enrollment Strategy (Phased Approach)
- **Phase 1 (Current)**: Agent-only enrollment for testing and quality control
- **Phase 2 (Planned)**: Hybrid model with both agent and self-enrollment
  - Self-enrolled members will be tagged for tracking
  - Agents maintain their commission structure
  - Lead capture continues for both channels
- **Scaling Plan**: Starting with <10 agents, scaling to several hundred agents
- **Note**: DPC non-insurance product, not regulated by Department of Insurance

### Access Rules
- Agents are automatically redirected to `/agent` dashboard
- Admins are automatically redirected to `/admin` dashboard
- Regular users see a "No Dashboard Access" page with customer service contact information
- Only agents and admins can access the enrollment flow

### Agent Features
- Track total enrollments and monthly enrollments
- View commission earnings (varies by plan: Base $9-17, Plus/Elite $20-40, +$2.50 for Rx)
- Export enrollment data as CSV for submission to MPP
- View and manage leads (placeholder for future implementation)
- Filter enrollments by date range

## Current MVP Implementation Status

### ✅ Completed Features

**Core Platform Architecture**
- React 18 + TypeScript frontend with Vite build system
- Express.js backend with PostgreSQL database via Drizzle ORM
- Replit Auth integration for secure user authentication
- Role-based access control (user, admin, agent)
- Responsive design with medical blue theme

**User Registration & Enrollment Flow**
- Multi-step registration form (6 steps) with progress indicator
- Comprehensive data collection:
  • Personal: name (first/middle/last), SSN, DOB, gender, member type
  • Employment: employer name, division, date of hire, plan start date
  • Contact: email, phone, address (2 lines), city, state, ZIP
  • Emergency contact information
- Coverage type selection (Individual, Couple, Parent/Child, Family)
- Plan tier selection (Base, Plus, Elite) with correct pricing
- Family member enrollment for non-individual plans
- RxValet prescription add-on option
- Terms acceptance and communication consent
- Form validation with Zod schemas

**Subscription Management**
- Active plan data with three tiers: Individual ($79), Family ($199), Group ($65)
- Plan feature comparison and selection
- Subscription status tracking
- Database integration for plans, subscriptions, and payments

**User Dashboard**
- Personalized welcome interface
- Current plan details and billing information
- Quick action buttons (appointments, messaging, prescriptions)
- Recent activity timeline
- Care team information display
- Health metrics overview
- Plan management options

**Admin Dashboard**
- Comprehensive admin controls with role verification
- User management with search and filtering
- Revenue and subscription analytics
- Member enrollment statistics
- Real-time stats dashboard with key metrics
- Export functionality placeholder

**Payment Integration Setup**
- Stripe integration framework ready
- Secure payment form with Elements
- Subscription creation and management endpoints
- Webhook handling for payment events
- PCI-compliant payment processing structure

### 🔄 Current State
- Application running successfully on http://localhost:5000
- Database schemas deployed and sample data loaded
- Authentication system functional
- All core pages accessible and responsive

### ⚠️ Pending Configuration
- Stripe API keys needed for live payment processing
- Payment flow currently shows configuration notice

## Next Implementation Phases

### Phase 2: Enhanced User Management
- Agent role implementation with commission tracking
- Group enrollment workflows
- Family member management
- Employer dashboard for group plans

### Phase 3: Healthcare Features
- Appointment scheduling system
- Secure messaging between patients and doctors
- Prescription management
- Health record integration

### Phase 4: Advanced Analytics
- Revenue reporting and analytics
- Member engagement metrics
- Care quality indicators
- Export functionality for compliance

## Changelog

```
Changelog:
- July 19, 2025: Implemented role-based dashboard personalization
  • Added personalized welcome messages to all dashboards (admin, agent, member)
  • Time-based greetings: "Good morning/afternoon/evening" based on user's local time
  • Name personalization: Uses firstName, name field, or email prefix as fallback
  • Role-specific content in welcome cards:
    - Admin: Platform status, last login time, full system access message
    - Agent: Monthly goals, commission earned, active leads, sales encouragement
    - Member: Membership status, plan details, 24/7 support contact
  • Color-coded welcome cards: Blue for admin/member, green for agent
  • Added relevant icons to each welcome card for visual appeal
- July 19, 2025: Removed Stripe payment integration
  • Uninstalled all Stripe packages (@stripe/stripe-js, @stripe/react-stripe-js, stripe)
  • Removed all Stripe API endpoints (create-payment-intent, complete-payment, stripe-webhook, create-subscription)
  • Cleaned up payment page to only show mock payment form
  • Updated confirmation page to remove Stripe payment completion logic
  • Payment system now uses mock payments only until new processor is selected
  • Database schema retains payment-related columns for future processor integration
  • Ready to integrate with Square Pay or other payment processor when decision is made
- July 15, 2025: Fixed authentication and implemented magic link login
  • Fixed password reset redirect URLs to work properly in Replit environment
  • Added magic link authentication option to login page
  • Users can now choose between password login and magic link login via tabs
  • Magic link sends a one-time login link to user's email
  • Both reset password and magic links now use correct Replit preview URLs
  • Created MagicLinkLogin component for passwordless authentication
  • Enhanced user experience with choice of authentication methods
- July 03, 2025: MVP platform foundation completed
  • Core authentication and user management
  • Multi-step enrollment process
  • Admin dashboard with analytics
  • Payment integration framework
  • Database schema with sample DPC plans
  • Responsive medical-themed UI
- July 03, 2025: Enhanced enrollment process
  • Updated member types: Member only, Member/Spouse, Member Children, Family
  • Made employment fields optional for individual enrollments
  • Coverage type automatically set based on member type selection
  • Fixed RxValet selection infinite loop issue
  • Streamlined enrollment flow from 6 visible steps to 5 (coverage type auto-selected)
- July 03, 2025: Implemented role-based access control
  • Created separate dashboards for agents (/agent) and admins (/admin)
  • Regular users now see "No Dashboard Access" page with customer service contact
  • Agent dashboard includes enrollment tracking, commission reports ($50/enrollment), and CSV export
  • Added enrolledByAgentId field to track which agent enrolled each member
  • Test users created: admin@mypremierplans.com (admin), agent@mypremierplans.com (agent), mdkeener@gmail.com (user)
  • Fixed authentication flow to properly handle unauthorized responses
  • Added logout functionality to landing page and no-access pages
- July 03, 2025: Enhanced enrollment and payment flow
  • Fixed price calculations to properly include 4% processing fee across all plans and add-ons
  • Added detailed price breakdown in enrollment review showing subtotal, processing fee, and total
  • Fixed "Complete Registration" button by properly passing planId to submission
  • Created mock payment flow for testing without Stripe configuration
  • Mock payment automatically redirects to agent dashboard after simulated payment
  • All pricing now consistently shows total with fees included
  • Added membership enrollment disclosure to payment page with terms about:
    - Recurring billing, payment authorization, NSF fees ($35), cancellation (45 days notice)
  • Created comprehensive confirmation page displaying after successful payment with:
    - Member details, plan features, payment confirmation, transaction ID
    - Billing dates, contact information, and next steps
  • Updated payment flow to route through confirmation page before dashboard
- July 07, 2025: Fixed family enrollment and payment flow issues
  • Fixed family enrollment flow - added proper navigation buttons to continue after adding family members
  • Made SSN optional for family members per user requirement
  • Fixed payment page to show only selected plan with clear pricing breakdown
  • Added flexible plan name matching for coverage types (handles "Member/Spouse" vs "Mem/Spouse" variations)
  • Fixed pricing calculations to properly handle family plans with spouse/children
  • Added mock payment button to complete enrollment without Stripe configuration
  • Added debugging logs to track plan selection issues
- July 07, 2025: Fixed payment and confirmation page issues
  • Fixed double decimal display issue ($119.00.00 → $119.00)
  • Fixed mock payment endpoint 500 error by using correct data types for database decimal fields
  • Enhanced confirmation page to serve as official enrollment proof with:
    - Unique customer number generation (MPP2025 + 6-digit user ID)
    - Download functionality (saves as HTML file)
    - Print functionality with proper print styles
    - Email functionality (currently shows notification)
    - Complete enrollment details including customer number, member ID, enrollment date
    - Professional layout suitable for company records
  • Fixed confirmation page redirect issue - now properly displays after mock payment
  • Added "Go to Dashboard" button that routes based on user role
- July 08, 2025: Fixed redundant family member enrollment issue
  • Eliminated duplicate family member data collection during enrollment
- July 20, 2025: Fixed routing issues for payment and confirmation pages
  • Added simple `/payment` route alongside parameterized route to fix 404 error after registration
  • Added simple `/confirmation` route alongside parameterized route for mock payment redirect
  • Fixed enrollment flow: Registration → Payment → Confirmation now works without 404 errors
  • Both admin and agent roles can access the payment flow properly
- July 22, 2025: Fixed contact form lead submission
  • Added better error logging to contact form and lead creation endpoint
  • Verified leads table exists in database schema
  • Added validation for required fields in lead submission
  • Tested lead creation locally - working successfully
  • Contact form now properly saves leads to database for agent follow-up
  • Modified registration flow to submit family members with primary member data
  • Removed redirect to family-enrollment page for family plans
  • All coverage types (Member only, Mem/Spouse, Mem/Children, Family) now go directly to payment after registration
  • Family member data from steps 4 and 5 is now properly included in registration submission
  • Improved user experience by removing unnecessary extra page in enrollment flow
- July 08, 2025: Landing page updates and branding improvements
  • Added Contact Us hyperlink in navigation to https://www.mypremierplans.com/contactus
  • Updated 24/7 Access text to include Patient Advocate Line (PAL) and mobile app
  • Updated hero image to professional doctor-patient consultation image
  • Learn More button now links to https://mypremierplans.com
  • Created contact form modal for lead capture (sends to info@mypremierplans.com)
  • All CTA buttons (Get Started, Enroll Now, Select Plan) now open contact form modal
  • Logo integration attempted but file was too small, reverted pending larger file
- July 10, 2025: Commission calculation fixes and lead management implementation
  • Fixed commission calculation bug - Plus plans now properly recognize "+" symbol and display correct $20-$40 commission
  • Updated commission structure to match tiered rates (Base: $9-17, Plus/Elite: $20-40, +$2.50 for RxValet)
  • Resolved contact form CTA button styling - now shows green when form is complete
  • Implemented comprehensive lead management system:
    - Database schema for leads and lead activities
    - Contact form now saves leads directly to database
    - Automatic lead assignment to available agents (round-robin)
    - Agent dashboard shows real-time lead stats and recent leads
    - Dedicated lead management page at /agent/leads with status filtering
    - Lead status workflow: new → contacted → qualified → enrolled/closed
    - Activity tracking for phone calls, emails, meetings, and notes
    - Lead conversion rate calculation and display
    - Visual status badges with color coding
  • Transformed placeholder lead features into fully functional system
- July 10, 2025: Landing page content update
  • Updated "Why Choose Direct Primary Care?" section with new tagline:
    - "Your Health, Your Plan"
    - "Unlimited primary care. No copays. No insurance hassles."
  • Enhanced messaging to emphasize key benefits of DPC model
- July 15, 2025: Supabase authentication integration and quiz improvements
  • Successfully integrated Supabase authentication replacing Replit Auth
  • Added support for email/password registration and social login (Google, Facebook, Twitter, LinkedIn, Microsoft, Apple)
  • Fixed environment variable configuration for Supabase credentials
  • Moved .env file to client directory for proper Vite loading
  • Fixed white button on white background issue in quiz - added explicit text-white class
  • Added agent-assisted enrollment popup when users select plans from quiz results
  • Contact form modal now pre-fills with selected plan information
  • Created TEST_ACCOUNTS.md with test account credentials for different roles
  • Production-ready authentication system now fully operational without requiring Replit accounts
- July 16, 2025: Plan features update and testimonials section
  • Updated all plan features in database and UI to match official MyPremierPlans offerings:
    - Base: Unlimited virtual/telehealth, unlimited primary care ($10 fee), PAL access, prescriptions, Wellcard
    - Plus: All Base features + unlimited urgent care ($25 fee)
    - Elite: All Plus features with NO visit fees + 200 Quest diagnostics procedures
  • Landing page now shows only 3 plans (member-only versions) for simplicity
  • Added "What Our Members Are Saying" testimonials section with placeholder reviews
  • Updated family plan capacity to 8 members (2 parents + 6 children) per requirement
  • Mock payment mode enabled for testing enrollment flow at enrollment.getmydpc.com
- July 18, 2025: User approval system and bot protection
  • Implemented comprehensive user approval system for security:
    - New users are set to "pending" status and cannot access the platform
    - Admin dashboard shows pending users with risk assessment
    - Bot detection flags: temporary emails, missing browser info, unverified emails
    - Admins can approve or reject users from the dashboard
    - Rejected users receive a reason for rejection
  • Added /pending-approval page for users awaiting approval
  • Social login users also require approval before access
  • All users except admins are auto-set to pending status
  • Enhanced security to prevent unauthorized access and bot registrations
```

## User Preferences

```
Preferred communication style: Simple, everyday language.
```

## Deployment Strategy

- **Domain**: getmydpc.com
- **Deployment URL**: enrollment.getmydpc.com
- **Platform**: Replit with custom domain
- **SSL**: Automatically provided by Replit
- **Authentication**: Supabase with redirect URLs configured for getmydpc.com