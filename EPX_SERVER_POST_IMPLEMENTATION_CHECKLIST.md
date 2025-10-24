# EPX Server Post Implementation Checklist

## 🎯 Current Status: Ready for Credentials & ACL Whitelist

### ✅ COMPLETED (Already Done)

#### Infrastructure
- ✅ Railway static IP enabled: `162.220.234.15`
- ✅ IP verification endpoint deployed: `/api/check-ip`
- ✅ Static IP confirmed and stable

#### Database Schema
- ✅ Schema definitions exist in `shared/schema.ts`:
  - `payment_tokens` table (BRIC tokens)
  - `billing_schedule` table (recurring billing)
  - `recurring_billing_log` table (audit trail)
- ✅ Migration SQL file ready: `migrations/add_recurring_billing_schema.sql`

#### Code Files Ready in Archive
- ✅ `archive/epx-server-post-future/epx-server-post-service.ts` (328 lines)
  - BRIC token creation
  - Recurring charge processing
  - Signature generation (HMAC-SHA256)
- ✅ `archive/epx-server-post-future/recurring-billing-scheduler.ts` (81 lines)
  - Cron job scheduler (daily 2 AM)
  - Retry logic (3/7/14 days)
  - Rate limiting
- ✅ `archive/epx-server-post-future/epx-server-post-routes.ts`
  - API endpoints for EPX integration

---

## ⏳ WAITING FOR (Blockers)

### 1. EPX ACL Whitelist Approval
**Status:** Pending submission to EPX
**Required:** Submit IP `162.220.234.15` to EPX Developer Portal
**Timeline:** 24-48 hours after submission

**Action Items:**
- [ ] Contact EPX support/developer portal
- [ ] Provide: Merchant name, EPI ID, static IP `162.220.234.15`
- [ ] Specify environment (Production or Sandbox)
- [ ] Wait for confirmation email from EPX

### 2. EPX Server Post Credentials
**Status:** Need from EPX Developer Portal
**Required:**
- [ ] `EPX_EPI_ID` - Your EPI ID for Server Post API
- [ ] `EPX_EPI_KEY` - Your EPI Key (MAC secret for signatures)
- [ ] `EPX_API_ENDPOINT` - API URL (sandbox or production)

---

## 🚀 IMPLEMENTATION TASKS (Once Credentials Ready)

### Phase 1: Database Migration (15 minutes)

#### Task 1.1: Run Migration in Supabase
- [ ] Log into Supabase dashboard
- [ ] Navigate to SQL Editor
- [ ] Copy contents of `migrations/add_recurring_billing_schema.sql`
- [ ] Execute migration
- [ ] Verify tables created:
  ```sql
  SELECT tablename FROM pg_tables 
  WHERE schemaname = 'public' 
  AND tablename IN ('payment_tokens', 'billing_schedule', 'recurring_billing_log');
  ```
- [ ] Verify triggers created:
  ```sql
  SELECT trigger_name, event_manipulation, event_object_table 
  FROM information_schema.triggers 
  WHERE trigger_name LIKE 'trigger_billing%';
  ```

**Expected Result:**
- ✅ 3 new tables created
- ✅ 2 triggers created (success/failure tracking)
- ✅ Existing tables updated (subscriptions, payments)

---

### Phase 2: Move Code from Archive (10 minutes)

#### Task 2.1: Create Services Directory
```bash
mkdir -p server/services/epx
```

#### Task 2.2: Move EPX Files
- [ ] Move `archive/epx-server-post-future/epx-server-post-service.ts`
  - **To:** `server/services/epx/epx-server-post-service.ts`
  
- [ ] Move `archive/epx-server-post-future/recurring-billing-scheduler.ts`
  - **To:** `server/services/epx/recurring-billing-scheduler.ts`
  
- [ ] Move `archive/epx-server-post-future/epx-server-post-routes.ts`
  - **To:** `server/routes/epx-server-post-routes.ts`

#### Task 2.3: Update Imports
Files that need import path updates:
- [ ] `server/services/epx/epx-server-post-service.ts`
  - Update any relative imports for shared schema
  - Update database connection imports
  
- [ ] `server/services/epx/recurring-billing-scheduler.ts`
  - Update import path for EPX service
  - Update import for storage/database
  
- [ ] `server/routes/epx-server-post-routes.ts`
  - Update import path for EPX service
  - Update auth imports

---

### Phase 3: Environment Configuration (5 minutes)

#### Task 3.1: Add EPX Credentials to Railway
In Railway dashboard → Variables:

```bash
# EPX Server Post Credentials
EPX_EPI_ID=CustNbr.DbaNbr.MerchNbr.TerminalNbr
EPX_EPI_KEY=your_epi_key_here
EPX_API_ENDPOINT=https://api.north.com/api/v1/  # or sandbox URL
EPX_ENVIRONMENT=production  # or 'sandbox'

# Static IP (for reference/documentation)
RAILWAY_STATIC_IP=162.220.234.15
```

