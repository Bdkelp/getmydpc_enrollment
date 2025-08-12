# PayAnywhere (North.com) Integration Guide

## Overview
This guide covers the integration of North.com's PayAnywhere ecommerce solution with the DPC subscription platform.

## Current Status
- ✅ Payment service abstraction layer created
- ✅ Mock payment provider for testing
- ✅ PayAnywhere provider class structure ready
- ⏳ Awaiting API credentials from North.com
- ⏳ Awaiting API documentation and endpoints

## Architecture

### Payment Service Structure
```
server/services/payment-service.ts
├── PaymentProvider Interface
├── MockPaymentProvider (for testing)
├── PayAnywhereProvider (production)
└── PaymentService (factory pattern)
```

### Data Flow
1. **Frontend**: Collects payment information
2. **Tokenization**: PayAnywhere JavaScript SDK tokenizes card data
3. **Backend**: Receives token, processes payment via PayAnywhere API
4. **Webhook**: PayAnywhere sends transaction updates
5. **Database**: Transaction records stored locally

## Required Information from North.com

### API Credentials
1. **API Key**: Authentication token for API requests
2. **Merchant ID**: Your unique merchant identifier
3. **Webhook Secret**: For validating webhook signatures
4. **Environment URLs**: Sandbox and production endpoints

### Technical Documentation Needed
1. **API Documentation**: REST API endpoints and parameters
2. **JavaScript SDK**: For frontend card tokenization
3. **Webhook Events**: List of events and payload formats
4. **Error Codes**: Response codes and meanings
5. **Testing Cards**: Test card numbers for sandbox

## Implementation Checklist

### Phase 1: Setup (Current)
- [x] Create payment service abstraction
- [x] Set up environment variables
- [x] Create mock provider for testing
- [x] Prepare PayAnywhere provider structure

### Phase 2: Integration (Pending API Credentials)
- [ ] Add PayAnywhere JavaScript SDK to frontend
- [ ] Implement card tokenization
- [ ] Complete PayAnywhere API methods
- [ ] Set up webhook endpoint
- [ ] Implement webhook signature validation

### Phase 3: Testing
- [ ] Test payment processing in sandbox
- [ ] Test refund functionality
- [ ] Test webhook handling
- [ ] Error handling and edge cases
- [ ] Load testing

### Phase 4: Production
- [ ] Switch to production environment
- [ ] SSL certificate verification
- [ ] PCI compliance check
- [ ] Security audit
- [ ] Go-live checklist

## Environment Configuration

Add to your `.env` file:
```bash
# Payment Provider Configuration
PAYMENT_PROVIDER=payanywhere  # Change from 'mock' to 'payanywhere'

# PayAnywhere Configuration
PAYANYWHERE_API_KEY=your_api_key_here
PAYANYWHERE_MERCHANT_ID=your_merchant_id_here
PAYANYWHERE_ENVIRONMENT=sandbox  # or 'production'
PAYANYWHERE_WEBHOOK_SECRET=your_webhook_secret_here
```

## Frontend Integration

### 1. Add PayAnywhere SDK
```html
<!-- Add to index.html -->
<script src="https://cdn.payanywhere.com/v1/payanywhere.js"></script>
```

### 2. Initialize SDK
```javascript
// Initialize PayAnywhere
const payanywhere = new PayAnywhere({
  merchantId: 'YOUR_MERCHANT_ID',
  environment: 'sandbox' // or 'production'
});
```

### 3. Tokenize Card
```javascript
// Tokenize card data
const token = await payanywhere.tokenizeCard({
  cardNumber: '4242424242424242',
  expiryMonth: '12',
  expiryYear: '2025',
  cvv: '123'
});
```

## Backend Integration

### Process Payment
```javascript
import { paymentService } from './services/payment-service';

const result = await paymentService.processPayment({
  amount: 100.00,
  currency: 'USD',
  cardToken: token,
  customerId: 'customer_123',
  customerEmail: 'customer@example.com',
  description: 'Monthly DPC Subscription'
});
```

### Handle Webhook
```javascript
app.post('/webhooks/payanywhere', (req, res) => {
  const signature = req.headers['x-payanywhere-signature'];
  
  if (paymentService.validateWebhook(req.body, signature)) {
    // Process webhook event
    handlePaymentEvent(req.body);
    res.status(200).send('OK');
  } else {
    res.status(401).send('Invalid signature');
  }
});
```

## Security Considerations

### PCI Compliance
1. **Never store card numbers** - Use tokenization
2. **Use HTTPS** - All API calls must be over SSL
3. **Validate webhooks** - Verify signatures
4. **Limit API key scope** - Use minimal permissions
5. **Log security events** - Track all payment attempts

### Data Protection
1. **Encrypt sensitive data** - SSN, DOB in database
2. **Secure API keys** - Use environment variables
3. **Access control** - Role-based permissions
4. **Audit trail** - Log all transactions
5. **Regular updates** - Keep SDK updated

## Testing Guide

### Test Card Numbers (Typical - Verify with PayAnywhere)
```
Success: 4242 4242 4242 4242
Decline: 4000 0000 0000 0002
Insufficient Funds: 4000 0000 0000 9995
```

### Test Scenarios
1. Successful payment
2. Declined card
3. Insufficient funds
4. Invalid card number
5. Expired card
6. Network timeout
7. Webhook validation
8. Refund processing

## Error Handling

### Common Error Codes
```javascript
const errorMessages = {
  'CARD_DECLINED': 'Your card was declined. Please try another card.',
  'INSUFFICIENT_FUNDS': 'Insufficient funds. Please try another card.',
  'INVALID_CARD': 'Invalid card information. Please check and try again.',
  'NETWORK_ERROR': 'Network error. Please try again.',
  'API_ERROR': 'Payment service unavailable. Please try later.'
};
```

## Support Contacts

### North.com PayAnywhere Support
- Technical Support: (To be provided)
- API Documentation: (To be provided)
- Merchant Portal: (To be provided)

### Internal Contacts
- Development Team: dev@yourcompany.com
- Security Team: security@yourcompany.com

## Next Steps

1. **Obtain API Credentials** from North.com
2. **Review API Documentation** when received
3. **Set up Sandbox Account** for testing
4. **Schedule Integration Call** with PayAnywhere team
5. **Plan Security Audit** before production

## Questions for North.com

1. What are the sandbox and production API endpoints?
2. Is there a JavaScript SDK for card tokenization?
3. What webhook events are available?
4. Are there specific test card numbers for sandbox?
5. What is the rate limiting policy?
6. Is there a merchant dashboard for transaction monitoring?
7. What are the settlement times and processes?
8. Are there any specific compliance requirements?

---

**Last Updated**: January 2025
**Status**: Awaiting API Credentials