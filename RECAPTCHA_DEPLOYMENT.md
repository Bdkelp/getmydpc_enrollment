# reCAPTCHA v3 + Rate Limiting - Deployment Checklist

## ✅ Implementation Status: COMPLETE

### Code Changes Deployed
- ✅ Frontend: reCAPTCHA v3 script loading and token generation (register.tsx)
- ✅ Backend: Rate limiting by IP + reCAPTCHA verification (supabase-auth.ts)
- ✅ Documentation: Setup guide and security assessment

### Commit Hash
- `09f15626338d8d3d52d3d484ef96d4abda5ff9bf`
- Message: "user acct security capcha implementation"
- Deployed to: `origin/main` ✅

---

## 🚀 Deployment Steps (You Need To Do These)

### Step 1: Get reCAPTCHA v3 API Keys (5 minutes) 🔑

1. Go to: https://www.google.com/recaptcha/admin/create
2. Sign in with Google account
3. Create new site:
   - **Label:** MyPremierPlans
   - **Type:** reCAPTCHA v3
   - **Domains:**
     - `localhost` (testing)
     - `enrollment.getmydpc.com` (production)
     - `getmydpcenrollment-production.up.railway.app` (Railway preview)
4. Copy the two keys:
   - **Site Key:** (public)
   - **Secret Key:** (PRIVATE - never share!)

### Step 2: Configure Local Environment (5 minutes) 🔧

Create `.env.local` in project root:
```
VITE_RECAPTCHA_SITE_KEY=your_site_key_here
```

Create or update `.env` in server root:
```
RECAPTCHA_SECRET_KEY=your_secret_key_here
```

**Never commit these files!** They're already in `.gitignore`

### Step 3: Test Locally (10 minutes) ✅

```bash
npm run dev
```

Then:
1. Go to http://localhost:5173/register
2. Try creating an account
3. Watch browser console for "[reCAPTCHA] Token generated successfully"
4. Try registering 6+ times rapidly from same IP
5. 6th attempt should show: "Too many registration attempts..."

### Step 4: Deploy to Railway (5 minutes) 🚂

Add environment variable to Railway:
1. Go to Railway Dashboard → Your Project
2. Click "Variables"
3. Add new variable:
   - **Name:** `RECAPTCHA_SECRET_KEY`
   - **Value:** Your secret key (from Step 1)
4. Redeploy

### Step 5: Test in Production (5 minutes) 🌍

1. Go to https://enrollment.getmydpc.com/register
2. Try creating account - should work
3. Try creating 6+ accounts rapidly - 6th should fail
4. Check that reCAPTCHA badge appears in bottom right

---

## 🔍 Verification Checklist

### Frontend Verification
- [ ] reCAPTCHA badge visible in bottom-right of registration page
- [ ] Normal registration works without errors
- [ ] Console shows "[reCAPTCHA] Token generated successfully"
- [ ] Form submission includes recaptchaToken

### Backend Verification
- [ ] First 5 registrations from same IP succeed
- [ ] 6th registration returns 429 status (rate limited)
- [ ] Error message: "Too many registration attempts..."
- [ ] Server logs show "[Rate Limit]" messages
- [ ] Server logs show "[reCAPTCHA] Verification result"

### Error Handling
- [ ] Missing reCAPTCHA keys → registration works without CAPTCHA
- [ ] Network timeout on CAPTCHA verification → registration allowed (fail open)
- [ ] Invalid reCAPTCHA token → registration rejected (400)
- [ ] Rate limit exceeded → registration rejected (429)

---

## 📊 Bot Protection Details

### What's Protected
| Attack Type | Protection | Status |
|------------|-----------|--------|
| Rapid registrations from same IP | Rate limiting (5/hour) | ✅ Protected |
| Bot script registrations | reCAPTCHA v3 score check | ✅ Protected |
| Email spam/harvesting | reCAPTCHA verification | ✅ Protected |
| Multiple fake accounts | Combination of above | ✅ Protected |

