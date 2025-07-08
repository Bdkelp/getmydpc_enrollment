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
- **Provider**: Stripe for PCI-compliant payment processing
- **Features**: Subscription management, recurring billing, payment intent handling
- **Security**: Server-side payment processing with client-side Elements integration

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

## External Dependencies

### Core Dependencies
- **@neondatabase/serverless**: PostgreSQL database connection
- **drizzle-orm**: Type-safe database ORM
- **@stripe/stripe-js & @stripe/react-stripe-js**: Payment processing
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
- Stripe keys for payment processing
- Session secrets for authentication
- Replit-specific configuration for auth

### Scaling Considerations
- Serverless-compatible architecture
- Stateless server design with database-backed sessions
- CDN-ready static asset structure
- Docker/Kubernetes deployment ready

## Role-Based Access Control

### User Roles
- **Admin**: Full system access, can view all enrollments, manage plans, access analytics
- **Agent**: Can enroll new members, view their own enrollments, track commissions, export enrollment data
- **User** (Regular Member): No dashboard access, must contact agent or customer service for changes

### Access Rules
- Agents are automatically redirected to `/agent` dashboard
- Admins are automatically redirected to `/admin` dashboard
- Regular users see a "No Dashboard Access" page with customer service contact information
- Only agents and admins can access the enrollment flow

### Agent Features
- Track total enrollments and monthly enrollments
- View commission earnings ($50 per enrollment)
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
  • Modified registration flow to submit family members with primary member data
  • Removed redirect to family-enrollment page for family plans
  • All coverage types (Member only, Mem/Spouse, Mem/Children, Family) now go directly to payment after registration
  • Family member data from steps 4 and 5 is now properly included in registration submission
  • Improved user experience by removing unnecessary extra page in enrollment flow
```

## User Preferences

```
Preferred communication style: Simple, everyday language.
```