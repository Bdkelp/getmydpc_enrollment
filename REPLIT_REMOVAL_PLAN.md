# Replit Removal Plan - Safe Migration to Digital Ocean

## Current Status Audit (January 14, 2025)

### ✅ What's Already Independent
- **Vite Configuration**: Uses standard Vite setup, no Replit plugins active
- **Server Setup**: Pure Express + Vite, no Replit middleware
- **Database**: Neon (independent)
- **Authentication**: Supabase (independent)
- **Frontend Deploy**: Vercel (independent)
- **Backend Deploy**: Railway (independent, ready for Digital Ocean)
- **Payment**: EPX Hosted Checkout (independent)

### ❌ Replit Dependencies Found (UNUSED - Safe to Remove)
```json
"@replit/vite-plugin-cartographer": "^0.2.7",
"@replit/vite-plugin-runtime-error-modal": "^0.0.3"
```

**Status**: These are in package.json but NOT imported or used anywhere in the code.

### 🔧 Issues to Fix Before Migration

#### 1. **npm Scripts - Unix-Style Environment Variables**
**Problem**: 
```json
"dev": "NODE_ENV=development tsx server/index.ts"
"start": "NODE_ENV=production node dist/index.js"
```
These don't work in Windows PowerShell.

**Solution**: Remove NODE_ENV prefix, use .env file instead (already configured)
```json
"dev": "tsx server/index.ts"
"start": "node dist/index.js"
```

**Why it works**: 
- `dotenv.config()` is already called in `server/index.ts` line 4
- `.env` file loads `NODE_ENV=development` automatically
- No need for command-line environment variables

#### 2. **Environment Variable Detection**
**Current**: Works perfectly with `.env` file
**Verified**: 
```bash
node -e "require('dotenv').config(); console.log('SUPABASE_URL:', process.env.SUPABASE_URL);"
# Output: SUPABASE_URL: https://sgtnzhgxlkcvtrzejobx.supabase.co ✅
```

## Safe Removal Steps

### Step 1: Update package.json Scripts
Remove Unix-style NODE_ENV from scripts (rely on .env file instead)

### Step 2: Remove Replit Dependencies
```bash
npm uninstall @replit/vite-plugin-cartographer @replit/vite-plugin-runtime-error-modal
```

### Step 3: Test Locally
```bash
npm run dev  # Should work after Step 1
```

### Step 4: Verify All Features Work
- [x] Server starts without errors
- [ ] Database connects (Neon)
- [ ] Supabase auth works
- [ ] API endpoints respond
- [ ] Frontend connects to backend
- [ ] Payment flow works

### Step 5: Deploy to Digital Ocean
**Requirements for Digital Ocean**:
- `.env` file with all variables (already created ✅)
- `npm run build` creates production bundle
- `npm start` runs production server
- Port from environment variable (already configured: `PORT=5000`)

## What Makes This App Self-Sufficient

### ✅ All External Services Use Environment Variables
1. **Database** → `DATABASE_URL` (Neon connection string)
2. **Auth** → `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
3. **Payment** → `EPX_PUBLIC_KEY`, `EPX_TERMINAL_PROFILE_ID`
4. **Session** → `SESSION_SECRET`

### ✅ No Platform-Specific Code
- Express server (standard Node.js)
- Vite build (standard bundler)
- No Replit-specific APIs or imports

### ✅ Portable Deployment
Can deploy to:
- ✅ Digital Ocean App Platform
- ✅ Railway (currently using)
- ✅ Heroku
- ✅ AWS Elastic Beanstalk
- ✅ Any Node.js hosting

## Digital Ocean Specific Setup

### App Platform Configuration
```yaml
name: getmydpc-enrollment
services:
  - name: api
    github:
      repo: Bdkelp/getmydpc_enrollment
      branch: main
    build_command: npm run build:all
    run_command: npm start
    envs:
      - key: DATABASE_URL
        value: ${DATABASE_URL}
      - key: SUPABASE_URL
        value: ${SUPABASE_URL}
      - key: SUPABASE_SERVICE_ROLE_KEY
        value: ${SUPABASE_SERVICE_ROLE_KEY}
      - key: SESSION_SECRET
        value: ${SESSION_SECRET}
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 8080
```

## Post-Migration Checklist

- [ ] Remove Replit dependencies from package.json
- [ ] Update npm scripts to remove NODE_ENV prefixes
- [ ] Test `npm run dev` locally on Windows
- [ ] Test `npm run build` creates dist folder
- [ ] Test `npm start` runs production build
- [ ] Deploy to Digital Ocean App Platform
- [ ] Update frontend API URL to point to Digital Ocean backend
- [ ] Test end-to-end: Registration → Payment → Success
- [ ] Verify Supabase auth works on production
- [ ] Verify EPX payment works on production
- [ ] Monitor logs for any Replit-related errors (should be none)

## Rollback Plan (if needed)

If something goes wrong:
1. Keep Railway deployment running (don't shut down)
2. Frontend stays on Vercel (already pointing to Railway)
3. Test Digital Ocean alongside Railway
4. Only switch DNS/frontend API URL after full verification

## Conclusion

✅ **App is already 95% independent of Replit**
✅ **Only 2 unused devDependencies need removal**
✅ **Scripts need minor adjustment for Windows/cross-platform**
✅ **Ready for Digital Ocean migration after fixes**

**Estimated Time**: 30 minutes to fix, test, and deploy to Digital Ocean
