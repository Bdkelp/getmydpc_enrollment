# Supabase Data Migration Guide

## Prerequisites
You'll need:
1. Access to your Supabase project dashboard
2. Supabase Service Role Key (not the anon key)

## Step 1: Get Your Supabase Service Role Key

1. Go to your Supabase project dashboard
2. Click on "Settings" (gear icon) in the left sidebar
3. Click on "API" under Configuration
4. Find "Service Role Key" (NOT the anon key)
5. Copy this key - you'll need it for the migration

## Step 2: Create Tables in Supabase

1. Go to your Supabase dashboard
2. Click on "SQL Editor" in the left sidebar
3. Click "New Query"
4. Copy the entire contents of `supabase_migration.sql`
5. Paste it into the SQL editor
6. Click "Run" to create all tables

## Step 3: Add Service Role Key to Environment

Add this to your .env file:
```
SUPABASE_SERVICE_KEY=your-service-role-key-here
```

## Step 4: Run the Migration

```bash
# Install required dependencies
npm install @supabase/supabase-js pg dotenv

# Run the migration script
npx tsx migrate-to-supabase.ts
```

## Step 5: Update Application Configuration

After migration, update your application to use Supabase for data:

1. Update `server/db.ts` to use Supabase connection
2. Update storage layer to use Supabase client

## What Gets Migrated

- ✅ Users (9 records)
- ✅ Plans (12 records)
- ✅ Subscriptions (22 records)
- ✅ Payments (0 records)
- ✅ Leads (11 records)
- ✅ Lead Activities
- ✅ Family Members (9 records)
- ✅ Enrollment Modifications

## Verification

After migration, check in Supabase:
1. Go to "Table Editor" in Supabase
2. Verify each table has the correct number of records
3. Test the application to ensure data is accessible

## Rollback Plan

If something goes wrong:
1. The Neon database remains unchanged
2. You can drop all tables in Supabase and start over
3. Your application still points to Neon until you update the configuration

## Notes

- The migration preserves all IDs and relationships
- Timestamps are maintained
- The script handles empty tables gracefully
- Row Level Security (RLS) is enabled for security