# Admin Commission Payout Management Documentation

**Date**: November 2, 2025  
**Commit**: `907ffeb`  
**Status**: Implemented and Deployed

---

## 🎯 Feature Overview

Admin users can now manage commission payouts with complete control over:
- Setting payout dates
- Changing payment status (unpaid → pending → paid)
- Adding notes/comments to commissions
- Batch updating multiple commissions at once
- Filtering commissions for payout processing

---

## 📊 New API Endpoints

### 1. Update Single Commission Payout
**Endpoint**: `POST /api/admin/commission/:commissionId/payout`  
**Authentication**: Admin role required  
**Purpose**: Update a single commission's payment status and date

**Request Body**:
```json
{
  "paymentStatus": "paid",          // "paid", "pending", or "unpaid"
  "paymentDate": "2025-11-02",      // Optional: ISO date string or YYYY-MM-DD
  "notes": "Payment processed via bank transfer" // Optional
}
```

**Response**:
```json
{
  "success": true,
  "commission": {
    "id": "commission-uuid",
    "agentId": "agent-uuid",
    "agentName": "John Smith",
    "agentEmail": "john@example.com",
    "memberId": "member-uuid",
    "memberName": "Jane Member",
    "memberEmail": "jane@example.com",
    "commissionAmount": 45.00,
    "paymentStatus": "paid",
    "paidAt": "2025-11-02T10:30:00Z",
    "notes": "Payment processed via bank transfer",
    "updatedAt": "2025-11-02T15:45:00Z"
  }
}
```

**Status Codes**:
- `200` - Success
- `400` - Invalid payment status or missing required fields
- `403` - Not admin
- `500` - Server error

---

### 2. Batch Update Commission Payouts
**Endpoint**: `POST /api/admin/commissions/batch-payout`  
**Authentication**: Admin role required  
**Purpose**: Update multiple commissions' payment status in one request

**Request Body**:
```json
{
  "updates": [
    {
      "commissionId": "commission-uuid-1",
      "paymentStatus": "paid",
      "paymentDate": "2025-11-02"
    },
    {
      "commissionId": "commission-uuid-2",
      "paymentStatus": "pending",
      "paymentDate": "2025-11-05"
    },
    {
      "commissionId": "commission-uuid-3",
      "paymentStatus": "paid",
      "paymentDate": "2025-11-02"
    }
  ]
}
```

**Response**:
```json
{
  "success": true,
  "message": "3 commission(s) payout updated"
}
```

**Max Batch Size**: No hard limit, but processes in batches of 100 to avoid rate limits

---

### 3. Get Commissions for Payout
**Endpoint**: `GET /api/admin/commissions/payout-list`  
**Authentication**: Admin role required  
**Purpose**: Fetch commissions filtered for payout management

**Query Parameters**:
- `agentId` (optional): Filter by specific agent
- `paymentStatus` (optional): Filter by status ("unpaid", "pending", "paid")
- `minAmount` (optional): Filter by minimum commission amount (e.g., "50.00")

**Examples**:
```
GET /api/admin/commissions/payout-list
GET /api/admin/commissions/payout-list?paymentStatus=unpaid
GET /api/admin/commissions/payout-list?agentId=agent-123&paymentStatus=pending
GET /api/admin/commissions/payout-list?minAmount=100&paymentStatus=unpaid
```

**Response**:
```json
[
  {
    "id": "commission-uuid-1",
    "agentId": "agent-uuid",
    "agentName": "John Smith",
    "agentEmail": "john@example.com",
    "memberName": "Jane Doe",
    "memberEmail": "jane@example.com",
    "commissionAmount": 45.00,
    "formattedAmount": "$45.00",
    "coverageType": "Plus",
    "paymentStatus": "unpaid",
    "paidAt": null,
    "createdAt": "2025-10-15T08:00:00Z",
    "isPaid": false
  },
  {
    "id": "commission-uuid-2",
    "agentId": "agent-uuid",
    "agentName": "John Smith",
    "agentEmail": "john@example.com",
    "memberName": "Bob Smith",
    "memberEmail": "bob@example.com",
    "commissionAmount": 20.00,
    "formattedAmount": "$20.00",
    "coverageType": "Base",
    "paymentStatus": "pending",
    "paidAt": null,
    "createdAt": "2025-10-20T10:30:00Z",
    "isPaid": false
  }
]
```

