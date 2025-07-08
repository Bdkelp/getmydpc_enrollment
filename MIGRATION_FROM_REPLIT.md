# Migration Guide: Moving from Replit to Other Platforms

## Good News: Your App is Highly Portable!

Your DPC platform uses standard technologies (React, Express, PostgreSQL) that run anywhere. There's **no vendor lock-in** with Replit.

## What's Portable (99% of your app)

✅ **All Your Code**
- Frontend (React, TypeScript, Vite)
- Backend (Express, Node.js)
- Database schemas (Drizzle ORM)
- UI components (Tailwind, shadcn)
- Business logic

✅ **Your Data**
- PostgreSQL database can be exported/imported
- User data, plans, subscriptions - all portable
- Standard SQL format

✅ **Most Configuration**
- Package.json dependencies
- Build scripts
- API routes
- Component structure

## What Needs Adjustment (Minor changes)

### 1. Authentication (Biggest Change)
**Current**: Replit Auth
**Migration**: Replace with standard auth

```typescript
// Current (Replit Auth)
import { getUserInfo } from "@replit/repl-auth"

// After Migration Options:
// Option 1: Auth0 (easiest)
import { useAuth0 } from "@auth0/nextjs-auth0"

// Option 2: Clerk (modern)
import { useUser } from "@clerk/clerk-react"

// Option 3: Self-hosted (Passport.js already in project)
import passport from "passport"
```

### 2. Environment Variables
**Current**: Replit Secrets
**Migration**: Standard .env files

```bash
# Easy - just copy your secrets to .env
DATABASE_URL=your-database-url
SESSION_SECRET=your-secret
STRIPE_SECRET_KEY=your-stripe-key
```

### 3. File Paths
**Current**: Replit file system
**Migration**: Standard Node.js paths (already compatible)

## Step-by-Step Migration Process

### Phase 1: Preparation (While still on Replit)

1. **Export Your Database**
```bash
# Run in Replit Shell
pg_dump $DATABASE_URL > backup.sql
```

2. **Document Your Secrets**
- List all environment variables
- Save them securely

3. **Download Your Code**
- Click menu → "Download as ZIP"
- Or use Git (recommended)

### Phase 2: Set Up New Platform

#### Example: Migrating to Railway

1. **Create GitHub Repository**
```bash
git init
git add .
git commit -m "Initial commit"
git push -u origin main
```

2. **Deploy to Railway**
- Connect GitHub repo
- Add PostgreSQL database
- Import your database backup
- Set environment variables

3. **Update Authentication**
```typescript
// server/auth.ts - Replace Replit auth
// Option 1: Keep existing passport setup
passport.use(new LocalStrategy(...))

// Option 2: Add OAuth providers
passport.use(new GoogleStrategy(...))
```

### Phase 3: Update Configuration

1. **Update Auth Endpoints**
```typescript
// Before (Replit)
app.get('/api/login', (req, res) => {
  res.redirect('/__replit/auth/login')
})

// After (Standard OAuth)
app.get('/api/login', passport.authenticate('google'))
```

2. **Update Frontend Auth**
```typescript
// Before
import { useAuth } from "@/hooks/useAuth" // Replit specific

// After - minimal changes needed
import { useAuth } from "@/hooks/useAuth" // Update hook internals only
```

## Migration Time Estimates

| Platform | Migration Time | Complexity | Main Tasks |
|----------|---------------|------------|------------|
| Railway | 2-4 hours | Easy | Database import, env vars, auth update |
| Render | 2-4 hours | Easy | Similar to Railway |
| Vercel + Supabase | 4-6 hours | Moderate | Split frontend/backend, auth |
| AWS | 1-2 days | Complex | Infrastructure setup, auth |
| DigitalOcean | 4-6 hours | Moderate | App platform config, auth |

## What Makes Migration Easy

1. **Standard Tech Stack**
   - Node.js/Express (runs anywhere)
   - React (static files, CDN-ready)
   - PostgreSQL (universal database)

2. **Good Architecture**
   - Separated frontend/backend
   - Environment-based config
   - Standard build tools (Vite)

3. **Minimal Replit Dependencies**
   - Only auth is Replit-specific
   - No proprietary APIs
   - Standard file structure

## Migration Tools & Scripts

### Database Migration Script
```bash
#!/bin/bash
# migrate-db.sh

# Export from Replit
pg_dump $DATABASE_URL > db-backup.sql

# Import to new platform
psql $NEW_DATABASE_URL < db-backup.sql
```

### Auth Migration Helper
```javascript
// auth-migration.js
// Maps Replit users to new auth system

const migrateUsers = async () => {
  const users = await db.select().from(usersTable)
  
  for (const user of users) {
    // Create user in new auth system
    await createAuthUser({
      email: user.email,
      metadata: { replitId: user.id }
    })
  }
}
```

## Common Migration Scenarios

### "I want cheaper hosting"
→ **Railway or Render**: 2-4 hour migration, save $5-10/month

### "I need more control"
→ **DigitalOcean or AWS**: 1-2 day migration, full control

### "I want better performance"
→ **Vercel + Supabase**: 4-6 hour migration, faster edge delivery

### "I'm scaling up"
→ **AWS or Google Cloud**: 1-2 days, unlimited scale

## Post-Migration Checklist

- [ ] Database migrated and verified
- [ ] Environment variables set
- [ ] Authentication working
- [ ] All routes accessible
- [ ] Payment processing functional
- [ ] Email sending working
- [ ] File uploads (if any) working
- [ ] SSL certificate active
- [ ] Domain pointed to new host
- [ ] Monitoring set up

## Keeping Options Open

### Best Practices for Portability
1. Use environment variables for all configs
2. Avoid platform-specific APIs when possible
3. Keep authentication modular
4. Use standard SQL (no proprietary extensions)
5. Document all external dependencies

### Dual Deployment Strategy
You can even run on multiple platforms:
- Replit for development
- Railway for production
- AWS for enterprise clients

## Summary

**Migration Difficulty: 3/10** (Easy)
- Most work is authentication swap
- Everything else is copy-paste
- No code rewrite needed
- Data fully portable

You're not locked into Replit. The platform is designed for portability, and migration is a straightforward process that typically takes a few hours, not days or weeks.