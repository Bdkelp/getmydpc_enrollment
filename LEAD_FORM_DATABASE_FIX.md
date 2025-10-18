# Lead Form Fix - Missing Database Columns

## Problem
The lead form submission was failing with error:
```
Database error: Could not find the 'assigned_agent_id' column of 'leads' in the schema cache
```

## Root Cause
The Supabase `leads` table is missing several columns that the application code expects:

**Current Supabase leads table columns:**
- ✅ `id` - primary key
- ✅ `first_name` - lead's first name
- ✅ `last_name` - lead's last name
- ✅ `email` - lead's email
- ✅ `phone` - lead's phone
- ✅ `message` - lead's message
- ✅ `status` - lead status
- ✅ `created_at` - timestamp

**Missing columns:**
- ❌ `source` - where the lead came from (e.g., 'contact_form')
- ❌ `assigned_agent_id` - which agent is assigned to this lead (NULL for unassigned)
- ❌ `notes` - additional notes about the lead
- ❌ `updated_at` - when the lead was last updated

## Solution

### Step 1: Add Missing Columns to Supabase

Run the SQL migration file in your **Supabase SQL Editor**:

**File:** `add_missing_leads_columns.sql`

This will add:
- `source VARCHAR(50) DEFAULT 'contact_form'`
- `assigned_agent_id VARCHAR(255)` (nullable - NULL means unassigned)
- `notes TEXT` (nullable)
- `updated_at TIMESTAMP DEFAULT NOW()`

### Step 2: Code Changes Made

Updated `server/storage.ts`:

**`createLead()` function:**
- Changed from camelCase to snake_case field names
- Maps JavaScript camelCase → PostgreSQL snake_case

**`updateLead()` function:**
- Changed from camelCase to snake_case field names
- Maps JavaScript camelCase → PostgreSQL snake_case

**`mapLeadFromDB()` helper:**
- Already supports both formats (snake_case || camelCase)

### Step 3: Workflow Confirmation

As you confirmed, the lead workflow is:

1. **Public visitor submits** → `assigned_agent_id` = NULL
2. **Admin reviews leads** → Manually assigns to agent
3. **Agent contacts lead** → Updates status/notes

This design is correct and supports the manual assignment workflow.

## Testing

After running the SQL migration, test with:

```bash
node test_lead_creation.mjs
```

Expected output:
```
✅ Lead created successfully!
   Lead ID: 1
   Name: Test User
   Email: testuser@example.com
   Status: new
   Source: contact_form
   Assigned Agent: None (as expected)
```

## Deployment

After running the SQL migration in Supabase:

1. The backend code is already fixed (uses snake_case)
2. Redeploy to Railway (code changes committed)
3. Test the public contact form on your website
4. Verify leads appear in admin panel with `assigned_agent_id` = NULL

## Column Naming Convention

**Important:** Supabase/PostgreSQL uses **snake_case** for column names:
- `first_name`, `last_name`, `assigned_agent_id`, `created_at`

**Application code** uses **camelCase** for JavaScript objects:
- `firstName`, `lastName`, `assignedAgentId`, `createdAt`

The `createLead()` and `updateLead()` functions handle the mapping between these formats.

## Status

- ✅ Code fixed (snake_case mapping)
- ⏳ SQL migration needs to be run in Supabase
- ⏳ Redeploy to Railway after SQL migration
- ⏳ Test public lead form submission

## Next Steps

1. **Run SQL migration** in Supabase SQL Editor:
   - Open Supabase dashboard
   - Go to SQL Editor
   - Paste contents of `add_missing_leads_columns.sql`
   - Click "Run"

2. **Verify columns added:**
   - Check Database → Tables → leads
   - Should see: source, assigned_agent_id, notes, updated_at

3. **Redeploy application:**
   - Commit and push code changes
   - Railway will auto-deploy
   - Or manually redeploy in Railway dashboard

4. **Test lead form:**
   - Visit public website
   - Submit contact form
   - Check admin panel for new lead
   - Verify `assigned_agent_id` is NULL
