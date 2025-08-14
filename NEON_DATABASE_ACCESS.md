# Neon Database Access Guide

## Database Connection Information

Your application uses a Neon PostgreSQL database for all business data (leads, users, enrollments, subscriptions).

### Connection Details
- **Provider**: Neon (Serverless PostgreSQL)
- **Database URL**: Stored in `DATABASE_URL` environment variable
- **Region**: US East 2 (AWS)

## How to Access Your Database

### Option 1: Neon Dashboard (Recommended)
1. Go to https://console.neon.tech
2. Sign in with your account
3. Select your project: `neondb`
4. Use the SQL Editor to run queries

### Option 2: Database Client Tools
You can connect using any PostgreSQL client:
- **TablePlus** (Mac/Windows/Linux)
- **pgAdmin** (Free, all platforms)
- **DBeaver** (Free, all platforms)
- **DataGrip** (JetBrains)

Connection string format:
```
postgresql://[username]:[password]@[endpoint]/neondb?sslmode=require
```

### Option 3: Command Line (psql)
```bash
psql [DATABASE_URL]
```

## Current Database Schema

### Tables Overview
- **users**: All user accounts (agents, admins, members)
- **leads**: Sales leads from contact forms
- **subscriptions**: Active membership subscriptions
- **plans**: Available membership plans
- **family_members**: Family members for family plans
- **lead_activities**: Lead interaction history
- **payments**: Payment records
- **enrollment_modifications**: Enrollment changes history

## Useful SQL Queries

### View All Leads
```sql
SELECT 
  id,
  first_name,
  last_name,
  email,
  phone,
  status,
  created_at
FROM leads
ORDER BY created_at DESC;
```

### View Recent Enrollments
```sql
SELECT 
  u.id,
  u.first_name,
  u.last_name,
  u.email,
  u.role,
  s.status as subscription_status,
  p.name as plan_name,
  s.amount as monthly_amount,
  u.created_at as enrolled_date
FROM users u
LEFT JOIN subscriptions s ON u.id = s.user_id
LEFT JOIN plans p ON s.plan_id = p.id
WHERE u.role = 'user'
ORDER BY u.created_at DESC;
```

### View Active Subscriptions
```sql
SELECT 
  s.*,
  u.first_name,
  u.last_name,
  u.email,
  p.name as plan_name
FROM subscriptions s
JOIN users u ON s.user_id = u.id
JOIN plans p ON s.plan_id = p.id
WHERE s.status = 'active'
ORDER BY s.created_at DESC;
```

### Count Summary
```sql
SELECT 
  'Total Users' as metric, COUNT(*) as count FROM users
UNION ALL
SELECT 'Total Leads', COUNT(*) FROM leads
UNION ALL
SELECT 'Active Subscriptions', COUNT(*) FROM subscriptions WHERE status = 'active'
UNION ALL
SELECT 'Total Plans', COUNT(*) FROM plans;
```

### Export Leads to CSV
```sql
COPY (
  SELECT * FROM leads ORDER BY created_at DESC
) TO STDOUT WITH CSV HEADER;
```

## Admin Dashboard Data Access

Your application already has built-in data viewers:

### For Admins:
- **Lead Management**: `/admin/leads` - View and manage all leads
- **View Enrollments**: `/admin/enrollments` - See all enrolled members
- **User Roles**: `/admin/users` - Manage user roles and permissions

### For Agents:
- **Agent Dashboard**: `/agent` - View assigned leads and enrollments
- **My Leads**: `/agent/leads` - Manage assigned leads

## Backup and Export

### Manual Backup
1. Log into Neon Console
2. Go to Settings > Backups
3. Create a manual backup

### Export All Data
Use pg_dump:
```bash
pg_dump [DATABASE_URL] > backup.sql
```

## Security Notes

- Never share your DATABASE_URL publicly
- Use read-only credentials for reporting
- Enable Row Level Security (RLS) for sensitive data
- Regular backups are automatic in Neon

## Getting Your Connection String

1. In Replit, the DATABASE_URL is automatically configured
2. To view it (be careful not to expose it):
   ```bash
   echo $DATABASE_URL | sed 's/\/\/.*@/\/\/[credentials]@/'
   ```

## Support

- **Neon Documentation**: https://neon.tech/docs
- **Neon Status**: https://neonstatus.com
- **Support**: support@neon.tech

## Migration to Other Providers

If you decide to migrate later:
1. Export data using pg_dump
2. Import to new provider
3. Update DATABASE_URL
4. No code changes needed (uses standard PostgreSQL)