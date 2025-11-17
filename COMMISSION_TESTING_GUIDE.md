# 🧪 Commission System Testing Guide

## Your New Commission System is Ready to Test!

### 🔗 **Test URLs** (Replace with your actual Railway domain):

**Base URL:** `https://your-railway-app.up.railway.app`

### **Test 1: Check New Commission Table**
```
GET https://your-railway-app.up.railway.app/api/test-commission-count
```
**Expected Result:** 
```json
{
  "success": true,
  "message": "Found 0 commissions in new table",
  "count": 0,
  "records": 0,
  "timestamp": "2025-10-29T..."
}
```

### **Test 2: Create Test Commission**
```
POST https://your-railway-app.up.railway.app/api/test-commission
```
**Expected Result:**
```json
{
  "success": true,
  "message": "NEW COMMISSION SYSTEM WORKING!",
  "commission": {
    "success": true,
    "agentCommissionId": "uuid-here",
    "legacyCommissionId": "id-here"
  },
  "timestamp": "2025-10-29T..."
}
```

### **Test 3: Verify Commission Was Created**
```
GET https://your-railway-app.up.railway.app/api/test-commission-count
```
**Expected Result:**
```json
{
  "success": true,
  "message": "Found 1 commissions in new table", 
  "count": 1,
  "records": 1,
  "sampleRecord": {
    "id": "uuid-here",
    "agent_id": "test-agent-...",
    "commission_amount": "125.50",
    "coverage_type": "aca",
    "status": "pending",
    "payment_status": "unpaid"
  }
}
```

## 🚀 **How to Test:**

### **Option 1: Using Browser**
1. Open your Railway app URL
2. Add `/api/test-commission-count` to see current count
3. Use a tool like Postman to POST to `/api/test-commission`
4. Check count again to see if it increased

### **Option 2: Using curl (if available)**
```bash
# Check current count
curl https://your-railway-app.up.railway.app/api/test-commission-count

# Create test commission  
curl -X POST https://your-railway-app.up.railway.app/api/test-commission

# Check count again
curl https://your-railway-app.up.railway.app/api/test-commission-count
```

### **Option 3: Real Enrollment Test**
1. Go to your enrollment form
2. Complete a test enrollment with an agent assigned
3. Check if commission appears in `agent_commissions` table
4. Verify both old and new tables get the commission (dual-write)

## ✅ **Success Criteria:**

- ✅ **Test 1:** New table exists and is accessible
- ✅ **Test 2:** Can create commissions in new table  
- ✅ **Test 3:** Commission data is properly structured
- ✅ **Test 4:** Real enrollments create commissions automatically

## 🎯 **Next Steps After Success:**

1. **Confirm working** → Remove old commission system
2. **Update frontend** → Use new commission endpoints  
3. **Full cleanup** → Delete legacy code and tables
4. **Celebrate** → Commission system finally works! 🎉

---

**Your commission tracking nightmare is about to end!** 🚀