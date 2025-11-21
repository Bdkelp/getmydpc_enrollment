# EPX Certification Logging Guide

## Overview
EPX requires specific raw request/response data for certification. This system provides **TWO types of logs** to meet their requirements:

1. **Hosted Checkout (Browser-Side)** - Captured via Browser DevTools
2. **Server-Side API Logs** - Automatically logged by backend

---

## 1. Hosted Checkout Certification (BROWSER-SIDE)

### What EPX Needs to See:
- ✅ Raw request containing **reCaptcha token** (Google reCaptcha v3 enforced in production)
- ✅ Proof that requests are sent **from the browser** (not server-side)
- ✅ Hosted Checkout payload structure and response format

### How to Capture (F12 Network Tab Method):

1. **Open Enrollment Page**
   - Navigate to your enrollment/payment page
   - Press `F12` to open Browser DevTools

2. **Open Network Tab**
   - Click the **"Network"** tab in DevTools
   - Keep it open during the entire payment process

3. **Complete a Test Payment**
   - Fill out enrollment form
   - Submit payment using EPX Hosted Checkout
   - Watch for network requests in the DevTools

4. **Find the EPX Hosted Checkout Request**
   - Look for requests to `hosted.epx.com` or `hosted.epxuap.com`
   - Find the POST request with payment data

5. **Copy Request Data**
   - **Option A (Recommended)**: Right-click request → **"Copy"** → **"Copy as cURL"**
   - **Option B**: Right-click request → **"Copy"** → **"Copy all as HAR"**
   - **Option C**: Right-click request → **"Copy"** → **"Copy request headers"** + **"Copy response"**

6. **Save to .txt File**
   - Paste into a text file named: `epx-hosted-checkout-browser-{DATE}.txt`
   - Include both REQUEST and RESPONSE data

### Important: Verify reCaptcha Token
Check that the captured request includes:
```json
{
  "captcha": "03AGdBq24..." // or "bypass" in sandbox
  // OR
  "recaptchaToken": "03AGdBq24..."
}
```

⚠️ **EPX specifically mentioned:** "we would like to see a raw request and a raw response exchange with Server Post API"

While you're using Hosted Checkout (not Server Post), the principle is the same: they need to see the RAW browser-to-EPX communication.

---

## 2. Server-Side API Logs (BACKEND)

### What's Automatically Logged:

Our backend automatically captures:
- ✅ **EPX Environment Variables**:
  ```
  EPX_CUST_NBR: '9001'
  EPX_MERCH_NBR: '900300'
  EPX_DBA_NBR: '2'
  EPX_TERMINAL_NBR: '72'
  EPX_TERMINAL_PROFILE_ID: 'b1561c80-e81d-453f-9d05-a264dc96b88d'
  EPX_ENVIRONMENT: 'sandbox' or 'production'
  ```

- ✅ **Raw HTTP Requests**:
  - Method (POST, GET, etc.)
  - Full URL
  - All headers
  - Complete request body
  - IP address
  - User agent

- ✅ **Raw HTTP Responses**:
  - Status code
  - Response headers
  - Complete response body
  - Processing time (ms)

- ✅ **Transaction Details**:
  - Transaction ID
  - Amount
  - Status
  - Timestamp

### How to Export Server Logs:

1. **Login to Admin Dashboard**
   - Navigate to `/admin`

2. **Click "EPX Payment Logs"**
   - Find the "EPX Certification Logs" section (blue alert box)

3. **Export Server Logs**
   - Click **"Export Certification Logs"** button
   - Downloads a .txt file with all server-side logs

4. **Optional: Filter by Date**
   - Use the date range filter to export logs from specific periods
   - Useful for exporting October successful transactions

### Log File Structure:
```
==========================================================================
EPX PAYMENT CERTIFICATION LOG
==========================================================================

EPX ENVIRONMENT VARIABLES:
  EPX_CUST_NBR: '9001',
  EPX_MERCH_NBR: '900300',
  EPX_DBA_NBR: '2',
  EPX_TERMINAL_NBR: '72',
  EPX_TERMINAL_PROFILE_ID: 'b1561c80-e81d-453f-9d05-a264dc96b88d',
  EPX_ENVIRONMENT: 'sandbox',

TRANSACTION DETAILS:
  Transaction ID: 1234567890
  Customer ID: ***CUSTOMER_ID***
  Amount: $125.00
  Environment: SANDBOX
  Purpose: payment-creation
  Logged: 2025-11-20T12:34:56.789Z

SENSITIVE DATA MASKED:
  • customerId
  • customerEmail

--------------------------------------------------------------------------
HTTP REQUEST:
--------------------------------------------------------------------------

Method: POST
URL: https://your-railway-app.up.railway.app/api/epx/hosted/create-payment

Headers:
  content-type: application/json
  user-agent: Mozilla/5.0...

Body:
  {
    "amount": 125.00,
    "customerId": "***CUSTOMER_ID***",
    "customerEmail": "te***@***",
    "planId": "individual-monthly"
  }

  ⚠️ reCaptcha Token Present: YES
  reCaptcha Value: bypass

--------------------------------------------------------------------------
HTTP RESPONSE:
--------------------------------------------------------------------------

Status Code: 200
Processing Time: 145ms

Headers:
  content-type: application/json

Body:
  {
    "success": true,
    "transactionId": "1234567890",
    "sessionId": "1234567890",
    "publicKey": "eyAi..."
  }

==========================================================================
END OF LOG
==========================================================================
```

