# Deployment Test Checklist for enrollment.getmydpc.com

## Quick Tests to Verify Everything Works:

### 1. Basic Access
- [ ] Visit https://enrollment.getmydpc.com
- [ ] Verify the page loads with SSL (padlock icon)
- [ ] Check that the landing page displays correctly

### 2. Authentication Tests
- [ ] Click "Login" and try the magic link feature
- [ ] Test "Forgot Password" functionality
- [ ] Verify email is sent to your inbox

### 3. Role-Based Access
- [ ] Login as admin (michael@mypremierplans.com)
- [ ] Verify admin dashboard at /admin works
- [ ] Login as agent (mdkeener@gmail.com) 
- [ ] Verify agent dashboard at /agent works

### 4. Enrollment Flow
- [ ] Start a new enrollment from the landing page
- [ ] Complete all form steps
- [ ] Verify data saves properly

### 5. Mobile Test
- [ ] Open on your phone
- [ ] Check responsive design
- [ ] Test form submission on mobile

## If Something Doesn't Work:

1. **Authentication issues**: Double-check Supabase URLs
2. **Page not loading**: Wait 5-10 minutes for DNS
3. **SSL errors**: Replit needs time to provision certificate
4. **Forms not submitting**: Check browser console for errors

## Success Indicators:
- Green padlock in browser (SSL working)
- Fast page loads
- All forms submit successfully
- Emails arrive promptly