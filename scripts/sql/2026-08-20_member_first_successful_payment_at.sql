-- Phase 2A preflight fix: members.first_payment_date is set at REGISTRATION
-- time (equal to enrollmentDate — see server/routes.ts "POST /api/registration",
-- and shared/schema.ts's own comment: "First payment date (same as
-- enrollmentDate, used for recurring billing)"). Because it is already
-- non-null before any payment occurs, PaymentConfirmedService's
-- `COALESCE(first_payment_date, ...)` can never actually update it upon a
-- real successful payment. first_payment_date must therefore NOT be treated
-- as proof of a successful payment.
--
-- This migration adds a dedicated, additive, nullable timestamp that is only
-- ever set by PaymentConfirmedService, first-write-wins, never backfilled.
--
-- Safe to run multiple times. Nothing existing is altered or deleted.

BEGIN;

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS first_successful_payment_at timestamptz;

COMMENT ON COLUMN public.members.first_successful_payment_at IS
  'When this member''s first payment was actually confirmed successful by PaymentConfirmedService (prefers the trusted provider transaction time when available, otherwise the platform confirmation time). Unlike first_payment_date, this is never set before a payment is confirmed and is never overwritten once set. NULL for historical members created before Phase 2A and for any member who has not yet had a successful payment confirmed through PaymentConfirmedService.';

CREATE INDEX IF NOT EXISTS idx_members_first_successful_payment_at
  ON public.members (first_successful_payment_at);

COMMIT;
