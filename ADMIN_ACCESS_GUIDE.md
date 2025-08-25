
# Admin Dashboard Access Guide

## Admin Login Credentials
- **Email**: michael@mypremierplans.com
- **Password**: Use the current admin password (set up via Supabase Auth)

## How to Access Admin Dashboard

1. **Navigate to**: The application URL (currently running on port 5000)
2. **Click**: "Sign In" button in the navigation
3. **Enter**: Admin credentials above
4. **Result**: You'll be automatically redirected to `/admin` based on your role

## Admin Dashboard Features

### 1. Overview Statistics Dashboard
- **Total System Users**: Complete count of all registered users
- **Monthly Revenue**: Current month's revenue tracking
- **New Enrollments**: Recent member enrollments
- **Churn Rate**: Member cancellation percentage
- **Real-time Status**: All systems operational indicator
- **Last Login Tracking**: Admin session management

### 2. User Management System
- **View All Users**: Complete user database with search and filtering
- **Role Management**: Change user roles (user/agent/admin) with dropdown selection
- **Agent Number Assignment**: Assign agent numbers to users with agent role
- **User Approval System**: Approve or reject pending user registrations
- **Security Risk Assessment**: Review suspicious flags and security indicators
- **Email Verification Status**: Track verified vs unverified accounts

### 3. Pending User Approvals
- **Security Review**: Review new registrations with risk level indicators
- **Bulk Actions**: Approve or reject multiple users
- **Suspicious Flag Detection**: Automatic flagging of potentially fraudulent accounts
- **Registration Timeline**: View when users registered and their status

### 4. Lead Management
- **Lead Tracking**: View and manage all system leads
- **Lead Status Updates**: Track lead progression through sales funnel
- **Agent Assignment**: Assign leads to specific agents
- **Conversion Analytics**: Monitor lead-to-enrollment conversion rates

### 5. Enrollment Analytics
- **Member Enrollment Tracking**: View all enrolled members
- **Plan Distribution**: See which plans are most popular
- **Enrollment Timeline**: Track enrollment patterns over time
- **Agent Performance**: Monitor which agents are performing best

### 6. Advanced Analytics & Reporting
- **Revenue Analytics**: Monthly recurring revenue (MRR) tracking
- **Growth Metrics**: User growth and churn analysis
- **Plan Performance**: Which plans generate most revenue
- **Time-based Reports**: Customizable date range analytics
- **Export Capabilities**: Download reports in various formats

### 7. Database Viewer
- **Direct Database Access**: View raw database tables
- **Data Export**: Export specific datasets
- **System Health**: Monitor database performance
- **Query Interface**: Execute custom database queries

### 8. System Administration
- **User Role Changes**: Promote users to agent/admin roles
- **System Configuration**: Manage platform settings
- **Security Management**: Monitor authentication and access
- **Audit Logging**: Track administrative actions

## Navigation Structure

### Main Admin Dashboard (`/admin`)
- Overview statistics cards
- Pending user approvals section
- Quick action buttons
- Recent activity summary

### Sub-Dashboard Pages
- **`/admin/leads`**: Lead management interface
- **`/admin/enrollments`**: Member enrollment tracking
- **`/admin/users`**: Complete user management system
- **`/admin/analytics`**: Advanced reporting and analytics
- **`/admin/data`**: Database viewer and export tools

## Key Differences from Agent Dashboard

| Feature | Agent Dashboard | Admin Dashboard |
|---------|----------------|-----------------|
| **User Scope** | Own enrollments only | All system users and data |
| **Lead Access** | Assigned leads only | All leads system-wide |
| **Revenue Data** | Personal commissions | Complete revenue analytics |
| **User Management** | Cannot modify users | Full user role management |
| **System Access** | Limited to agent functions | Complete system administration |
| **Analytics Depth** | Personal performance | Platform-wide insights |
| **Security Controls** | Basic access | User approval and security review |

## Admin-Only Capabilities

### 1. User Role Management
- Change any user's role (user ↔ agent ↔ admin)
- Assign agent numbers to sales representatives
- Approve or reject new user registrations
- Review security flags and suspicious activity

### 2. System-Wide Analytics
- View complete revenue data across all agents
- Monitor platform growth and churn metrics
- Access detailed enrollment analytics
- Export comprehensive system reports

### 3. Security and Compliance
- Review and approve new user registrations
- Monitor suspicious account activity
- Track email verification status
- Audit user access and permissions

### 4. Database Administration
- Direct access to database tables
- Export capabilities for all data
- System health monitoring
- Custom query execution

## Authentication System

### Current Authentication Flow
- **Supabase Auth**: Primary authentication provider
- **JWT Tokens**: Secure session management
- **Role-Based Access**: Automatic role detection and routing
- **Session Persistence**: Maintains login state across browser sessions

### Security Features
- **Email Verification**: Required for account activation
- **Password Security**: Encrypted password storage
- **Role Validation**: Server-side role verification
- **Session Management**: Automatic token refresh and validation

## Testing Admin Features

Once logged in as admin, verify access to:

1. **Dashboard Overview**: Check statistics load properly
2. **User Management**: Test role changes and user search
3. **Pending Approvals**: Review any users awaiting approval
4. **Analytics Access**: Verify revenue and growth data
5. **Database Viewer**: Confirm direct database access
6. **Export Functions**: Test data export capabilities

## Troubleshooting

### Common Issues
- **Authentication Loops**: Clear browser cache and cookies
- **Role Not Recognized**: Verify user role in database
- **API Errors**: Check server console for authentication issues
- **Dashboard Not Loading**: Ensure proper admin role assignment

### Console Monitoring
Monitor browser console for:
- Authentication state changes
- Session token validation
- API request success/failure
- Role verification status

The admin dashboard provides complete platform oversight with robust security, comprehensive analytics, and full user management capabilities.
