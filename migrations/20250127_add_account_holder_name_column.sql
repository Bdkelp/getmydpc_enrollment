ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS account_holder_name text;

UPDATE public.users
SET account_holder_name = NULLIF(TRIM(CONCAT_WS(' ', NULLIF(first_name, ''), NULLIF(last_name, ''))), '')
WHERE account_holder_name IS NULL;