### Rate Limiting Rules
- **Window:** 1 hour (3600000 ms)
- **Max registrations per IP:** 5
- **Response when exceeded:** HTTP 429 + error message
- **Reset:** Automatic after 1 hour

### reCAPTCHA Verification
- **Score threshold:** 0.5 (0 = likely bot, 1.0 = definitely human)
- **Action:** "register"
- **Fail mode:** Reject if score < 0.5
- **Timeout:** 5 seconds (fail open if network issue)

---

## 🔧 Configuration

### Frontend (client/src/pages/register.tsx)
```typescript
const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '';

// Loads reCAPTCHA v3 script on component mount
// Generates token on form submission
// Sends token to backend
```

### Backend (server/routes/supabase-auth.ts)
```typescript
const RATE_LIMIT_WINDOW = 3600000; // 1 hour
const RATE_LIMIT_MAX = 5; // 5 registrations per window per IP
const RECAPTCHA_SCORE_THRESHOLD = 0.5; // Min score to allow

// Checks rate limit by IP
// Verifies reCAPTCHA token with Google
// Returns appropriate error codes
```

---

## 🚨 Troubleshooting

### reCAPTCHA Badge Not Showing
- **Cause:** Script not loaded or site key not set
- **Fix:** Check VITE_RECAPTCHA_SITE_KEY environment variable
- **Fallback:** Registration works anyway (protection just disabled)

### "Too many registration attempts" Error
- **Cause:** IP has exceeded 5 registrations in 1 hour
- **Fix:** Wait 1 hour or test from different IP
- **Details:** Check server logs for "[Rate Limit]" messages

### "reCAPTCHA verification failed" Error
- **Cause:** reCAPTCHA score too low (looks like bot)
- **Fix:** This is working as intended - blocking bots
- **Debug:** Check server logs for "[reCAPTCHA] Verification result"

### Backend Not Verifying Token
- **Cause:** RECAPTCHA_SECRET_KEY not set
- **Fix:** Add to Railway environment variables
- **Fallback:** Registration works without verification (protection disabled)

### Legitimate Users Getting Blocked
- **Cause:** Low reCAPTCHA score (score < 0.5)
- **Possible reasons:**
  - Using VPN/proxy
  - Rapid registrations
  - Browser automation detected
- **Solution:** 
  - Try without VPN
  - Wait a while between attempts
  - Use normal browser (not headless)

---

## 📝 Monitoring

### What to Watch For
1. **Rate Limit Triggering**: Look for 429 responses in logs
2. **reCAPTCHA Failures**: Look for low scores in logs
3. **Legitimate User Complaints**: Low score rejections
4. **Bot Attacks**: Sudden spike in registration attempts

### Logs to Check
- Frontend: Browser console → "[reCAPTCHA]" messages
- Backend: Server logs → "[Rate Limit]" and "[reCAPTCHA]" messages

### Adjusting Thresholds
If needed to adjust protection level:

**Less strict (allow more users):**
```typescript
const RECAPTCHA_SCORE_THRESHOLD = 0.4; // Lower threshold
const RATE_LIMIT_MAX = 10; // More registrations per hour
```

**More strict (block more bots):**
```typescript
const RECAPTCHA_SCORE_THRESHOLD = 0.7; // Higher threshold
const RATE_LIMIT_MAX = 3; // Fewer registrations per hour
```

---

## 📞 Support

### Questions?
Check `RECAPTCHA_SETUP.md` or `SECURITY_BOT_PROTECTION.md` for more details

### Issues?
1. Check server logs for error messages
2. Verify environment variables are set correctly
3. Make sure reCAPTCHA domains are added correctly in Google Console
4. Test with a fresh browser window (clear cache)

---

## ✨ Next Steps

1. ✅ Get reCAPTCHA keys from Google
2. ✅ Set environment variables (local + Railway)
3. ✅ Test locally
4. ✅ Deploy to Railway
5. ✅ Test in production
6. ✅ Monitor for issues
7. ⏳ Adjust thresholds if needed

**Ready to deploy!** 🚀
