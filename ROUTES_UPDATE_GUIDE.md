# Routes Update Instructions

## Overview
The registration and agent enrollment endpoints need to be updated to create **members** (not users with Supabase Auth).

## Key Changes

### 1. Members vs Users
- **OLD**: Registration creates Supabase Auth account + users table entry
- **NEW**: Registration creates ONLY members table entry (NO Supabase Auth)
- **WHY**: Members are customers who don't need login access

### 2. What to Replace

#### File: `server/routes.ts`

**Replace `/api/registration` endpoint** (starts around line 2266)
- Remove ALL Supabase Auth `signUp()` calls
- Remove password handling
- Change from `storage.createUser()` to `storage.createMember()`
- Customer number will auto-generate via database function

**Replace `/api/agent/enrollment` endpoint** (starts around line 2683)
- Remove any Supabase Auth logic if present
- Change from `storage.createUser()` to `storage.createMember()`
- Ensure `enrolledByAgentId` and `agentNumber` are captured
- Create commission record for the agent

### 3. Key Code Changes

**OLD CODE** (Don't use):
```typescript
// Creating a user with Supabase Auth
const { data, error } = await supabase.auth.signUp({
  email: email,
  password: password,
});

const user = await storage.createUser({
  id: data.user.id,
  email: email,
  role: "member",
  // ...
});
```

**NEW CODE** (Use this):
```typescript
// Creating a member WITHOUT Supabase Auth
const newMember = await storage.createMember({
  email: email.trim().toLowerCase(),
  firstName,
  lastName,
  phone, // Will be formatted to 10 digits
  dateOfBirth, // Will be formatted to MMDDYYYY
  state, // Will be formatted to 2 char uppercase
  // customer_number auto-generates
  enrolledByAgentId: req.user?.id, // For agent enrollments
  agentNumber: req.user?.agentNumber,
  status: 'pending',
  isActive: true,
});
```

### 4. Field Formatting (Automatic)

The `storage.createMember()` function automatically formats:
- **phone**: `(512) 555-1234` → `5125551234`
- **dateOfBirth**: `1990-01-15` → `01151990`
- **state**: `tx` → `TX`
- **zipCode**: `78701-1234` → `78701`
- **gender**: `m` → `M`
- **ssn**: `123-45-6789` → `123456789` (encrypted)

### 5. Response Changes

**OLD Response**:
```json
{
  "success": true,
  "user": {
    "id": "uuid-from-supabase",
    "email": "user@example.com"
  }
}
```

**NEW Response**:
```json
{
  "success": true,
  "member": {
    "id": 1,
    "customerNumber": "MPP20250001",
    "email": "member@example.com",
    "status": "active"
  },
  "note": "Members cannot log into this system. Please contact your agent."
}
```

## Implementation Steps

1. **Backup current routes.ts** (just in case)
2. **Find the `/api/registration` endpoint** (~line 2266)
3. **Replace the entire endpoint** with the new version from `UPDATED_ROUTES_REFERENCE.ts`
4. **Find the `/api/agent/enrollment` endpoint** (~line 2683)
5. **Replace the entire endpoint** with the new version
6. **Test with Postman or curl**

## Testing Checklist

- [ ] POST `/api/registration` creates a member
- [ ] Customer number auto-generates (MPP20250001)
- [ ] Phone formats to 10 digits
- [ ] Dates format to MMDDYYYY
- [ ] NO Supabase Auth account created
- [ ] Member email returns 403 if trying to log in
- [ ] Agent can still log in
- [ ] POST `/api/agent/enrollment` tracks agent ID
- [ ] Commission record created for agent enrollments

## Next Steps After Routes Update

1. Update authentication middleware to block member emails
2. Test member enrollment end-to-end
3. Verify data formatting in database
4. Test agent dashboard shows enrolled members

## Notes

- **Members have NO passwords** - they cannot log in
- **Only agents/admins can authenticate**
- Customer numbers are sequential per year: MPP20250001, MPP20250002, etc.
- All date fields stored as MMDDYYYY (8 chars)
- All phone fields stored as 10 digits (no formatting)
