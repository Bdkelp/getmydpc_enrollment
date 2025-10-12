# Login Issue Troubleshooting

## Current Status (October 12, 2025)

### ✅ Services Status
- **Railway Backend**: ✅ Green, responding at `https://getmydpcenrollment-production.up.railway.app`
- **Vercel Frontend**: ✅ Green, serving at `https://enrollment.getmydpc.com`
- **Neon Database**: ✅ Accessible (assumed, but not tested due to local env missing)

### ✅ Tested Endpoints
- `/health` → 200 OK
- `/api/auth/login` OPTIONS → 204 No Content (CORS working)
- `/api/auth/login` POST → 401 Unauthorized (backend working, credentials issue)

### ❌ Current Error
User seeing: `Network error: 404: <!DOCTYPE html>...Cannot POST /auth/login`

### 🔍 Root Cause Analysis

The error message shows `/auth/login` (WITHOUT `/api` prefix), which is the **fallback endpoint** that the client tries after `/api/auth/login` fails.

#### Login Flow:
1. Client tries `/api/auth/login` first
2. Gets 401 Unauthorized (wrong password OR backend issue)
3. apiClient.ts RETRIES the same endpoint (line 74)
4. Still fails with 401
5. Falls back to `/auth/login` (doesn't exist) → **404 error shown to user**

### 🎯 Actual Problem

One of these issues:

1. **Wrong Password**: The password being entered doesn't match what's in Supabase Auth
2. **apiClient Retry Logic**: The 401 triggers a retry which causes confusion
3. **Supabase Session**: There might be a stale session or auth state issue
4. **Browser Cache**: Old JavaScript bundle cached, not using latest apiClient code

### ✅ Verified Working
- CORS is properly configured in Railway (`railway.ts` line 20-32)
- Backend auth endpoint exists and responds
- Frontend is deployed and serving
- API_BASE_URL is correctly set to Railway URL

### 🔧 Solutions to Try

#### Option 1: Check Password (Most Likely)
The backend is returning 401, which means Supabase Auth is rejecting the credentials.

**Action**: 
- Try resetting password via Supabase dashboard
- Or verify what the correct password is
- Or check if account exists in Supabase Auth

#### Option 2: Clear Browser Cache
The error might be from an old cached version of the app.

**Action**:
```
1. Press Ctrl + Shift + Delete
2. Clear "Cached images and files" 
3. Clear "Cookies and other site data"
4. Hard refresh: Ctrl + F5
5. Try login again
```

#### Option 3: Fix apiClient Retry Logic
The 401 retry might be causing issues. The apiClient shouldn't retry auth failures.

**Fix**: Remove 401 from retry logic in `client/src/lib/apiClient.ts` line 74:
```typescript
// Change this:
if (retryCount === 0 && (res.status === 0 || res.status >= 500 || res.status === 401)) {

// To this:
if (retryCount === 0 && (res.status === 0 || res.status >= 500)) {
```

#### Option 4: Remove Fallback Endpoint
The `/auth/login` fallback is confusing. Remove it from `client/src/pages/login.tsx`:

```typescript
// Change line 67 from:
const endpoints = ["/api/auth/login", "/auth/login"];

// To:
const endpoints = ["/api/auth/login"];
```

### 📋 Checklist for User

- [ ] What password are you using? Is it the original password you set up?
- [ ] Have you tried clearing browser cache? (Ctrl + Shift + Delete)
- [ ] Can you try in Incognito/Private mode?
- [ ] Can you check Railway logs and paste the lines with `[Login]` prefix?
- [ ] Have you reset your password recently in Supabase?

### 🚨 What Changed Recently

User reported: "I have had no issues logging in. this is a new thing."

**Recent Changes**:
1. Commit `8575cc3` - Added CORS preflight handlers (REVERTED)
2. Commit `2a6bbf5` - Reverted CORS changes (CURRENT)
3. Subscription creation fixes (commits d91ff22, aa40fd6, eefd3de, beafb5b)

**Hypothesis**: The issue might not be from code changes, but from:
- Supabase session expiration
- Password change
- Browser cache holding old code
- Environment variable change in Vercel

### 🎯 Next Steps

1. **User should try**: Clear cache + hard refresh + try login
2. **If still fails**: Check Supabase dashboard for account status
3. **If account exists**: Try password reset
4. **If still fails**: Check Railway logs for exact error from Supabase
5. **Last resort**: Fix apiClient retry logic + remove fallback endpoint

### 🔬 Debug Commands

```powershell
# Test Railway backend directly
Invoke-WebRequest -Uri "https://getmydpcenrollment-production.up.railway.app/health" -UseBasicParsing

# Test auth endpoint (should return 401 with wrong password)
$body = '{"email":"michael@mypremierplans.com","password":"test"}'; 
Invoke-WebRequest -Uri "https://getmydpcenrollment-production.up.railway.app/api/auth/login" -Method POST -Headers @{"Content-Type"="application/json"} -Body $body -UseBasicParsing

# Check Vercel is serving
Invoke-WebRequest -Uri "https://enrollment.getmydpc.com" -UseBasicParsing | Select StatusCode
```

