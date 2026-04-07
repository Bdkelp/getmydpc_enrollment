-- Ensure subscriptions.member_id does not block hard deletes of members.
-- Recreate the FK as ON DELETE CASCADE in a defensive, idempotent way.
DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT tc.constraint_name
  INTO fk_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
   AND tc.table_schema = ccu.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND tc.table_name = 'subscriptions'
    AND kcu.column_name = 'member_id'
    AND ccu.table_schema = 'public'
    AND ccu.table_name = 'members'
    AND ccu.column_name = 'id'
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.subscriptions DROP CONSTRAINT %I', fk_name);
  END IF;
END
$$;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_member_id_members_id_fk
  FOREIGN KEY (member_id)
  REFERENCES public.members(id)
  ON DELETE CASCADE;
