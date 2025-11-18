# EPX Certification Logging Guide

## Quick Status Check

### Option 1: Via Admin Dashboard (Recommended)
1. Login as super_admin (michael@mypremierplans.com)
2. Go to Admin Dashboard → EPX Logs
3. Look at the blue "EPX Certification Logs" section at the top
4. You'll see a badge showing:
   - ✅ **"Logging Active"** (green) = Certification logging is enabled
   - ❌ **"Logging Disabled"** (red) = Certification logging is disabled
5. The section also shows:
   - Number of available certification logs
   - Current environment (sandbox/production)
   - List of all log files with filenames

### Option 2: Via Railway Logs
1. Go to Railway dashboard → getmydpcenrollment-production service
2. Click "Deployments" → Select latest deployment → "View Logs"
3. Look for lines like:
   ```
   [Certification Logger] ✅ Logged transaction 3421015235 to 3421015235_callback-processing.txt
   ```
4. If you see these, logging is active

### Option 3: Via API Endpoint
```bash
curl https://getmydpcenrollment-production.up.railway.app/api/admin/epx-certification-status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Response:
```json
{
  "success": true,
  "certificationLoggingEnabled": true,  // ← This tells you the status
  "totalLogs": 5,
  "environment": "sandbox",
  "logFiles": ["3421015235_callback-processing.txt", ...]
}
```

## Enabling Certification Logging in Railway

### Step 1: Set Environment Variable
1. Go to: https://railway.app/dashboard
2. Select: **getmydpcenrollment-production** service
3. Click: **Variables** tab
4. Click: **+ New Variable**
5. Add:
   - Variable: `ENABLE_CERTIFICATION_LOGGING`
   - Value: `true`
6. Click: **Add**
7. Railway will automatically redeploy (takes ~2 minutes)

### Step 2: Verify It's Enabled
1. Wait for Railway deployment to complete
2. Go to Admin Dashboard → EPX Logs
3. Click "Check Status" button
4. Badge should now show **"Logging Active"** (green)

## Retrieving Certification Logs

### Get All Current Logs
1. Admin Dashboard → EPX Logs
2. Look for blue "EPX Certification Logs" section
3. Click: **"Export Certification Logs (X)"** button
   - The number in parentheses shows how many logs will be exported
4. File downloads as: `epx-certification-logs-YYYY-MM-DD.txt`

### Get Logs from Specific Date Range (e.g., Earlier This Month)
1. Admin Dashboard → EPX Logs
2. Scroll to "Available Log Files" section (shows if logs exist)
3. Use the **"Filter by Date Range"** controls:
   - **Start Date**: Select the beginning of your range (e.g., November 1, 2025)
   - **End Date**: Select the end of your range (e.g., November 10, 2025)
4. Click: **"Export Range"** button
5. File downloads as: `epx-certification-logs-YYYY-MM-DD-to-YYYY-MM-DD.txt`

**Note:** Date filtering uses file modification time, so it finds logs created/modified within that date range.

### Leave Both Dates Empty
- Exports ALL logs (same as clicking main "Export Certification Logs" button)

## Log File Format

Each exported .txt file contains:

```
=============================================================================
FULL CERTIFICATION LOG EXPORT
=============================================================================
Generated: 2025-11-17T10:30:00.000Z
Total Transactions: 5
=============================================================================

=============================================================================
CERTIFICATION LOG - Transaction 3421015235
=============================================================================

Transaction ID: 3421015235
Customer ID: cust_123
Amount: $89.00
Environment: sandbox
Purpose: callback-processing
Timestamp: 2025-11-17T10:25:00.000Z

SENSITIVE DATA MASKED:
  - card_number
  - authorization
  - mac_key

--------------------------------------------------------------------------------
HTTP REQUEST:
--------------------------------------------------------------------------------

Method: POST
URL: https://your-app.railway.app/api/epx/hosted/callback
Headers:
  content-type: application/x-www-form-urlencoded
  user-agent: EPX/1.0
  ...

Body:
{
  "transactionId": "3421015235",
  "amount": "89.00",
  "cardNumber": "4111********1111",  // ← Automatically masked
  ...
}

--------------------------------------------------------------------------------
HTTP RESPONSE:
--------------------------------------------------------------------------------

Status Code: 200
Processing Time: 245ms

Headers:
  content-type: application/json
  ...

Body:
{
  "success": true,
  "message": "Payment processed successfully"
}

=============================================================================
END OF LOG
=============================================================================

