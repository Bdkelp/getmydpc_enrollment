
-- Enable UUID extension (still useful for some operations)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR PRIMARY KEY NOT NULL,
  email VARCHAR(255) UNIQUE,
  "firstName" VARCHAR(100),
  "lastName" VARCHAR(100),
  "middleName" VARCHAR(100),
  "profileImageUrl" VARCHAR(255),
  phone VARCHAR(20),
  "dateOfBirth" VARCHAR(50),
  gender VARCHAR(50),
  address TEXT,
  address2 TEXT,
  city VARCHAR(100),
  state VARCHAR(10),
  "zipCode" VARCHAR(10),
  "emergencyContactName" VARCHAR(255),
  "emergencyContactPhone" VARCHAR(20),
  "stripeCustomerId" VARCHAR(255) UNIQUE,
  "stripeSubscriptionId" VARCHAR(255) UNIQUE,
  role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('member', 'agent', 'admin')),
  "agentNumber" VARCHAR(255) UNIQUE,
  "isActive" BOOLEAN DEFAULT TRUE,
  "approvalStatus" VARCHAR(20) DEFAULT 'pending' CHECK ("approvalStatus" IN ('pending', 'approved', 'rejected')),
  "approvedAt" TIMESTAMP,
  "approvedBy" VARCHAR(255),
  "rejectionReason" TEXT,
  "emailVerified" BOOLEAN DEFAULT FALSE,
  "emailVerifiedAt" TIMESTAMP,
  "registrationIp" VARCHAR(45),
  "registrationUserAgent" TEXT,
  "suspiciousFlags" JSONB,
  "enrolledByAgentId" VARCHAR(255),
  "lastLoginAt" TIMESTAMP,
  "lastActivityAt" TIMESTAMP,
  "employerName" VARCHAR(255),
  "divisionName" VARCHAR(255),
  "memberType" VARCHAR(50),
  ssn VARCHAR(11),
  "dateOfHire" VARCHAR(50),
  "planStartDate" VARCHAR(50),
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  sid VARCHAR PRIMARY KEY,
  sess JSONB NOT NULL,
  expire TIMESTAMP NOT NULL
);

-- Plans table
CREATE TABLE IF NOT EXISTS plans (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  "billingPeriod" VARCHAR(20) DEFAULT 'monthly',
  features JSONB,
  "maxMembers" INTEGER DEFAULT 1,
  "isActive" BOOLEAN DEFAULT TRUE,
  "stripePriceId" VARCHAR(255),
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  "userId" VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "planId" INTEGER NOT NULL REFERENCES plans(id),
  status VARCHAR(20) NOT NULL,
  "pendingReason" VARCHAR(100),
  "pendingDetails" TEXT,
  "startDate" TIMESTAMP DEFAULT NOW(),
  "endDate" TIMESTAMP,
  "nextBillingDate" TIMESTAMP,
  amount DECIMAL(10,2) NOT NULL,
  "stripeSubscriptionId" VARCHAR(255) UNIQUE,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Family Members table
CREATE TABLE IF NOT EXISTS family_members (
  id SERIAL PRIMARY KEY,
  "primaryUserId" VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "firstName" VARCHAR(100) NOT NULL,
  "lastName" VARCHAR(100) NOT NULL,
  "middleName" VARCHAR(100),
  "dateOfBirth" VARCHAR(50),
  gender VARCHAR(50),
  ssn VARCHAR(11),
  email VARCHAR(255),
  phone VARCHAR(20),
  relationship VARCHAR(50),
  "memberType" VARCHAR(50) NOT NULL,
  address TEXT,
  address2 TEXT,
  city VARCHAR(100),
  state VARCHAR(10),
  "zipCode" VARCHAR(10),
  "planStartDate" VARCHAR(50),
  "isActive" BOOLEAN DEFAULT TRUE,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

-- Leads table
CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  "firstName" VARCHAR(255) NOT NULL,
  "lastName" VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  message TEXT,
  source VARCHAR(50) DEFAULT 'contact_form',
  status VARCHAR(50) DEFAULT 'new',
  "assignedAgentId" VARCHAR(255) REFERENCES users(id),
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Lead Activities table
CREATE TABLE IF NOT EXISTS lead_activities (
  id SERIAL PRIMARY KEY,
  "leadId" INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  "agentId" VARCHAR(255) REFERENCES users(id),
  "activityType" VARCHAR(50),
  notes TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  "userId" VARCHAR NOT NULL REFERENCES users(id),
  "subscriptionId" INTEGER REFERENCES subscriptions(id),
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL,
  "stripePaymentIntentId" VARCHAR(255) UNIQUE,
  "stripeChargeId" VARCHAR(255),
  "paymentMethod" VARCHAR(50),
  "createdAt" TIMESTAMP DEFAULT NOW()
);

-- Enrollment Modifications table
CREATE TABLE IF NOT EXISTS enrollment_modifications (
  id SERIAL PRIMARY KEY,
  "userId" VARCHAR NOT NULL REFERENCES users(id),
  "subscriptionId" INTEGER REFERENCES subscriptions(id),
  "modifiedBy" VARCHAR NOT NULL REFERENCES users(id),
  "changeType" VARCHAR(100) NOT NULL,
  "changeDetails" JSONB,
  "consentType" VARCHAR(50),
  "consentNotes" TEXT,
  "consentDate" TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

-- Commissions table
CREATE TABLE IF NOT EXISTS commissions (
  id SERIAL PRIMARY KEY,
  "agentId" VARCHAR NOT NULL REFERENCES users(id),
  "subscriptionId" INTEGER NOT NULL REFERENCES subscriptions(id),
  "userId" VARCHAR NOT NULL REFERENCES users(id),
  "planName" VARCHAR(255) NOT NULL,
  "planType" VARCHAR(10) NOT NULL,
  "planTier" VARCHAR(50) NOT NULL,
  "commissionAmount" DECIMAL(10,2) NOT NULL,
  "totalPlanCost" DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  "paymentStatus" VARCHAR(20) DEFAULT 'unpaid',
  "paidDate" TIMESTAMP,
  "cancellationDate" TIMESTAMP,
  "cancellationReason" TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Insert default plans
INSERT INTO plans (name, description, price, "billingPeriod", features, "maxMembers") VALUES
('Individual Plan', 'Perfect for single coverage', 89.00, 'monthly', '["Unlimited office visits", "Prescription discounts", "Telemedicine"]', 1),
('Family Plan', 'Comprehensive family coverage', 189.00, 'monthly', '["Unlimited office visits", "Prescription discounts", "Telemedicine", "Family coverage up to 6 members"]', 6)
ON CONFLICT DO NOTHING;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_agent_number ON users("agentNumber");
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions("userId");
CREATE INDEX IF NOT EXISTS idx_family_members_primary_user_id ON family_members("primaryUserId");
CREATE INDEX IF NOT EXISTS idx_leads_assigned_agent_id ON leads("assignedAgentId");
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_id ON lead_activities("leadId");
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments("userId");
CREATE INDEX IF NOT EXISTS idx_commissions_agent_id ON commissions("agentId");
CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);
