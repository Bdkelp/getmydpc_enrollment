# IMPORTANT: Update These URLs in Supabase

## Go to your Supabase Dashboard:
1. Open https://supabase.com/dashboard
2. Select your project
3. Go to: Authentication → URL Configuration

## Update these settings:

### Site URL:
```
https://enrollment.getmydpc.com
```

### Redirect URLs (add ALL of these):
```
https://enrollment.getmydpc.com/auth/callback
https://enrollment.getmydpc.com/reset-password
https://enrollment.getmydpc.com/*
```

### Email Templates:
Also update the redirect URLs in:
- Authentication → Email Templates → Reset Password
- Change the URL to: https://enrollment.getmydpc.com/reset-password

## Why This Matters:
Without updating these URLs, users won't be able to:
- Reset passwords
- Use magic links
- Complete OAuth logins

Save these changes in Supabase before testing!