[Next transaction follows...]
```

## Running Test Transactions

### Prerequisite
Make sure `ENABLE_CERTIFICATION_LOGGING=true` is set in Railway (see above)

### Step 1: Run Mock Enrollments
1. Go to: https://enrollment.getmydpc.com
2. Complete enrollment form with test data:
   - **Use Agent Code**: MPP0001 (Michael's code)
   - **Test Card**: 4111 1111 1111 1111 (EPX sandbox test card)
   - **Expiry**: Any future date
   - **CVV**: 123
   - **Amount**: Select any plan

### Step 2: Monitor Railway Logs
1. Go to Railway → getmydpcenrollment-production → Deployments → View Logs
2. Watch for:
   ```
   [EPX Hosted] Processing callback for transaction 3421015235
   [Certification Logger] ✅ Logged transaction 3421015235 to 3421015235_callback-processing.txt
   ```

### Step 3: Verify Logs Created
1. Admin Dashboard → EPX Logs
2. Click "Check Status"
3. Count should increase (e.g., from 0 to 1, 2, 3...)
4. Log filenames appear in "Available Log Files" list

### Recommendation
- Run **3-5 test transactions** for certification
- Use different plan types (individual, family)
- Test both monthly and annual billing if applicable

## Accessing Old Logs from Earlier This Month

### If Logs Were Created Before (Nov 1-10)

**Good News:** The date range filter retrieves ANY logs in the Railway filesystem, even from earlier in November.

**Steps:**
1. Admin Dashboard → EPX Logs
2. Set date range:
   - Start Date: `2025-11-01`
   - End Date: `2025-11-10`
3. Click "Export Range"
4. All logs from that period will be included in the download

### If No Logs Exist Yet

**You'll need to run new transactions** because:
- Certification logging must be **enabled at the time of the transaction**
- Old transactions that happened before `ENABLE_CERTIFICATION_LOGGING=true` were NOT logged
- The system doesn't retroactively create logs for past transactions

**What to do:**
1. Enable certification logging NOW (see Step 1 above)
2. Run fresh test transactions
3. Export those new logs for EPX certification

## Troubleshooting

### "Logging Disabled" Warning Shows
- **Cause**: `ENABLE_CERTIFICATION_LOGGING` not set to `true` in Railway
- **Fix**: Follow "Enabling Certification Logging in Railway" section above

### "0 certification logs" Shown
- **Cause 1**: No transactions have occurred since logging was enabled
- **Fix**: Run test enrollments (see "Running Test Transactions" above)
- **Cause 2**: Logging was just enabled, needs deployment to complete
- **Fix**: Wait 2-3 minutes for Railway redeploy, then click "Check Status"

### Date Range Export Returns Error
- **Cause**: No logs exist in that date range
- **Fix**: Try different dates or export all logs without date filter

### Download Button Disabled
- **Cause**: Zero logs available
- **Fix**: Run test transactions first, then export

## Where Logs Are Stored

### On Railway Server
- **Directory**: `logs/certification/raw-requests/`
- **File Format**: Individual `.txt` files per transaction
- **Naming**: `TRANSACTIONID_PURPOSE.txt` (e.g., `3421015235_callback-processing.txt`)
- **Persistence**: Files persist across deployments

### Exported Downloads
- **Directory**: Your local Downloads folder
- **File Format**: Single consolidated `.txt` file
- **Naming**: 
  - All logs: `epx-certification-logs-YYYY-MM-DD.txt`
  - Date range: `epx-certification-logs-START-to-END.txt`

## Submitting to EPX

1. Download certification logs (see "Retrieving Certification Logs" above)
2. Open the `.txt` file and verify:
   - ✅ Raw HTTP requests and responses are present
   - ✅ Sensitive data is masked (card numbers show as `4111********1111`)
   - ✅ Transaction IDs match your test transactions
3. Attach the `.txt` file to your EPX certification support ticket
4. EPX will review and approve for production use

## Quick Reference Commands

### Check Current Logging Status (CLI)
```bash
# Via Railway CLI (if installed)
railway logs -s getmydpcenrollment-production | grep "Certification Logger"

# Via curl (requires JWT token)
curl https://getmydpcenrollment-production.up.railway.app/api/admin/epx-certification-status \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Enable Logging (Railway Dashboard)
1. Railway Dashboard → Variables tab
2. Add: `ENABLE_CERTIFICATION_LOGGING=true`
3. Wait 2 minutes for redeploy

### Export All Logs (UI)
1. Admin Dashboard → EPX Logs
2. "Export Certification Logs" button

### Export Date Range (UI)
1. Admin Dashboard → EPX Logs
2. Set Start Date and End Date
3. "Export Range" button
