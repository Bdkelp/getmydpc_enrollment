-- Enable real-time replication for all important tables
-- Run this in Supabase SQL Editor to enable real-time updates

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS users;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS members;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS subscriptions;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS payments;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS commissions;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS leads;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS plans;

-- Verify all tables are added to realtime
SELECT 
  schemaname, 
  tablename,
  'Real-time enabled' AS status
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
  AND schemaname = 'public'
ORDER BY tablename;

-- Success message
SELECT 'Real-time replication enabled for all key tables' AS result;