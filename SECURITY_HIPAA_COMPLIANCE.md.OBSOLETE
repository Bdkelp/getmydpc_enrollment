# Security & HIPAA Compliance Guide - DPC Platform

## Current Security Status

### ✅ Already Implemented
- **HTTPS/TLS**: Automatic on Railway/Vercel deployments
- **Password Hashing**: Managed by Supabase Auth (industry-standard bcrypt)
- **Session Management**: Supabase Auth with JWT tokens
- **SQL Injection Protection**: Parameterized queries via Drizzle ORM
- **CSRF Protection**: Session-based authentication
- **Input Validation**: Zod schemas for all user inputs

### ⚠️ Needs Implementation for HIPAA
- **Encryption at Rest**: Database encryption
- **Audit Logging**: All PHI access must be logged
- **Access Controls**: Role-based permissions need refinement
- **Data Backup**: Automated encrypted backups
- **Business Associate Agreements (BAAs)**: Required with all vendors
- **Privacy Controls**: Data minimization and retention policies

## HIPAA Technical Safeguards Required

### 1. Access Control (§164.312(a)(1))
**Current Gap**: Basic role-based access
**Required Actions**:
```typescript
// Implement in server/middleware/audit.ts
export const auditMiddleware = (action: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    await db.insert(auditLogs).values({
      userId: req.user?.id,
      action,
      resource: req.path,
      ipAddress: req.ip,
      timestamp: new Date(),
      details: JSON.stringify(req.body)
    });
    next();
  };
};
```

### 2. Audit Controls (§164.312(b))
**Required**: Log all PHI access
```sql
-- Add to schema.ts
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }),
  action: varchar("action", { length: 100 }).notNull(),
  resource: varchar("resource", { length: 255 }),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  timestamp: timestamp("timestamp").defaultNow(),
  success: boolean("success").default(true),
  details: json("details")
});
```

### 3. Integrity Controls (§164.312(c)(1))
**Required**: Ensure PHI isn't improperly altered
- Implement checksums for critical data
- Version control for patient records
- Immutable audit trail

### 4. Transmission Security (§164.312(e)(1))
**Current**: HTTPS for all communications
**Additional Needs**:
- End-to-end encryption for messages
- Encrypted email communications
- VPN requirements for admin access

### 5. Encryption (§164.312(a)(2)(iv))
**Critical Gap**: Database encryption at rest
```bash
# PostgreSQL encryption options:
# 1. Transparent Data Encryption (TDE)
# 2. Column-level encryption for SSN, DOB
# 3. Application-level encryption
```

## HIPAA Administrative Safeguards

### 1. Security Officer Designation
- Appoint HIPAA Security Officer
- Appoint HIPAA Privacy Officer
- Document responsibilities

### 2. Workforce Training
- Annual HIPAA training for all staff
- Document training completion
- Access based on job function

### 3. Access Management
```typescript
// Implement granular permissions
export const permissions = {
  patient: {
    read: ['own_records', 'own_appointments'],
    write: ['own_profile', 'appointments'],
    delete: []
  },
  agent: {
    read: ['enrolled_patients', 'plans'],
    write: ['enrollments', 'patient_notes'],
    delete: []
  },
  admin: {
    read: ['all_patients', 'audit_logs', 'system_config'],
    write: ['all'],
    delete: ['with_approval']
  }
};
```

### 4. Business Associate Agreements (BAAs)
**Required with**:
- Neon (database provider - stores PHI)
- Supabase (authentication provider)
- Railway/Vercel (hosting platform)
- EPX/North.com (payment processor)
- Email service provider
- Any third-party services storing PHI

## HIPAA Physical Safeguards

### 1. Facility Access Controls
- Secure data center (handled by hosting provider)
- Restricted access to servers

### 2. Device and Media Controls
- Encrypted laptops/workstations
- Secure disposal procedures
- Device inventory

## Implementation Checklist

### Immediate Actions (Before Go-Live)

1. **Database Encryption**
```sql
-- Enable PostgreSQL encryption
ALTER DATABASE your_db SET encryption_key = 'your-key';
```

2. **Audit Logging Implementation**
```typescript
// Add to all PHI endpoints
app.get('/api/patients/:id', 
  authenticate, 
  authorize('patient.read'),
  auditMiddleware('VIEW_PATIENT'),
  async (req, res) => {
    // endpoint logic
  }
);
```

3. **Session Timeout**
```typescript
// server/index.ts
app.use(session({
  // ... existing config
  cookie: {
    maxAge: 15 * 60 * 1000, // 15 minutes
    secure: true, // HTTPS only
    httpOnly: true,
    sameSite: 'strict'
  }
}));
```

