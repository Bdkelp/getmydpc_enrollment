
-- Enable real-time on all tables
ALTER publication supabase_realtime ADD TABLE users;
ALTER publication supabase_realtime ADD TABLE subscriptions;
ALTER publication supabase_realtime ADD TABLE payments;
ALTER publication supabase_realtime ADD TABLE plans;
ALTER publication supabase_realtime ADD TABLE family_members;
ALTER publication supabase_realtime ADD TABLE leads;

-- Verify real-time is enabled
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';
