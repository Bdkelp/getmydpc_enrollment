# Lead Form Fix - Column Name Mismatch (UPDATED)

## Issue
Lead form was failing with 500 error: "Could not find the 'assigned_agent_id' column of 'leads' in the schema cache"

## Root Cause
The `storage.createLead()` function was trying to insert data with snake_case column names (`first_name`, `assigned_agent_id`, etc.), but the `leads` table in the database uses camelCase column names (`firstName`, `assignedAgentId`, etc.).

## Solution

### 1. Fixed Database Column Mapping (server/storage.ts)
**Changed from:**
```typescript
const dbData = {
  first_name: leadData.firstName.trim(),
  last_name: leadData.lastName.trim(),
  // ... snake_case columns
  assigned_agent_id: leadData.assignedAgentId || null,
};
```

**Changed to:**
```typescript
const dbData = {
  firstName: leadData.firstName.trim(),
  lastName: leadData.lastName.trim(),
  // ... camelCase columns
  assignedAgentId: leadData.assignedAgentId || null,
};
```

### 2. Added Email Notification (server/email.ts)
Created new email service that sends notifications to `info@mypremierplans.com` when leads are submitted.

**Features:**
- Uses nodemailer with configurable email service (Gmail, Outlook, etc.)
- Gracefully handles missing email credentials (logs warning but doesn't fail)
- Sends formatted HTML email with lead details

### 3. Integrated Email in Lead Submission (server/routes.ts)
Added email notification after successful lead creation:
```typescript
await sendLeadNotification({
  firstName: leadData.firstName,
  lastName: leadData.lastName,
  email: leadData.email,
  phone: leadData.phone,
  message: leadData.message,
  source: leadData.source,
});
```

**Important:** Email errors don't fail the lead submission - leads are still saved even if email fails.

## Testing

Run the test script to verify lead form works:
```bash
node test_lead_form.mjs
```

## Environment Variables

Add these to your `.env` file to enable email notifications:
```bash
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
```

**Note:** For Gmail, you need to generate an app-specific password at https://myaccount.google.com/apppasswords

## Lead Assignment Workflow

1. **Lead Submission** - Public users submit lead form (no authentication required)
2. **Email Notification** - Notification sent to info@mypremierplans.com
3. **Manual Assignment** - Admins manually assign leads to agents via dashboard
4. **Agent Follow-up** - Assigned agent follows up with lead

The `assignedAgentId` field remains `null` until manually assigned by an admin.

## Files Modified
- `server/storage.ts` - Fixed column name mapping
- `server/routes.ts` - Added email notification
- `server/email.ts` - Created email service
- `.env.example` - Documented email environment variables
- `test_lead_form.mjs` - Created test script

## Status
✅ Lead form fixed and tested
✅ Email notification added
✅ Environment variables documented
✅ Test script created
