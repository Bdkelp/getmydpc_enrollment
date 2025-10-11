# Run Cleanup Script - Quick Guide

## 🚀 How to Execute the Cleanup

### Method 1: Via Railway (Recommended)

#### Step 1: Push the Script to Railway
```powershell
# In your terminal
cd "c:\Users\Aarons\OneDrive\Desktop\landing pages\lonestarenotary-repo\getmydpc_enrollment"

git add run_cleanup.js RUN_CLEANUP_GUIDE.md
git commit -m "Add one-time database cleanup script"
git push origin master
```

Railway will automatically deploy the new code.

#### Step 2: Add Environment Variable
1. Go to **https://railway.app**
2. Open your **getmydpc** project
3. Click on your **backend service**
4. Go to **"Variables"** tab
5. Click **"+ New Variable"**
6. Add: `CONFIRM_CLEANUP` = `YES`
7. Click **"Add"**

#### Step 3: Run the Cleanup
**Option A - Using Custom Start Command:**
1. In Railway, go to **"Settings"** tab
2. Find **"Custom Start Command"**
3. Change it to: `node run_cleanup.js`
4. Click **"Deploy"**
5. Go to **"Deployments"** tab
6. Click latest deployment
7. Click **"View Logs"**
8. Watch the cleanup happen in real-time! 🎉

**Option B - Using Railway Run:**
1. In Railway dashboard
2. Click the **"⋯"** menu on your service
3. Select **"Run Command"**
4. Type: `node run_cleanup.js`
5. Press Enter
6. Watch the output

#### Step 4: Restore Normal Operation
1. Go back to **"Settings"** tab
2. Find **"Custom Start Command"**
3. Change it back to: `npm run start` (or remove it to use default)
4. Go to **"Variables"** tab
5. Delete the `CONFIRM_CLEANUP` variable
6. Redeploy

#### Step 5: Clean Up
```powershell
# Delete the script from your repo
git rm run_cleanup.js RUN_CLEANUP_GUIDE.md
git commit -m "Remove cleanup script after execution"
git push origin master
```

---

### Method 2: Run Locally (If you have .env file)

#### Step 1: Make sure you have .env
```bash
# Check if .env exists with DATABASE_URL
cat .env | grep DATABASE_URL
```

If you don't have it, get it from Railway:
1. Railway dashboard → Your service → Variables tab
2. Copy `DATABASE_URL` value
3. Create `.env` file with:
```
DATABASE_URL=postgresql://your-connection-string
```

#### Step 2: Run the script
```powershell
# Install pg if not already installed
npm install pg

# Run the cleanup script
node run_cleanup.js
```

#### Step 3: Follow prompts
- Script will show you what will be deleted
- Type `YES` to confirm
- Watch the cleanup execute
- See verification results

---

## 📊 What You'll See

### 1. Pre-Cleanup Verification
```
=============================================================
STEP 1: PRE-CLEANUP VERIFICATION
=============================================================

Current Data Counts:
{ member_users: 81, total_subscriptions: 65, ... }

These 20 NEWEST enrollments will be KEPT:
┌───┬────┬──────────────────┬──────────┬─────────────┐
│ # │ ID │ Plan             │ Type     │ Date        │
├───┼────┼──────────────────┼──────────┼─────────────┤
│ 1 │ 65 │ MyPremierPlan    │ Family   │ 10/9/2025   │
│ 2 │ 64 │ MyPremierPlan    │ Couple   │ 10/8/2025   │
...

These OLDEST enrollments will be DELETED:
┌───┬────┬──────────────────┬──────────┬─────────────┐
│ # │ ID │ Plan             │ Type     │ Date        │
├───┼────┼──────────────────┼──────────┼─────────────┤
│ 1 │ 1  │ MyPremierPlan    │ Individual│ 9/1/2025   │
...
```

### 2. Confirmation
```
⚠️  Proceed with cleanup? Type "YES" to continue: 
```

### 3. Execution
```
=============================================================
STEP 2: EXECUTING CLEANUP
=============================================================

ℹ Creating temporary tables...
ℹ Deleting commissions...
✅ Deleted 25 commissions
ℹ Deleting payments...
✅ Deleted 35 payments
ℹ Deleting subscriptions...
✅ Deleted 45 subscriptions
✅ Transaction committed successfully!
```

### 4. Verification
```
=============================================================
STEP 3: POST-CLEANUP VERIFICATION
=============================================================

Final Data Counts:
{ subscriptions: 20, payments: 20, ... }

✅ PASS - Exactly 20 subscriptions remain
✅ PASS - No orphaned payments
✅ PASS - No orphaned commissions

✅ CLEANUP COMPLETE AND VERIFIED!
```

---

## ✅ Success Indicators

You'll know it worked when you see:
- ✅ PASS - Exactly 20 subscriptions remain
- ✅ PASS - No orphaned payments
- ✅ PASS - No orphaned commissions
- ✅ CLEANUP COMPLETE AND VERIFIED!

---

## 🛑 If Something Goes Wrong

### "DATABASE_URL is not set"
- Make sure you added `DATABASE_URL` to Railway variables
- Or have it in your local `.env` file

### "CONFIRM_CLEANUP=YES to proceed"
- You forgot to add the `CONFIRM_CLEANUP=YES` environment variable
- Add it in Railway Variables tab

### Transaction failed
- The script automatically rolls back
- No data is deleted if there's an error
- Check Railway logs for specific error message

### Wrong number of subscriptions deleted
- Script won't run if you have ≤20 subscriptions already
- Double-check your data first

---

## 🔄 After Cleanup

1. **Test Your App**
   - Go to enrollment.getmydpc.com
   - Log in as an agent
   - Check that enrollments are visible
   - Verify app works normally

2. **Notify EPX**
   - Let them know cleanup is complete
   - 20 most recent enrollments preserved
   - They can verify transaction visibility

3. **Clean Up**
   - Delete `run_cleanup.js` from repo
   - Remove `CONFIRM_CLEANUP` from Railway
   - Restore normal start command

4. **Document**
   - Note the date cleanup was run
   - Record how many records were deleted
   - Update your progress tracker

---

## 📝 Troubleshooting

### Can't find Railway dashboard?
- Go to https://railway.app
- Sign in
- Look for "getmydpc" or "enrollment" project

### Can't see logs?
- Railway dashboard → Your service
- Click "Deployments" tab
- Click on latest deployment
- Click "View Logs" button

### Want to test first?
- Run locally with your `.env` file
- Script shows preview before asking for confirmation
- Type anything except "YES" to cancel

### Need to undo?
- Neon has automatic backups
- Railway dashboard → Database → Backups
- Restore to time before cleanup

---

## 🎯 Next Steps After Successful Cleanup

1. ✅ Verify 20 enrollments remain
2. ✅ Test app functionality  
3. ✅ Delete cleanup script
4. ➡️ **Move to Issue #5**: Role-Based Dashboard Implementation

---

**Ready to run? Follow Method 1 (Railway) steps above!** 🚀
