# Database Access Guide

## Database Architecture

Your application uses a **dual-database architecture**:

### 🔐 Supabase - Authentication Only
- **Provider**: Supabase (Managed PostgreSQL)
- **Purpose**: User authentication and session management
- **Features**: Sign up/login, password reset, JWT tokens, OAuth
- **Access**: Via Supabase Auth client

### 💾 Neon - All Business Data
- **Provider**: Neon (Serverless PostgreSQL)
- **Purpose**: ALL business data storage
- **Tables**: leads, users, enrollments, subscriptions, commissions, payments, plans, family_members
- **Access**: Direct SQL via `neonPool` connection (server/lib/neonDb.ts)

### Connection Details
- **Authentication**: Supabase Auth (`supabase.auth.*`)
- **Data Operations**: Neon PostgreSQL (via `DATABASE_URL`)

## How to Access Your Database

### Option 1: Supabase Dashboard (Recommended)
1. Go to https://supabase.com/dashboard
2. Sign in with your account
3. Select your project
4. Use the SQL Editor or Table Editor

### Option 2: Application Admin Dashboard
- Your application has built-in data management at `/admin`
- Real-time data access through Supabase APIs
- No direct database connection needed

### Option 3: Supabase API
All data operations use Supabase's REST API and real-time subscriptions

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

### Automatic Backups
- Supabase provides automatic daily backups
- Point-in-time recovery available
- Access backups through Supabase Dashboard

### Export Data
- Use Supabase Dashboard's export features
- Export via API calls or SQL queries
- CSV/JSON export options available

## Security Notes

- Never share Supabase credentials publicly
- Row Level Security (RLS) is enabled on all tables
- API keys are environment-specific
- Built-in authentication and authorization

## Environment Configuration

Supabase credentials are configured via environment variables:
- `SUPABASE_URL`: Your project URL
- `SUPABASE_ANON_KEY`: Public API key
- `SUPABASE_SERVICE_ROLE_KEY`: Private API key (server-side only)

## Support

- **Supabase Documentation**: https://supabase.com/docs
- **Supabase Status**: https://status.supabase.com
- **Support**: Via Supabase Dashboard or Discord

## Data Management

All data operations now use Supabase:
- Real-time subscriptions for live updates
- Built-in authentication and user management
- Automatic API generation
- Edge functions for custom logic