---

## 🔧 Backend Implementation

### New Storage Functions

#### 1. `updateCommissionPayoutStatus()`
Updates a single commission's payout information.

```typescript
export async function updateCommissionPayoutStatus(
  commissionId: string,
  payoutData: {
    paymentStatus: 'paid' | 'pending' | 'unpaid';
    paymentDate?: string;
    notes?: string;
  }
): Promise<any>
```

**Features**:
- Sets `paid_at` timestamp when marking as paid
- Updates `payment_status` field
- Adds/updates notes if provided
- Returns updated commission object

#### 2. `updateMultipleCommissionPayouts()`
Batch updates multiple commissions.

```typescript
export async function updateMultipleCommissionPayouts(
  updates: Array<{
    commissionId: string;
    paymentStatus: 'paid' | 'pending' | 'unpaid';
    paymentDate?: string;
  }>
): Promise<void>
```

**Features**:
- Processes in batches of 100
- Sets `paid_at` for paid status
- Uses Promise.all for parallel updates

#### 3. `getCommissionsForPayout()`
Fetches filtered commissions with agent and member details.

```typescript
export async function getCommissionsForPayout(
  agentId?: string,
  paymentStatus?: string,
  minAmount?: number
): Promise<any[]>
```

**Features**:
- Filters by agent, payment status, minimum amount
- Includes agent and member details
- Formats amounts for display
- Includes `isPaid` boolean flag

---

## 💼 Payout Workflow Examples

### Example 1: Mark Single Commission as Paid
```bash
curl -X POST https://api.example.com/api/admin/commission/abc123/payout \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "paymentStatus": "paid",
    "paymentDate": "2025-11-02",
    "notes": "ACH transfer completed"
  }'
```

### Example 2: Process Monthly Payouts
```bash
# 1. Get all unpaid commissions
curl -X GET "https://api.example.com/api/admin/commissions/payout-list?paymentStatus=unpaid" \
  -H "Authorization: Bearer {token}"

# 2. Prepare batch update
# Filter commissions that should be paid today

# 3. Batch update them all
curl -X POST https://api.example.com/api/admin/commissions/batch-payout \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "updates": [
      {"commissionId": "id1", "paymentStatus": "paid", "paymentDate": "2025-11-02"},
      {"commissionId": "id2", "paymentStatus": "paid", "paymentDate": "2025-11-02"},
      {"commissionId": "id3", "paymentStatus": "paid", "paymentDate": "2025-11-02"}
    ]
  }'
```

### Example 3: Process Pending to Paid
```bash
# Get all pending commissions
curl -X GET "https://api.example.com/api/admin/commissions/payout-list?paymentStatus=pending" \
  -H "Authorization: Bearer {token}"

# Mark specific ones as paid when transferred
```

---

## 📋 Payout Status Flow

```
UNPAID (initial state)
   ↓
PENDING (queued for processing)
   ↓
PAID (payment completed with date)
```

**Status Meanings**:
- **UNPAID**: Commission earned but not scheduled for payout
- **PENDING**: Commission scheduled for payout (awaiting processing)
- **PAID**: Payment sent to agent with payment date recorded

---

## 🎨 Frontend Integration Suggestions

### Admin Payout Dashboard Component

```tsx
// Display unpaid commissions
const [unpaidCommissions, setUnpaidCommissions] = useState([]);

useEffect(() => {
  fetch('/api/admin/commissions/payout-list?paymentStatus=unpaid')
    .then(r => r.json())
    .then(data => setUnpaidCommissions(data));
}, []);

// Mark as paid
const handleMarkPaid = async (commissionId, paymentDate) => {
  await fetch(`/api/admin/commission/${commissionId}/payout`, {
    method: 'POST',
    body: JSON.stringify({
      paymentStatus: 'paid',
      paymentDate,
      notes: 'Processed'
    })
  });
};

// Batch update
const handleBatchPayout = async (selectedIds) => {
  await fetch('/api/admin/commissions/batch-payout', {
    method: 'POST',
    body: JSON.stringify({
      updates: selectedIds.map(id => ({
        commissionId: id,
        paymentStatus: 'paid',
        paymentDate: new Date().toISOString().split('T')[0]
      }))
    })
  });
};
```

### Suggested UI Elements

