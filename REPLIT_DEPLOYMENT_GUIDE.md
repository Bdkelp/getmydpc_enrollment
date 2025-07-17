# Deploying on Replit with Custom Domain

## Step 1: Deploy on Replit

1. Click the "Deploy" button in the Replit interface
2. Choose "Production" deployment
3. Replit will provide you with a URL like: `your-app-name.replit.app`

## Step 2: Configure Your Custom Domain

### Option A: Use your entire domain (e.g., enrollment.yourdomain.com)
1. In your domain's DNS settings, create a CNAME record:
   - Host: `enrollment` (or whatever subdomain you prefer)
   - Points to: `your-app-name.replit.app`
   - TTL: 3600 (or your preference)

2. In Replit:
   - Go to your deployment settings
   - Add your custom domain (e.g., `enrollment.yourdomain.com`)
   - Replit will automatically provision an SSL certificate

### Option B: Use a subdirectory (e.g., yourdomain.com/enrollment)
This requires a reverse proxy on your main domain to forward requests to Replit.

## Step 3: Update Application Configuration

Before deploying, we need to update the redirect URLs for authentication to use your custom domain.

### Environment Variables to Update:
- `PUBLIC_URL` - Set to your custom domain
- Update Supabase redirect URLs in your Supabase dashboard

## Step 4: Post-Deployment Tasks

1. **Update Supabase Settings:**
   - Go to your Supabase project dashboard
   - Navigate to Authentication > URL Configuration
   - Add your custom domain to:
     - Site URL: `https://enrollment.yourdomain.com`
     - Redirect URLs: 
       - `https://enrollment.yourdomain.com/auth/callback`
       - `https://enrollment.yourdomain.com/reset-password`

2. **Test Everything:**
   - User registration flow
   - Password reset emails
   - Magic link authentication
   - Agent and admin dashboards
   - Payment processing

## DNS Setup Example

If your domain is `mypremierplans.com` and you want `enrollment.mypremierplans.com`:

```
Type: CNAME
Name: enrollment
Value: your-replit-app.replit.app
TTL: 3600
```

## Timeline
- DNS propagation: 5 minutes to 48 hours (usually within 1 hour)
- SSL certificate: Automatically provisioned by Replit (usually instant)

## Benefits of This Approach
- ✅ Professional appearance with your own domain
- ✅ Free SSL certificate from Replit
- ✅ Easy to manage and update
- ✅ Replit handles all the hosting infrastructure
- ✅ Automatic scaling and performance optimization