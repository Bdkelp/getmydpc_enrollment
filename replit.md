# DPC Subscription Platform

## Overview

This project is a comprehensive Direct Primary Care (DPC) subscription and enrollment platform. Its primary purpose is to streamline patient, agent, and employer enrollment processes for DPC services. Key capabilities include multiple enrollment flows, secure payment processing, and robust user management. The vision is to provide an intuitive, efficient platform that simplifies access to DPC, driving market growth and enhancing healthcare accessibility.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Routing**: Wouter
- **State Management**: TanStack Query
- **UI Framework**: shadcn/ui components on Radix UI
- **Styling**: Tailwind CSS with a custom medical-themed color scheme
- **Forms**: React Hook Form with Zod validation
- **UI/UX Decisions**: Responsive design with a mobile-first approach, medical blue color scheme for a professional appearance, multi-step forms with progress indicators, and toast notifications.

### Backend
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js for REST API
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Supabase (replacing Replit Auth)
- **Session Management**: Express session with PostgreSQL store
- **Payment Processing**: Mock payment system (Stripe was removed, new provider to be determined)

### Core Architectural Decisions
- **Authentication**: Role-based access control (Admin, Agent, User) is central, with secure session management and protected routes. A user approval system and bot detection are implemented for security.
- **Database**: PostgreSQL via Neon serverless with Drizzle ORM for type-safe queries and automated schema management.
- **Payment System**: Designed for flexibility, currently using a mock system with a framework ready for integration with a new provider.
- **Data Flow**: Defined flows for user registration, payment, and authentication, ensuring structured data handling.
- **Role-Based Access Control**: Differentiated dashboards and functionalities for Admin, Agent, and User roles. Agents can enroll members, track commissions, and export data. Admins have full system access and user management.
- **Enrollment Strategy**: Phased approach supporting agent-only enrollment currently, with plans for hybrid agent/self-enrollment.
- **Deployment Strategy**: Serverless-compatible, stateless server design, CDN-ready, configured for Replit with custom domain.

### Feature Specifications
- **User Registration & Enrollment**: Multi-step forms for personal info, employment, contact, coverage type (Individual, Couple, Parent/Child, Family), plan tier selection (Base, Plus, Elite), family member enrollment, RxValet add-on, and terms acceptance. Includes comprehensive Zod validation.
- **Subscription Management**: Active plan data with three tiers and feature comparisons.
- **User Dashboard**: Personalized interface showing plan details, quick actions, activity timeline, and care team info (future phases).
- **Admin Dashboard**: Controls for user management (role changes, approval), revenue/subscription analytics, and member enrollment statistics. Includes lead management and qualification.
- **Agent Dashboard**: Tracks enrollments, commissions, and manages leads.
- **Lead Management**: Comprehensive system with database schema, lead activities, automatic/manual assignment, status workflows, and activity tracking.
- **User Approval System**: New users are set to "pending" status, requiring admin approval, with bot detection flags.
- **Authentication Features**: Email/password registration with verification, social login (Google, Facebook, etc.), magic link login, password reset.

## External Dependencies

- **Database**: `@neondatabase/serverless` (PostgreSQL), `drizzle-orm`
- **State Management**: `@tanstack/react-query`
- **Form Handling & Validation**: `react-hook-form`, `@hookform/resolvers`, `zod`
- **Authentication**: `passport`, `openid-client`, Supabase (external service)
- **UI Libraries**: `@radix-ui/*`, `tailwindcss`, `lucide-react`, `class-variance-authority`
- **Build Tools (Dev)**: `vite`, `typescript`, `tsx`, `esbuild`