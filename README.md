# DPC Enrollment Platform

**Split-deployment DPC (Direct Primary Care) enrollment platform** with strict frontend/backend separation.

## Quick Links

- **Live Site:** https://enrollment.getmydpc.com
- **Backend API:** https://getmydpcenrollment-production.up.railway.app
- **Tech Stack:** React + TypeScript + Vite (Vercel) | Express + TypeScript (Railway) | Supabase PostgreSQL

## Architecture

### Deployment Pattern
- **Frontend**: Vercel (auto-deploy from `main` branch)
- **Backend**: Railway (auto-deploy from `main` branch)
- **Database**: Supabase PostgreSQL (auth + business data)
- **Payments**: EPX Hosted Checkout integration

### Key Pattern
All API calls use `client/src/lib/apiClient.ts` with `API_BASE_URL` pointing to Railway backend. Never assume same-origin deployment.

## Development Setup

```bash
# Install dependencies
npm install
cd client && npm install

# Development (runs both frontend and backend)
npm run dev

# Build
npm run build:all

# Database migration
npm run db:push
```

## Environment Variables

### Backend (Railway)
```env
# Database
DATABASE_URL=postgresql://...
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...

# EPX Payment Processing
EPX_TERMINAL_PROFILE_ID=...
EPX_MAC_KEY=...
EPX_ENVIRONMENT=sandbox

# Optional: Enable certification logging
ENABLE_CERTIFICATION_LOGGING=true
```

### Frontend (Vercel)
```env
VITE_SUPABASE_URL=https://...
VITE_SUPABASE_ANON_KEY=...
```

## User Roles & Access

| Role | Access |
|------|--------|
| `super_admin` | Full platform access (Michael) |
| `admin` | User management, data viewing |
| `agent` | Lead creation, commission viewing, own downline |
| Members | No login (payment-only interaction) |

## Key Features

### EPX Certification Logging
- **Export October Successful Transactions**: Quick one-click export of all successful October 2025 enrollments for EPX certification
- **Temporary Storage**: Files stored in temp directory for easy cleanup after certification
- **Cleanup**: One-click deletion of temp files after EPX approval

**Location**: Admin Dashboard → EPX Logs → Green "Quick Export" box

### Commission Tracking
- Automated commission calculation based on plan type
- Agent hierarchy support (upline/downline)
- Monthly payout tracking
- Commission rates in `commissionCalculator.ts`

### Lead Management
- Public lead form (no auth required)
- Agent assignment workflow
- Lead-to-enrollment conversion tracking

## Database Schema

### User Types
- `users` table: Agents/admins with login access (Supabase Auth + local data)
- `members` table: DPC enrollees (no login, different structure)
- `leads` table: Pre-enrollment contact forms

### Critical Files
- `shared/schema.ts`: Drizzle ORM schema definitions (types only)
- `server/storage.ts`: Direct SQL queries using database connection (NOT Drizzle ORM)
- **Never use Drizzle ORM queries** - always use `storage.ts` functions

## Deployment

### Railway (Backend)
1. Push to `main` branch
2. Railway auto-deploys (~2 min)
3. Health check: `GET /api/health`

### Vercel (Frontend)
1. Push to `main` branch
2. Vercel auto-deploys (~2 min)
3. Routes to Railway via `/api/*` proxy

## Common Commands

```bash
# Check Supabase connection
npm run check:supabase

# View Railway IP (for EPX ACL)
curl https://your-railway-app.up.railway.app/api/check-ip

# Run tests
npm test

# Production cleanup (before deploy)
.\cleanup_for_production.ps1
```

## File Organization

```
client/               # Frontend (React + Vite)
  src/
    pages/           # Route components
    components/      # Reusable UI components
    lib/            # API client, utilities
    
server/              # Backend (Express)
  routes/           # API endpoints
  services/         # Business logic (EPX, email, etc.)
  auth/            # Authentication logic
  lib/             # Database connections
  
shared/              # Shared types & schemas
  schema.ts         # Drizzle schema definitions
```

## Important Notes

### Payment Integration
- **Active**: EPX Hosted Checkout (`epx-hosted-checkout-service.ts`)
- **Inactive**: EPX Server Post (TypeScript warnings expected)
- Set `BILLING_SCHEDULER_ENABLED=false` to disable server post

### Data Patterns
- **Agent Numbers**: Format as `MPP0001`, `MPP0002`, etc.
- **Phone Numbers**: Always store formatted as `+1-234-567-8900`
- **Commission Rates**: Use actual rates from `commissionCalculator.ts`

### Error Handling
- API routes use consistent format: `{ message: "...", error: "..." }`
- Frontend uses TanStack Query for API state management
- Always use `apiClient.ts` for API calls (never fetch directly)

## Testing

### Test Accounts
See `TEST_ACCOUNTS.md` for login credentials

### EPX Test Cards
- **Success**: 4111 1111 1111 1111
- **Decline**: 4000 0000 0000 0002

## Production Checklist

- [ ] Environment variables set in Railway and Vercel
- [ ] EPX sandbox tested successfully
- [ ] Commission calculations verified
- [ ] Agent hierarchy working correctly
- [ ] Run `cleanup_for_production.ps1`
- [ ] Monitor `/api/health` endpoint
- [ ] Test CORS from production domains

## Troubleshooting

### Database Issues
- Use `storage.ts` functions, NOT direct Drizzle queries
- Check Supabase connection: `npm run check:supabase`

### Payment Issues
- Verify EPX environment variables set
- Check Railway outbound IP is whitelisted in EPX ACL
- Review EPX logs: Admin Dashboard → EPX Logs

### Authentication Issues
- Verify Supabase URLs and keys match in both Railway and Vercel
- Check JWT token format in browser dev tools
- Review role assignments in `users` table

## Support

**Primary Contact**: Michael (super_admin)
**Email**: michael@mypremierplans.com

## License

Proprietary - My Premier Plans LLC
