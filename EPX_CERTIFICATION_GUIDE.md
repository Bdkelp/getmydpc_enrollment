# EPX Certification Logging Guide

## Overview

This system captures raw HTTP request/response data for EPX payment certification. EPX requires these logs to verify your integration is implemented correctly before production use.

## What EPX Requires

> "We simply ask that you log the raw request and response for each call you wish to certify and copy/paste this information for our review. (Preferably in a .txt, and you can remove/mask any sensitive data if needed)"

## How It Works

### 1. Automatic Logging

When `ENABLE_CERTIFICATION_LOGGING=true` is set in your `.env` file, the system automatically:

- Captures every payment creation request
- Captures every EPX callback response
- Logs raw HTTP headers and body data
- Automatically masks sensitive data (card numbers, auth tokens, etc.)
- Saves each transaction to a separate `.txt` file

### 2. Log Location

Logs are saved to:
```
logs/certification/raw-requests/
```

Each log file is named:
```
{transactionId}_{purpose}.txt
```

For example:
```
1731889234_payment-creation.txt
1731889234_callback-processing.txt
```

### 3. What's Captured

Each log file contains:

**Transaction Details:**
- Transaction ID
- Customer ID
- Amount
- Environment (sandbox/production)
- Timestamp

**HTTP Request:**
- Method (POST/GET)
- URL
- Headers
- Body (JSON formatted)

**HTTP Response:**
- Status Code
- Processing Time
- Headers
- Body (JSON formatted)

**Sensitive Data Handling:**
- List of masked fields
- Card numbers: Shows first 4 and last 4 digits
- Auth tokens: Masked with ***
- Passwords/secrets: Completely masked

## How to Access Logs

### Option 1: Admin Dashboard (Recommended)

1. Log in as admin or super_admin
2. Navigate to: **Admin → EPX Logs** (`/admin/epx-logs`)
3. Click **"Export Certification Logs"** button
4. A summary file will download automatically
5. The full logs are available on the server at `logs/certification/raw-requests/`

### Option 2: API Endpoint

```bash
GET /api/admin/epx-certification-logs
Authorization: Bearer {your-admin-token}
```

Response:
```json
{
  "success": true,
  "summary": {
    "totalLogs": 5,
    "logsDirectory": "/path/to/logs/certification/raw-requests",
    "exportedFile": "/path/to/logs/certification/summaries/certification_export_2024-11-17.txt",
    "instructions": [
      "Each log file contains raw HTTP request/response data for EPX certification",
      "Sensitive data (card numbers, auth tokens) has been masked",
      "Submit the exported file or individual log files to EPX for certification review",
      "Files are in .txt format for easy viewing and sharing"
    ]
  },
  "logFiles": [
    "1731889234_payment-creation.txt",
    "1731889234_callback-processing.txt"
  ],
  "environment": "sandbox",
  "terminalProfileId": "b1561c80-e81d-453f-9d05-a264dc96b88d"
}
```

### Option 3: Direct File Access (Server)

If you have server access:
```bash
cd logs/certification/raw-requests
ls -la
cat 1731889234_payment-creation.txt
```

## Submitting to EPX

1. **Export the logs** using the admin dashboard
2. **Review the logs** - ensure no unmasked sensitive data
3. **Create a support ticket** with EPX
4. **Attach the log files** (either individual .txt files or the consolidated export)
5. **Specify what you're certifying**:
   - Payment creation calls
   - Callback processing
   - Specific transaction flows

## Sample Log Format

```
================================================================================
EPX PAYMENT CERTIFICATION LOG
================================================================================

TRANSACTION DETAILS:
  Transaction ID: 1731889234
  Customer ID: 123
  Amount: $149.00
  Environment: SANDBOX
  Purpose: payment-creation
  Logged: 2024-11-17T10:30:00.000Z

SENSITIVE DATA MASKED:
  • customerId
  • customerEmail
  • billingAddress

--------------------------------------------------------------------------------
HTTP REQUEST:
--------------------------------------------------------------------------------

Method: POST
URL: https://your-domain.com/api/epx/hosted/create-payment

Headers:
  content-type: application/json
  user-agent: Mozilla/5.0...

Body:
  {
    "amount": 149,
    "customerId": "***MASKED***",
    "customerEmail": "***MASKED***",
    "planId": "individual-monthly"
  }

--------------------------------------------------------------------------------
HTTP RESPONSE:
--------------------------------------------------------------------------------

Status Code: 200
Processing Time: 234ms

Headers:
  content-type: application/json

Body:
  {
    "success": true,
    "transactionId": "1731889234",
    "publicKey": "eyAi...",
    "environment": "sandbox"
  }

================================================================================
END OF LOG
================================================================================
```

## Configuration

### Enable Certification Logging

In `.env`:
```bash
ENABLE_CERTIFICATION_LOGGING=true
```

### Disable Certification Logging

In `.env`:
```bash
ENABLE_CERTIFICATION_LOGGING=false
```

Or simply remove the variable (defaults to disabled).

## Important Notes

1. **Only enable in development/sandbox** initially
2. **Logs contain masked sensitive data** - safe to share with EPX
3. **Each transaction creates 2 log files** (request creation + callback)
4. **Logs are stored locally on the server** - ensure adequate disk space
5. **Production logs should be monitored** - consider log rotation

## Testing

To generate test logs:

1. Enable certification logging: `ENABLE_CERTIFICATION_LOGGING=true`
2. Create a test enrollment at `/registration`
3. Complete payment flow
4. Check `logs/certification/raw-requests/` for new files
5. Access via admin dashboard to export

## Troubleshooting

### No logs being created

- Check `ENABLE_CERTIFICATION_LOGGING=true` is set
- Verify `logs/certification/raw-requests/` directory exists
- Check server console for certification logger messages

### Can't access admin dashboard

- Ensure you're logged in as admin or super_admin
- Check that `/admin/epx-logs` route is accessible
- Verify the App.tsx includes the AdminEPXLogs route

### Export shows no files

- No test transactions have been completed yet
- Certification logging was disabled during testing
- Logs directory doesn't exist (check server permissions)

## Production Readiness

Before going to production:

1. ✅ Complete sandbox testing with certification logs
2. ✅ Submit logs to EPX for certification approval
3. ✅ Wait for EPX certification confirmation
4. ✅ Update `EPX_ENVIRONMENT=production` in Railway
5. ✅ Keep `ENABLE_CERTIFICATION_LOGGING=true` initially
6. ✅ Monitor first production transactions
7. ✅ Optionally disable certification logging after verification

## Support

If you need help with certification logs:

1. Check the log files directly on the server
2. Use the admin dashboard to export and review
3. Contact EPX support with specific transaction IDs
4. Reference this guide for log format and data captured
