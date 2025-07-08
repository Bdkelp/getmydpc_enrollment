# Test Accounts for DPC Platform

## User Roles Overview

The platform has three distinct user roles with different access levels:

### 1. Admin Role
- **Access**: Full system access at `/admin`
- **Capabilities**: 
  - View all enrollments and users
  - Access revenue analytics
  - Manage plans and pricing
  - View system-wide statistics
  - Export data

### 2. Agent Role  
- **Access**: Agent dashboard at `/agent`
- **Capabilities**:
  - Enroll new members
  - View their own enrollments
  - Track commissions ($50 per enrollment)
  - Export enrollment data as CSV
  - Access lead management (future feature)

### 3. Regular User
- **Access**: No dashboard access
- **Capabilities**:
  - Must contact agent or customer service
  - Cannot self-manage enrollment
  - Sees contact information page

## Test Account Credentials

Based on the code review, here are the test accounts we created:

### Admin Account
- **Email**: admin@mypremierplans.com
- **Password**: admin123
- **Access URL**: /admin

### Agent Account  
- **Email**: agent@mypremierplans.com
- **Password**: agent123
- **Access URL**: /agent

### Regular User Account
- **Email**: mdkeener@gmail.com
- **Password**: user123
- **Access**: No dashboard (sees contact page)

## How to Test Each Role

### Testing Admin Access
1. Go to the landing page
2. Click "Sign In"
3. Login with admin@mypremierplans.com
4. You'll be redirected to `/admin` dashboard
5. Test features:
   - View user management
   - Check revenue statistics
   - View enrollment analytics
   - Access all system functions

### Testing Agent Access
1. Go to the landing page
2. Click "Sign In" 
3. Login with agent@mypremierplans.com
4. You'll be redirected to `/agent` dashboard
5. Test features:
   - View enrollment stats
   - Check commission totals
   - Try enrolling a new member
   - Export enrollment data

### Testing Regular User Access
1. Go to the landing page
2. Click "Sign In"
3. Login with mdkeener@gmail.com
4. You'll see "No Dashboard Access" page
5. Verify:
   - Customer service number displayed
   - No access to enrollment functions
   - Contact information visible

## Navigation Flow by Role

### Admin Flow
Landing → Sign In → Admin Dashboard → Full Access

### Agent Flow  
Landing → Sign In → Agent Dashboard → Enrollment Tools

### User Flow
Landing → Sign In → No Access Page → Contact Support

## Important Notes

1. **Mock Payment**: Currently using mock payment flow for testing
2. **Stripe Integration**: Ready but needs API keys
3. **Role Assignment**: Set during user creation in database
4. **Session Management**: Roles persist across sessions

## Quick Access Links

- Landing Page: http://localhost:5000
- Admin Dashboard: http://localhost:5000/admin
- Agent Dashboard: http://localhost:5000/agent
- Registration: http://localhost:5000/registration (agents/admins only)

## Troubleshooting

If login doesn't work:
1. Check if the app is running
2. Verify database connection
3. Try logging out first: http://localhost:5000/api/logout
4. Clear browser cookies
5. Check console for errors

The authentication system uses Replit Auth, so make sure you're testing in a browser that supports it.