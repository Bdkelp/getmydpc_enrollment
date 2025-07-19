# Square Pay Integration Guide for MyPremierPlans

## Overview

Square provides a comprehensive payment processing solution with full support for subscription billing through their Subscriptions API. This guide covers the integration requirements and implementation steps for replacing Stripe with Square Pay in the MyPremierPlans platform.

## Key Features

### Subscription Management
- **Billing Cycles**: Weekly, monthly, bi-weekly, quarterly, bi-annual, or annual
- **Prorated Billing**: Automatic proration for mid-cycle changes
- **Free Trials**: Support for trial periods with 100% discount phases
- **Pricing Models**: Static, relative, or usage-based pricing
- **Minimum Charge**: $1 per subscription

### Payment Processing
- **Transaction Fees**: 2.9% + $0.30 per transaction (same as Stripe)
- **Supported Cards**: Visa, Mastercard, Amex, Discover
- **Digital Wallets**: Apple Pay, Google Pay, Cash App Pay
- **PCI Compliance**: Handled by Square's hosted payment fields
- **No Monthly Fees**: For basic subscription functionality

### Technical Requirements
- **HTTPS Required**: Starting October 2025 for production
- **Cards on File Only**: ACH/bank payments not supported for subscriptions
- **Webhook Support**: Real-time subscription status updates
- **API Rate Limits**: Standard Square API limits apply

## Implementation Plan

### Phase 1: Development Setup

1. **Create Square Developer Account**
   - Sign up at https://developer.squareup.com
   - Get Sandbox Application ID and Access Token
   - Create test location ID

2. **Install Dependencies**
   ```bash
   npm install react-square-web-payments-sdk squareup
   ```

3. **Environment Variables**
   ```
   SQUARE_APPLICATION_ID=sandbox-sq0idb-XXXXXX
   SQUARE_ACCESS_TOKEN=EAAAXXXXXXXXXX
   SQUARE_LOCATION_ID=LXXXXXXXXXX
   SQUARE_ENVIRONMENT=sandbox
   ```

### Phase 2: Frontend Integration

1. **Update Payment Page Component**
   ```tsx
   import { PaymentForm, CreditCard } from 'react-square-web-payments-sdk';
   
   export default function PaymentPage() {
     return (
       <PaymentForm
         applicationId={process.env.VITE_SQUARE_APPLICATION_ID}
         locationId={process.env.VITE_SQUARE_LOCATION_ID}
         cardTokenizeResponseReceived={async (token) => {
           // Send token to backend
           await createSubscription(token.token);
         }}
       >
         <CreditCard />
       </PaymentForm>
     );
   }
   ```

2. **Add Digital Wallet Support** (Optional)
   ```tsx
   <PaymentForm>
     <CreditCard />
     <GooglePay />
     <ApplePay />
   </PaymentForm>
   ```

### Phase 3: Backend Integration

1. **Create Subscription Plans in Square**
   - Use Catalog API to create DPC plan variations
   - Map existing plans: Base, Plus, Elite
   - Set up monthly billing cycles

2. **API Endpoints to Create**
   - `/api/create-customer` - Create Square customer record
   - `/api/create-subscription` - Subscribe customer to plan
   - `/api/update-subscription` - Modify existing subscription
   - `/api/cancel-subscription` - Cancel subscription
   - `/api/square-webhook` - Handle subscription events

3. **Subscription Creation Flow**
   ```javascript
   // 1. Create customer
   const customer = await customersApi.createCustomer({
     givenName: user.firstName,
     familyName: user.lastName,
     emailAddress: user.email
   });
   
   // 2. Create card on file
   const card = await cardsApi.createCard({
     sourceId: paymentToken,
     customerId: customer.id
   });
   
   // 3. Create subscription
   const subscription = await subscriptionsApi.createSubscription({
     locationId: SQUARE_LOCATION_ID,
     planVariationId: selectedPlanId,
     customerId: customer.id,
     cardId: card.id,
     startDate: new Date().toISOString()
   });
   ```

### Phase 4: Webhook Integration

1. **Configure Webhook Endpoint**
   - Add endpoint URL in Square Dashboard
   - Subscribe to events:
     - `subscription.created`
     - `subscription.updated`
     - `subscription.deactivated`
     - `invoices.payment_made`

2. **Handle Webhook Events**
   ```javascript
   app.post('/api/square-webhook', async (req, res) => {
     const { type, data } = req.body;
     
     switch (type) {
       case 'subscription.created':
         await updateUserSubscriptionStatus(data.subscription);
         break;
       case 'invoices.payment_made':
         await recordPayment(data.invoice);
         break;
     }
   });
   ```

### Phase 5: Database Updates

1. **Add Square-specific fields to schema**
   ```typescript
   // Add to users table
   squareCustomerId: text().unique(),
   
   // Add to subscriptions table
   squareSubscriptionId: text().unique(),
   squarePlanVariationId: text(),
   
   // Add to payments table
   squarePaymentId: text().unique(),
   squareInvoiceId: text(),
   ```

2. **Migration Strategy**
   - Keep existing schema structure
   - Add Square fields alongside existing fields
   - Update storage.ts methods to handle Square data

## Testing Strategy

### Sandbox Testing
1. Use test card numbers:
   - Visa: `4111 1111 1111 1111`
   - Mastercard: `5105 1051 0510 5100`
   - CVV: Any 3 digits
   - Expiry: Any future date

2. Test subscription scenarios:
   - New subscription creation
   - Payment failures and retries
   - Subscription modifications
   - Cancellations

### Production Readiness
1. Switch environment variables to production
2. Update webhook URLs to production domain
3. Test with real cards in small batch
4. Monitor webhook delivery and payment success rates

## Migration Checklist

- [ ] Create Square developer account
- [ ] Install Square SDKs
- [ ] Update environment variables
- [ ] Replace payment form with Square components
- [ ] Create subscription plans in Square
- [ ] Implement backend API endpoints
- [ ] Set up webhook handling
- [ ] Update database schema
- [ ] Test in sandbox environment
- [ ] Deploy to production
- [ ] Monitor initial transactions

## Advantages Over Previous System

1. **Native Subscription Support**: Unlike early Square implementations, full subscription API now available
2. **Simplified Integration**: React SDK provides pre-built payment components
3. **Unified Platform**: Payments, subscriptions, and reporting in one system
4. **No Additional Fees**: Same transaction rates as Stripe
5. **Better Support**: Direct Square support vs third-party Stripe support

## Support Resources

- **Documentation**: https://developer.squareup.com/docs/subscriptions-api/overview
- **React SDK**: https://www.npmjs.com/package/react-square-web-payments-sdk
- **API Reference**: https://developer.squareup.com/reference/square/subscriptions-api
- **Support**: Available through Square Developer Dashboard

## Timeline Estimate

- **Week 1**: Development setup and frontend integration
- **Week 2**: Backend API implementation and testing
- **Week 3**: Production deployment and monitoring

Total estimated time: 3 weeks for complete migration