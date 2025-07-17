# Production Deployment Checklist

## Pre-Deployment Checklist

### ✅ Environment Variables
- [x] DATABASE_URL - PostgreSQL connection configured
- [x] STRIPE_SECRET_KEY - Stripe integration ready
- [x] VITE_STRIPE_PUBLIC_KEY - Stripe public key set
- [x] SESSION_SECRET - Secure session secret configured
- [x] SUPABASE_URL - Authentication URL configured
- [x] SUPABASE_ANON_KEY - Public key configured
- [x] SUPABASE_SERVICE_ROLE_KEY - Service key configured

### 🔧 Application Configuration
- [ ] Update BASE_URL in application for subdirectory deployment
- [ ] Configure CORS for your domain
- [ ] Set production email configuration
- [ ] Update redirect URLs in Supabase for your domain

### 🔒 Security
- [ ] Ensure all secrets are using production values
- [ ] Remove any test accounts or demo data
- [ ] Enable rate limiting
- [ ] Configure CSP headers

### 📱 Testing
- [ ] Test all user flows (registration, login, enrollment)
- [ ] Verify payment processing with Stripe
- [ ] Test on mobile devices
- [ ] Verify email sending (password reset, magic links)

## Deployment Options

### Option 1: Deploy to mypremierplans.com/enrollment (Recommended)
1. Deploy application on Replit
2. Configure reverse proxy on your main domain
3. Update all URLs to use relative paths

### Option 2: Deploy to enrollment.mypremierplans.com
1. Create subdomain DNS record
2. Deploy application
3. Configure SSL certificate

### Option 3: Use Replit's deployment directly
1. Click the Deploy button in Replit
2. Use the provided .replit.app URL
3. Configure custom domain if desired

## Post-Deployment Tasks
- [ ] Update Supabase redirect URLs with production domain
- [ ] Test all authentication flows
- [ ] Monitor error logs
- [ ] Set up backups
- [ ] Configure analytics (optional)