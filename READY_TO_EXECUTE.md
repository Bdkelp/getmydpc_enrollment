# ✅ READY TO EXECUTE CLEANUP!

## 🎉 Good News: Files are pushed to Railway!

The cleanup script (`run_cleanup.js`) is now deployed on Railway. Here's what to do next:

---

## 🚀 STEP-BY-STEP: Execute Cleanup in 5 Minutes

### **STEP 1: Open Railway Dashboard**
1. Go to **https://railway.app**
2. Sign in
3. Find your **getmydpc** project
4. Click on your **backend service** (Node.js)

---

### **STEP 2: Add Environment Variable**

In your Railway backend service:

1. Click **"Variables"** tab (in the top navigation)
2. Click **"+ New Variable"** button
3. Add:
   - **Variable Name**: `CONFIRM_CLEANUP`
   - **Value**: `YES`
4. Click **"Add"** or **"Save"**

**Why?** This confirms you want to run the cleanup (safety feature)

---

### **STEP 3: Run the Cleanup Script**

#### Option A: Custom Start Command (Cleaner)

1. In Railway, click **"Settings"** tab
2. Scroll to **"Deploy"** section
3. Find **"Custom Start Command"**
4. Click **"Edit"**
5. Enter: `node run_cleanup.js`
6. Click **"Save"**
7. Railway will automatically redeploy
8. Go to **"Deployments"** tab
9. Click on the latest deployment
10. Click **"View Logs"** button
11. **Watch the magic happen!** 🎉

You'll see:
```
=============================================================
STEP 1: PRE-CLEANUP VERIFICATION
=============================================================

Current Data Counts: {...}
These 20 NEWEST enrollments will be KEPT: [table]
These OLDEST enrollments will be DELETED: [table]

=============================================================
STEP 2: EXECUTING CLEANUP
=============================================================

✅ Deleted X commissions
✅ Deleted X payments
✅ Deleted X subscriptions
✅ Transaction committed successfully!

=============================================================
STEP 3: POST-CLEANUP VERIFICATION
=============================================================

✅ PASS - Exactly 20 subscriptions remain
✅ PASS - No orphaned payments
✅ PASS - No orphaned commissions

✅ CLEANUP COMPLETE AND VERIFIED!
```

#### Option B: One-Time Command (Alternative)

If Railway has a "Run Command" feature:
1. Look for **"⋯"** (three dots) menu on your service
2. Select **"Run Command"** or **"Execute"**
3. Type: `node run_cleanup.js`
4. Press Enter
5. Watch output

---

### **STEP 4: Restore Normal Operation**

After cleanup completes successfully:

1. Go back to **"Settings"** tab
2. Find **"Custom Start Command"**
3. **Delete the custom command** or change back to: `npm run start`
4. Click **"Save"**
5. Go to **"Variables"** tab
6. Find `CONFIRM_CLEANUP`
7. Click **"Delete"** (trash icon)
8. Railway will redeploy with normal start command

---

### **STEP 5: Verify Your App Works**

1. Go to **enrollment.getmydpc.com**
2. Log in as an agent
3. Check the enrollments list
4. Verify you see the 20 most recent enrollments
5. Test that everything works normally

---

### **STEP 6: Clean Up the Script**

Once verified, remove the cleanup script from your repo:

```powershell
cd "c:\Users\Aarons\OneDrive\Desktop\landing pages\lonestarenotary-repo\getmydpc_enrollment"

git rm run_cleanup.js
git commit -m "Remove cleanup script after successful execution"
git push origin main
```

**Why?** Security - don't leave database modification scripts in production code.

---

## 📊 What to Expect

### Before Cleanup:
- ~81 member users
- ~65 subscriptions
- Lots of test data

### After Cleanup:
- **Exactly 20 subscriptions** (newest ones)
- Related payments/commissions for those 20
- All agents/admins preserved
- EPX can see their 20 transactions

---

## ✅ Success Checklist

After running, verify:
- [ ] Railway logs show "✅ CLEANUP COMPLETE AND VERIFIED!"
- [ ] Exactly 20 subscriptions remain
- [ ] No orphaned records (0 for both checks)
- [ ] App loads normally
- [ ] Can see enrollments in dashboard
- [ ] EPX can view their transactions
- [ ] Removed `CONFIRM_CLEANUP` variable
- [ ] Restored normal start command
- [ ] Deleted `run_cleanup.js` from repo

---

## 🆘 Troubleshooting

### "DATABASE_URL is not set"
→ Check that Railway has `DATABASE_URL` in Variables tab

### "CONFIRM_CLEANUP=YES to proceed"
→ You forgot to add the environment variable in Step 2

### "Cleanup not needed (≤20)"
→ You already have 20 or fewer subscriptions, cleanup not needed

### Can't find Railway logs
→ Deployments tab → Click deployment → View Logs button

### Need to undo?
→ Railway dashboard → Find database backup/restore feature
→ Or contact me for rollback help

---

## 🎯 After Successful Cleanup

1. ✅ Mark Issue #4 complete
2. ✅ Notify EPX cleanup is done
3. ✅ Document completion date
4. ➡️ **Move to Issue #5**: Role-Based Dashboard Implementation

---

## 📞 Need Help?

If you get stuck:
1. Check Railway logs for specific error messages
2. Verify `DATABASE_URL` exists in Railway Variables
3. Make sure `CONFIRM_CLEANUP=YES` is set
4. Ask me for help with specific error messages

---

## 🚀 Ready to Go!

**You're all set!** Just follow Steps 1-6 above. The script is already on Railway, just needs to be triggered.

**Estimated time**: 5-10 minutes total

**Good luck!** 🎉
