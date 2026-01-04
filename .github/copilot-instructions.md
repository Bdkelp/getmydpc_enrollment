# DPC Enrollment Platform - AI Coding Agent Instructions

## Architecture Overview

This is a **split-deployment DPC (Direct Primary Care) enrollment platform** with strict separation:
- **Frontend**: React + TypeScript + Vite (served via DigitalOcean App Platform static hosting)
- **Backend**: Express + TypeScript (DigitalOcean App Platform service)
- **Database**: Supabase PostgreSQL (auth + business data)
- **Payments**: EPX Hosted Checkout integration

### Critical Split-Deployment Pattern
All API calls use `client/src/lib/apiClient.ts` with `API_BASE_URL` pointing to the DigitalOcean backend. Never assume same-origin deployment.

## Data Architecture - Dual Database Pattern

### Supabase Database Architecture
- **Supabase**: Full database operations (both auth and business data)
- **Authentication**: Supabase Auth (login/JWT tokens)
- **Business Data**: Supabase PostgreSQL via direct queries
- **Key Files**: `server/lib/supabaseClient.ts`, `server/lib/neonDb.ts` (connects to Supabase), `server/storage.ts`

### Schema Pattern
- `shared/schema.ts`: Drizzle ORM schema definitions (types only)
- `server/storage.ts`: Direct SQL queries using database connection (NOT Drizzle ORM)
- **Migration**: Use `npm run db:push` for schema changes

### User Types Separation
- `users` table: Agents/admins with login access (Supabase Auth + local data)
- `members` table: DPC enrollees (no login, different data structure)
- `leads` table: Pre-enrollment contact forms

## Payment Integration - EPX Hosted Checkout

### Two EPX Implementations
1. **Active**: EPX Hosted Checkout (`server/services/epx-hosted-checkout-service.ts`)
2. **Inactive**: EPX Server Post (TypeScript warnings expected, `BILLING_SCHEDULER_ENABLED=false`)

### Payment Flow
```
Registration → EPX Hosted → Callback → Member Creation → Commission Calculation
```

### Key Files
- `server/routes/epx-hosted-routes.ts`: Payment endpoints
- `server/services/epx-hosted-checkout-service.ts`: EPX payment integration
- `server/commissionCalculator.ts`: Agent commission logic

## Authentication & Authorization

### Role-Based Access
- `super_admin`: Full platform access
- `admin`: User management, data viewing
- `agent`: Lead creation, commission viewing
- Members: No login (payment-only interaction)

### Auth Pattern
```typescript
// All authenticated routes use this pattern:
router.get("/api/endpoint", authenticateToken, async (req: AuthRequest, res) => {
  const user = req.user; // From Supabase JWT
  // Business logic using Supabase storage
});
```

## Frontend Routing & State

### Routing (Wouter)
- `client/src/App.tsx`: Main route definitions
- No nested routers, single-level routing only
- Protected routes check auth status via `useAuth` hook

### State Management
- **TanStack Query**: API state management
- **React Hook Form**: Form state
- **Zustand**: Minimal global state (avoid overuse)

### Key Patterns
```typescript
// API calls always use apiClient
import { apiClient } from "@/lib/apiClient";
const data = await apiClient.get("/api/endpoint");

// Forms use react-hook-form + zod validation
const form = useForm<FormData>({
  resolver: zodResolver(schema),
});
```

## Development Workflows

### Environment Setup
```bash
# Install dependencies for both frontend and backend
npm install
cd client && npm install

# Development (runs both frontend and backend)
npm run dev

# Database migration
npm run db:push
```

### Build Process
- Backend: `npm run build` → `dist/index.js`
- Frontend: `npm run build:client` → `client/dist/`
- Full build: `npm run build:all`

### Deployment
- **Backend**: DigitalOcean App Platform auto-deploys from `main` branch
- **Frontend**: DigitalOcean App Platform serves `client/` build artifacts alongside the API
- **Health Check**: `/api/health` endpoint for DigitalOcean

## Critical File Patterns

### Database Queries
Use `server/storage.ts` functions, NOT direct Drizzle queries:
```typescript
// ✅ Correct
const members = await storage.getAllMembers();

// ❌ Avoid (causes TypeScript issues)
const members = await db.select().from(members);
```

### Error Handling
```typescript
// API routes use consistent error format
res.status(500).json({ 
  message: "Error description", 
  error: error.message 
});
```

### Commission Calculations
Use `server/commissionCalculator.ts` with actual rates:
```typescript
const commission = calculateCommission(planName, memberType, isFamily);
```

## Integration Points

### External Services
- **Supabase**: Authentication & Database (`server/lib/supabaseClient.ts`, `server/lib/neonDb.ts`)
- **EPX**: Payment processing (`server/services/epx-hosted-checkout-service.ts`)
- **SendGrid**: Email notifications (`server/email.ts`)

### CORS Configuration
Production origins in `server/index.ts`:
- `enrollment.getmydpc.com`
- `getmydpc-enrollment-gjk6m.ondigitalocean.app`
- DigitalOcean domains

## Key Debugging Commands

```bash
# Check Supabase database connection
npm run check:supabase

# View DigitalOcean outbound IP (for EPX ACL)
curl https://getmydpc-enrollment-gjk6m.ondigitalocean.app/api/check-ip

# Test CORS configuration
curl https://getmydpc-enrollment-gjk6m.ondigitalocean.app/api/test-cors
```

## Common Gotchas

1. **Never use Drizzle ORM queries** - use `storage.ts` functions
2. **Always use `apiClient.ts`** for frontend API calls
3. **EPX Server Post files have TypeScript warnings** - this is expected
4. **Agent numbers format**: `MPP0001`, `MPP0002`, etc.
5. **Phone number storage**: Always store formatted (+1-234-567-8900)
6. **Commission rates**: Use actual rates from `commissionCalculator.ts`

## Production Deployment Notes

- Use `cleanup_for_production.ps1` before deployment
- Verify environment variables in DigitalOcean App Platform
- Test payment flows in EPX sandbox before production
- Monitor `/api/health` endpoint for backend status

## File Organization Priority

When making changes, focus on these high-impact areas:
- `server/routes.ts` - Main API endpoints
- `server/storage.ts` - Database operations
- `client/src/pages/` - User-facing components
- `shared/schema.ts` - Data models
- Environment configuration files