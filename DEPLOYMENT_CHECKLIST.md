# Digital Ocean Deployment Checklist

Use this checklist to ensure all steps are completed for a successful deployment.

## Pre-Deployment

### Code Preparation
- [ ] Update CORS origins in `server/routes.ts` to include Digital Ocean URL pattern
- [ ] Update CORS origins in `server/railway.ts` to include Digital Ocean URL pattern
- [ ] Verify port configuration is flexible (uses `process.env.PORT`)
- [ ] Test build commands locally:
  ```bash
  npm --prefix client ci && npm --prefix client run build && npm run build
  ```
- [ ] Verify `npm start` works with production build
- [ ] Remove any hardcoded development URLs
- [ ] Commit all changes to git

### Environment Variables Checklist
Copy this list and fill in values:

#### Database
- [ ] `DATABASE_URL` - Neon PostgreSQL connection string
- [ ] `VITE_SUPABASE_URL` - Supabase project URL
- [ ] `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key

#### Application
- [ ] `NODE_ENV=production`
- [ ] `PORT=5000` (or let Digital Ocean set it)
- [ ] `SESSION_SECRET` - Generated 32-byte hex string
- [ ] `VITE_PUBLIC_URL` - Your Digital Ocean app URL
- [ ] `ENCRYPTION_KEY` - Generated 32-byte hex string (if using)

#### Payment (EPX)
- [ ] `EPX_PUBLIC_KEY`
- [ ] `EPX_TERMINAL_PROFILE_ID`
- [ ] `EPX_ENVIRONMENT=production`
- [ ] `EPX_WEBHOOK_SECRET`
- [ ] `EPX_CUST_NBR`
- [ ] `EPX_MERCH_NBR`
- [ ] `EPX_DBA_NBR`
- [ ] `EPX_TERMINAL_NBR`
- [ ] `EPX_MAC` or `EPX_MAC_KEY`
- [ ] `PAYMENT_PROVIDER=epx`

#### Email (Optional)
- [ ] `EMAIL_SERVICE=gmail`
- [ ] `EMAIL_USER`
- [ ] `EMAIL_PASSWORD` (app-specific password)

## Digital Ocean Setup

### App Platform Configuration
- [ ] Create Digital Ocean account
- [ ] Connect GitHub repository: `Bdkelp/getmydpc_enrollment`
- [ ] Select branch: `main`
- [ ] Configure as Web Service
- [ ] Set build command: `npm --prefix client ci && npm --prefix client run build && npm run build`
- [ ] Set run command: `npm start`
- [ ] Set HTTP port: `5000`
- [ ] Add all environment variables
- [ ] Select instance size: Basic (1 GB RAM) minimum
- [ ] Deploy application

### First Deployment
- [ ] Wait for build to complete (check build logs)
- [ ] Note your app URL: `https://________.ondigitalocean.app`
- [ ] Update `VITE_PUBLIC_URL` environment variable with your app URL
- [ ] Trigger redeploy for URL update to take effect

## Post-Deployment Configuration

### External Services
- [ ] **Supabase**: Add Digital Ocean URL to redirect URLs
  - Go to: Authentication > URL Configuration
  - Add: `https://your-app.ondigitalocean.app/*`
  
- [ ] **EPX**: Update webhook callback URL
  - Contact EPX support
  - New URL: `https://your-app.ondigitalocean.app/api/epx/hosted/callback`

- [ ] **Frontend** (if separate Vercel deployment):
  - Update `VITE_API_URL` to Digital Ocean backend URL

### DNS Configuration (if using custom domain)
- [ ] Add custom domain in Digital Ocean: `enrollment.getmydpc.com`
- [ ] Update DNS records as instructed by Digital Ocean
- [ ] Wait for SSL certificate provisioning (automatic)
- [ ] Add custom domain to Supabase redirect URLs

## Testing

### Health Checks
- [ ] Test `/health` endpoint
- [ ] Test `/api/health` endpoint
- [ ] Test `/api/epx/health-check` endpoint