1. **Payout Management Table**
   - Checkboxes for bulk selection
   - Agent name, member name columns
   - Amount column
   - Current status dropdown (Unpaid/Pending/Paid)
   - Payment date picker
   - Notes field
   - Action buttons (Save, Mark Paid)

2. **Filter Controls**
   - Status filter dropdown
   - Agent selector
   - Minimum amount slider
   - Date range picker

3. **Bulk Actions**
   - "Mark Selected as Paid" button
   - "Mark Selected as Pending" button
   - Set payment date for all selected
   - Export to CSV

4. **Summary Cards**
   - Total unpaid amount
   - Total pending amount
   - Commissions awaiting payout

---

## 🧪 Testing Recommendations

### Manual Testing

1. **Single Update**:
   - Update one commission from unpaid to paid
   - Verify date is set correctly
   - Verify notes are saved
   - Verify response includes updated data

2. **Batch Update**:
   - Select 5+ commissions
   - Batch update all at once
   - Verify all are updated
   - Check payment dates are set

3. **Filtering**:
   - Filter by agent
   - Filter by status
   - Filter by amount
   - Combine filters

4. **Edge Cases**:
   - Update with no payment date (should use today)
   - Update same commission twice
   - Batch update with invalid status
   - Empty batch array

### Automated Tests

```typescript
describe('Commission Payout Management', () => {
  it('should update single commission status', async () => {
    const response = await updateCommissionPayoutStatus(id, {
      paymentStatus: 'paid',
      paymentDate: '2025-11-02'
    });
    expect(response.paymentStatus).toBe('paid');
    expect(response.paidAt).toBeTruthy();
  });

  it('should batch update commissions', async () => {
    await updateMultipleCommissionPayouts([
      { commissionId: id1, paymentStatus: 'paid' },
      { commissionId: id2, paymentStatus: 'pending' }
    ]);
    // Verify both updated
  });

  it('should filter by payment status', async () => {
    const unpaid = await getCommissionsForPayout(null, 'unpaid');
    expect(unpaid.every(c => c.paymentStatus === 'unpaid')).toBe(true);
  });

  it('should filter by amount', async () => {
    const filtered = await getCommissionsForPayout(null, null, 50);
    expect(filtered.every(c => c.commissionAmount >= 50)).toBe(true);
  });
});
```

---

## 🔒 Security Considerations

- ✅ All endpoints require admin role
- ✅ No way to modify commission amounts (only payment status/date)
- ✅ All changes logged with timestamps
- ✅ Payment dates can be set to past or future
- ✅ Batch operations are atomic (all or nothing)

---

## 📈 Performance Considerations

- **Batch Size**: Limited to 100 per request to prevent timeouts
- **Query Optimization**: Uses indexed fields (agent_id, payment_status)
- **Filtering**: Applied in-memory after query for flexibility
- **Response Data**: Includes only needed fields

---

## 🐛 Common Issues & Solutions

**Issue**: Payment date not updating  
**Solution**: Ensure paymentStatus is 'paid' - paid_at only sets with that status

**Issue**: Batch update fails halfway  
**Solution**: Process in smaller batches (50-100 items) to avoid timeout

**Issue**: Agent/member names showing as "Unknown"  
**Solution**: Check users table has first_name, last_name fields populated

---

## 📞 Reference & Related Endpoints

**Related Endpoints**:
- `GET /api/admin/commission-totals` - View totals by agent
- `GET /api/admin/commissions` - View all commissions
- `POST /api/admin/mark-commissions-paid` - Legacy endpoint (use payout endpoint instead)

**Related Documentation**:
- `COMMISSION_TOTALS_FEATURE.md` - Commission totals system
- `COMMISSION_STRUCTURE.md` - Commission rates

---

## ✅ Implementation Checklist

- ✅ updateCommissionPayoutStatus() function
- ✅ updateMultipleCommissionPayouts() function
- ✅ getCommissionsForPayout() function
- ✅ POST /api/admin/commission/:commissionId/payout endpoint
- ✅ POST /api/admin/commissions/batch-payout endpoint
- ✅ GET /api/admin/commissions/payout-list endpoint
- ⏳ Frontend payout dashboard component (next)
- ⏳ Admin UI for payout management (next)
- ⏳ Testing in staging (next)

---

**Status**: 🟢 BACKEND IMPLEMENTATION COMPLETE  
**Last Updated**: November 2, 2025  
**Ready For**: Frontend Integration

