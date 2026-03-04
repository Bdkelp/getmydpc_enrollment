# Admin Enrollment Date Override Feature

## Overview
Administrators and super administrators can now backdate enrollments to correct effective dates. For example, enrolling someone on March 4 but setting the effective date to March 1.

## Backend Implementation

### API Endpoint: `/api/register`
**Method:** POST

**New Parameter:**
- `overrideEnrollmentDate` (optional, string, ISO date format): Backdated enrollment date

**Authorization:**
- Only users with `admin` or `super_admin` roles can use the override
- Regular agents and users will have the override ignored

**Validation:**
- Date must be valid ISO format (YYYY-MM-DD)
- Date cannot be in the future
- Invalid dates will return a 400 error

### Example Usage

```typescript
// Standard enrollment (uses today's date)
POST /api/register
{
  "email": "john@example.com",
  "firstName": "John",
  "lastName": "Doe",
  ...
}

// Admin-backdated enrollment (March 1, 2026)
POST /api/register
{
  "email": "john@example.com",
  "firstName": "John",
  "lastName": "Doe",
  ...
  "overrideEnrollmentDate": "2026-03-01",
  "enrolledByAgentId": "admin-user-id"  // Must be admin/super_admin
}
```

### Response
Success responses include the enrollment date in the `enrollmentDate` field, which will reflect the override if applied.

## Frontend Component

A reusable React component is available: `AdminEnrollmentDateOverride`

**Location:** `client/src/components/admin-enrollment-date-override.tsx`

**Props:**
- `onDateChange: (date: string | null) => void` - Callback when date changes
- `disabled?: boolean` - Disable the date picker

**Features:**
- Date picker with validation
- Cannot select future dates
- Visual feedback with amber styling for admin-only feature
- Clear error messages for invalid dates
- Preview of selected date in user-friendly format

### Integration Example

```tsx
import { AdminEnrollmentDateOverride } from "@/components/admin-enrollment-date-override";

function EnrollmentForm() {
  const [overrideDate, setOverrideDate] = useState<string | null>(null);
  const { user } = useAuth();
  const isAdmin = hasAtLeastRole(user?.role, 'admin');

  const handleSubmit = async () => {
    const payload = {
      ...formData,
      ...(overrideDate && { overrideEnrollmentDate: overrideDate })
    };
    
    await apiRequest('/api/register', { method: 'POST', body: payload });
  };

  return (
    <form>
      {/* Regular form fields */}
      
      {isAdmin && (
        <AdminEnrollmentDateOverride 
          onDateChange={setOverrideDate}
          disabled={isSubmitting}
        />
      )}
      
      <button onClick={handleSubmit}>Submit</button>
    </form>
  );
}
```

## Use Cases

1. **Backdated Enrollments**: Member enrolled verbally on March 1, but paperwork processed on March 4
2. **Effective Date Corrections**: Correct enrollments that were entered with wrong dates
3. **Batch Enrollments**: Process historical enrollments with accurate effective dates
4. **Group Enrollments**: Set consistent start dates for bulk enrollment groups

## Membership Start Date Calculation

The system automatically calculates `membershipStartDate` based on the enrollment date (or overridden date):

- **Enrolled 1st-14th**: Membership starts on the 15th of the same month
- **Enrolled 15th-31st**: Membership starts on the 1st of the next month

**Examples:**
- Override to March 1 → Membership starts March 15
- Override to March 18 → Membership starts April 1
- Override to December 14 → Membership starts December 15
- Override to December 15 → Membership starts January 1

## Security

- Override is **admin/super_admin only**
- Audit trail maintained in enrollment records
- Override attempts by non-admin users are logged and ignored
- No security bypass - standard validation still applies

## Database Fields

- `enrollment_date`: Set to override date if provided, otherwise current date
- `first_payment_date`: Same as enrollment_date
- `membership_start_date`: Calculated based on enrollment_date (1st or 15th)

## Testing

### Valid Override (Admin User)
```bash
curl -X POST /api/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "firstName": "Test",
    "lastName": "User",
    "enrolledByAgentId": "admin-uuid-here",
    "overrideEnrollmentDate": "2026-03-01"
  }'
```

### Invalid - Future Date
```bash
curl -X POST /api/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "firstName": "Test",
    "lastName": "User",
    "enrolledByAgentId": "admin-uuid-here",
    "overrideEnrollmentDate": "2026-12-25"  // Returns 400 error
  }'
```

### Invalid - Non-Admin User
```bash
# Override is silently ignored, enrollment uses current date
curl -X POST /api/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "firstName": "Test",
    "lastName": "User",
    "enrolledByAgentId": "agent-uuid-here",  // Regular agent, not admin
    "overrideEnrollmentDate": "2026-03-01"  // Ignored
  }'
```

## Logs

Look for these log entries:
-  `✅ ADMIN OVERRIDE: Enrollment date set to {date} (by {admin-email})`
- `⚠️ Ignoring overrideEnrollmentDate - user is not admin/super_admin`
- `❌ Invalid override date format: {provided-date}`
- `❌ Override date cannot be in the future: {provided-date}`
