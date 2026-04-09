-- Enforce commission unit uniqueness at the database layer.
-- Rule: direct and override are separate lanes; each lane can appear once per enrollment unit.
-- Enrollment unit is normalized as member_id + enrollment_id (with null/blank enrollment_id collapsed).

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_commissions_enrollment_unit_lane
ON public.agent_commissions (
  member_id,
  COALESCE(NULLIF(enrollment_id, ''), '__NO_ENROLLMENT__'),
  agent_id,
  COALESCE(NULLIF(commission_type, ''), 'direct'),
  COALESCE(override_for_agent_id, '__NO_OVERRIDE__')
);
