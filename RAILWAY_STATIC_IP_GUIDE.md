# Railway Static IP Configuration Guide

## ✅ Step 1: Check if Railway Provides Static IPs

### Current Railway Plans (as of 2025)

Railway offers **static outbound IPs** as an add-on feature. Here's what you need to check:

1. **Go to your Railway dashboard:**
   - Visit: https://railway.app/dashboard
   - Select your `getmydpc_enrollment` project

2. **Check your current plan:**
   - Click on your project settings
   - Look for "Plan" or "Usage" section
   - Static IPs are typically available on:
     - **Pro Plan** ($20+/month) - Static IP available as add-on
     - **Team/Enterprise Plans** - Included or available

3. **Check for Static IP option:**
   - In project settings, look for:
     - "Network" or "Networking" tab
     - "Static Outbound IP" option
     - "TCP Proxy" settings

---

## 🔍 Step 2: Find Your Current Railway Outbound IP

### Method 1: Use Railway's Built-in Tool (Easiest)

```bash
# SSH into your Railway deployment
railway run bash

# Inside the Railway container, run:
curl ifconfig.me
# OR
curl ipinfo.io/ip
```

### Method 2: Add a Temporary Endpoint to Your Express App

Add this to your `server/routes.ts` temporarily:

```typescript
// Temporary endpoint to check outbound IP
app.get("/api/check-ip", async (req, res) => {
  try {
    const response = await fetch("https://api.ipify.org?format=json");
    const data = await response.json();
    res.json({ 
      outboundIP: data.ip,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to check IP" });
  }
});
```

Then visit: `https://enrollment.getmydpc.com/api/check-ip`

### Method 3: Check Railway Logs

1. Go to Railway dashboard → Your project
2. Click "Deployments"
3. Look for any connection logs that show your outbound IP

---

## 📋 Step 3: Railway Static IP Options

### Option A: Enable Static IP Add-on (Recommended)

**If Railway offers static IPs on your plan:**

1. **Navigate to Settings:**
   - Project Settings → Network/Networking
   - Look for "Static Outbound IP" toggle or add-on

2. **Enable Static IP:**
   - May require plan upgrade to Pro ($20/month)
   - Additional cost: Typically $5-10/month for static IP
   - Once enabled, Railway assigns a dedicated IP

3. **Get Your Static IP:**
   - Railway will display the assigned static IP
   - Copy this IP for EPX ACL whitelist
   - This IP remains constant even with redeployments

**Cost Estimate:**
- Railway Pro Plan: $20/month (if not already on it)
- Static IP Add-on: ~$5-10/month
- **Total: $25-30/month** (vs $4-6/month for DO droplet)

### Option B: Use Railway's Dynamic IP (Current State)

**If you don't enable static IP:**

⚠️ **Problem:** Railway's outbound IP can change:
- During redeployments
- During platform maintenance
- Without warning

❌ **EPX Requirement:** EPX Server Post **requires** static IP for ACL
🚫 **Won't work:** Dynamic IP will break when Railway changes your IP

---

## 🎯 Recommended Path: Railway Static IP

Since you want to keep everything on Railway, here's the plan:

### Prerequisites Needed:

1. ✅ Railway Pro Plan (or higher)
2. ✅ Static Outbound IP add-on enabled
3. ✅ EPX Server Post credentials (EPI ID, EPI Key)
4. ✅ EPX ACL whitelist request submitted with your Railway static IP

### Implementation Steps:

#### Phase 1: Enable Railway Static IP (Do This First)

1. **Upgrade Railway Plan if needed:**
   ```
   Dashboard → Project Settings → Billing
   → Upgrade to Pro Plan ($20/month)
   ```

2. **Enable Static IP:**
   ```
   Dashboard → Project Settings → Network
   → Enable "Static Outbound IP"
   → Note the assigned IP address
   ```

3. **Verify Static IP:**
   - Use the `/api/check-ip` endpoint (from Method 2 above)
   - Confirm the IP matches what Railway assigned
   - Test after a redeployment to confirm it stays the same

