# Quick Supabase Migration Guide
## Your Situation: Supabase Already Set Up!

**Date:** October 12, 2025  
**Status:** Ready to Execute  
**Time Required:** 5-10 minutes

---

## ✅ What You Already Have

- ✅ Supabase project created
- ✅ Admin/agent login info in Supabase Auth
- ✅ Plan data in repository files (`seed-plans-supabase.ts`)
- ✅ Schema files ready (`supabase_schema.sql`)

---

## 🎯 What We Need To Do

1. Get Supabase connection string (2 min)
2. Verify/clean Supabase database schema (2 min)
3. Seed plans if needed (1 min)
4. Update Railway DATABASE_URL (2 min)
5. Test login (2 min)

**Total: ~10 minutes**

---

## 📝 Step-by-Step Instructions

### **Step 1: Get Supabase Connection String** (2 minutes)

1. **Go to your Supabase dashboard:**
   - Visit: https://supabase.com
   - Sign in to your existing project

2. **Get the database connection string:**
   - Click on your project
   - Go to **Project Settings** (gear icon in sidebar)
   - Click **Database** tab
   - Scroll to "Connection String" section
   - Copy the **Transaction** mode connection string
   - Example format:
     ```
     postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
     ```

3. **Important:** Replace `[YOUR-PASSWORD]` with your actual database password
   - If you don't remember it, you can reset it in the same Database settings page

---

### **Step 2: Check Current Database State** (2 minutes)

1. **In Supabase, go to Table Editor** (left sidebar)

2. **Check what tables exist:**
   - Do you see: `users`, `plans`, `subscriptions`, `payments`, `commissions`, etc?
   - If YES: Great! Schema is already set up
   - If NO or PARTIAL: We need to run the schema SQL

3. **Check if you have test enrollment data:**
   - Click on `users` table
   - How many rows with `role = 'member'` or `role = 'user'`?
   - Click on `subscriptions` table
   - How many rows?

**Tell me what you see and we'll proceed accordingly!**

---

### **Step 3A: If Schema Exists - Clean Enrollment Data** (2 minutes)

If you already have tables set up:

1. **In Supabase, click "SQL Editor"** (left sidebar)
2. **Click "New Query"**
3. **Copy the contents of `clean_enrollment_data_only.sql`** from your repo
4. **Paste into SQL Editor**
5. **Click "Run"** (bottom right)
6. **Review the preview** (shows what will be deleted)
7. **Type `COMMIT;`** at the bottom and run again to confirm

This removes all test member/enrollment data while keeping agents/admins.

---

### **Step 3B: If Schema Missing - Create It** (3 minutes)

If tables don't exist:

1. **In Supabase SQL Editor, open `supabase_schema.sql`** from your repo
2. **Copy and paste the entire file**
3. **Click "Run"**
4. **Should see:** "Success. No rows returned"
5. **Verify:** Go to Table Editor, should see all tables created

---

### **Step 4: Seed Plans** (1 minute)

We have a script ready! In your terminal:

```powershell
# Make sure you're in the project directory
cd "c:\Users\Aarons\OneDrive\Desktop\landing pages\lonestarenotary-repo\getmydpc_enrollment"

# Set Supabase environment variables (use your actual values)
$env:SUPABASE_URL="https://your-project.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Run the seed script
npx tsx server/scripts/seed-plans-supabase.ts
```

Should see:
```
🌱 Starting to seed plans...
✓ Successfully inserted 9 plans!
✅ Plans seeding completed successfully!
```

**Where to find Supabase keys:**
- SUPABASE_URL: Project Settings → API → Project URL
- SUPABASE_SERVICE_ROLE_KEY: Project Settings → API → service_role key (click "Reveal")

---

### **Step 5: Update Railway DATABASE_URL** (2 minutes)

1. **Go to Railway dashboard:**
   - Visit: https://railway.app
   - Navigate to `getmydpcenrollment-production`

2. **Update the DATABASE_URL:**
   - Click on your service
   - Go to "Variables" tab
   - Find `DATABASE_URL`
   - Click "Edit"
   
   **SAVE THE OLD VALUE FIRST (for rollback):**
   ```
   OLD (Neon - SUSPENDED):
   postgresql://neondb_owner:npg_1xLagzI6bHNO@ep-young-violet-ae4ri08o.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
   
   **Replace with your Supabase connection string**
   
   - Click "Update"

3. **Railway auto-deploys:**
   - Watch deployment logs
   - Should complete in 2-3 minutes
   - Look for "Server listening on port 3000"

---

### **Step 6: Test Everything** (3 minutes)

1. **Wait for Railway deployment to complete**
   - Check logs for success

2. **Test Login:**
   - Go to: https://enrollment.getmydpc.com
   - Log in with your admin credentials
   - Should work without errors!

3. **Check Railway Logs:**
   - Should see: `[Login] User authenticated successfully`
   - Should NOT see: "endpoint has been disabled"

4. **Check Dashboard:**
   - All Enrollments tab - Should be empty or show only valid data
   - Manage Leads tab - Should load without errors
   - User Management tab - Should load without errors

5. **Test New Enrollment (optional):**
   - Try creating a test enrollment
   - Verify it appears in "All Enrollments"
   - Check Supabase Table Editor → `subscriptions` (should have new row)

---

## ✅ Success Checklist

After completing, you should have:

- ✅ Railway connected to Supabase (not suspended Neon)
- ✅ Login working without 500 errors
- ✅ Dashboard loading successfully
- ✅ Plans loaded (9 plans in database)
- ✅ Agents/admins preserved
- ✅ Test enrollment data cleaned out
- ✅ No more suspension issues!

---

## 🔄 Quick Rollback (If Needed)

If something goes wrong:

1. Go to Railway → Variables
2. Change DATABASE_URL back to old Neon string:
   ```
   postgresql://neondb_owner:npg_1xLagzI6bHNO@ep-young-violet-ae4ri08o.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
3. Wait for redeploy

*(This brings back the suspension issue, but gets you to known state)*

---

## 📞 Need Help?

**Issue:** Can't find Supabase connection string
- **Solution:** Project Settings → Database → Connection String (Transaction mode)

**Issue:** Forgot database password
- **Solution:** Project Settings → Database → "Reset database password"

**Issue:** Plans won't seed
- **Solution:** Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are correct

**Issue:** Railway won't deploy
- **Solution:** Check logs for specific error, verify DATABASE_URL format

---

## 🎉 What You'll Gain

✅ **No more suspensions** - Supabase free tier doesn't auto-suspend  
✅ **Faster cold starts** - No wake-up delay  
✅ **Unified platform** - Auth + Database in one place  
✅ **Better tooling** - Built-in SQL Editor, Table Editor  
✅ **Easy backups** - Point-in-time recovery  
✅ **Clean database** - No test data clutter  

---

**Ready to proceed? Start with Step 1 (get connection string) and let me know what you find!**
