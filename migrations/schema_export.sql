-- Generated Schema Export from Neon Database
-- Date: 2025-10-23T23:21:35.944Z

-- Drop existing tables (in reverse order to handle foreign keys)
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS plans CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS members CASCADE;
DROP TABLE IF EXISTS leads CASCADE;
DROP TABLE IF EXISTS lead_activities CASCADE;
DROP TABLE IF EXISTS family_members CASCADE;
DROP TABLE IF EXISTS enrollment_modifications CASCADE;
DROP TABLE IF EXISTS commissions CASCADE;

-- Create tables

-- Table: commissions
CREATE TABLE commissions (id integer(32,0) NOT NULL DEFAULT nextval('commissions_id_seq'::regclass), agent_id character varying NOT NULL, subscription_id integer(32,0), member_id integer(32,0) NOT NULL, plan_name character varying NOT NULL, plan_type character varying NOT NULL, plan_tier character varying NOT NULL, commission_amount numeric(10,2) NOT NULL, total_plan_cost numeric(10,2) NOT NULL, status character varying NOT NULL DEFAULT 'pending'::character varying, payment_status character varying DEFAULT 'unpaid'::character varying, paid_date timestamp without time zone, cancellation_date timestamp without time zone, cancellation_reason text, created_at timestamp without time zone DEFAULT now(), updated_at timestamp without time zone DEFAULT now());

ALTER TABLE commissions ADD PRIMARY KEY (id);

-- Table: enrollment_modifications
CREATE TABLE enrollment_modifications (id integer(32,0) NOT NULL DEFAULT nextval('enrollment_modifications_id_seq'::regclass), user_id character varying NOT NULL, subscription_id integer(32,0), modified_by character varying NOT NULL, change_type character varying NOT NULL, change_details jsonb, consent_type character varying, consent_notes text, consent_date timestamp without time zone, created_at timestamp without time zone DEFAULT now());

ALTER TABLE enrollment_modifications ADD PRIMARY KEY (id);

-- Table: family_members
CREATE TABLE family_members (id integer(32,0) NOT NULL DEFAULT nextval('family_members_id_seq'::regclass), primary_user_id character varying NOT NULL, first_name character varying NOT NULL, last_name character varying NOT NULL, date_of_birth character varying, gender character varying, relationship character varying, is_active boolean DEFAULT true, created_at timestamp without time zone DEFAULT now(), middle_name character varying, ssn character varying, email character varying, phone character varying, member_type character varying NOT NULL, address text, address2 text, city character varying, state character varying, zip_code character varying, plan_start_date character varying);

ALTER TABLE family_members ADD PRIMARY KEY (id);

-- Table: lead_activities
CREATE TABLE lead_activities (id integer(32,0) NOT NULL DEFAULT nextval('lead_activities_id_seq'::regclass), lead_id integer(32,0), agent_id character varying(255), activity_type character varying(50), notes text, created_at timestamp without time zone DEFAULT now());

ALTER TABLE lead_activities ADD PRIMARY KEY (id);

-- Table: leads
CREATE TABLE leads (id integer(32,0) NOT NULL DEFAULT nextval('leads_id_seq'::regclass), first_name character varying(255) NOT NULL, last_name character varying(255) NOT NULL, email character varying(255) NOT NULL, phone character varying(50) NOT NULL, status character varying(50) DEFAULT 'new'::character varying, assigned_agent_id character varying(255), source character varying(50) DEFAULT 'contact_form'::character varying, notes text, created_at timestamp without time zone DEFAULT now(), updated_at timestamp without time zone DEFAULT now(), message text);

ALTER TABLE leads ADD PRIMARY KEY (id);

-- Table: members
CREATE TABLE members (id integer(32,0) NOT NULL DEFAULT nextval('members_id_seq'::regclass), customer_number character varying(20) NOT NULL, first_name character varying(50) NOT NULL, last_name character varying(50) NOT NULL, middle_name character varying(50), email character varying(100) NOT NULL, phone character(10), date_of_birth character(8), gender character(1), ssn character varying(255), address character varying(100), address2 character varying(50), city character varying(50), state character(2), zip_code character(5), emergency_contact_name character varying(100), emergency_contact_phone character(10), employer_name character varying(100), division_name character varying(100), member_type character varying(20), date_of_hire character(8), plan_start_date character(8), enrolled_by_agent_id character varying(255), agent_number character varying(20), enrollment_date timestamp without time zone DEFAULT now(), is_active boolean DEFAULT true, status character varying(20) DEFAULT 'active'::character varying, cancellation_date timestamp without time zone, cancellation_reason text, created_at timestamp without time zone DEFAULT now(), updated_at timestamp without time zone DEFAULT now(), plan_id integer(32,0), coverage_type character varying(50), total_monthly_price numeric(10,2), add_rx_valet boolean DEFAULT false);

ALTER TABLE members ADD PRIMARY KEY (id);

