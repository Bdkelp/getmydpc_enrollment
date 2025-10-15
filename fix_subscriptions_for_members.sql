-- Fix subscriptions table to work with members (not users)
-- Members are healthcare customers, users are agents/admins

-- 1. Drop the foreign key constraint from subscriptions.user_id to users.id
ALTER TABLE subscriptions 
DROP CONSTRAINT IF EXISTS subscriptions_user_id_users_id_fk;

-- 2. Rename user_id to member_id for clarity (optional but recommended)
-- This makes it clear that subscriptions belong to members, not users
ALTER TABLE subscriptions 
RENAME COLUMN user_id TO member_id;

-- 3. Add foreign key to members table instead
ALTER TABLE subscriptions
ADD CONSTRAINT subscriptions_member_id_members_id_fk 
FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;

-- 4. Fix commissions table similarly
-- Drop old FK constraint on user_id
ALTER TABLE commissions
DROP CONSTRAINT IF EXISTS commissions_user_id_users_id_fk;

-- 5. Rename user_id to member_id in commissions table
ALTER TABLE commissions
RENAME COLUMN user_id TO member_id;

-- 6. Add FK to members table
ALTER TABLE commissions
ADD CONSTRAINT commissions_member_id_members_id_fk
FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;

-- 7. Make subscription_id nullable in commissions (some members may not have subscriptions yet)
ALTER TABLE commissions
ALTER COLUMN subscription_id DROP NOT NULL;

-- 8. Drop FK constraint on subscription_id (we'll track by member_id instead)
ALTER TABLE commissions
DROP CONSTRAINT IF EXISTS commissions_subscription_id_subscriptions_id_fk;

-- Summary:
-- ✅ subscriptions.member_id now references members.id (not users.id)
-- ✅ commissions.member_id now references members.id (not users.id)
-- ✅ commissions.agent_id still references users.id (agents are users)
-- ✅ subscriptions are for members (healthcare customers)
-- ✅ users table is for agents and admins only
