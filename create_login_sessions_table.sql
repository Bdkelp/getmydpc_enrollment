
-- Create login_sessions table to track user login activity
CREATE TABLE IF NOT EXISTS login_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  login_time TIMESTAMPTZ DEFAULT NOW(),
  logout_time TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  session_duration_minutes INTEGER,
  device_type TEXT,
  browser TEXT,
  location TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_login_sessions_user_id ON login_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_login_sessions_login_time ON login_sessions(login_time);
CREATE INDEX IF NOT EXISTS idx_login_sessions_active ON login_sessions(is_active);

-- Enable RLS
ALTER TABLE login_sessions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own login sessions" ON login_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all login sessions" ON login_sessions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

CREATE POLICY "System can insert login sessions" ON login_sessions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "System can update login sessions" ON login_sessions
  FOR UPDATE USING (true);
