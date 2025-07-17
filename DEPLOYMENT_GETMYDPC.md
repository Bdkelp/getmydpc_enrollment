# Deployment Instructions for getmydpc.com

## Your Domain Setup Options

### Option 1: Use enrollment.getmydpc.com (Recommended)
This creates a professional subdomain specifically for your enrollment platform.

**DNS Configuration:**
```
Type: CNAME
Name: enrollment
Value: [your-replit-app-name].replit.app
TTL: 3600
```

### Option 2: Use the main domain getmydpc.com
This would make your entire domain point to the enrollment app.

**DNS Configuration:**
```
Type: A
Name: @ (or blank)
Value: [Replit will provide IP addresses]
```

## Step-by-Step Deployment Process

### 1. Deploy on Replit
- Click the "Deploy" button in Replit
- Select "Production" deployment
- Note your Replit app URL (e.g., `mypremierplans-enrollment.replit.app`)

### 2. Configure DNS
For enrollment.getmydpc.com:
1. Log into your domain registrar (GoDaddy, Namecheap, etc.)
2. Go to DNS management
3. Add a CNAME record:
   - Host/Name: `enrollment`
   - Points to: `[your-replit-app].replit.app`
   - TTL: 3600

### 3. Add Custom Domain in Replit
1. Go to your Replit deployment settings
2. Click "Add custom domain"
3. Enter: `enrollment.getmydpc.com`
4. Replit will verify and provision SSL certificate

### 4. Update Supabase Configuration
**Critical: Update these URLs in your Supabase dashboard**

1. Go to Supabase Dashboard → Authentication → URL Configuration
2. Update:
   - **Site URL**: `https://enrollment.getmydpc.com`
   - **Redirect URLs** (add all of these):
     - `https://enrollment.getmydpc.com/auth/callback`
     - `https://enrollment.getmydpc.com/reset-password`
     - `https://enrollment.getmydpc.com/*`

### 5. Test Your Deployment
Once DNS propagates (5 minutes to 2 hours):
- Visit https://enrollment.getmydpc.com
- Test user registration
- Test password reset
- Test magic link login
- Test agent/admin login

## Quick Reference URLs
After deployment, your application will be accessible at:
- Main site: `https://enrollment.getmydpc.com`
- Admin dashboard: `https://enrollment.getmydpc.com/admin`
- Agent dashboard: `https://enrollment.getmydpc.com/agent`
- Registration: `https://enrollment.getmydpc.com/registration`

## Support Contacts
If users need help, they should contact:
- Customer Service: 1-888-899-1608
- Email: info@mypremierplans.com

## Timeline
- DNS propagation: 5 minutes to 2 hours (usually within 30 minutes)
- SSL certificate: Automatic via Replit (instant after domain verification)
- Full deployment: ~15 minutes after DNS propagation