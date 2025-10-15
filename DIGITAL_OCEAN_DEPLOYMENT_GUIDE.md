# Digital Ocean Deployment Guide

## Overview
This guide walks through deploying the GetMyDPC Enrollment application to Digital Ocean. The application is a full-stack Express + React application with dual database architecture (Supabase for authentication, Neon PostgreSQL for business data).

## Application Architecture

### Technology Stack
- **Backend**: Node.js + Express + TypeScript
- **Frontend**: React + Vite + TypeScript
- **Databases**: 
  - Supabase (Authentication, Users table, Leads table)
  - Neon PostgreSQL (Members, Commissions, Subscriptions, Plans)
- **Payment Processing**: EPX Hosted Checkout
- **Email**: Nodemailer for lead notifications

### Current Port Configuration
- Application runs on port **5000** (hardcoded in server/index.ts)
- Development mode: Vite dev server included
- Production mode: Serves static files from `dist/public`

## Digital Ocean Deployment Options

### Option 1: Digital Ocean App Platform (Recommended)
**Pros:**
- Managed platform (like Railway/Heroku)
- Automatic deployments from GitHub
- Built-in SSL certificates
- Easy scaling
- No server management

**Cons:**
- Higher cost than Droplets
- Less control over infrastructure

### Option 2: Digital Ocean Droplets
**Pros:**
- Full server control
- More cost-effective
- Can run multiple apps

**Cons:**
- Requires server management
- Manual SSL setup
- More complex deployment

## Required Environment Variables

Create a `.env` file or configure these in Digital Ocean:

```bash
# ============================================
# DATABASE CONFIGURATION
# ============================================
# Neon PostgreSQL - Primary business database
DATABASE_URL=postgresql://user:password@host:5432/dbname?sslmode=require

# ============================================
# SUPABASE AUTHENTICATION
# ============================================
# Get these from: Supabase Dashboard > Project Settings > API
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# ============================================
# APPLICATION CONFIGURATION
# ============================================
NODE_ENV=production
PORT=5000  # Digital Ocean will use this or override

# Session secret - generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SESSION_SECRET=your-strong-session-secret-here

# Frontend URL (will be your Digital Ocean URL)
VITE_PUBLIC_URL=https://your-app.ondigitalocean.app

# ============================================
# PAYMENT PROCESSING - EPX HOSTED CHECKOUT
# ============================================
EPX_PUBLIC_KEY=your_epx_public_key_here
EPX_TERMINAL_PROFILE_ID=your_terminal_profile_id_here
EPX_ENVIRONMENT=production  # 'sandbox' or 'production'
EPX_WEBHOOK_SECRET=your_webhook_secret_here

# EPX Account Details
EPX_CUST_NBR=your_customer_number
EPX_MERCH_NBR=your_merchant_number
EPX_DBA_NBR=your_dba_number
EPX_TERMINAL_NBR=your_terminal_number
EPX_MAC=your_mac_key  # or EPX_MAC_KEY
EPX_MAC_KEY=your_mac_key

# Payment provider mode
PAYMENT_PROVIDER=epx  # Use 'mock' for testing, 'epx' for production

# ============================================
# EMAIL NOTIFICATIONS (Optional)
# ============================================
# Lead form submissions send to info@mypremierplans.com
EMAIL_SERVICE=gmail  # or 'outlook', 'yahoo', etc.
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password

# ============================================
# ENCRYPTION (Optional but recommended)
# ============================================
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=your-64-char-hex-encryption-key-here
```

## Deployment Steps

### Preparation (Before Deployment)

#### 1. Update CORS Configuration
The app currently has Railway-specific URLs hardcoded. You'll need to update `server/routes.ts` and `server/railway.ts`:

**Files to update:**
- `server/routes.ts` (lines 35-37, 578-580, 717-719, 2401-2403)
- `server/railway.ts` (lines 17-24)

**Replace Railway URLs with your Digital Ocean URL:**
```typescript
// OLD:
'https://getmydpcenrollment-production.up.railway.app',
'https://shimmering-nourishment.up.railway.app',

// NEW:
'https://your-app-name.ondigitalocean.app',
```

Or better yet, use environment variables:
```typescript
origin: [
  process.env.VITE_PUBLIC_URL,
  'https://enrollment.getmydpc.com',
  /\.vercel\.app$/,
  /\.ondigitalocean\.app$/,  // Add this pattern
  // ... rest of your origins
]
```

#### 2. Create a Dockerfile (if using Droplets)
If deploying to a Droplet instead of App Platform, create a `Dockerfile`:

```dockerfile
# Use Node.js 20 LTS
FROM node:20-slim

# Install dependencies for building
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY client/package*.json ./client/

# Install dependencies
RUN npm ci
RUN npm --prefix client ci

# Copy source code
COPY . .

# Build the application
RUN npm run build:client
RUN npm run build

# Expose port
EXPOSE 5000

# Start the application
CMD ["npm", "start"]
```

