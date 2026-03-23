-- Initialize group profile metadata for existing groups
-- This keeps current behavior while enabling profile completion and update workflows.

UPDATE public.groups
SET metadata =
  COALESCE(metadata, '{}'::jsonb)
  || jsonb_build_object(
    'groupProfile',
    COALESCE(metadata->'groupProfile', '{}'::jsonb)
    || jsonb_build_object(
      'ein', COALESCE(metadata->'groupProfile'->>'ein', NULL),
      'responsiblePerson', COALESCE(
        metadata->'groupProfile'->'responsiblePerson',
        jsonb_build_object('name', NULL, 'email', NULL, 'phone', NULL)
      ),
      'contactPerson', COALESCE(
        metadata->'groupProfile'->'contactPerson',
        jsonb_build_object('name', NULL, 'email', NULL, 'phone', NULL)
      ),
      'payorMix', COALESCE(
        metadata->'groupProfile'->'payorMix',
        jsonb_build_object(
          'mode', CASE
            WHEN payor_type = 'full' THEN 'full'
            WHEN payor_type = 'member' THEN 'member'
            ELSE 'fixed'
          END,
          'employerFixedAmount', NULL,
          'memberFixedAmount', NULL,
          'employerPercentage', NULL,
          'memberPercentage', NULL
        )
      ),
      'preferredPaymentMethod', COALESCE(metadata->'groupProfile'->>'preferredPaymentMethod', NULL),
      'achDetails', COALESCE(
        metadata->'groupProfile'->'achDetails',
        jsonb_build_object(
          'routingNumber', NULL,
          'accountNumber', NULL,
          'bankName', NULL,
          'accountType', NULL
        )
      )
    )
  ),
  updated_at = NOW();
