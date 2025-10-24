# Agent Permissions & Change Request Workflow

## 🔐 What Agents CAN Do Directly

### ✅ **Contact Information Updates** (No approval needed)
- Update member phone number
- Update member email
- Update mailing address
- Update emergency contact info
- Add/update family member demographics

### ✅ **Family Member Management**
- Add new family members to existing enrollment
- Update family member contact info

### ✅ **View Their Own Data**
- View all members they enrolled
- View commissions they've earned
- View payments for their members
- View their own profile

---

## ⚠️ What Agents MUST Request Admin Approval For

### 🔄 **Plan Changes**
- Upgrade to higher tier (Base → Plus → Elite)
- Downgrade to lower tier
- Change coverage type (Individual → Family, etc.)
- Add/remove RxValet add-on

### 💰 **Financial Changes**
- Modify pricing
- Apply discounts
- Change billing frequency

### 🚫 **Account Status Changes**
- Cancel membership
- Suspend membership
- Reactivate cancelled membership

---

## 📝 Change Request Workflow

### **Step 1: Agent Submits Request**
```
Agent → Dashboard → Member Profile → "Request Change"
- Select change type
- Provide reason
- Submit for review
```

### **Step 2: Admin Reviews**
```
Admin → Dashboard → "Pending Requests" 
- Review change details
- Approve or reject with notes
```

### **Step 3: Change Applied**
```
If approved:
- System automatically applies change
- Member notified
- Agent notified
- Audit trail created

If rejected:
- Agent notified with reason
- Can resubmit with clarification
```

---

## 🎯 Change Request Types

### **Plan Upgrade**
- **Current Plan:** MyPremierPlan Base - Member Only
- **Requested Plan:** MyPremierPlan Plus - Member Only
- **Reason:** "Member wants urgent care coverage"
- **Effective Date:** Next billing cycle

### **Plan Downgrade**
- **Current Plan:** MyPremierPlan Elite - Family
- **Requested Plan:** MyPremierPlan Base - Family
- **Reason:** "Financial hardship, customer request"
- **Effective Date:** Next billing cycle

### **Add Family Member**
- **Type:** Add child to coverage
- **Current:** Member + Spouse
- **Requested:** Member + Spouse + Child
- **New Pricing:** Auto-calculated

### **Cancellation**
- **Reason:** "Moving out of state"
- **Effective Date:** End of billing period
- **Refund Status:** Pro-rated/None

---

## 🔒 Security Model

### **Agent Permissions**
```sql
-- Can only see/modify their own enrolled members
WHERE enrolled_by_agent_id = auth.uid()

-- Cannot modify financial fields directly
-- Cannot change plan_id, total_monthly_price, status
```

### **Admin Permissions**
```sql
-- Can see all members
-- Can approve/reject all change requests
-- Can modify any field
```

### **Super Admin (You)**
```sql
-- God mode: Complete access
-- Can delete records
-- Can override any restriction
```

---

## 📊 Benefits of This Approach

### ✅ **For Agents**
- Fast updates for routine changes
- Better customer service
- Less waiting for simple updates
- Clear process for complex changes

### ✅ **For Admins**
- Control over financial changes
- Audit trail for compliance
- Prevent unauthorized modifications
- Review complex changes before applying

### ✅ **For Members**
- Faster service for simple updates
- Protected from errors on complex changes
- Clear communication about status changes

---

## 🚀 Implementation Status

- ✅ Schema: `member_change_requests` table added
- ✅ RLS Policies: Configured for agents/admins
- ✅ Member table: Protected critical fields
- ⏳ UI: Change request form (to be built)
- ⏳ Admin panel: Request review interface (to be built)
- ⏳ Notifications: Email alerts for requests (to be built)

---

## 🔄 Example: Agent Updates Member Phone

**Direct Update (No approval needed):**
```typescript
// Agent can do this directly
await updateMember({
  id: memberId,
  phone: "5125551234",
  email: "newemail@example.com"
});
// ✅ Succeeds immediately
```

## 🔄 Example: Agent Requests Plan Upgrade

**Change Request (Requires approval):**
```typescript
// Agent submits request
await createChangeRequest({
  memberId: memberId,
  changeType: "plan_upgrade",
  currentPlanId: 17, // Base - Member Only
  requestedPlanId: 21, // Plus - Member Only
  requestReason: "Customer wants urgent care coverage",
  requestedBy: agentId
});
// ⏳ Status: Pending admin review
```

**Admin Approves:**
```typescript
await reviewChangeRequest({
  requestId: 123,
  status: "approved",
  reviewNotes: "Approved - valid upgrade request",
  reviewedBy: adminId
});
// ✅ Plan automatically updated
// 📧 Notifications sent
```
