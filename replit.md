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

## Current MVP Implementation Status

### ✅ Completed Features

**Core Platform Architecture**
- React 18 + TypeScript frontend with Vite build system
- Express.js backend with PostgreSQL database via Drizzle ORM
- Replit Auth integration for secure user authentication
- Role-based access control (user, admin, agent)
- Responsive design with medical blue theme

**User Registration & Enrollment Flow**
- Multi-step registration form with progress indicator
- Personal information collection (name, email, phone, DOB, address)
- Plan selection with pricing display
- Emergency contact information
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
```

## User Preferences

```
Preferred communication style: Simple, everyday language.
```