# Test Accounts for MyPremierPlans

## Admin Accounts (4 total)

| Email | Password | Name | Role |
|-------|----------|------|------|
| michael@mypremierplans.com | Admin123! | Michael A. | Admin |
| travis@mypremierplans.com | Admin123! | Travis M. | Admin |
| richard@mypremierplans.com | Admin123! | Richard H. | Admin |
| joaquin@mypremierplans.com | Admin123! | Joaquin R. | Admin |

**Admin Access:**
- Full access to admin dashboard
- Commission management and tracking
- Agent oversight and management
- Payout processing

## Agent Accounts (4 total)

| Email | Password | Name | Role |
|-------|----------|------|------|
| mdkeener@gmail.com | Agent123! | Mark D. Keener | Agent |
| tmatheny77@gmail.com | Agent123! | Trent M. | Agent |
| svillarreal@cyariskmanagement.com | Agent123! | Steve V. | Agent |
| sarah.johnson@mypremierplans.com | Agent123! | Sarah J. | Agent |

**Agent Access:**
- Agent dashboard with personal metrics
- Enroll new members
- View personal commission totals (MTD/YTD/Lifetime/Pending)
- Export commission reports
- Track recent enrollments

## How to Create These Users

### Via Supabase Dashboard (Recommended)
1. Go to Supabase Console → Authentication → Users
2. Click "Add User" 
3. Enter email and password
4. Check "Auto confirm user"
5. Click "Create User"
6. Repeat for all 8 emails

### Via App Registration
1. Go to `https://enrollment.getmydpc.com`
2. Click Sign Up
3. Enter email, password, first name, last name
4. Role will be automatically assigned
5. Account needs approval from admin

## User Role Assignment

Roles are **automatically assigned** based on email address:

**Admin Emails:**
- `michael@mypremierplans.com`
- `travis@mypremierplans.com`
- `richard@mypremierplans.com`
- `joaquin@mypremierplans.com`

**Agent Emails:**
- `mdkeener@gmail.com`
- `tmatheny77@gmail.com`
- `svillarreal@cyariskmanagement.com`
- `sarah.johnson@mypremierplans.com`

**All Other Emails:** User (no dashboard access)

## Testing Workflow

1. **Create all 8 users** in Supabase with the credentials above
2. **Test Admin Login** as `michael@mypremierplans.com`
   - Should see admin dashboard
   - Should see commission management section
   - Should see all agents' data
3. **Test Agent Login** as `mdkeener@gmail.com`
   - Should see agent dashboard
   - Should see personal commission totals
   - Should be able to export reports
4. **Test Member Access** (optional with other email)
   - Should see "No Dashboard Access" message

## Important Notes

- Email matching is **case-sensitive** in role assignment
- Users created through registration start in "pending" approval status
- Users created through Supabase Dashboard auto login immediately
- Update `server/auth/supabaseAuth.ts` if adding new users with different emails