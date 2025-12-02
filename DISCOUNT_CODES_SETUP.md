# Discount Codes System - Setup Instructions

## Database Migration

Run the following migration to create the discount codes tables:

```sql
psql -h your-database-host -U your-username -d your-database -f migrations/add_discount_codes_tables.sql
```

Or if using Supabase SQL Editor:
1. Open Supabase Dashboard
2. Go to SQL Editor
3. Copy contents of `migrations/add_discount_codes_tables.sql`
4. Execute the SQL

## What Gets Created

### Tables:
1. **discount_codes** - Stores all discount code definitions
   - Fields: code, description, discount_type, discount_value, duration_type, etc.
   - Indexes for fast lookups on code, is_active, and created_at

2. **member_discount_codes** - Tracks which members are using which codes
   - Links members to discount codes
   - Tracks remaining months for limited-duration discounts
   - Auto-increments usage counter via trigger

3. **members table updates** - Adds discount tracking columns
   - discount_code_id
   - discount_amount
   - original_price

### Triggers:
- Auto-increment `discount_codes.current_uses` when member applies code
- Auto-update `updated_at` timestamp on discount code changes

## Permissions

### Super Admin (super_admin role):
- ✅ Create new discount codes
- ✅ Edit existing codes
- ✅ Delete unused codes
- ✅ Toggle active/inactive status
- ✅ View all codes and usage stats

### Admin (admin role):
- ✅ View all discount codes
- ✅ View usage statistics
- ❌ Cannot create/edit/delete codes

### Agents (agent role):
- ❌ No access to discount code management
- Note: Agents can still enroll members who have discount codes

## Usage Flow

1. **Super Admin** creates discount code via `/admin/discount-codes`
   - Example: Code "PBBT2024", $20 off, indefinite duration
   
2. **Member** enters code during registration (Step 2 - Employment Info)
   - Clicks "Apply" to validate
   - System checks: active status, date range, max uses
   - Price automatically recalculates with discount
   
3. **Backend** stores discount with member record
   - Increments usage counter
   - Creates tracking record in `member_discount_codes`
   - Applies discount to monthly billing

## Sample Codes (for testing)

Uncomment the sample INSERT statements in the migration file to create:
- `WELCOME20` - $20 off first month (one-time)
- `PBBT2024` - $20 off indefinitely (association discount)
- `SUMMER10` - 10% off for 3 months (limited duration)

## Verification

After running migration, verify with:

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('discount_codes', 'member_discount_codes');

-- Check sample data (if you inserted it)
SELECT code, description, discount_type, discount_value, duration_type, is_active 
FROM discount_codes;
```

## Next Steps

1. Run the migration
2. Login as super_admin
3. Navigate to `/admin/discount-codes`
4. Create your first discount code
5. Test enrollment with the code
