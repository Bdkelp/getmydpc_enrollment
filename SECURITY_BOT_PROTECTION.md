# Security & Bot Protection Assessment

## Current Status

### ✅ What's In Place
1. **Email Verification** - Supabase sends confirmation email (configured in Supabase settings)
2. **Password Requirements** - 8+ characters enforced on frontend
3. **Terms & Conditions** - Must be accepted to register
4. **Account Approval** - New registrations start in "pending" status
5. **Basic Validation** - Email format, password match verification

### ⚠️ What's Missing
1. **CAPTCHA** - No bot protection on registration form
2. **Rate Limiting** - No API rate limiting on registration endpoint
3. **Rate Limiting on Email** - No throttling on failed login attempts
4. **IP-based Tracking** - No IP blocking for suspicious activity
5. **Email Verification Enforcement** - Users created in DB even if email not verified

---

## Bot Protection Options

### Option 1: reCAPTCHA v3 (Recommended - Invisible to Users)
- **Pros**: Invisible, better user experience, proven bot detection
- **Cons**: Google data tracking, requires API key
- **Cost**: Free (requires Google Cloud account)
- **Implementation**: 5-10 minutes

**Setup Steps:**
1. Go to https://www.google.com/recaptcha/admin
2. Create new site for "MyPremierPlans"
3. Choose reCAPTCHA v3
4. Get Site Key and Secret Key
5. Add to registration form
6. Validate on backend

### Option 2: hCaptcha (Privacy-Focused Alternative)
- **Pros**: Privacy-friendly, GDPR compliant, no Google tracking
- **Cons**: Slight performance overhead, less proven
- **Cost**: Free tier available
- **Implementation**: 5-10 minutes (same as reCAPTCHA)

### Option 3: Custom Challenge-Response (DIY)
- **Pros**: Complete control, no external dependency
- **Cons**: Less effective against advanced bots, more code needed
- **Cost**: Development time only
- **Implementation**: 1-2 hours

### Option 4: Honeypot + Rate Limiting (Lightweight)
- **Pros**: Simple, effective against basic bots, no external deps
- **Cons**: Not effective against sophisticated bots
- **Cost**: Development time only
- **Implementation**: 30 minutes

---

## Recommended Implementation Plan

### Phase 1: Immediate (Low Effort)
Implement rate limiting on backend registration endpoint:

```typescript
// In server/routes/supabase-auth.ts

// Store failed attempts in memory (or Redis for production)
const registrationAttempts = new Map<string, { count: number; timestamp: number }>();

router.post('/api/auth/register', async (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  
  // Check rate limit: 5 registrations per hour per IP
  const attempt = registrationAttempts.get(clientIp);
  if (attempt && (now - attempt.timestamp) < 3600000 && attempt.count >= 5) {
    return res.status(429).json({ 
      message: 'Too many registration attempts. Please try again later.' 
    });
  }
  
  // Track attempt
  if (attempt) {
    attempt.count++;
  } else {
    registrationAttempts.set(clientIp, { count: 1, timestamp: now });
  }
  
  // Clean old entries periodically
  if (Math.random() < 0.01) {
    for (const [ip, data] of registrationAttempts.entries()) {
      if (now - data.timestamp > 3600000) {
        registrationAttempts.delete(ip);
      }
    }
  }
  
  // ... rest of registration logic
});
```

### Phase 2: Short Term (Medium Effort)
Add reCAPTCHA v3 to registration form:

**Frontend (register.tsx):**
```tsx
import { useEffect } from 'react';

// Load reCAPTCHA script
useEffect(() => {
  const script = document.createElement('script');
  script.src = 'https://www.google.com/recaptcha/api.js?render=YOUR_SITE_KEY';
  document.body.appendChild(script);
}, []);

// On form submit
const onSubmit = async (data) => {
  const token = await window.grecaptcha.execute('YOUR_SITE_KEY', { action: 'register' });
  
  const response = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      ...data,
      recaptchaToken: token  // Send token to backend
    })
  });
  // ... handle response
};
```

