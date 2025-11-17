# reCAPTCHA v3 Setup & Implementation Guide

## Step 1: Get reCAPTCHA v3 API Keys (5 minutes)

### Go to Google reCAPTCHA Admin Console:
1. Visit: https://www.google.com/recaptcha/admin/create
2. Sign in with your Google account (create one if needed)

### Create New Site:
- **Label:** MyPremierPlans
- **reCAPTCHA type:** Select "reCAPTCHA v3"
- **Domains:** 
  - `localhost` (for local testing)
  - `enrollment.getmydpc.com` (production domain)
  - `getmydpcenrollment-production.up.railway.app` (Railway preview)

### Copy Your Keys:
- **Site Key:** (public, safe to share in frontend code)
  ```
  6LdZ...your_site_key...
  ```
- **Secret Key:** (PRIVATE, never commit to git)
  ```
  6LdZ...your_secret_key...
  ```

### Save in Environment Variables:
1. Create `.env.local` in project root (never commit):
   ```
   REACT_APP_RECAPTCHA_SITE_KEY=6LdZ...your_site_key...
   VITE_RECAPTCHA_SITE_KEY=6LdZ...your_site_key...
   ```

2. Create `.env` in server root (never commit):
   ```
   RECAPTCHA_SECRET_KEY=6LdZ...your_secret_key...
   ```

3. Add to Railway environment variables (Production):
   - **Name:** `RECAPTCHA_SECRET_KEY`
   - **Value:** Your secret key from step 2

---

## Step 2: Frontend Implementation

The frontend will:
1. Load reCAPTCHA v3 script
2. Generate token before form submission
3. Send token with registration data
4. Handle verification failures

**File to modify:** `client/src/pages/register.tsx`

---

## Step 3: Backend Implementation

The backend will:
1. Rate limit by IP (5 registrations per hour)
2. Verify reCAPTCHA token with Google
3. Check reCAPTCHA score (0.5+ is human)
4. Reject obvious bots and spam attempts
5. Return appropriate error messages

**File to modify:** `server/routes/supabase-auth.ts`

---

## Step 4: Testing

### Local Testing:
```bash
# Set environment variables
$env:VITE_RECAPTCHA_SITE_KEY="your_site_key"
$env:RECAPTCHA_SECRET_KEY="your_secret_key"

# Start development server
npm run dev
```

Then test registration with different scenarios:
- ✅ Normal human registration - should work
- ✅ Rapid registrations from same IP - should get rate limited
- ✅ Missing reCAPTCHA token - should fail
- ✅ Low reCAPTCHA score - should fail

### Production Testing:
Once deployed to Railway, test the registration form at:
```
https://enrollment.getmydpc.com/register
```

---

## What Gets Implemented

### Frontend Changes:
- Load reCAPTCHA v3 script
- Generate token on registration form submit
- Send token to backend
- Handle reCAPTCHA errors gracefully
- Show user-friendly error messages

### Backend Changes:
- Rate limiting by IP (5 registrations per hour)
- reCAPTCHA verification with Google
- Return 429 status for rate limit
- Return 400 status for reCAPTCHA failures
- Detailed logging for security monitoring

### No Changes Needed:
- Database schema
- User creation logic
- Email verification
- Authentication flow
- Existing API endpoints

---

## Rollback Plan

If needed, can quickly disable:
1. Comment out reCAPTCHA script in register.tsx
2. Remove token verification in supabase-auth.ts
3. Keep rate limiting (lightweight, low risk)

---

## Security Benefits

| Protection | Before | After |
|-----------|--------|-------|
| Bot signups | ❌ None | ✅ Blocked |
| Brute force IPs | ❌ None | ✅ Rate limited |
| Spam registrations | ❌ Unlimited | ✅ 5/hour max |
| Invalid bots | ❌ Accepted | ✅ Rejected |

---

## Next Steps

1. ✅ Get your reCAPTCHA keys (you do this)
2. ⏳ I implement frontend + backend
3. ⏳ You test locally
4. ⏳ Deploy to Railway
5. ⏳ Monitor production for issues

Ready to proceed? Once you have the keys, I'll implement the code!
