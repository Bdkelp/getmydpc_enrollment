-- Check current database and schema
SELECT current_database(), current_schema();

-- List all schemas
SELECT schema_name FROM information_schema.schemata;

-- Check if tables exist in any schema
SELECT schemaname, tablename 
FROM pg_tables 
WHERE tablename IN ('users', 'leads', 'plans')
ORDER BY schemaname, tablename;