---

## 3. Enabling Certification Logging

### Environment Variables:

Add to Railway environment variables:
```env
ENABLE_CERTIFICATION_LOGGING=true
```

### Restart Required:
After enabling, restart the Railway backend:
1. Go to Railway dashboard
2. Restart the deployment
3. Verify logging is active in Admin → EPX Logs

### Check Status:
- Admin Dashboard → EPX Payment Logs
- Look for green "Logging Active" badge
- Shows number of certification logs captured

---

## 4. Submitting to EPX for Certification

### What to Send EPX:

**Package 1: Browser-Side Hosted Checkout**
- File: `epx-hosted-checkout-browser-{DATE}.txt`
- Contains: cURL or HAR format with reCaptcha token
- Proves: Requests sent from browser, includes reCaptcha

**Package 2: Server-Side API Logs**
- File: `epx-certification-logs-{DATE}.txt`
- Contains: EPX environment variables, raw HTTP request/response
- Proves: Correct configuration, proper field usage

### Email Template:
```
Subject: EPX Certification Logs - [Your Company Name]

Hi EPX Certification Team,

Attached are the certification logs you requested:

1. epx-hosted-checkout-browser-{DATE}.txt
   - Browser-captured Hosted Checkout request/response
   - Shows reCaptcha token in request
   - Demonstrates browser-originated requests

2. epx-certification-logs-{DATE}.txt
   - Server-side API logs
   - Includes EPX environment variables
   - Raw HTTP request/response data

EPX Configuration:
- EPX_CUST_NBR: 9001
- EPX_MERCH_NBR: 900300
- EPX_DBA_NBR: 2
- EPX_TERMINAL_NBR: 72
- Environment: [sandbox/production]
- Integration Type: Hosted Checkout

Please let me know if you need any additional information.

Best regards,
[Your Name]
```

---

## 5. Special Features

### October Successful Transactions Export:
If EPX needs historical data from October:

1. Admin → EPX Logs → "Export October Successful Only"
2. Downloads retroactive logs from all successful October transactions
3. Temporary files (delete after certification approval)

### Cleanup Temporary Files:
After EPX certification is approved:
1. Admin → EPX Logs → "Cleanup Temp Files"
2. Deletes all temporary certification exports
3. Keeps permanent logs intact

---

## 6. Security & Data Masking

### Automatically Masked Fields:
- ✅ Customer IDs
- ✅ Email addresses (partial)
- ✅ Card numbers (if present)
- ✅ CVV/CVC codes
- ✅ API keys and tokens
- ✅ Authorization headers
- ✅ MAC keys

### What's NOT Masked (EPX Needs These):
- ✅ Transaction IDs
- ✅ Amounts
- ✅ Status codes
- ✅ EPX environment variables
- ✅ reCaptcha tokens (needed for certification)
- ✅ Request/response structure

---

## 7. Troubleshooting

### "No logs available"
- Enable certification logging: `ENABLE_CERTIFICATION_LOGGING=true`
- Restart Railway backend
- Process a test payment
- Check Admin → EPX Logs

### "Can't find reCaptcha token in browser capture"
- Make sure to capture the **POST request** to EPX
- Look for `captcha` or `recaptchaToken` field in request body
- In sandbox, should show `"bypass"`
- In production, should show actual token starting with `03AG...`

### "EPX says they need Server Post, not Hosted Checkout"
- You're using Hosted Checkout (correct for your setup)
- The principle is the same: raw request/response data
- Browser-side capture shows the client-to-EPX communication
- Server-side logs show backend-to-EPX API calls
- Both together provide complete certification picture

---

## 8. Quick Reference

| Certification Type | Capture Method | What EPX Sees |
|-------------------|----------------|---------------|
| **Hosted Checkout** | Browser F12 → Network Tab → Copy as cURL | reCaptcha token, browser-originated request, EPX response |
| **Server API** | Admin → EPX Logs → Export | EPX env variables, raw API request/response, processing details |

**Both are required for complete EPX certification.**

---

## Contact Information

If EPX certification team has questions, provide:
- Railway deployment URL
- EPX environment (sandbox/production)
- Terminal Profile ID
- This certification guide

---

**Last Updated**: November 20, 2025
**Integration Type**: EPX Hosted Checkout
**Status**: Active logging enabled