#### 3. Create .dockerignore (if using Docker)
```
node_modules
client/node_modules
dist
client/dist
.env
.env.local
*.log
.git
.gitignore
README.md
*.md
*.mjs
*.sql
cleanup.ps1
```

### Deployment to Digital Ocean App Platform

#### Step 1: Connect GitHub Repository
1. Log in to Digital Ocean
2. Go to **Apps** section
3. Click **Create App**
4. Select **GitHub** as source
5. Authorize Digital Ocean to access your repository
6. Select your repository: `Bdkelp/getmydpc_enrollment`
7. Select branch: `main`

#### Step 2: Configure Build Settings
1. **Type**: Web Service
2. **Environment**: Node.js
3. **Build Command**:
   ```bash
   npm --prefix client ci && npm --prefix client run build && npm run build
   ```
4. **Run Command**:
   ```bash
   npm start
   ```
5. **HTTP Port**: 5000
6. **HTTP Routes**: `/` (all routes)

#### Step 3: Add Environment Variables
In the Digital Ocean App Platform console, add all environment variables from the section above.

**Important:** 
- Set `NODE_ENV=production`
- Set `VITE_PUBLIC_URL` to your app's URL (you'll get this after first deployment)
- Make sure `DATABASE_URL` points to your Neon database
- Configure Supabase credentials

#### Step 4: Configure Domains
1. After deployment, you'll get a URL like: `https://your-app-name.ondigitalocean.app`
2. If using custom domain (`enrollment.getmydpc.com`):
   - Go to **Settings** > **Domains**
   - Add your custom domain
   - Update DNS records as instructed by Digital Ocean
   - Digital Ocean will automatically provision SSL certificate

#### Step 5: Deploy
1. Click **Create Resources**
2. Digital Ocean will:
   - Clone your repository
   - Install dependencies
   - Build client and server
   - Start the application
   - Provision SSL certificate

### Post-Deployment Configuration

#### 1. Update Supabase Redirect URLs
Go to Supabase Dashboard > Authentication > URL Configuration:
- Add your Digital Ocean URL to **Site URL**
- Add to **Redirect URLs**:
  ```
  https://your-app.ondigitalocean.app/*
  https://enrollment.getmydpc.com/*
  ```

#### 2. Update EPX Webhook URLs
Contact EPX support to update webhook/callback URLs to:
```
https://your-app.ondigitalocean.app/api/epx/hosted/callback
```

#### 3. Update Frontend Environment Variables
If you have a separate frontend deployment (Vercel), update:
```bash
VITE_API_URL=https://your-app.ondigitalocean.app
```

#### 4. Test Critical Flows
- [ ] Health check: `https://your-app.ondigitalocean.app/health`
- [ ] API health: `https://your-app.ondigitalocean.app/api/health`
- [ ] User login (agents/admins)
- [ ] Lead form submission
- [ ] Member enrollment
- [ ] Commission creation
- [ ] Payment processing

## Database Considerations

### Neon Database
Your Neon database contains:
- `members` table (7 members)
- `commissions` table (7 commissions)
- `subscriptions` table
- `plans` table

**Important:** Neon free tier databases auto-suspend after inactivity. Consider:
1. Upgrading to Neon paid plan (no auto-suspend)
2. Migrating to Supabase PostgreSQL (included, no auto-suspend)
3. Using Digital Ocean Managed PostgreSQL

### Supabase
Your Supabase project contains:
- `users` table (agents/admins authentication)
- `leads` table (lead management)

**No changes needed** - continue using Supabase for auth.

## Monitoring and Logs

### Digital Ocean App Platform
- **Runtime Logs**: Apps > Your App > Runtime Logs
- **Build Logs**: Apps > Your App > Deployments > Build Logs
- **Metrics**: CPU, Memory, Response Time

### Application Health Endpoints
Monitor these endpoints:
- `/health` - Server health check
- `/api/health` - API health check
- `/api/epx/health-check` - EPX service health

## Scaling Configuration

### Horizontal Scaling
Digital Ocean App Platform supports multiple containers:
1. Go to **Components** > Your Web Service
2. Edit **Instance Size** and **Instance Count**
3. Recommended for production:
   - Instance Size: Basic (1 GB RAM / 1 vCPU) or Professional
   - Instance Count: 2+ for high availability

### Database Connection Pooling
Current configuration (in `server/lib/neonDb.ts`):
```typescript
max: 10, // Connection pool size
idleTimeoutMillis: 30000,
connectionTimeoutMillis: 10000,
```