4. **Password Requirements**
```typescript
// Update registration schema
export const passwordSchema = z.string()
  .min(12, "Password must be at least 12 characters")
  .regex(/[A-Z]/, "Must contain uppercase letter")
  .regex(/[a-z]/, "Must contain lowercase letter")
  .regex(/[0-9]/, "Must contain number")
  .regex(/[^A-Za-z0-9]/, "Must contain special character");
```

5. **Data Retention Policy**
```typescript
// Automated data purging
const purgeOldData = async () => {
  const sevenYearsAgo = new Date();
  sevenYearsAgo.setFullYear(sevenYearsAgo.getFullYear() - 7);
  
  await db.delete(auditLogs)
    .where(lt(auditLogs.timestamp, sevenYearsAgo));
};
```

### 30-Day Implementation Plan

**Week 1: Technical Safeguards**
- [ ] Implement audit logging
- [ ] Add session timeouts
- [ ] Enhance password requirements
- [ ] Set up automated backups

**Week 2: Encryption**
- [ ] Enable database encryption
- [ ] Implement field-level encryption for SSN
- [ ] Set up encrypted backups
- [ ] Configure encrypted communications

**Week 3: Access Controls**
- [ ] Implement granular permissions
- [ ] Add two-factor authentication
- [ ] Set up role-based access control
- [ ] Create access review process

**Week 4: Compliance Documentation**
- [ ] Create privacy policies
- [ ] Document security procedures
- [ ] Establish BAAs with vendors
- [ ] Conduct risk assessment

## Vendor Requirements

### Current Vendors & BAA Status
- **Railway/Vercel**: Contact for BAA (hosting)
- **Neon**: HIPAA-eligible PostgreSQL with BAA available
- **Supabase**: HIPAA-compliant authentication with BAA available
- **EPX/North.com**: PCI-DSS compliant payment processing
- **AWS**: HIPAA eligible with BAA (if needed)
- **Google Cloud**: HIPAA compliant with BAA (if needed)
- **Azure**: HIPAA compliant with BAA (if needed)
- **DigitalOcean**: HIPAA compliant with BAA

### Third-Party Services
1. **Email**: Use HIPAA-compliant service
   - SendGrid (with BAA)
   - Amazon SES (with BAA)
   - Postmark (with BAA)

2. **File Storage**: Encrypted storage only
   - AWS S3 with encryption
   - Google Cloud Storage
   - Azure Blob Storage

3. **Payment Processing**
   - Stripe is PCI compliant
   - Limit PHI in payment systems
   - Never store full SSN with payment

## Security Best Practices

### 1. Principle of Least Privilege
```typescript
// Check permissions before every action
const canAccessPatient = (user: User, patientId: string) => {
  if (user.role === 'admin') return true;
  if (user.role === 'agent') {
    return checkAgentPatientRelation(user.id, patientId);
  }
  return user.id === patientId;
};
```

### 2. Data Minimization
- Only collect necessary PHI
- Separate PHI from payment data
- Use identifiers instead of names where possible

### 3. Regular Security Updates
```json
// package.json - Add security scanning
"scripts": {
  "security-check": "npm audit fix && npm update",
  "test:security": "npm audit"
}
```

### 4. Incident Response Plan
1. Detect breach
2. Contain incident
3. Assess scope
4. Notify affected parties (within 60 days)
5. Document everything
6. Prevent recurrence

## Testing Security

### Penetration Testing Checklist
- [ ] SQL injection attempts
- [ ] Cross-site scripting (XSS)
- [ ] Authentication bypass
- [ ] Session hijacking
- [ ] Privilege escalation
- [ ] Data exposure
- [ ] API security

### Compliance Testing
- [ ] Access controls working
- [ ] Audit logs capturing all events
- [ ] Encryption verified
- [ ] Backup restoration tested
- [ ] Incident response drilled

## Estimated Costs

### HIPAA Compliance Infrastructure
- **Encrypted Database**: +$50-100/month
- **Backup Solution**: +$20-50/month
- **Audit Log Storage**: +$10-30/month
- **Security Monitoring**: +$50-100/month
- **Total Additional**: ~$130-280/month

### One-Time Costs
- **Security Audit**: $5,000-15,000
- **HIPAA Training**: $500-1,000
- **Legal Review**: $2,000-5,000
- **Penetration Testing**: $5,000-10,000

## Summary

Your platform has a good security foundation, but needs several enhancements for HIPAA compliance:

1. **Critical**: Implement audit logging immediately
2. **Critical**: Add database encryption
3. **Critical**: Get BAAs from all vendors
4. **Important**: Enhance access controls
5. **Important**: Implement data retention policies
6. **Important**: Create incident response plan

Most modifications can be implemented within 30 days. The main ongoing cost will be for HIPAA-compliant hosting and encrypted backups.