- [ ] Add `EPX_EPI_ID` variable
- [ ] Add `EPX_EPI_KEY` variable (keep secure!)
- [ ] Add `EPX_API_ENDPOINT` variable
- [ ] Add `EPX_ENVIRONMENT` variable

#### Task 3.2: Update Config File
- [ ] Create or update `server/config/epx-config.ts`:
  ```typescript
  export const epxConfig = {
    epiId: process.env.EPX_EPI_ID!,
    epiKey: process.env.EPX_EPI_KEY!,
    environment: (process.env.EPX_ENVIRONMENT as 'sandbox' | 'production') || 'production',
    apiEndpoint: process.env.EPX_API_ENDPOINT || 'https://api.north.com/api/v1/',
  };
  ```

---

### Phase 4: Integrate Routes (10 minutes)

#### Task 4.1: Register EPX Routes in Main App
Update `server/index.ts`:

```typescript
import epxServerPostRoutes from "./routes/epx-server-post-routes";

// ... existing code ...

// Register EPX Server Post routes
app.use("/api/epx", epxServerPostRoutes);
```

- [ ] Import EPX routes
- [ ] Register routes with `/api/epx` prefix
- [ ] Verify no route conflicts

#### Task 4.2: Initialize Recurring Billing Scheduler
Update `server/index.ts`:

```typescript
import { RecurringBillingScheduler } from "./services/epx/recurring-billing-scheduler";

// ... after app.listen ...

// Start recurring billing cron job (2 AM daily)
const billingScheduler = new RecurringBillingScheduler();
billingScheduler.start();

console.log("✅ Recurring billing scheduler started (runs daily at 2:00 AM)");
```

- [ ] Import scheduler
- [ ] Initialize scheduler after server starts
- [ ] Add logging for confirmation

---

### Phase 5: Update Enrollment Flow (20 minutes)

#### Task 5.1: Modify Member Enrollment
Update `server/routes.ts` - enrollment endpoint:

**Current:** Creates member → Creates payment with EPX Browser Post
**New:** Creates member → Creates payment with EPX Server Post → Stores BRIC token

- [ ] Import EPX Server Post service
- [ ] After successful enrollment payment, call:
  ```typescript
  // Store BRIC token from enrollment payment
  if (epxResponse.BRIC && epxResponse.NetworkTransactionId) {
    await storage.createPaymentToken({
      memberId: newMember.id,
      bricToken: epxResponse.BRIC,
      cardLastFour: epxResponse.CardNumber?.slice(-4),
      cardType: epxResponse.CardType,
      originalNetworkTransId: epxResponse.NetworkTransactionId,
      expiryMonth: cardData.expirationDate.slice(0, 2),
      expiryYear: cardData.expirationDate.slice(2, 4),
      isActive: true,
      isPrimary: true,
    });
  }
  ```

#### Task 5.2: Create Billing Schedule
After storing token:

- [ ] Create billing schedule entry:
  ```typescript
  await storage.createBillingSchedule({
    memberId: newMember.id,
    paymentTokenId: paymentToken.id,
    amount: memberData.totalMonthlyPrice,
    frequency: 'monthly',
    nextBillingDate: calculateNextBillingDate(new Date()), // +1 month
    status: 'active',
  });
  ```

#### Task 5.3: Add Storage Methods
Update `server/storage.ts`:

- [ ] Add `createPaymentToken()` method
- [ ] Add `createBillingSchedule()` method
- [ ] Add `getBillingScheduleForMember()` method
- [ ] Add `updateBillingSchedule()` method

---

### Phase 6: Testing (30-60 minutes)

#### Task 6.1: Test in EPX Sandbox (if available)
- [ ] Use EPX sandbox credentials
- [ ] Test enrollment with card tokenization
- [ ] Verify BRIC token stored in database
- [ ] Verify billing schedule created
- [ ] Test manual recurring charge:
  ```typescript
  POST /api/epx/test-recurring-charge
  {
    "memberId": 123,
    "amount": 45.00
  }
  ```

#### Task 6.2: Test Scheduler Locally
- [ ] Temporarily change cron to run every minute for testing
- [ ] Monitor logs for scheduler execution
- [ ] Verify it finds due memberships
- [ ] Verify it processes charges
- [ ] Reset cron to daily 2 AM

#### Task 6.3: Test Error Handling
- [ ] Test with declined card (use EPX test cards)
- [ ] Verify retry logic works (3/7/14 days)
- [ ] Verify suspension after 3 failures
- [ ] Test failure notifications

---

### Phase 7: Monitoring & Alerts (15 minutes)

#### Task 7.1: Add Logging
- [ ] Log all recurring charge attempts
- [ ] Log all BRIC token creations
- [ ] Log scheduler runs
- [ ] Log failures with details

#### Task 7.2: Set Up Alerts (Optional)
- [ ] Email notification on billing failure
- [ ] Slack/Discord webhook for critical errors
- [ ] Daily summary report of billing activity

