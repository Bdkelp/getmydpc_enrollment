-- DROP old tables if they exist
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS members CASCADE;
DROP TABLE IF EXISTS plans CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS commissions CASCADE;
DROP TABLE IF EXISTS leads CASCADE;

-- USERS: Agents/Admins only
CREATE TABLE users (
  email VARCHAR(255) PRIMARY KEY, -- Use email as user ID
  username VARCHAR(10) UNIQUE, -- Optional short username
  first_name VARCHAR(30),
  last_name VARCHAR(30),
  phone VARCHAR(10), -- US-based, 10 digits
  role VARCHAR(20) NOT NULL, -- agent, admin, super_admin
  agent_number VARCHAR(10), -- Alphanumeric, ≤10 chars
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- MEMBERS: People enrolled in MPP plans
CREATE TABLE members (
  member_number VARCHAR(20) PRIMARY KEY, -- Constant system, ≤20 chars
  first_name VARCHAR(30) NOT NULL,
  last_name VARCHAR(30) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(10),
  date_of_birth VARCHAR(20),
  address VARCHAR(100),
  city VARCHAR(30),
  state VARCHAR(2),
  zip_code VARCHAR(10),
  agent_number VARCHAR(10),
  enrollment_date TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

-- PLANS: DPC plan configurations
CREATE TABLE plans (
  id SERIAL PRIMARY KEY,
  name VARCHAR(30) NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL,
  billing_period VARCHAR(20) DEFAULT 'monthly',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- SUBSCRIPTIONS: Link members to plans
CREATE TABLE subscriptions (
  id SERIAL PRIMARY KEY,
  member_number VARCHAR(20) REFERENCES members(member_number),
  plan_id INTEGER REFERENCES plans(id),
  status VARCHAR(20) NOT NULL,
  start_date TIMESTAMP DEFAULT NOW(),
  end_date TIMESTAMP,
  amount NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- PAYMENTS: Payment history
CREATE TABLE payments (
  id SERIAL PRIMARY KEY,
  member_number VARCHAR(20) REFERENCES members(member_number),
  subscription_id INTEGER REFERENCES subscriptions(id),
  amount NUMERIC(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- COMMISSIONS: Agent commission tracking
CREATE TABLE commissions (
  id SERIAL PRIMARY KEY,
  agent_number VARCHAR(10),
  subscription_id INTEGER REFERENCES subscriptions(id),
  commission_amount NUMERIC(10,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);

-- LEADS: Contact form submissions
CREATE TABLE leads (
  id SERIAL PRIMARY KEY,
  first_name VARCHAR(30) NOT NULL,
  last_name VARCHAR(30) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(10),
  message TEXT,
  status VARCHAR(20) DEFAULT 'new',
  created_at TIMESTAMP DEFAULT NOW()
);
