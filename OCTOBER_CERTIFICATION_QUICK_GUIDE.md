# EPX Certification - Quick Guide

## For October 2025 Successful Transactions

### Quick Export (Recommended)

1. **Login**: Admin Dashboard → EPX Logs
2. **Click**: Green box → "Export October Successful Only"
3. **Download**: `epx-certification-october-successful-YYYY-MM-DD.txt`
4. **Submit** to EPX for certification
5. **After approval**: Click "🧹 Cleanup Temp Files"

**What It Does:**
- ✅ Exports ONLY successful (completed) transactions
- ✅ Filters to October 2025 date range
- ✅ Masks sensitive data automatically
- ✅ Stores in temporary directory for easy cleanup

### Status Check

**Check if logging is active:**
- Admin Dashboard → EPX Logs
- Look for badge: 🟢 "Logging Active" or 🔴 "Logging Disabled"
- Click "Check Status" to refresh

**Enable logging in Railway:**
1. Railway Dashboard → Variables tab
2. Add: `ENABLE_CERTIFICATION_LOGGING=true`
3. Wait 2 minutes for redeploy

### Log File Format

```
=============================================================================
EPX CERTIFICATION LOG EXPORT - OCTOBER SUCCESSFUL TRANSACTIONS
=============================================================================
Generated: 2025-11-17T15:30:00.000Z
Total Successful Transactions: 12
Period: October 2025
Status Filter: Completed transactions only
⚠️ TEMPORARY EXPORT - Delete after EPX certification
=============================================================================

[Individual transaction logs with masked sensitive data]
```

### Cleanup After Certification

**IMPORTANT**: Only after EPX approves!

1. EPX Logs page → Green box
2. Click "🧹 Cleanup Temp Files"
3. Confirm deletion
4. Done! Files deleted from server

### Troubleshooting

**"No successful transactions found"**
- Check database for October 2025 completed payments
- Verify date range is October 1-31, 2025

**Export button disabled**
- Wait for current operation to finish
- Refresh page if stuck

**Files not deleted**
- Try again after a few minutes
- Check Railway logs for errors

### API Endpoints

```bash
# Generate October logs
POST /api/admin/epx-certification-logs/generate-october

# Cleanup temp files  
DELETE /api/admin/epx-certification-logs/cleanup-temp

# Check status
GET /api/admin/epx-certification-status
```