#### Phase 2: Submit EPX ACL Request

1. **Contact EPX Support:**
   - Email: developer@north.com (or your EPX account manager)
   - Subject: "Server Post ACL Whitelist Request"
   
2. **Provide Information:**
   ```
   Merchant Name: My Premier Plans (or your registered name)
   EPI ID: [Your EPI ID from EPX Developer Portal]
   Static IP Address: [Railway static IP from Phase 1]
   Environment: Production (or Sandbox for testing)
   ```

3. **Wait for Confirmation:**
   - EPX typically responds within 1-3 business days
   - They'll confirm when your IP is whitelisted
   - Keep this confirmation email for reference

#### Phase 3: Implement EPX Server Post Code

**Once your IP is whitelisted:**

1. Move EPX code from archive to active services:
   ```
   archive/epx-server-post-future/epx-server-post-service.ts 
   → server/services/epx-server-post-service.ts
   
   archive/epx-server-post-future/recurring-billing-scheduler.ts 
   → server/services/recurring-billing-scheduler.ts
   
   archive/epx-server-post-future/epx-server-post-routes.ts 
   → server/routes/epx-server-post-routes.ts
   ```

2. Add EPX credentials to Railway environment:
   ```
   EPX_EPI_ID=your_epi_id
   EPX_EPI_KEY=your_epi_key
   EPX_API_URL=https://api.north.com (production) or sandbox URL
   ```

3. Run database migrations for new tables:
   ```sql
   -- payment_tokens table for BRIC tokens
   -- billing_schedule table for recurring charges
   -- recurring_billing_log table for audit trail
   ```

4. Update environment-specific code:
   - Replace any Neon references with Supabase
   - Update database connection strings
   - Test all EPX service methods

5. Deploy and test:
   - Test in EPX sandbox first (if available)
   - Verify BRIC token storage works
   - Test a manual recurring charge
   - Enable the cron job (daily 2 AM billing)

---

## 🚨 Important Notes

### Railway Static IP Limitations:

1. **Not available on Hobby/Free plans** - Must upgrade to Pro
2. **Additional cost** - Usually $5-10/month on top of Pro plan
3. **Single region** - IP is tied to Railway's deployment region
4. **No IP failover** - If Railway has issues, no backup IP

### EPX Server Post Requirements:

1. **Static IP is mandatory** - Cannot use dynamic IP
2. **ACL whitelist takes time** - Plan for 1-3 business days
3. **Production vs Sandbox** - May need separate IPs for each environment
4. **IP change = downtime** - If you ever change IP, must update EPX ACL

### Fallback Option:

If Railway doesn't offer static IPs or it's too expensive, you can still use:
- **Hybrid approach:** Railway backend + Digital Ocean static IP proxy
- **Cost:** Railway Pro ($20) + DO droplet ($4) = $24/month (similar cost)
- **Benefit:** More control over networking, true static IP guarantee

---

## ✅ Action Items for You

**Right Now:**

1. [ ] Log into Railway dashboard
2. [ ] Check your current plan (Hobby/Pro/Team?)
3. [ ] Look for "Static Outbound IP" option in settings
4. [ ] Report back: Is static IP available? What's the cost?

**If Static IP Available:**

5. [ ] Enable static IP add-on
6. [ ] Note your assigned static IP
7. [ ] Test with `/api/check-ip` endpoint
8. [ ] Get EPX credentials ready (EPI ID, EPI Key)
9. [ ] Submit EPX ACL whitelist request

**If Static IP NOT Available:**

5. [ ] Consider Railway Pro upgrade ($20/month)
6. [ ] OR pivot to Digital Ocean proxy approach ($4/month)
7. [ ] Let me know which path you prefer

---

## 📞 Next Steps

**Tell me:**
1. What Railway plan are you currently on?
2. Do you see a "Static Outbound IP" option?
3. What would be the cost to enable it?
4. Do you have EPX credentials (EPI ID, EPI Key) ready?

Once I know this, I'll create the exact implementation plan for your specific Railway setup! 🚀
