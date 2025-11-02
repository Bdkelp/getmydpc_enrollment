# GetMyDPC Enrollment - Tech Stack & Environments

**Last Updated**: November 2, 2025  
**Status**: Production Ready  
**Version**: 1.0

---

## 🏗️ Technology Stack

### Frontend
- **Framework**: React 18.3+ with TypeScript
- **Build Tool**: Vite (ES modules, fast HMR)
- **CSS**: Tailwind CSS + PostCSS
- **UI Components**: ShadcnUI + Radix UI
- **HTTP Client**: Axios with environment-based baseURL
- **Auth**: Supabase Auth SDK
- **Deployment**: Vercel (Auto-deploys from main branch)

### Backend
- **Runtime**: Node.js (Express.js)
- **Language**: TypeScript
- **Database**: PostgreSQL via Supabase
- **Auth**: Supabase Auth (JWT tokens)
- **Bot Protection**: reCAPTCHA v3 + Rate Limiting
- **Deployment**: Railway (Auto-deploys from main branch)

### Database
- **Provider**: Supabase (PostgreSQL)
- **Security**: Row Level Security (RLS) policies
- **Tables**: 15+ (users, enrollments, members, agent_commissions, etc.)
- **Real-time**: Supabase subscriptions configured
- **Backups**: Daily automatic snapshots

### Infrastructure
- **Frontend Hosting**: Vercel
- **Backend Hosting**: Railway
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **Monitoring**: Railway & Vercel dashboards

---

## 🌍 Environments

### Development
**Purpose**: Local development and testing

**Frontend**:
- URL: `http://localhost:5173`
- Command: `npm run dev` (from client/)
- Environment File: `.env.development` (uses localhost API)

**Backend**:
- URL: `http://localhost:3001`
- Command: `npm run dev` (from server/)
- Database: Supabase dev database

**How to Set Up**:
```bash
# Frontend setup
cd client
npm install
npm run dev

# Backend setup (in separate terminal)
cd server
npm install
npm run dev

# Both will start on localhost with hot-reload enabled
```

### Staging
**Purpose**: Pre-production testing

**Frontend**:
- URL: `https://getmydpc-staging.vercel.app` (if configured)
- Database: Staging Supabase database
- Branch: `staging` (if using staging branch)

**Backend**:
- URL: `https://staging-getmydpc.railway.app` (if configured)
- Database: Staging Supabase database
- Branch: `staging`

**Note**: Currently using main branch for production only. Can set up staging if needed.

### Production
**Purpose**: Live user-facing application

**Frontend**:
- URL: `https://enrollment.getmydpc.com` (or your production domain)
- Hosting: Vercel
- Database: Production Supabase database
- Branch: `main` (auto-deploys)

**Backend**:
- URL: `https://getmydpc-enrollment.railway.app` (or your production domain)
- Hosting: Railway
- Database: Production Supabase database
- Branch: `main` (auto-deploys)

**Environment Variables**: All configured in Vercel & Railway dashboards

---

## 🔧 Database Schema Overview

### Core Tables
- `users` - User accounts (admin, agent, user roles)
- `enrollments` - Member enrollment records
- `members` - Member details (primary members)
- `agent_commissions` - Commission tracking
- `sessions` - Session management

### Supporting Tables
- `audit_logs` - Activity tracking
- `user_activity` - User action logging

### Key Relationships
```
users (1) ──→ (many) enrollments
users (1) ──→ (many) agent_commissions
enrollments (1) ──→ (many) members
enrollments (1) ──→ (many) agent_commissions
```

---

## 🔐 Security & Authentication

### Authentication Flow
1. User registers or logs in
2. Supabase Auth validates credentials
3. JWT token issued
4. Token stored in localStorage (frontend) or session
5. All API requests include Authorization header

### Authorization Levels
- **Admin**: Full access to all features + admin dashboard
- **Agent**: Can create enrollments, view own commissions
- **User**: Can register and view own enrollment

### Security Measures
- Row Level Security (RLS) on all sensitive tables
- reCAPTCHA v3 on registration (score 0.5+)
- Rate limiting: 5 registrations per IP per hour
- HIPAA compliance measures
- Audit logging on sensitive operations

---

## 📊 Key Features

### User Management
- User registration with email verification
- Admin can create other admins and agents
- Role-based access control
- User profile management

### Commission Tracking
- Automatic commission calculation based on plan type
- Commission status tracking (pending, paid, etc.)
- Admin commission payout management
- Agent commission dashboard with MTD/YTD/Lifetime totals
- Export commissions as CSV

### Enrollment Management
- Member enrollment creation and tracking
- Plan selection (Base, Plus, Elite, RxValet)
- Status management
- Member detail tracking

---

## 🚀 Deployment & CI/CD

### Frontend (Vercel)
- **Branch**: main
- **Build Command**: `npm run build`
- **Output Dir**: dist
- **Auto-Deploy**: Yes (on git push to main)
- **Preview Deploys**: Yes (on pull requests)

### Backend (Railway)
- **Branch**: main
- **Build Command**: `npm run build`
- **Start Command**: `npm start`
- **Auto-Deploy**: Yes (on git push to main)
- **Environment Variables**: Set in Railway dashboard

### Database (Supabase)
- **Type**: PostgreSQL
- **Backups**: Daily snapshots
- **Restore**: Available via Supabase dashboard
- **Monitoring**: Via Supabase dashboard

---

## 📝 Environment Variables

