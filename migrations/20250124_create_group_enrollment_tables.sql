CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Stage 1 Group Enrollment tables
CREATE TABLE IF NOT EXISTS public.groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    group_type text,
    payor_type text NOT NULL,
    discount_code text,
    discount_code_id integer REFERENCES public.discount_codes(id),
    status text NOT NULL DEFAULT 'draft',
    metadata jsonb,
    created_by uuid REFERENCES public.users(id),
    updated_by uuid REFERENCES public.users(id),
    registration_completed_at timestamptz,
    hosted_checkout_link text,
    hosted_checkout_status text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.group_members (
    id serial PRIMARY KEY,
    group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    member_id integer REFERENCES public.members(id),
    tier text NOT NULL,
    payor_type text NOT NULL,
    employer_amount numeric(10,2) DEFAULT 0,
    member_amount numeric(10,2) DEFAULT 0,
    discount_amount numeric(10,2) DEFAULT 0,
    total_amount numeric(10,2) DEFAULT 0,
    payment_status text DEFAULT 'pending',
    status text DEFAULT 'draft',
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text NOT NULL,
    phone varchar(20),
    date_of_birth varchar(8),
    metadata jsonb,
    registration_payload jsonb,
    registered_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    enrollment_completed_at timestamptz,
    notes text
);

CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON public.group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_member_id ON public.group_members(member_id);
CREATE INDEX IF NOT EXISTS idx_group_members_status ON public.group_members(status);
