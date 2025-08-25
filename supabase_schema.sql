
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  "firstName" VARCHAR(100),
  "lastName" VARCHAR(100),
  phone VARCHAR(20),
  "dateOfBirth" DATE,
  "profileImageUrl" TEXT,
  role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('member', 'agent', 'admin')),
  "approvalStatus" VARCHAR(20) DEFAULT 'pending' CHECK ("approvalStatus" IN ('pending', 'approved', 'rejected')),
  "emailVerified" BOOLEAN DEFAULT FALSE,
  "emailVerifiedAt" TIMESTAMP,
  "registrationIp" INET,
  "registrationUserAgent" TEXT,
  "lastLoginAt" TIMESTAMP DEFAULT NOW(),
  "isActive" BOOLEAN DEFAULT TRUE,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Plans table
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  "monthlyPrice" DECIMAL(10,2) NOT NULL,
  "annualPrice" DECIMAL(10,2),
  "maxFamilyMembers" INTEGER DEFAULT 1,
  features JSONB DEFAULT '[]',
  "isActive" BOOLEAN DEFAULT TRUE,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "planId" UUID NOT NULL REFERENCES plans(id),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'suspended', 'expired')),
  "billingCycle" VARCHAR(20) DEFAULT 'monthly' CHECK ("billingCycle" IN ('monthly', 'annual')),
  "startDate" TIMESTAMP DEFAULT NOW(),
  "endDate" TIMESTAMP,
  "nextBillingDate" TIMESTAMP,
  "cancelledAt" TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Family Members table
CREATE TABLE IF NOT EXISTS family_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "subscriptionId" UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  "firstName" VARCHAR(100) NOT NULL,
  "lastName" VARCHAR(100) NOT NULL,
  "dateOfBirth" DATE NOT NULL,
  relationship VARCHAR(50),
  "isActive" BOOLEAN DEFAULT TRUE,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Leads table
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "firstName" VARCHAR(100) NOT NULL,
  "lastName" VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'lost')),
  source VARCHAR(50),
  "agentId" UUID REFERENCES users(id),
  notes TEXT,
  "leadValue" DECIMAL(10,2),
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Lead Activities table
CREATE TABLE IF NOT EXISTS lead_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "leadId" UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  "agentId" UUID REFERENCES users(id),
  type VARCHAR(50) NOT NULL,
  description TEXT,
  "scheduledFor" TIMESTAMP,
  "completedAt" TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId" UUID NOT NULL REFERENCES users(id),
  "subscriptionId" UUID REFERENCES subscriptions(id),
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  "paymentMethod" VARCHAR(50),
  "transactionId" VARCHAR(255),
  "failureReason" TEXT,
  "processedAt" TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

-- Commissions table
CREATE TABLE IF NOT EXISTS commissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "agentId" UUID NOT NULL REFERENCES users(id),
  "subscriptionId" UUID REFERENCES subscriptions(id),
  "leadId" UUID REFERENCES leads(id),
  amount DECIMAL(10,2) NOT NULL,
  percentage DECIMAL(5,2),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  "paidAt" TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

-- Insert default plans
INSERT INTO plans (id, name, description, "monthlyPrice", "annualPrice", "maxFamilyMembers", features) VALUES
('00000000-0000-0000-0000-000000000001', 'Individual', 'Perfect for single coverage', 89.00, 890.00, 1, '["Unlimited office visits", "Prescription discounts", "Telemedicine"]'),
('00000000-0000-0000-0000-000000000002', 'Family', 'Comprehensive family coverage', 189.00, 1890.00, 6, '["Unlimited office visits", "Prescription discounts", "Telemedicine", "Family coverage up to 6 members"]')
ON CONFLICT (id) DO NOTHING;

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "Enable read access for all users" ON plans FOR SELECT USING (true);
CREATE POLICY "Enable all access for authenticated users" ON users FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all access for authenticated users" ON subscriptions FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all access for authenticated users" ON family_members FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all access for authenticated users" ON leads FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all access for authenticated users" ON lead_activities FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all access for authenticated users" ON payments FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all access for authenticated users" ON commissions FOR ALL USING (auth.role() = 'authenticated');

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions("userId");
CREATE INDEX IF NOT EXISTS idx_family_members_subscription_id ON family_members("subscriptionId");
CREATE INDEX IF NOT EXISTS idx_leads_agent_id ON leads("agentId");
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_id ON lead_activities("leadId");
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments("userId");
CREATE INDEX IF NOT EXISTS idx_commissions_agent_id ON commissions("agentId");