### Authentication
- [ ] Test agent login
- [ ] Test admin login
- [ ] Verify session persistence

### Lead Form
- [ ] Submit test lead form
- [ ] Verify lead saved to database
- [ ] Check email notification sent to info@mypremierplans.com

### Member Enrollment
- [ ] Test complete enrollment flow
- [ ] Verify member created in database
- [ ] Verify commission created for agent
- [ ] Check payment processing (EPX)

### Dashboard Access
- [ ] Agent dashboard loads
- [ ] Admin dashboard loads
- [ ] Super admin can access all features
- [ ] Commission data displays correctly

### Database Connectivity
- [ ] Verify Neon database connection
- [ ] Check members table access
- [ ] Check commissions table access
- [ ] Verify Supabase auth works

## Monitoring Setup

- [ ] Setup uptime monitoring (e.g., UptimeRobot)
  - Monitor: `https://your-app.ondigitalocean.app/health`
  - Alert email: _______________

- [ ] Configure Digital Ocean alerts
  - CPU usage > 80%
  - Memory usage > 80%
  - Response time > 5 seconds

- [ ] Setup error tracking (optional)
  - Consider: Sentry, LogRocket, or Bugsnag
  - Add error reporting to critical paths

## Migration from Railway (if applicable)

### Parallel Testing
- [ ] Keep Railway deployment running
- [ ] Test Digital Ocean deployment thoroughly
- [ ] Compare performance and reliability
- [ ] Document any differences

### DNS Cutover
- [ ] Update DNS for `enrollment.getmydpc.com`
  - Current: Point to Railway/Vercel
  - New: Point to Digital Ocean
- [ ] Monitor for issues (24-48 hours)
- [ ] Keep Railway as backup during transition

### Cleanup
- [ ] Verify Digital Ocean deployment stable (1 week)
- [ ] Shut down Railway deployment
- [ ] Cancel Railway subscription
- [ ] Archive Railway deployment documentation

## Performance Optimization (Post-Launch)

- [ ] Review application metrics after 1 week
- [ ] Check database query performance
- [ ] Identify slow endpoints
- [ ] Optimize as needed

## Documentation Updates

- [ ] Update README with new deployment URL
- [ ] Document environment variables in team wiki
- [ ] Create runbook for common issues
- [ ] Share deployment guide with team

## Security Audit

- [ ] Verify all secrets are in environment variables (not code)
- [ ] Check CORS settings are restrictive
- [ ] Verify SSL/TLS is enabled
- [ ] Review Supabase RLS policies
- [ ] Test authentication flows
- [ ] Verify rate limiting (if configured)

## Rollback Plan (Just in Case)

**If critical issues arise:**

1. [ ] Have Railway credentials ready
2. [ ] Keep Railway deployment running during transition
3. [ ] Document rollback steps:
   - Revert DNS changes
   - Point traffic back to Railway
   - Fix issues on Digital Ocean
   - Retry cutover when ready

## Success Criteria

Deployment is considered successful when:
- [ ] Application loads without errors
- [ ] All health checks passing
- [ ] Users can login successfully
- [ ] Lead form submissions work
- [ ] Member enrollments complete
- [ ] Commissions are created
- [ ] Payments process through EPX
- [ ] Email notifications sent
- [ ] No database connection errors
- [ ] Uptime > 99% for 48 hours

## Support Contacts

- **Digital Ocean Support**: support@digitalocean.com
- **Neon Database**: support@neon.tech
- **Supabase**: support@supabase.io
- **EPX Payment Processing**: _________________
- **Development Team**: _________________

---

## Quick Commands

### Generate session secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Generate encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Test build locally:
```bash
npm --prefix client ci && npm --prefix client run build && npm run build && npm start
```

### View Digital Ocean logs:
```bash
doctl apps logs <app-id> --follow
```

---

**Checklist Version**: 1.0  
**Last Updated**: October 15, 2025  
**Completed By**: _______________  
**Completion Date**: _______________
