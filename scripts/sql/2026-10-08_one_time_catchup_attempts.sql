-- Issue #28: durable standalone payment attempt ledger.
-- NOT APPLIED. Deploy only after tests and operator approval.
CREATE TABLE IF NOT EXISTS public.one_time_catchup_attempts (
  id bigserial PRIMARY KEY,
  request_key uuid NOT NULL UNIQUE,
  member_id integer NOT NULL REFERENCES public.members(id),
  subscription_id integer NOT NULL REFERENCES public.subscriptions(id),
  cycle_month date NOT NULL,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  processor_reference text NOT NULL UNIQUE, -- internal immutable request UUID
  epx_tran_nbr varchar(32), -- actual EPX-normalized on-wire transaction number
  state text NOT NULL DEFAULT 'reserved'
    CHECK (state IN ('reserved','submitting','succeeded','declined','unknown','record_pending')),
  initiated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  completed_at timestamptz,
  processor_auth_guid text,
  processor_auth_code text,
  processor_response_code text,
  payment_id integer REFERENCES public.payments(id),
  notes text,
  CONSTRAINT one_time_catchup_month_first CHECK
    (date_trunc('month',cycle_month::timestamp)::date=cycle_month)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_time_catchup_month
 ON public.one_time_catchup_attempts (subscription_id, cycle_month);
ALTER TABLE public.one_time_catchup_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.one_time_catchup_attempts FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.one_time_catchup_attempts_id_seq FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.one_time_catchup_attempts TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.one_time_catchup_attempts_id_seq TO service_role;
