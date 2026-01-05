-- Platform-wide settings for runtime feature toggles (EPX sandbox/live, etc.)
CREATE TABLE IF NOT EXISTS platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id)
);

INSERT INTO platform_settings (key, value)
VALUES (
  'payment_environment',
  jsonb_build_object('environment', 'sandbox')
)
ON CONFLICT (key) DO NOTHING;