**Backend (supabase-auth.ts):**
```typescript
const axios = require('axios');

router.post('/api/auth/register', async (req, res) => {
  const { email, password, firstName, lastName, recaptchaToken } = req.body;
  
  // Verify reCAPTCHA
  if (recaptchaToken) {
    try {
      const response = await axios.post(
        `https://www.google.com/recaptcha/api/siteverify`,
        null,
        {
          params: {
            secret: process.env.RECAPTCHA_SECRET_KEY,
            response: recaptchaToken
          }
        }
      );
      
      if (!response.data.success || response.data.score < 0.5) {
        return res.status(400).json({ 
          message: 'reCAPTCHA verification failed. Please try again.' 
        });
      }
    } catch (error) {
      console.error('reCAPTCHA verification error:', error);
      // Optionally fail open or closed
    }
  }
  
  // ... rest of registration logic
});
```

### Phase 3: Long Term (Maintenance)
- Monitor registration patterns for suspicious activity
- Update IP blocklist based on attack patterns
- Implement email verification enforcement
- Add SMS verification option
- Consider WAF (Web Application Firewall) service

---

## Email Verification Status

**Current Implementation:**
- Supabase sends email on signup
- User marked as `emailVerified: false` until confirmed
- No enforcement - users can login before verifying email

**Recommendation:**
Add optional enforcement for strict compliance:

```typescript
// In supabaseAuth.ts middleware
if (dbUser.approvalStatus === 'approved' && !dbUser.emailVerified) {
  return res.status(403).json({ 
    message: 'Please verify your email before logging in',
    requiresEmailVerification: true,
    verificationSent: true
  });
}
```

---

## Current Security Posture

| Feature | Status | Risk | Priority |
|---------|--------|------|----------|
| Email Verification | ✅ Enabled | Low | N/A |
| Rate Limiting | ❌ Missing | **HIGH** | 🔴 URGENT |
| CAPTCHA/Bot Protection | ❌ Missing | **HIGH** | 🔴 URGENT |
| IP Blocking | ❌ Missing | Medium | 🟡 Soon |
| Email Verification Enforcement | ⚠️ Optional | Low | 🟢 Later |
| Password Requirements | ✅ 8+ chars | Low | N/A |
| Account Approval | ✅ Pending review | Low | N/A |

---

## Recommended Action Plan

### ✅ DO THIS NOW (10 minutes)
1. **Add rate limiting** to `/api/auth/register` endpoint
2. **Limit registrations** to 5 per IP per hour
3. **Return 429 status** when limit exceeded
4. **Test with multiple registrations** from same IP

### 🔄 DO THIS THIS WEEK (1-2 hours)
1. **Choose reCAPTCHA v3** or **hCaptcha**
2. **Get API keys** from service
3. **Add to register.tsx**
4. **Add verification to backend**
5. **Test thoroughly**

### 📋 DO THIS MONTH (Optional)
1. **Enforce email verification** for sensitive operations
2. **Add login attempt throttling** (3 failed attempts = 15 min lockout)
3. **Log suspicious activity** (multiple failed attempts, unusual IPs)
4. **Set up monitoring alerts**

---

## Important Notes

1. **Supabase Email Configuration**
   - Currently uses Supabase Auth's default email templates
   - Can be customized in Supabase Dashboard → Authentication → Email Templates
   - Confirmation link expires in 24 hours

2. **Current User Creation Flow**
   ```
   User registers → Supabase Auth creates user → Email sent
                 → Our DB creates pending user → User can login before confirming email
   ```

3. **Public Landing Page Risk**
   - Anyone can click "Create Account"
   - Currently unprotected against bot spam
   - **Priority: Add rate limiting + CAPTCHA**

4. **Production Considerations**
   - Use Redis instead of Map for rate limiting in production
   - Add monitoring/alerting for unusual registration patterns
   - Consider geographic restrictions if needed
   - Backup CAPTCHA service if using single provider

---

## Next Steps

Please let me know which approach you prefer:

A. **Minimal** - Just add rate limiting (5 min) ⚡
B. **Balanced** - Rate limiting + reCAPTCHA v3 (1-2 hours) ✅ RECOMMENDED
C. **Strict** - Rate limiting + reCAPTCHA + Email enforcement (2-3 hours)
D. **Custom** - Build custom challenge system (several hours)

I can implement any of these options. Which would you like to proceed with?