### Frontend (.env / .env.production)
```
VITE_API_URL=https://getmydpc-enrollment.railway.app
VITE_RECAPTCHA_SITE_KEY=your_recaptcha_key
```

### Backend (.env / .env.production)
```
DATABASE_URL=your_supabase_connection_string
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
RECAPTCHA_SECRET_KEY=your_recaptcha_secret
PORT=3001
NODE_ENV=production
```

---

## 🧪 Testing

### Manual Testing
- User registration workflow
- Admin user creation
- Commission calculations
- Payment status updates
- Export functionality

### Test Accounts
See `TEST_ACCOUNTS.md` for pre-configured test credentials.

### Test Data
Production currently has 5 demo enrollments for testing commission calculations and workflows.

---

## 📱 API Endpoints Summary

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout

### Users
- `GET /api/admin/users` - List all users (admin only)
- `POST /api/admin/create-user` - Create new user (admin only)

### Enrollments
- `GET /api/enrollments` - Get user's enrollments
- `POST /api/enrollments` - Create new enrollment
- `GET /api/admin/enrollments` - List all enrollments (admin)

### Commissions
- `GET /api/agent/commission-totals` - Agent's commission totals
- `GET /api/admin/commission-totals` - All commissions (admin)
- `POST /api/admin/update-commission-status` - Update payout status (admin)
- `GET /api/agent/export-commissions` - Export as CSV

### Utilities
- `GET /api/health` - Health check

---

## 🔄 Data Flow

### Registration Flow
```
User → Frontend Form → reCAPTCHA Check → API Validation 
→ Supabase Auth Create → RLS Insert to users table 
→ Commission Setup → Success Response
```

### Commission Creation Flow
```
Enrollment Created → Calculate Commission Amount 
→ Determine Agent → Insert to agent_commissions 
→ Track Status → Display in Dashboard
```

### Payout Flow
```
Admin Selects Commissions → API Validates 
→ Update Status to "Paid" → Audit Log Created 
→ Send Confirmation → Update Dashboard
```

---

## 📞 Important Files

### Operational (Run the app)
- `client/` - React frontend code
- `server/` - Express backend code
- `shared/` - TypeScript types and utilities
- `package.json` - Dependencies & scripts

### Deployment Guides
- `DEPLOYMENT_GUIDE.md` - How to deploy
- `DEPLOYMENT_CHECKLIST.md` - Pre-deployment checklist

### Operations
- `USER_SETUP_GUIDE.md` - Managing users
- `TEST_ACCOUNTS.md` - Test credentials

### Database
- `database-cleanup-production.sql` - Clean test data

### Feature Documentation
- `COMMISSION_STRUCTURE.md` - Commission calculations
- `COMMISSION_PAYOUT_MANAGEMENT.md` - Payout process
- `AGENT_PERMISSIONS.md` - Permission structure

### Security
- `SECURITY_HIPAA_COMPLIANCE.md` - HIPAA compliance
- `SECURITY_BOT_PROTECTION.md` - reCAPTCHA & rate limiting
- `RECAPTCHA_SETUP.md` - reCAPTCHA configuration

---

## 🐛 Troubleshooting

### Frontend Issues
- **Build fails**: Delete node_modules and package-lock.json, run npm install
- **API not responding**: Check backend is running and VITE_API_URL is correct
- **reCAPTCHA errors**: Verify reCAPTCHA keys are correct

### Backend Issues
- **Database connection fails**: Check DATABASE_URL and network access
- **Auth fails**: Verify Supabase keys are correct and not expired
- **Commission calculations wrong**: Check COMMISSION_STRUCTURE.md rates

### Deployment Issues
- **Vercel build fails**: Check build logs in Vercel dashboard
- **Railway deployment fails**: Check logs in Railway dashboard
- **Database connection in production**: Check environment variables are set correctly

---

## 📈 Performance & Monitoring

### Frontend Performance
- Built with Vite (fast builds)
- Code splitting with React Router
- Lazy loading of routes
- Minified production builds

### Backend Performance
- Express.js lightweight server
- Connection pooling via Supabase
- Rate limiting to prevent abuse
- Efficient SQL queries with indexes

### Monitoring
- **Frontend**: Vercel analytics and error tracking
- **Backend**: Railway logs and error tracking
- **Database**: Supabase query performance dashboard

---

## 🚀 Deployment Checklist Quick Reference

Before deploying to production:

1. ✅ Code committed to main branch
2. ✅ Environment variables configured in Vercel & Railway
3. ✅ Database migrations applied
4. ✅ reCAPTCHA keys configured
5. ✅ Test account credentials set up
6. ✅ Health check endpoint responds
7. ✅ API endpoints tested locally
8. ✅ Frontend builds without errors
9. ✅ Backend starts without errors
10. ✅ Ready for auto-deployment

---

## 📚 Additional Resources

- **Supabase Docs**: https://supabase.com/docs
- **React Docs**: https://react.dev
- **Express.js Docs**: https://expressjs.com
- **Tailwind CSS Docs**: https://tailwindcss.com/docs
- **TypeScript Docs**: https://www.typescriptlang.org/docs

---

## 👥 Team Information

**Repository**: https://github.com/Bdkelp/getmydpc_enrollment  
**Current Status**: Production Ready  
**Last Deployment**: [Date of last deployment]  
**Next Review**: [Schedule for next review]

---

**This is the authoritative technical reference for the GetMyDPC Enrollment application.**
