# Payment Processor Certification Logging Guide

## Overview

This guide explains how to use the **Payment Processor Certification Logging** system to capture raw EPX Hosted Checkout request/response data for submission to your payment processor for certification.

## Key Features

✅ **Raw Request/Response Capture** - Logs complete HTTP headers and bodies
✅ **Automatic Sensitive Data Masking** - Masks card numbers, tokens, MACs, and API keys
✅ **File-Based Output** - Organized .txt files for easy review
✅ **Sandbox & Production Support** - Works in both environments
✅ **Export Functionality** - Compile multiple transactions into one file for submission

## Getting Started

### 1. Enable Certification Logging

Add this to your `.env` file:

```bash
ENABLE_CERTIFICATION_LOGGING=true
EPX_ENVIRONMENT=sandbox  # or 'production'
```

Then restart your server:

```bash
npm run dev
```

### 2. Generate Test Logs (Optional)

To create sample certification logs without real transactions:

```bash
npm run cert:generate-test-logs
```

This creates 3 sample transactions in `logs/certification/raw-requests/`.

### 3. Generate Real Transaction Logs

Once certification logging is enabled, all payment transactions will automatically be logged:

1. Go to the payment page in your enrollment app
2. Complete a test payment (in sandbox mode, use test card `4111 1111 1111 1111`)
3. The transaction will be captured and logged automatically

### 4. View & Export Logs

**Check logs summary:**
```bash
curl http://localhost:3000/api/epx/certification/summary
```

**View certification report:**
```bash
curl http://localhost:3000/api/epx/certification/report
```

**Export all logs to single file:**
```bash
curl -X POST http://localhost:3000/api/epx/certification/export
```

**Generate test logs:**
```bash
npm run cert:generate-test-logs
```

**Export to single file:**
```bash
npm run cert:export-logs
```

## File Structure

```
logs/
└── certification/
    ├── raw-requests/           # Individual transaction logs
    │   ├── TEST_1234567_001.txt
    │   ├── TEST_1234567_002.txt
    │   └── ...
    └── summaries/              # Compiled exports
        └── EPX_CERTIFICATION_EXPORT_2024-01-15.txt
```

## What Gets Logged

### For Payment Creation (`POST /api/epx/hosted/create-payment`)

**Request includes:**
- Method: `POST`
- Endpoint: `/api/epx/hosted/create-payment`
- Headers: `content-type`, `user-agent`
- Body: amount, customer email (masked), customer name, plan ID
- IP address and user agent

**Response includes:**
- Status code: `200`
- Transaction ID, session ID
- Amount, environment, payment method
- Processing time

### For Payment Callback (`POST /api/epx/hosted/callback`)

**Request includes:**
- Method: `POST`
- Endpoint: `/api/epx/hosted/callback`
- Headers
- Body: transaction status, auth code (masked), amount

**Response includes:**
- Status code
- Success/failure status
- Transaction ID
- Processing time

## Sensitive Data Masking

The following fields are automatically masked:

**Card & Auth Data:**
- `card_number`, `cardNumber` → First 4 and last 4 digits visible
- `cvv`, `cvc`, `pin` → Fully masked
- `authCode`, `mac`, `mac_key` → First 4 and last 4 digits visible

**API & Auth Headers:**
- `Authorization`
- `X-API-Key`
- `X-Auth-Token`
- `Cookie`, `Set-Cookie`

**Personal Data:**
- Customer ID → `***CUSTOMER_ID***`
- Email addresses → First 2 chars + masked: `te***@***`

Each log file indicates which fields were masked in a "SENSITIVE DATA MASKED" section.

## Submitting for Certification

### Step 1: Generate Complete Export

```bash
npm run cert:export-logs
```

This creates a single .txt file in `logs/certification/summaries/` containing all transactions.

### Step 2: Review the File

Open the export file and verify:
- ✅ All transactions are included
- ✅ Sensitive data is masked appropriately
- ✅ Request/response pairs are complete

### Step 3: Submit to Processor

Send the .txt file to your payment processor with:

```
From: [Your email]
To: [Processor certification email]
Subject: EPX Hosted Checkout Certification - Request/Response Logs

Attached: EPX_CERTIFICATION_EXPORT_[DATE].txt

Body:
Please review the attached certification logs for our EPX Hosted Checkout integration.

These are sanitized request/response pairs from our payment processing system. 
Sensitive data (card numbers, tokens, MACs) has been masked while preserving 
the data structure and flow.

Environment: [Sandbox/Production]
Date Range: [Start] to [End]
Transaction Count: [Number]
```

