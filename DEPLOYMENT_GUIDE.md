# DPC Platform Deployment Guide

## Prerequisites for External Hosting

Before deploying externally, you'll need:

1. **Database**: PostgreSQL database (options below)
2. **Environment Variables**: 
   - `DATABASE_URL` - PostgreSQL connection string
   - `STRIPE_SECRET_KEY` - For payment processing (when ready)
   - `SESSION_SECRET` - For secure sessions
   - `NODE_ENV` - Set to 'production'
   - `PORT` - Port for your application

## Download from Replit

1. Click the three dots menu in your Replit project
2. Select "Download as ZIP"
3. Extract the ZIP file on your local machine

## Hosting Options

### 1. **Vercel** (Recommended for this stack)
- **Pros**: Free tier, automatic deployments, great for React apps
- **Cons**: Need separate backend hosting
- **Best for**: If you split frontend/backend

### 2. **Railway** (Full-stack hosting)
- **Pros**: Easy PostgreSQL setup, full-stack apps, good free tier
- **Cons**: Limited free hours
- **Deploy**: Connect GitHub, auto-deploys

### 3. **Render** 
- **Pros**: Free PostgreSQL, web services, static sites
- **Cons**: Cold starts on free tier
- **Deploy**: Connect GitHub repo

### 4. **DigitalOcean App Platform**
- **Pros**: Professional, scalable, managed databases
- **Cons**: Paid only ($5/month minimum)
- **Deploy**: GitHub integration

### 5. **Heroku** 
- **Pros**: Well-established, many add-ons
- **Cons**: No more free tier
- **Deploy**: Git push or GitHub

## Deployment Steps (Railway Example)

1. **Create GitHub Repository**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin YOUR_GITHUB_REPO
   git push -u origin main
   ```

2. **Set up Railway**
   - Go to railway.app
   - Click "New Project" → "Deploy from GitHub"
   - Select your repository
   - Add PostgreSQL service
   - Set environment variables

3. **Configure Build Commands**
   The app already has proper scripts in package.json:
   - Build: `npm run build`
   - Start: `npm start`

4. **Database Migration**
   After deployment, run:
   ```bash
   npm run db:push
   ```

## Production Considerations

### Security
- [ ] Enable HTTPS (automatic on most platforms)
- [ ] Set strong SESSION_SECRET
- [ ] Configure CORS if needed
- [ ] Review authentication settings

### Performance
- [ ] Enable caching headers
- [ ] Consider CDN for static assets
- [ ] Database connection pooling (already configured)

### Monitoring
- [ ] Set up error tracking (Sentry, etc.)
- [ ] Configure uptime monitoring
- [ ] Set up logging service

## Environment-Specific Files

Create `.env.production` for production settings:
```
NODE_ENV=production
DATABASE_URL=your_production_db_url
SESSION_SECRET=generate_strong_secret_here
STRIPE_SECRET_KEY=your_stripe_key
```

## Quick Deploy Commands

### For Railway:
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and link project
railway login
railway link

# Deploy
railway up
```

### For Render:
1. Create `render.yaml` in root
2. Push to GitHub
3. Connect on Render dashboard

### For Vercel (frontend only):
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel
```

## Post-Deployment Checklist

1. [ ] Verify database connection
2. [ ] Test authentication flow
3. [ ] Verify payment integration (when configured)
4. [ ] Check all routes work
5. [ ] Test form submissions
6. [ ] Verify email sending (contact form)

## Support & Resources

- **PostgreSQL Hosting**: Neon, Supabase, or Railway
- **Email Service**: SendGrid, Postmark, or Resend
- **Domain & SSL**: Cloudflare, Namecheap
- **Monitoring**: UptimeRobot, Pingdom

## Common Issues

1. **Database Connection**: Ensure DATABASE_URL includes `?sslmode=require` for production
2. **Build Failures**: Check Node version matches (v20 recommended)
3. **Session Issues**: Ensure SESSION_SECRET is set
4. **CORS Errors**: Configure allowed origins in production