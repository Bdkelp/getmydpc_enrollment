-- Supabase Migration Script
-- This script creates all necessary tables in Supabase
-- Run this in Supabase SQL Editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing tables if they exist (be careful in production!)
DROP TABLE IF EXISTS lead_activities CASCADE;
DROP TABLE IF EXISTS leads CASCADE;
DROP TABLE IF EXISTS family_members CASCADE;
DROP TABLE IF EXISTS enrollment_modifications CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS plans CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;

-- Create sessions table (for Express session storage)
CREATE TABLE sessions (
  sid VARCHAR PRIMARY KEY,
  sess JSONB NOT NULL,
  expire TIMESTAMP NOT NULL
);
CREATE INDEX IDX_session_expire ON sessions(expire);

-- Create users table
CREATE TABLE users (
  id VARCHAR PRIMARY KEY,
  email VARCHAR UNIQUE,
  first_name VARCHAR,
  last_name VARCHAR,
  middle_name VARCHAR,
  profile_image_url VARCHAR,
  phone VARCHAR,
  date_of_birth VARCHAR,
  gender VARCHAR,
  address TEXT,
  address2 TEXT,
  city VARCHAR,
  state VARCHAR,
  zip_code VARCHAR,
  emergency_contact_name VARCHAR,
  emergency_contact_phone VARCHAR,
  stripe_customer_id VARCHAR UNIQUE,
  stripe_subscription_id VARCHAR UNIQUE,
  role VARCHAR DEFAULT 'user',
  agent_number VARCHAR UNIQUE,
  is_active BOOLEAN DEFAULT true,
  approval_status VARCHAR DEFAULT 'pending',
  approved_at TIMESTAMP,
  approved_by VARCHAR,
  rejection_reason TEXT,
  email_verified BOOLEAN DEFAULT false,
  email_verified_at TIMESTAMP,
  registration_ip VARCHAR,
  registration_user_agent TEXT,
  suspicious_flags JSONB,
  enrolled_by_agent_id VARCHAR,
  employer_name VARCHAR,
  division_name VARCHAR,
  member_type VARCHAR,
  ssn VARCHAR,
  date_of_hire VARCHAR,
  plan_start_date VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create plans table
CREATE TABLE plans (
  id SERIAL PRIMARY KEY,
  name VARCHAR NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  billing_period VARCHAR DEFAULT 'monthly',
  features JSONB,
  max_members INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  stripe_price_id VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create subscriptions table
CREATE TABLE subscriptions (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR REFERENCES users(id) NOT NULL,
  plan_id INTEGER REFERENCES plans(id) NOT NULL,
  status VARCHAR NOT NULL,
  pending_reason VARCHAR,
  pending_details TEXT,
  start_date TIMESTAMP DEFAULT NOW(),
  end_date TIMESTAMP,
  next_billing_date TIMESTAMP,
  amount DECIMAL(10, 2) NOT NULL,
  stripe_subscription_id VARCHAR UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create payments table
CREATE TABLE payments (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR REFERENCES users(id) NOT NULL,
  subscription_id INTEGER REFERENCES subscriptions(id),
  amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR NOT NULL,
  stripe_payment_intent_id VARCHAR UNIQUE,
  stripe_charge_id VARCHAR,
  payment_method VARCHAR,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create enrollment_modifications table
CREATE TABLE enrollment_modifications (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR REFERENCES users(id) NOT NULL,
  subscription_id INTEGER REFERENCES subscriptions(id),
  modified_by VARCHAR REFERENCES users(id) NOT NULL,
  change_type VARCHAR NOT NULL,
  change_details JSONB,
  consent_type VARCHAR,
  consent_notes TEXT,
  consent_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create leads table
CREATE TABLE leads (
  id SERIAL PRIMARY KEY,
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  message TEXT,
  source VARCHAR(50) DEFAULT 'contact_form',
  status VARCHAR(50) DEFAULT 'new',
  assigned_agent_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create lead_activities table
CREATE TABLE lead_activities (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id),
  agent_id VARCHAR(255),
  activity_type VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create family_members table
CREATE TABLE family_members (
  id SERIAL PRIMARY KEY,
  primary_user_id VARCHAR REFERENCES users(id) NOT NULL,
  first_name VARCHAR NOT NULL,
  last_name VARCHAR NOT NULL,
  middle_name VARCHAR,
  date_of_birth VARCHAR,
  gender VARCHAR,
  ssn VARCHAR,
  email VARCHAR,
  phone VARCHAR,
  relationship VARCHAR,
  member_type VARCHAR NOT NULL,
  address TEXT,
  address2 TEXT,
  city VARCHAR,
  state VARCHAR,
  zip_code VARCHAR,
  plan_start_date VARCHAR,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_approval_status ON users(approval_status);
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_assigned_agent_id ON leads(assigned_agent_id);
CREATE INDEX idx_family_members_primary_user_id ON family_members(primary_user_id);

-- Enable Row Level Security (RLS) for all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment_modifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for users table
CREATE POLICY "Users can view their own data" ON users
  FOR SELECT USING (auth.uid()::text = id OR role = 'admin' OR role = 'agent');

CREATE POLICY "Admins can update all users" ON users
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid()::text AND role = 'admin'
  ));

CREATE POLICY "Admins can insert users" ON users
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid()::text AND role = 'admin'
  ));

-- Create RLS policies for leads table
CREATE POLICY "Admins and agents can view leads" ON leads
  FOR ALL USING (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid()::text AND (role = 'admin' OR role = 'agent')
  ));

-- Create RLS policies for subscriptions
CREATE POLICY "Users can view their own subscriptions" ON subscriptions
  FOR SELECT USING (
    user_id = auth.uid()::text OR 
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid()::text AND (role = 'admin' OR role = 'agent'))
  );

-- Create RLS policies for plans (public read)
CREATE POLICY "Anyone can view active plans" ON plans
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage plans" ON plans
  FOR ALL USING (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid()::text AND role = 'admin'
  ));

-- Grant necessary permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