## Example Log Entry

```
================================================================================
EPX PAYMENT CERTIFICATION LOG
================================================================================

TRANSACTION DETAILS:
  Transaction ID: TEST_1234567890_001
  Customer ID: customer-001
  Amount: $99.99
  Environment: SANDBOX
  Purpose: payment-creation
  Logged: 2024-01-15T10:30:45.123Z

SENSITIVE DATA MASKED:
  • customerId
  • customerEmail

--------------------------------------------------------------------------------
HTTP REQUEST:
--------------------------------------------------------------------------------

Method: POST
URL: https://api.getmydpc.com/api/epx/hosted/create-payment

Headers:
  content-type: application/json
  user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)

Body:
  {
    "amount": 99.99,
    "customerId": "***MASKED***",
    "customerEmail": "te***@***",
    "customerName": "Test User",
    "planId": "plan-premium",
    "description": "DPC Monthly Subscription"
  }

--------------------------------------------------------------------------------
HTTP RESPONSE:
--------------------------------------------------------------------------------

Status Code: 200
Processing Time: 245ms

Headers:
  content-type: application/json
  x-processing-time: 245ms

Body:
  {
    "success": true,
    "transactionId": "TEST_1234567890_001",
    "sessionId": "sess_a1b2c3d4e5",
    "amount": 99.99,
    "environment": "sandbox",
    "paymentMethod": "hosted-checkout"
  }

================================================================================
END OF LOG
================================================================================
```

## API Endpoints

### Get Logs Summary
```
GET /api/epx/certification/summary

Response:
{
  "success": true,
  "data": {
    "totalLogs": 5,
    "logFiles": ["TRANS_001.txt", "TRANS_002.txt", ...],
    "rawLogsDir": "/path/to/logs/certification/raw-requests"
  }
}
```

### Generate Report
```
GET /api/epx/certification/report

Response: Plain text report showing all logged transactions
```

### Export Logs
```
POST /api/epx/certification/export
Body: { "filename": "optional-custom-name.txt" }

Response:
{
  "success": true,
  "message": "All certification logs exported",
  "filepath": "/path/to/EPX_CERTIFICATION_EXPORT_2024-01-15.txt"
}
```

### Check Logging Status
```
POST /api/epx/certification/toggle

Response:
{
  "success": true,
  "currentState": true,
  "environment": "sandbox",
  "note": "Certification logging is currently ENABLED"
}
```

## Troubleshooting

### Logs not being created

1. **Check if logging is enabled:**
   ```bash
   curl http://localhost:3000/api/epx/certification/toggle
   ```

2. **Verify .env setting:**
   ```
   ENABLE_CERTIFICATION_LOGGING=true
   ```

3. **Ensure server restarted after .env change**

4. **Check logs directory exists:**
   ```bash
   ls -la logs/certification/raw-requests/
   ```

### Logs directory permissions error

```bash
# On Linux/Mac:
mkdir -p logs/certification/raw-requests logs/certification/summaries
chmod -R 755 logs/

# On Windows (PowerShell):
New-Item -ItemType Directory -Path "logs/certification/raw-requests" -Force
New-Item -ItemType Directory -Path "logs/certification/summaries" -Force
```

### Sensitive data not masked properly

The masking uses field name matching. If a field isn't being masked:

1. Check the field name is in the sensitive fields list (in `certification-logger.ts`)
2. Add new field names to the `sensitiveFields` array
3. Restart the server

## Best Practices

✅ **Do:**
- Generate logs in sandbox environment first
- Review all logs before submission
- Use the export function to compile all transactions
- Keep logs for audit trail (30+ days recommended)
- Regenerate logs periodically to verify consistency

❌ **Don't:**
- Submit logs without masking review
- Mix sandbox and production logs in one submission
- Delete logs immediately after submission
- Log production credentials in any format

## Performance Considerations

- Certification logging adds ~5-10ms per transaction
- Log files are typically 2-5 KB each
- No database writes (file-based only)
- Safe for production use with minimal overhead

## Support

For issues or questions:
1. Check the `logs/certification/` directory structure
2. Run `npm run cert:export-logs` to compile logs
3. Review the generated .txt files for format validation
4. Contact your payment processor with the exported log file

---

**Last Updated:** 2024
**Status:** Production Ready
**Environment Support:** Sandbox & Production
