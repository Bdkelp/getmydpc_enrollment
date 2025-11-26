# Payment-First Registration Flow - Implementation Notes

## Current Flow (PROBLEM)
1. User fills out registration form
2. **Member record created immediately** in `/api/auth/register` endpoint
3. User redirected to payment page
4. EPX Hosted Checkout payment attempted
5. EPX callback updates payment status (member already exists)
6. Commission created after payment succeeds

**Issue**: If payment fails, member record exists with no payment. Email is in database preventing retry.

## New Flow (SOLUTION)
1. User fills out registration form
2. **Registration data stored in sessionStorage** (NOT database)
3. Optionally: Store backup in `temp_registrations` table
4. User redirected to payment page
5. EPX Hosted Checkout payment attempted
6. EPX callback receives BRIC token
7. **Callback calls `/api/finalize-registration`** with registration data + BRIC token
8. Finalize endpoint creates: Member → Subscription → EPX Recurring → Commission
9. sessionStorage cleared on success

## Implementation Status

### ✅ Completed - Backend
- [x] Database schema updates (payment_token, payment_method_type, epx_subscription_id)
- [x] temp_registrations table created
- [x] admin_notifications table created
- [x] `/api/finalize-registration` endpoint created
- [x] storage.createMember updated to accept new fields
- [x] EPX processCallback updated to capture BRIC token
- [x] EPX callback route updated to call finalize-registration
- [x] Payment attempt tracking service created
- [x] Temp registration cleanup scheduler created
- [x] Legacy flow removed (all existing data is test data)

### 🔲 Not Started
- [ ] Modify frontend registration to use sessionStorage ONLY
- [ ] Update frontend payment page to pass sessionStorage data
- [ ] Remove direct member creation from `/api/auth/register`
- [ ] Update EPXHostedPayment component to include registration data
- [ ] Add payment retry UI with 3-attempt limit
- [ ] Create admin dashboard for failed EPX subscription notifications
- [ ] End-to-end testing

## Critical Files to Modify

### Backend
1. `server/routes.ts` - Remove member creation from `/api/auth/register`
2. `server/routes/epx-hosted-routes.ts` - Update callback to call finalize-registration
3. `server/routes/finalize-registration.ts` - Already created ✅

### Frontend
4. `client/src/pages/register.tsx` or similar - Use sessionStorage, not API call
5. `client/src/components/EPXHostedPayment.tsx` - Include registration data in form
6. `client/src/pages/payment.tsx` - Pass registration data to EPX component
7. `client/src/pages/payment-callback.tsx` - Handle new flow

## Data Flow

### Registration Phase
```
Form Submit → sessionStorage.setItem('registrationData', JSON.stringify(formData))
           → sessionStorage.setItem('tempRegId', uuid) // optional backup
           → POST /api/temp-registrations (optional)
           → Redirect to /payment
```

### Payment Phase
```
Payment Page Load → sessionStorage.getItem('registrationData')
                  → Render EPX payment form with hidden fields

EPX Form Submit → POST to EPX with registration data in custom fields
               → EPX processes payment
               → EPX redirects to callback URL
```

### Callback Phase
```
EPX Callback → Extract BRIC token (result.GUID)
            → Extract registration data from custom fields
            → POST /api/finalize-registration with:
              - registrationData
              - paymentToken (BRIC)
              - transactionId
              - paymentMethodType

Finalize → Create Member
        → Create Subscription
        → Create EPX Recurring Subscription
        → Create Commission
        → Clear sessionStorage
        → Redirect to success page
```

## Retry Logic

### Payment Attempts
- Track in sessionStorage: `paymentAttempts: 0-3`
- On failure: increment counter
- If < 3: Show "Try Again" button
- If >= 3: Clear sessionStorage, show "Start Over"

### EPX Subscription Failures
- Member/subscription already created
- EPX recurring call fails
- Insert into admin_notifications table
- Flag for manual review
- Admin can retry EPX subscription creation

## Testing Checklist
- [ ] Successful payment → member created
- [ ] Failed payment → no member created
- [ ] Retry with same card → works
- [ ] Retry with different card → works
- [ ] 3 failed payments → data purged
- [ ] Browser crash during payment → temp table recovery (optional)
- [ ] EPX recurring subscription fails → admin notified
- [ ] Commission calculated correctly
- [ ] Membership date logic (1st/15th) correct

## Deployment Plan
1. Deploy database migration (add columns + tables)
2. Deploy backend changes (new endpoint + callback update)
3. Deploy frontend changes (sessionStorage logic)
4. Test in sandbox environment
5. Monitor first few production registrations
6. Verify EPX recurring subscriptions created
7. Check admin notifications for failures
