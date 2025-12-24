-- Enable Row Level Security for discount code tables and restrict access to service role
BEGIN;

-- Discount codes definitions
ALTER TABLE IF EXISTS public.discount_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.member_discount_codes ENABLE ROW LEVEL SECURITY;

-- Policy helpers for discount_codes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'discount_codes'
      AND policyname = 'discount_codes_service_role_full_access'
  ) THEN
    CREATE POLICY discount_codes_service_role_full_access
      ON public.discount_codes
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- Policy helpers for member_discount_codes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'member_discount_codes'
      AND policyname = 'member_discount_codes_service_role_full_access'
  ) THEN
    CREATE POLICY member_discount_codes_service_role_full_access
      ON public.member_discount_codes
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

COMMIT;