If scaling to multiple instances, consider:
- Using a connection pooler (PgBouncer)
- Increasing Neon connection limits
- Or migrating to Digital Ocean Managed PostgreSQL

## Cost Estimate (Digital Ocean)

### App Platform
- **Starter**: $5/month (512 MB RAM, won't be enough)
- **Basic**: $12/month (1 GB RAM / 1 vCPU) - Recommended
- **Professional**: $25/month (2 GB RAM / 1 vCPU)

### Managed PostgreSQL (Optional)
- **Basic**: $15/month (1 GB RAM, 10 GB storage)
- **Professional**: $55/month (4 GB RAM, 115 GB storage)

### Total Estimated Cost
- **App Platform (Basic)**: $12/month
- **Current setup** (Supabase free + Neon free): $0/month
- **Recommended production**: $27/month (App Platform + Managed DB)

Compare to:
- Railway: ~$20-50/month depending on usage
- Heroku: ~$25/month minimum

## Troubleshooting

### Build Failures
**Error**: "Module not found"
- Check `package.json` dependencies are correct
- Ensure `npm ci` installs all packages
- Verify build command includes client build

**Error**: "Out of memory"
- Increase instance size in App Platform settings
- Optimize build process (remove unnecessary dependencies)

### Runtime Errors
**Error**: "DATABASE_URL is not set"
- Check environment variables in App Platform settings
- Ensure variable names match exactly

**Error**: "Port already in use"
- Digital Ocean will override PORT env var
- Remove hardcoded port 5000 or make it configurable:
  ```typescript
  const port = parseInt(process.env.PORT || '5000');
  ```

**Error**: "CORS blocked"
- Update CORS origins to include your Digital Ocean URL
- Check `server/routes.ts` and `server/railway.ts`

### Database Connection Issues
**Neon database suspended:**
- Wake up database in Neon console
- Or migrate to always-on database solution

**Too many database connections:**
- Check connection pool settings
- Consider connection pooler (PgBouncer)
- Reduce `max` connections in pool config

## Migration from Railway

### DNS Update
Update DNS records for `enrollment.getmydpc.com`:
1. Current: Points to Railway/Vercel
2. New: Point to Digital Ocean App Platform
3. Wait for DNS propagation (5-60 minutes)

### Zero-Downtime Migration
1. Deploy to Digital Ocean (test with .ondigitalocean.app URL)
2. Verify all functionality works
3. Update DNS to point to Digital Ocean
4. Monitor for 24 hours
5. Shut down Railway deployment

### Rollback Plan
If issues arise:
1. Revert DNS changes to Railway
2. Railway deployment should still be running
3. Fix issues on Digital Ocean
4. Try migration again

## Security Checklist

- [ ] All environment variables configured (no hardcoded secrets)
- [ ] `SESSION_SECRET` is strong and unique
- [ ] `ENCRYPTION_KEY` generated and set
- [ ] Supabase RLS policies enabled
- [ ] Database passwords are strong
- [ ] SSL/TLS enabled (automatic with Digital Ocean)
- [ ] CORS origins properly restricted
- [ ] EPX credentials secured in environment variables
- [ ] Email credentials using app-specific passwords

## Next Steps After Deployment

1. **Update documentation**:
   - Document the new deployment URL
   - Update any API documentation

2. **Setup monitoring**:
   - Configure uptime monitoring (UptimeRobot, Pingdom)
   - Setup error tracking (Sentry)
   - Enable Digital Ocean monitoring alerts

3. **Backup strategy**:
   - Neon has automatic backups
   - Consider additional backup strategy for critical data
   - Document restore procedures

4. **Performance optimization**:
   - Enable CDN for static assets
   - Consider Redis for session storage (vs in-memory)
   - Optimize database queries

5. **CI/CD Pipeline**:
   - Setup automatic deployments on git push
   - Add pre-deployment tests
   - Configure staging environment

## Support and Resources

- **Digital Ocean Docs**: https://docs.digitalocean.com/products/app-platform/
- **Neon Docs**: https://neon.tech/docs
- **Supabase Docs**: https://supabase.com/docs
- **EPX Support**: Contact your EPX representative

## Maintenance Commands

### View logs
```bash
doctl apps logs <app-id>
```

### Restart application
```bash
doctl apps restart <app-id>
```

### Update environment variable
Go to Digital Ocean console > Apps > Settings > Environment Variables

---

## Quick Reference: Build Commands

**Full build (client + server):**
```bash
npm --prefix client ci && npm --prefix client run build && npm run build
```

**Client only:**
```bash
npm --prefix client run build
```

**Server only:**
```bash
npm run build
```

**Start production:**
```bash
npm start
```

**Development:**
```bash
npm run dev
```

---

**Document Version**: 1.0  
**Last Updated**: October 15, 2025  
**Application**: GetMyDPC Enrollment Platform
