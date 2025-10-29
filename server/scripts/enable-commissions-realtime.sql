-- Enable real-time replication for commissions table
-- Run this in Supabase SQL Editor

-- Enable realtime for commissions table
ALTER PUBLICATION supabase_realtime ADD TABLE commissions;

-- Verify the table is added to realtime
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' AND tablename = 'commissions';

-- Optional: Check all tables in realtime publication
-- SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

-- Success message
SELECT 'Real-time replication enabled for commissions table' AS status;