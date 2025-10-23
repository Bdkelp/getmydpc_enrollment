# Migration from Neon to Supabase Database

This guide will help you migrate all data from Neon PostgreSQL to Supabase PostgreSQL.

## Step 1: Get Supabase Database Connection String

1. Go to your Supabase project: https://supabase.com/dashboard/project/sgtnzhgxlkcvtrzejobx
2. Click on **Settings** (gear icon in left sidebar)
3. Click on **Database**
4. Scroll down to **Connection string**
5. Select the **URI** tab
6. Copy the connection string that looks like:
   ```
   postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
   ```
7. Replace `[YOUR-PASSWORD]` with your actual database password

## Step 2: Add to .env file

Add this line to your `.env` file:

```
SUPABASE_DATABASE_URL=postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

## Step 3: Run Migration Script

Once you've added the connection string, run:

```bash
cd server/scripts
npm run migrate
```

## What will be migrated:

- ✅ All users (login accounts + enrolled members)
- ✅ All members (enrollment data)
- ✅ All plans
- ✅ All payments
- ✅ All subscriptions
- ✅ All family members
- ✅ All commissions
- ✅ All sessions
- ✅ All leads

## After Migration:

1. Update your Railway environment variables to use `SUPABASE_DATABASE_URL` instead of `DATABASE_URL`
2. Restart your Railway deployment
3. Test that everything works
4. You can then safely remove the Neon database

## Rollback:

If anything goes wrong, you can easily switch back by changing `DATABASE_URL` back to the Neon URL in Railway.
