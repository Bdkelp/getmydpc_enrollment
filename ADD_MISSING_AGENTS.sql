-- Add missing users: Ana Vasquez and Sean Casados
-- Run this in Supabase SQL Editor if they don't exist

-- Check if Ana Vasquez exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'addsumbalance@gmail.com') THEN
    INSERT INTO users (
      id,
      email,
      first_name,
      last_name,
      phone,
      role,
      agent_number,
      is_active,
      approval_status,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      'addsumbalance@gmail.com',
      'Ana',
      'Vasquez',
      '956.221.2464',
      'agent',
      'MPP0006',
      true,
      'approved',
      NOW(),
      NOW()
    );
    RAISE NOTICE 'Added Ana Vasquez (addsumbalance@gmail.com)';
  ELSE
    RAISE NOTICE 'Ana Vasquez already exists';
  END IF;
END $$;

-- Check if Sean Casados exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'sean@sciahealthins.com') THEN
    INSERT INTO users (
      id,
      email,
      first_name,
      last_name,
      phone,
      role,
      agent_number,
      is_active,
      approval_status,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      'sean@sciahealthins.com',
      'Sean',
      'Casados',
      '720.584.6097',
      'agent',
      'MPP0007',
      true,
      'approved',
      NOW(),
      NOW()
    );
    RAISE NOTICE 'Added Sean Casados (sean@sciahealthins.com)';
  ELSE
    RAISE NOTICE 'Sean Casados already exists';
  END IF;
END $$;

-- Verify they were added
SELECT 
  email,
  first_name,
  last_name,
  agent_number,
  role,
  is_active,
  approval_status
FROM users
WHERE email IN ('addsumbalance@gmail.com', 'sean@sciahealthins.com')
ORDER BY email;
