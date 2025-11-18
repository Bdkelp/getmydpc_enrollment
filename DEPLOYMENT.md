# Deployment Guide

## Railway (Backend)

### Initial Setup
1. Connect GitHub repository to Railway
2. Set root directory to project root
3. Configure build command: `npm run build`
4. Configure start command: `node dist/index.js`

### Environment Variables
```env
DATABASE_URL=postgresql://...
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
EPX_TERMINAL_PROFILE_ID=...
EPX_MAC_KEY=...
EPX_ENVIRONMENT=sandbox
ENABLE_CERTIFICATION_LOGGING=true  # Optional
```

### Deployment
- **Auto-deploy**: Push to `main` branch
- **Deploy time**: ~2 minutes
- **Health check**: `GET /api/health`

## Vercel (Frontend)

### Initial Setup
1. Import `client` directory as root
2. Framework preset: Vite
3. Build command: `npm run build`
4. Output directory: `dist`

### Environment Variables
```env
VITE_SUPABASE_URL=https://...
VITE_SUPABASE_ANON_KEY=...
```

### Deployment
- **Auto-deploy**: Push to `main` branch
- **Deploy time**: ~2 minutes
- **Custom domain**: enrollment.getmydpc.com

## Supabase

### Database Setup
1. Create new Supabase project
2. Run schema from `shared/schema.ts`
3. Execute: `npm run db:push`

### Auth Configuration
1. Enable Email auth provider
2. Configure email templates
3. Set site URL to Vercel domain

## CORS Configuration

Update `server/index.ts` with production origins:
```typescript
const allowedOrigins = [
  'https://enrollment.getmydpc.com',
  'https://getmydpcenrollment-production.up.railway.app'
];
```

## EPX Configuration

1. **Whitelist Railway IP**: Contact EPX support with Railway outbound IP
2. **Get credentials**: Terminal Profile ID and MAC Key
3. **Test in sandbox** before switching to production

## Post-Deployment Verification

### Backend Health
```bash
curl https://getmydpcenrollment-production.up.railway.app/api/health
```

### Frontend
Visit https://enrollment.getmydpc.com

### Database Connection
Check Railway logs for: `✅ Supabase connection successful`

### EPX Integration
Test enrollment with EPX sandbox test card: 4111 1111 1111 1111

## Rollback Procedure

### Railway
1. Go to Deployments tab
2. Click "..." on previous deployment
3. Select "Redeploy"

### Vercel
1. Go to Deployments
2. Click "..." on previous deployment
3. Select "Promote to Production"

## Monitoring

- **Railway Logs**: Real-time backend logs
- **Vercel Analytics**: Frontend performance
- **Supabase Dashboard**: Database queries and auth

## Emergency Contacts

- **Railway Support**: https://railway.app/help
- **Vercel Support**: https://vercel.com/support
- **EPX Support**: Contact your EPX account manager