---

### Phase 8: Deploy to Production (10 minutes)

#### Task 8.1: Pre-Deployment Checklist
- [ ] All tests passing in sandbox
- [ ] EPX production ACL confirmed
- [ ] Production credentials configured in Railway
- [ ] Database migration run in production Supabase
- [ ] Code reviewed and committed

#### Task 8.2: Deploy
```bash
git add .
git commit -m "feat: Implement EPX Server Post recurring billing with BRIC tokens"
git push origin main
```

- [ ] Push to GitHub (Railway auto-deploys)
- [ ] Monitor Railway deployment logs
- [ ] Verify no errors on startup
- [ ] Check scheduler initialized

#### Task 8.3: Post-Deployment Verification
- [ ] Test enrollment with real card (small amount)
- [ ] Verify BRIC token created
- [ ] Verify billing schedule created
- [ ] Check Supabase tables populated correctly
- [ ] Monitor first scheduled run (next day at 2 AM)

---

## 📊 Estimated Timeline

| Phase | Time Estimate | Dependencies |
|-------|--------------|--------------|
| **Phase 1:** Database Migration | 15 min | EPX credentials ready |
| **Phase 2:** Move Code | 10 min | - |
| **Phase 3:** Environment Config | 5 min | EPX credentials |
| **Phase 4:** Integrate Routes | 10 min | Phase 2 complete |
| **Phase 5:** Update Enrollment | 20 min | Phase 1, 2 complete |
| **Phase 6:** Testing | 30-60 min | All phases complete |
| **Phase 7:** Monitoring | 15 min | - |
| **Phase 8:** Deploy | 10 min | Testing complete |
| **TOTAL** | **~2-3 hours** | After credentials + ACL |

---

## 🔐 Security Checklist

- [ ] EPX_EPI_KEY stored securely (Railway environment variables)
- [ ] BRIC tokens treated like passwords (never logged in plaintext)
- [ ] Database connections use SSL (Supabase default)
- [ ] API endpoints protected with authentication
- [ ] Rate limiting on recurring charge endpoint
- [ ] Input validation on all EPX requests
- [ ] Error messages don't expose sensitive data

---

## 📝 Files That Need Updates

### New Files to Create:
1. `server/services/epx/epx-server-post-service.ts` (move from archive)
2. `server/services/epx/recurring-billing-scheduler.ts` (move from archive)
3. `server/routes/epx-server-post-routes.ts` (move from archive)
4. `server/config/epx-config.ts` (create new)

### Existing Files to Modify:
1. `server/index.ts` - Register routes, start scheduler
2. `server/routes.ts` - Update enrollment to store BRIC tokens
3. `server/storage.ts` - Add payment token methods
4. Railway environment variables - Add EPX credentials

### Files Already Ready:
1. ✅ `shared/schema.ts` - Tables defined
2. ✅ `migrations/add_recurring_billing_schema.sql` - Migration ready
3. ✅ Archive files - Code complete and tested

---

## 🚨 Common Issues & Solutions

### Issue 1: EPX Returns "IP Not Whitelisted"
**Solution:** Verify `162.220.234.15` is in EPX ACL, wait 24-48 hours after submission

### Issue 2: BRIC Token Empty or Undefined
**Solution:** Check EPX response includes BRIC, verify initial transaction was approved

### Issue 3: NetworkTransactionId Missing
**Solution:** Must use EPX Server Post for initial enrollment (not Browser Post)

### Issue 4: Scheduler Not Running
**Solution:** Check cron syntax, verify scheduler.start() called after app.listen()

### Issue 5: Signature Mismatch
**Solution:** Verify EPX_EPI_KEY matches EPX portal, check signature generation algorithm

---

## ✅ Success Criteria

### You'll know it's working when:
1. ✅ New enrollments create BRIC tokens in `payment_tokens` table
2. ✅ Billing schedules created with next_billing_date = enrollment_date + 1 month
3. ✅ Scheduler runs daily at 2 AM (check logs)
4. ✅ Recurring charges processed successfully on billing dates
5. ✅ Failed charges retry at 3/7/14 day intervals
6. ✅ Members suspended after 3 consecutive failures
7. ✅ All charges logged in `recurring_billing_log` table

---

## 📞 Next Steps

**Right Now (Before Implementation):**
1. [ ] Submit IP `162.220.234.15` to EPX for ACL whitelist
2. [ ] Obtain EPX Server Post credentials (EPI ID, EPI Key, API endpoint)
3. [ ] Wait for EPX confirmation (24-48 hours)

**Once Credentials & Whitelist Confirmed:**
4. [ ] Tell me you're ready and provide the credentials
5. [ ] I'll help with each phase of implementation
6. [ ] We'll test thoroughly in sandbox first
7. [ ] Deploy to production

**Estimated Total Time:** 2-3 hours of active work after credentials ready

---

**Status:** ✅ Ready to implement as soon as EPX credentials and ACL whitelist are confirmed!
