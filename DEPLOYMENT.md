# Deployment Guide - Split Architecture

This guide explains how to deploy your DPC enrollment platform using a split architecture:
- **Frontend**: Vercel (React application)
- **Backend**: Railway (Express API server)
- **Auth**: Supabase (authentication only)
- **Database**: Neon (PostgreSQL data storage)

## Architecture Overview

```
┌─────────────────┐        ┌──────────────────┐
│                 │        │                  │
│  Vercel         │  ───>  │  Railway         │
│  (React App)    │        │  (Express API)   │
│                 │        │                  │
└─────────────────┘        └──────────────────┘
       │                            │
       │                            │
       ▼                            ▼
┌─────────────────┐        ┌──────────────────┐
│  Supabase       │        │  Neon Database   │
│  (Auth Only)    │        │  (PostgreSQL)    │
└─────────────────┘        └──────────────────┘
```

## Prerequisites

1. Accounts on:
   - [Vercel](https://vercel.com)
   - [Railway](https://railway.app)
   - [Supabase](https://supabase.com) (already set up)
   - [Neon](https://neon.tech) (already set up)

2. Your repository connected to both platforms

## Step 1: Deploy Backend to Railway

### 1.1 Create Railway Project

1. Go to [Railway](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your repository
5. Railway will auto-detect the Node.js app

### 1.2 Configure Railway Environment Variables

In Railway dashboard, add these environment variables:

```env
# Database
DATABASE_URL=your-neon-database-url

# Supabase (for auth verification)
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# JWT Secret (generate a secure random string)
JWT_SECRET=your-jwt-secret

# Node Environment
NODE_ENV=production

# Port (Railway sets this automatically)
PORT=${{PORT}}

# EPX Payment Gateway (if using)
EPX_MAC_KEY=your-epx-mac-key
EPX_CUST_NBR=your-customer-number
EPX_MERCH_NBR=your-merchant-number
EPX_DBA_NBR=your-dba-number
EPX_TERMINAL_NBR=your-terminal-number
EPX_BASE_URL=https://your-railway-app.railway.app

# SendGrid (for emails)
SENDGRID_API_KEY=your-sendgrid-api-key
SENDGRID_FROM_EMAIL=your-from-email
```

### 1.3 Deploy to Railway

1. Railway will automatically build and deploy using `railway.json` configuration
2. Note your Railway app URL (e.g., `https://your-app-name.railway.app`)
3. Test the health endpoint: `https://your-app-name.railway.app/health`

## Step 2: Deploy Frontend to Vercel

### 2.1 Update Frontend Configuration

1. Update `client/.env.production` with your Railway backend URL:

```env
# Railway Backend URL
VITE_API_URL=https://your-app-name.railway.app

# Your custom domain
VITE_PUBLIC_URL=https://enrollment.getmydpc.com

# Supabase
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 2.2 Deploy to Vercel

1. Go to [Vercel](https://vercel.com)
2. Import your GitHub repository
3. Configure build settings:
   - Framework Preset: None
   - Build Command: `cd client && npm install && vite build`
   - Output Directory: `client/dist`
   - Install Command: `npm install`

### 2.3 Set Vercel Environment Variables

In Vercel dashboard, add:

```env
VITE_API_URL=https://your-railway-app.railway.app
VITE_PUBLIC_URL=https://enrollment.getmydpc.com
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 2.4 Deploy

1. Click "Deploy"
2. Vercel will build and deploy your frontend
3. Your app will be available at your custom domain

## Step 3: Post-Deployment Setup

### 3.1 Update CORS Settings

Ensure your Railway backend allows requests from your Vercel frontend:

1. The `server/railway.ts` file already includes CORS configuration
2. Update the origin array if you have additional domains

### 3.2 Test the Full Stack

1. Visit your frontend URL
2. Try to log in or register
3. Check that API calls reach Railway backend
4. Verify data persists in Neon database

### 3.3 Custom Domain Setup (Vercel)

1. In Vercel dashboard, go to Settings > Domains
2. Add your custom domain (enrollment.getmydpc.com)
3. Update DNS records as instructed by Vercel

## Troubleshooting

### Frontend can't reach backend

1. Check VITE_API_URL in Vercel environment variables
2. Verify CORS settings in `server/railway.ts`
3. Check Railway logs for errors

### Authentication issues

1. Ensure Supabase keys match in both Vercel and Railway
2. Check JWT_SECRET is same in Railway as stored in Supabase
3. Verify Authorization headers are being sent

### Database connection issues

1. Check DATABASE_URL in Railway environment variables
2. Verify Neon database is accessible
3. Check Railway logs for connection errors

### Deployment fails

**Railway:**
- Check build logs in Railway dashboard
- Ensure all dependencies are in package.json
- Verify Node.js version compatibility

**Vercel:**
- Check build logs in Vercel dashboard
- Ensure client/package.json has all dependencies
- Verify build command is correct

## Monitoring

### Railway
- View logs: Railway Dashboard > Your Project > Logs
- Monitor metrics: Railway Dashboard > Your Project > Metrics

### Vercel
- View logs: Vercel Dashboard > Your Project > Functions Logs
- Analytics: Vercel Dashboard > Your Project > Analytics

## Updating Deployments

### Backend (Railway)
1. Push changes to your GitHub repository
2. Railway automatically deploys from main branch

### Frontend (Vercel)
1. Push changes to your GitHub repository
2. Vercel automatically deploys from main branch

## Environment-Specific Notes

### Development
- Frontend: http://localhost:5173
- Backend: http://localhost:5000
- Uses local environment variables from `.env` files

### Production
- Frontend: https://enrollment.getmydpc.com (Vercel)
- Backend: https://your-app-name.railway.app (Railway)
- Uses platform environment variables

## Security Checklist

- [ ] All sensitive keys are in environment variables
- [ ] CORS is properly configured
- [ ] HTTPS is enabled on both platforms
- [ ] Database connection uses SSL
- [ ] JWT secrets are secure and unique
- [ ] API rate limiting is configured (if needed)

## Support

For platform-specific issues:
- Vercel: https://vercel.com/support
- Railway: https://railway.app/help
- Supabase: https://supabase.com/support
- Neon: https://neon.tech/docs