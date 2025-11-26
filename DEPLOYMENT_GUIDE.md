# Payment-First Registration - Deployment Guide

## ✅ Implementation Complete

All backend and frontend code has been updated to implement the payment-first registration flow.

## 📋 Pre-Deployment Checklist

### 1. Environment Variables
Ensure these are set in Railway:
```bash
# EPX Configuration (already set)
EPX_CUST_NBR=<your_value>
EPX_MERCH_NBR=<your_value>
EPX_DBA_NBR=<your_value>
EPX_TERMINAL_NBR=<your_value>
EPX_MAC=<your_value>

# Database (already set)
DATABASE_URL=<supabase_connection_string>

# API Base URL for callback
API_BASE_URL=https://your-railway-app.up.railway.app
```

### 2. Run Database Migration

**Option A: Using npm script**
```powershell
npm run db:push
```

**Option B: Manual SQL execution**
```powershell
# Connect to Supabase database
psql $env:DATABASE_URL -f migrations/add_payment_tokens_and_temp_storage.sql
```

### 3. Verify Migration
Check that these tables/columns exist:
```sql
-- Check new columns
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'members' 
AND column_name IN ('payment_token', 'payment_method_type');

SELECT column_name FROM information_schema.columns 
WHERE table_name = 'subscriptions' 
AND column_name = 'epx_subscription_id';

-- Check new tables
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'temp_registrations');
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_notifications');
```

## 🚀 Deployment Steps

### 1. Deploy Backend (Railway)
```powershell
# Commit and push changes
git add .
git commit -m "Implement payment-first registration flow"
git push origin main
```

Railway will auto-deploy. Monitor logs for:
- ✅ `[Temp Registrations] Cleanup scheduler started (every 15 minutes)`
- ✅ `Server running on port XXXX`

### 2. Deploy Frontend (Vercel)
Vercel auto-deploys from main branch. Verify deployment:
- Check build logs for errors
- Test frontend loads correctly

### 3. Test in Sandbox

#### Test Case 1: Successful Payment
1. Go to `/enroll`
2. Fill out registration form
3. Click "Complete Registration"
4. Verify: NO member created in database yet
5. Fill out payment form with test card: `4111111111111111`
6. Submit payment
7. Verify:
   - Member created in `members` table
   - `payment_token` field populated
   - Subscription created with `epx_subscription_id`
   - Commission created
   - `temp_registrations` record deleted
   - Redirected to confirmation page

#### Test Case 2: Failed Payment (Retry)
1. Go to `/enroll`
2. Fill out registration form
3. Click "Complete Registration"
4. Use declined test card: `4000000000000002`
5. Verify:
   - Redirected to payment-failed page
   - Shows "Payment attempt 1 of 3"
   - "Try Again" button visible
6. Click "Try Again"
7. Use valid test card: `4111111111111111`
8. Verify: Member created successfully

#### Test Case 3: Max Attempts Reached
1. Go to `/enroll`
2. Fill out registration form
3. Fail payment 3 times with declined card
4. Verify:
   - Shows "Maximum attempts reached"
   - "Start Over" button displayed
   - `temp_registrations` record deleted
5. Click "Start Over"
6. Verify: Redirected to `/enroll` with cleared sessionStorage

#### Test Case 4: EPX Recurring Subscription Failure
1. Temporarily break EPX API (wrong credentials in env)
2. Complete successful initial payment
3. Verify:
   - Member and subscription created
   - Entry in `admin_notifications` table
   - Type: `epx_subscription_failed`
4. Go to `/admin/notifications`
5. See notification listed
6. Fix EPX credentials
7. Click "Retry EPX" button
8. Verify:
   - EPX subscription created
   - `epx_subscription_id` populated
   - Notification marked as resolved

## 📊 Monitoring

### Key Metrics to Watch
```sql
-- Members created today
SELECT COUNT(*) FROM members WHERE DATE(created_at) = CURRENT_DATE;

-- Members with EPX subscriptions
SELECT COUNT(*) FROM members WHERE payment_token IS NOT NULL;

-- Active EPX subscriptions
SELECT COUNT(*) FROM subscriptions WHERE epx_subscription_id IS NOT NULL;

-- Unresolved notifications
SELECT COUNT(*) FROM admin_notifications WHERE resolved = FALSE;

-- Payment attempts summary
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_attempts,
  AVG(payment_attempts) as avg_attempts
FROM temp_registrations
GROUP BY DATE(created_at);
```

### Logs to Monitor
```bash
# Railway logs
railway logs --tail

# Watch for:
# - "[EPX Server Post - REQUEST]" - EPX API calls
# - "[EPX Server Post - RESPONSE]" - EPX API responses
# - "[Finalize Registration]" - Member creation after payment
# - "[Temp Registrations] Cleanup" - Periodic cleanup
```

## 🔧 Rollback Plan

If issues occur, you can rollback:

### Quick Rollback (Frontend Only)
```powershell
# Revert frontend changes
git revert HEAD
git push origin main
```

This will restore the old registration flow that creates members immediately.

### Full Rollback (Backend + Frontend)
```sql
-- Remove new columns (optional - won't break old code)
ALTER TABLE members DROP COLUMN IF EXISTS payment_token;
ALTER TABLE members DROP COLUMN IF EXISTS payment_method_type;
ALTER TABLE subscriptions DROP COLUMN IF EXISTS epx_subscription_id;

-- Remove new tables (optional)
DROP TABLE IF EXISTS temp_registrations;
DROP TABLE IF EXISTS admin_notifications;
```

## 🎯 Success Criteria

Deployment is successful when:
- ✅ Members are created ONLY after payment succeeds
- ✅ Failed payments don't create member records
- ✅ Payment retry works (up to 3 attempts)
- ✅ EPX recurring subscriptions created automatically
- ✅ Admin notifications appear for EPX failures
- ✅ Temp registration cleanup runs every 15 minutes
- ✅ Commission created after successful payment
- ✅ No orphaned member records

## 📞 Support

If issues arise:
1. Check Railway logs: `railway logs`
2. Check Supabase logs in dashboard
3. Review `admin_notifications` table for system alerts
4. Check browser console for frontend errors
5. Verify EPX sandbox credentials are correct

## 🎉 Post-Deployment

Once verified in sandbox:
1. Update EPX credentials to production
2. Test with real card (small amount)
3. Monitor first few production registrations
4. Document any edge cases discovered
5. Train support team on new flow

---

**Note**: All current member records are test data, so the migration is clean with no backward compatibility concerns.
