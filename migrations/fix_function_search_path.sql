-- ============================================================
-- Fix Function Search Path Security Warnings
-- ============================================================
-- Purpose: Set explicit search_path on custom functions to prevent
--          potential SQL injection via search_path manipulation
-- ============================================================

-- Drop existing functions first to avoid signature conflicts
DROP FUNCTION IF EXISTS generate_customer_number();
DROP FUNCTION IF EXISTS format_phone(text);
DROP FUNCTION IF EXISTS format_date_mmddyyyy(text);

-- Fix: generate_customer_number function
CREATE OR REPLACE FUNCTION generate_customer_number()
RETURNS VARCHAR(10)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    new_customer_number VARCHAR(10);
    exists_check INTEGER;
BEGIN
    LOOP
        -- Generate random 10-character alphanumeric string
        new_customer_number := UPPER(
            substring(md5(random()::text || clock_timestamp()::text) from 1 for 10)
        );
        
        -- Replace numbers with letters randomly for better readability
        new_customer_number := translate(
            new_customer_number,
            '0123456789',
            'ABCDEFGHJK'  -- Excluding I, L, O to avoid confusion with 1, 0
        );
        
        -- Check if this number already exists
        SELECT COUNT(*) INTO exists_check
        FROM members
        WHERE customer_number = new_customer_number;
        
        -- If unique, exit loop
        EXIT WHEN exists_check = 0;
    END LOOP;
    
    RETURN new_customer_number;
END;
$$;

COMMENT ON FUNCTION generate_customer_number() IS 'Generates unique 10-character customer IDs - Security: search_path fixed to public';

-- Fix: format_phone function
CREATE OR REPLACE FUNCTION format_phone(phone_input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Remove all non-numeric characters
    phone_input := regexp_replace(phone_input, '[^0-9]', '', 'g');
    
    -- Format as (XXX) XXX-XXXX if 10 digits
    IF length(phone_input) = 10 THEN
        RETURN '(' || substring(phone_input, 1, 3) || ') ' || 
               substring(phone_input, 4, 3) || '-' || 
               substring(phone_input, 7, 4);
    ELSE
        -- Return as-is if not 10 digits
        RETURN phone_input;
    END IF;
END;
$$;

COMMENT ON FUNCTION format_phone(text) IS 'Formats phone numbers as (XXX) XXX-XXXX - Security: search_path fixed to public';

-- Fix: format_date_mmddyyyy function
CREATE OR REPLACE FUNCTION format_date_mmddyyyy(date_input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Try to parse and reformat the date
    RETURN to_char(date_input::date, 'MM/DD/YYYY');
EXCEPTION
    WHEN OTHERS THEN
        -- Return original if parsing fails
        RETURN date_input;
END;
$$;

COMMENT ON FUNCTION format_date_mmddyyyy(text) IS 'Formats dates as MM/DD/YYYY - Security: search_path fixed to public';

-- Verification
DO $$
BEGIN
    RAISE NOTICE 'Function security update completed';
    RAISE NOTICE 'Updated functions: generate_customer_number, format_phone, format_date_mmddyyyy';
    RAISE NOTICE 'All functions now have fixed search_path for security';
END $$;
