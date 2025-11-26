# EPX Certification Status - November 26, 2025

## Overview
This document tracks the current status of EPX certification requirements for the DPC enrollment platform.

---

## 1️⃣ Environment Configuration (DigitalOcean)

### ✅ Required Environment Variables

**General App Config:**
- `NODE_ENV=production` ✅ (Set in DigitalOcean)
- `PORT=8080` ✅ (Configured for DigitalOcean)
- `DATABASE_URL` ✅ (Supabase PostgreSQL - working)

**EPX Configuration:**
- `EPX_ENVIRONMENT=sandbox` ✅ (Keep for certification)
- `EPX_CUST_NBR=9001` ✅ (Set)
- `EPX_MERCH_NBR=900300` ✅ (Set)
- `EPX_DBA_NBR=2` ✅ (Set)
- `EPX_TERMINAL_NBR=72` ✅ (Set)
- `EPX_MAC` ✅ (Required for HMAC signing - verify it's set in DO)
- `EPX_LOG_DIR=/var/log/epx` ⚠️ (Optional - defaults to ./logs/epx)

**reCAPTCHA Configuration:**
- `RECAPTCHA_SECRET_KEY` ✅ (From Google reCAPTCHA v3)
- `RECAPTCHA_SCORE_THRESHOLD=0.5` ✅ (Set)

### 🔍 Action Items:
1. **Verify in DigitalOcean Console:**
   - Go to: App Settings → Environment Variables
   - Confirm all EPX_ variables are set
   - Confirm RECAPTCHA_SECRET_KEY is set
   - Screenshot for documentation

---

## 2️⃣ Hosted Checkout + reCAPTCHA v3

### ✅ Implementation Status

**Frontend (`client/src/components/EPXHostedPayment.tsx`):**
- ✅ Loads Google reCAPTCHA v3 script
- ✅ Site Key: `6LflwiQgAAAAAC8yO38mzv-g9a9QiR91Bw4y62ww`
- ✅ Executes `grecaptcha.execute()` to get real token
- ✅ Sends `captchaToken` to backend
- ✅ Includes token in `Captcha` field for EPX

**Backend (`server/routes/epx-hosted-routes.ts`):**
- ✅ `verifyRecaptcha()` function implemented
- ✅ Calls Google siteverify API
- ✅ Validates score >= threshold
- ✅ Logs reCAPTCHA verification results
- ✅ Logs Hosted Checkout request/response payloads

### 🔍 Action Items:

#### Test End-to-End:
1. **Open Production App:**
   - URL: `https://enrollment.getmydpc.com`
   - Or: `https://getmydpc-enrollment-gjk6m.ondigitalocean.app`

2. **Perform Test Enrollment:**
   - Use EPX sandbox test card: `4111111111111111`
   - CVV: `999`
   - Exp: Any future date
   - Amount: Any valid plan amount

3. **Monitor DigitalOcean Logs:**
   ```bash
   # Filter for these patterns:
   - "EPX Hosted Checkout"
   - "reCAPTCHA"
   - "EPX Hosted Callback"
   ```

4. **Expected Log Output:**
   ```
   [EPX Hosted Checkout] Creating session...
   [reCAPTCHA] Verification result: { success: true, score: 0.9, ... }
   [EPX Hosted Checkout - REQUEST] { Captcha: "03AGd...", ... }
   [EPX Hosted Callback] Received payload: { ... }
   ```

5. **Capture for EPX:**
   - Copy **Hosted Checkout REQUEST JSON** (what we send to EPX)
   - Copy **Hosted Checkout RESPONSE JSON** (what EPX returns)
   - Scrub sensitive data (keep last 4 of card)

---

## 3️⃣ Server Post API (Recurring Billing)

### ⚠️ Implementation Status

**Current State:**
- ✅ EPX Recurring Billing service exists (`server/services/epx-recurring-billing.ts`)
- ✅ HMAC-SHA256 signing implemented
- ✅ Card masking in logs implemented
- ✅ Endpoints exist but may not be exposed
- ❌ **Test endpoint NOT found** (`/api/epx/test-recurring`)
- ⚠️ `BILLING_SCHEDULER_ENABLED=false` (recurring disabled)

**Files to Check:**
- `server/services/epx-recurring-billing.ts` - Core implementation
- `server/routes/epx-routes.ts` - Main EPX routes
- `server/routes/epx-hosted-routes.ts` - Hosted checkout routes

### 🔍 Action Items:

#### Option A: Create Test Endpoint (Recommended)
Create `/api/epx/test-recurring` endpoint for certification samples:

```typescript
// In server/routes/epx-routes.ts or epx-hosted-routes.ts
router.post('/api/epx/test-recurring', async (req: Request, res: Response) => {
  try {
    const epxService = new EPXRecurringBillingService();
    
    // Test CreateSubscription call
    const subscriptionResult = await epxService.createSubscription({
      customerId: 'TEST-CERT-001',
      planCode: 'MPP-BASE',
      amount: 59.00,
      // ... other required fields
    });
    
    logEPX({
      level: 'info',
      phase: 'test-recurring',
      message: 'Certification test - CreateSubscription',
      data: subscriptionResult
    });
    
    res.json({ success: true, result: subscriptionResult });
  } catch (error) {
    logEPX({
      level: 'error',
      phase: 'test-recurring',
      message: 'Certification test failed',
      data: { error: error.message }
    });
    res.status(500).json({ success: false, error: error.message });
  }
});
```

#### Option B: Use Existing Enrollment Flow
If recurring billing is already triggered during enrollment:
1. Enable temporarily: `BILLING_SCHEDULER_ENABLED=true`
2. Complete a full test enrollment
3. Monitor logs for Server Post API calls
4. Capture request/response samples
5. Disable: `BILLING_SCHEDULER_ENABLED=false`

#### Capture for EPX:
Once you have Server Post API calls, grab from logs:
- **CreateSubscription REQUEST JSON**
- **CreateSubscription RESPONSE JSON**
- **PayBill REQUEST JSON** (if available)
- **PayBill RESPONSE JSON** (if available)

---

## 4️⃣ Domain & IP Whitelisting

### ✅ Domain Configuration

**Primary Domain:**
- `enrollment.getmydpc.com` ✅

**DigitalOcean App URL:**
- `getmydpc-enrollment-gjk6m.ondigitalocean.app` ✅

### ✅ Static IP Addresses

**DigitalOcean Outbound IPs (for EPX whitelist):**
- Check with: `curl https://getmydpc-enrollment-gjk6m.ondigitalocean.app/api/check-ip`
- Or: Contact DigitalOcean support for static IP list
- Typical DO IPs: `165.227.x.x`, `167.99.x.x` ranges

### 🔍 Action Items:

1. **Verify DNS:**
   ```bash
   nslookup enrollment.getmydpc.com
   # Should point to DigitalOcean
   ```

2. **Verify reCAPTCHA Domain:**
   - Go to: https://www.google.com/recaptcha/admin
   - Find your site key: `6LflwiQgAAAAAC8yO38mzv-g9a9QiR91Bw4y62ww`
   - Verify `enrollment.getmydpc.com` is in allowed domains

3. **Get Outbound IPs:**
   ```bash
   # Option 1: Check from backend
   curl https://getmydpc-enrollment-gjk6m.ondigitalocean.app/api/check-ip
   
   # Option 2: DigitalOcean dashboard
   # App Settings → Networking
   ```

4. **Send to EPX:**
   - Domain: `enrollment.getmydpc.com`
   - Outbound IPs: `[list from step 3]`

---

## 5️⃣ Certification Samples Summary

### What EPX Needs:

#### ✅ Hosted Checkout Samples:
1. **Request JSON** (what you send to EPX)
   - Must include real reCAPTCHA token (not "bypass")
   - Customer data
   - Payment amount
   - Merchant credentials

2. **Response/Callback JSON** (what EPX returns)
   - Transaction ID
   - Auth code
   - Success/failure status

#### ⚠️ Server Post API Samples:
1. **CreateSubscription Request JSON**
   - HMAC signature
   - Subscription details
   - Customer info

2. **CreateSubscription Response JSON**
   - Subscription ID
   - Status

3. **PayBill Request JSON** (optional but good to have)
   - Payment details
   - HMAC signature

4. **PayBill Response JSON**
   - Transaction result

---

## 6️⃣ EPX Certification Checklist

### Pre-Submission:
- [ ] All environment variables set in DigitalOcean
- [ ] DNS pointing `enrollment.getmydpc.com` to DO app
- [ ] reCAPTCHA domain whitelisted in Google console
- [ ] DigitalOcean outbound IPs obtained

### Testing:
- [ ] Complete test enrollment with real reCAPTCHA token
- [ ] Verify Hosted Checkout request includes valid `Captcha` field
- [ ] Capture Hosted Checkout request/response from logs
- [ ] Test Server Post API (create test endpoint or use enrollment)
- [ ] Capture Server Post request/response from logs

### Submission to EPX:
- [ ] Hosted Checkout Request JSON
- [ ] Hosted Checkout Response JSON
- [ ] Server Post CreateSubscription Request JSON
- [ ] Server Post CreateSubscription Response JSON
- [ ] Domain: `enrollment.getmydpc.com`
- [ ] Outbound IP addresses (list)

### Final Verification:
- [ ] All sensitive data scrubbed from samples (PAN → last 4 digits)
- [ ] Verify `Captcha` field shows real token, not "bypass"
- [ ] Verify HMAC signatures present in Server Post samples
- [ ] Confirm all samples use `EPX_ENVIRONMENT=sandbox`

---

## 7️⃣ Quick Test Commands

### Check Environment:
```bash
# Check if app is running
curl https://getmydpc-enrollment-gjk6m.ondigitalocean.app/api/health

# Check outbound IP
curl https://getmydpc-enrollment-gjk6m.ondigitalocean.app/api/check-ip

# Check CORS (should allow enrollment.getmydpc.com)
curl https://getmydpc-enrollment-gjk6m.ondigitalocean.app/api/test-cors
```

### Monitor Logs (DigitalOcean Console):
```
Filter: "EPX"
Filter: "reCAPTCHA"
Filter: "Hosted Checkout"
Filter: "Recurring"
```

---

## 8️⃣ Known Issues & Notes

### ✅ Fixed Issues:
- ✅ Build error in `epx-hosted-routes.ts` (duplicate route) - FIXED
- ✅ Commission tracking by agent_number - FIXED
- ✅ Member name display in commissions - FIXED
- ✅ Admin/super_admin can earn commissions - FIXED

### ⚠️ Outstanding Items:
- ⚠️ Need to create `/api/epx/test-recurring` endpoint for certification
- ⚠️ Need to verify all environment variables set in DigitalOcean
- ⚠️ Need to obtain DigitalOcean outbound IP addresses
- ⚠️ Need to perform end-to-end test enrollment and capture logs

---

## 9️⃣ Next Steps (Priority Order)

1. **Immediate (Required for Cert):**
   - [ ] Verify all env vars in DigitalOcean App Settings
   - [ ] Create `/api/epx/test-recurring` endpoint
   - [ ] Perform test enrollment on `enrollment.getmydpc.com`
   - [ ] Capture Hosted Checkout request/response from logs
   - [ ] Test Server Post API endpoint
   - [ ] Capture Server Post request/response from logs
   - [ ] Get DigitalOcean outbound IPs

2. **Submission:**
   - [ ] Compile all JSON samples
   - [ ] Scrub sensitive data
   - [ ] Email to EPX with domain + IPs

3. **Post-Certification:**
   - [ ] Switch `EPX_ENVIRONMENT=production`
   - [ ] Update EPX credentials for production
   - [ ] Enable `BILLING_SCHEDULER_ENABLED=true` (if using recurring)
   - [ ] Monitor production transactions

---

## 📞 Contacts

**EPX Support:**
- Certification Team: [EPX contact from previous emails]
- Issue: "Captcha bypass" and "Missing Server Post samples"

**Domain/DNS:**
- Provider: [Your DNS provider]
- Domain: enrollment.getmydpc.com

**Hosting:**
- Platform: DigitalOcean App Platform
- App: getmydpc-enrollment-gjk6m

---

**Last Updated:** November 26, 2025  
**Status:** Awaiting certification testing & sample collection