-- Table: payments
CREATE TABLE payments (id integer(32,0) NOT NULL DEFAULT nextval('payments_id_seq'::regclass), user_id character varying NOT NULL, subscription_id integer(32,0), amount numeric(10,2) NOT NULL, status character varying NOT NULL, stripe_payment_intent_id character varying, stripe_charge_id character varying, payment_method character varying, created_at timestamp without time zone DEFAULT now(), currency character varying DEFAULT 'USD'::character varying, transaction_id character varying, metadata jsonb, updated_at timestamp without time zone DEFAULT now());

ALTER TABLE payments ADD PRIMARY KEY (id);

-- Table: plans
CREATE TABLE plans (id integer(32,0) NOT NULL DEFAULT nextval('plans_id_seq'::regclass), name character varying NOT NULL, description text, price numeric(10,2) NOT NULL, billing_period character varying DEFAULT 'monthly'::character varying, features jsonb, max_members integer(32,0) DEFAULT 1, is_active boolean DEFAULT true, stripe_price_id character varying, created_at timestamp without time zone DEFAULT now(), updated_at timestamp without time zone DEFAULT now());

ALTER TABLE plans ADD PRIMARY KEY (id);

-- Table: sessions
CREATE TABLE sessions (sid character varying NOT NULL, sess jsonb NOT NULL, expire timestamp without time zone NOT NULL);

ALTER TABLE sessions ADD PRIMARY KEY (sid);

-- Table: subscriptions
CREATE TABLE subscriptions (id integer(32,0) NOT NULL DEFAULT nextval('subscriptions_id_seq'::regclass), member_id integer(32,0) NOT NULL, plan_id integer(32,0) NOT NULL, status character varying NOT NULL, start_date timestamp without time zone DEFAULT now(), end_date timestamp without time zone, next_billing_date timestamp without time zone, amount numeric(10,2) NOT NULL, stripe_subscription_id character varying, created_at timestamp without time zone DEFAULT now(), updated_at timestamp without time zone DEFAULT now(), pending_reason character varying, pending_details text);

ALTER TABLE subscriptions ADD PRIMARY KEY (id);

-- Table: users
CREATE TABLE users (id character varying NOT NULL, email character varying, first_name character varying, last_name character varying, profile_image_url character varying, phone character varying, date_of_birth character varying, gender character varying, address text, city character varying, state character varying, zip_code character varying, emergency_contact_name character varying, emergency_contact_phone character varying, stripe_customer_id character varying, stripe_subscription_id character varying, role character varying DEFAULT 'member'::character varying, is_active boolean DEFAULT true, created_at timestamp without time zone DEFAULT now(), updated_at timestamp without time zone DEFAULT now(), middle_name character varying, address2 text, employer_name character varying, division_name character varying, member_type character varying, ssn character varying, date_of_hire character varying, plan_start_date character varying, enrolled_by_agent_id character varying, agent_number character varying, username character varying, password_hash text, email_verified boolean DEFAULT false, email_verification_token text, reset_password_token text, reset_password_expiry timestamp without time zone, last_login_at timestamp without time zone, google_id character varying, facebook_id character varying, apple_id character varying, microsoft_id character varying, linkedin_id character varying, twitter_id character varying, approval_status character varying DEFAULT 'pending'::character varying, approved_at timestamp without time zone, approved_by character varying, rejection_reason text, email_verified_at timestamp without time zone, registration_ip character varying, registration_user_agent text, suspicious_flags jsonb, last_activity_at timestamp without time zone);

ALTER TABLE users ADD PRIMARY KEY (id);

-- Indexes

CREATE INDEX idx_members_agent_number ON public.members USING btree (agent_number);
CREATE INDEX idx_members_created_at ON public.members USING btree (created_at);
CREATE INDEX idx_members_customer_number ON public.members USING btree (customer_number);
CREATE INDEX idx_members_email ON public.members USING btree (email);
CREATE INDEX idx_members_enrolled_by ON public.members USING btree (enrolled_by_agent_id);
CREATE INDEX idx_members_status ON public.members USING btree (status);
CREATE UNIQUE INDEX members_customer_number_key ON public.members USING btree (customer_number);
CREATE UNIQUE INDEX members_email_key ON public.members USING btree (email);
CREATE UNIQUE INDEX payments_stripe_payment_intent_id_unique ON public.payments USING btree (stripe_payment_intent_id);
CREATE UNIQUE INDEX payments_transaction_id_unique ON public.payments USING btree (transaction_id);
CREATE INDEX "IDX_session_expire" ON public.sessions USING btree (expire);
CREATE UNIQUE INDEX subscriptions_stripe_subscription_id_unique ON public.subscriptions USING btree (stripe_subscription_id);
CREATE UNIQUE INDEX users_email_unique ON public.users USING btree (email);
CREATE UNIQUE INDEX users_stripe_customer_id_unique ON public.users USING btree (stripe_customer_id);
CREATE UNIQUE INDEX users_stripe_subscription_id_unique ON public.users USING btree (stripe_subscription_id);
