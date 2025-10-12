# What's in the Neon Database
## Data Inventory & Loss Assessment

**Date:** October 12, 2025  
**Status:** Database Suspended - Cannot Export  

---

## 📊 Database Tables & Contents

Based on your schema and Railway logs, here's what's stored in the suspended Neon database:

### **1. USERS Table** 
**What it contains:**
- Agent accounts (role='agent')
- Admin accounts (role='admin', 'super_admin')
- Test user accounts (role='member', 'user') - **83 total mentioned**

**Critical Data:**
- ✅ **Agent/Admin login credentials** (email, passwordHash)
- ✅ **Agent numbers** (MPP0001, MPP0002, etc.)
- ✅ **Personal info** (name, phone, email, address)
- ✅ **Role assignments** (who can log in)
- ✅ **Approval status** (approved, pending, rejected)
- ⚠️ **Last login tracking** (lastLoginAt, lastActivityAt)

**What you'd lose if we start fresh:**
- ❌ Test user accounts (83 users) - **NOT NEEDED**
- ❌ Test member login history
- ⚠️ **IMPORTANT:** Agent/Admin accounts - **YOU SAID THESE ARE IN SUPABASE AUTH**

---

### **2. MEMBERS Table**
**What it contains:**
- Enrolled healthcare customers (no login access)
- Personal information (name, DOB, SSN, address)
- Employment information
- Emergency contacts
- Enrollment tracking (which agent enrolled them)

**From logs:** You mentioned having members, but mostly test data

**What you'd lose if we start fresh:**
- ❌ All test member enrollments
- ⚠️ **Any real customer enrollments** (if any exist)

**QUESTION:** Do you have any REAL customer enrollments in production yet? Or all test?

---

### **3. SUBSCRIPTIONS Table**
**What it contains:**
- Active subscriptions linking members to plans
- Subscription status (active, pending, cancelled)
- Start/end dates
- Billing information
- Stripe subscription IDs

**From logs:** Mentioned 22 subscriptions exist

**What you'd lose if we start fresh:**
- ❌ All 22 test subscriptions
- ⚠️ **Any real customer subscriptions** (if any)

**QUESTION:** Are all 22 subscriptions test data? Or are some real customers?

---

### **4. PAYMENTS Table**
**What it contains:**
- Payment transaction history
- Amounts paid
- Stripe payment IDs
- Payment status (succeeded, failed, pending, refunded)
- Transaction metadata

**What you'd lose if we start fresh:**
- ❌ Test payment records
- ⚠️ **Real payment history** (if any exists)

**NOTE:** Stripe still has all payment records, so financial data is safe

---

### **5. COMMISSIONS Table**
**What it contains:**
- Agent commission tracking
- Which agent enrolled which member
- Commission amounts per enrollment
- Payment status (unpaid, paid)
- Plan details at time of enrollment

**What you'd lose if we start fresh:**
- ❌ Test commission records
- ⚠️ **Real commission tracking** (if any real enrollments exist)

**IMPORTANT:** If you have real enrollments with unpaid commissions, this data is critical!

---

### **6. FAMILY_MEMBERS Table**
**What it contains:**
- Spouses and dependents on family plans
- Personal information for each family member
- Links to primary member

**What you'd lose if we start fresh:**
- ❌ Test family member data
- ⚠️ **Real family enrollments** (if any)

---

### **7. LEADS Table**
**What it contains:**
- Contact form submissions
- Lead status (new, contacted, converted, etc.)
- Assigned agent for follow-up
- Contact information

**What you'd lose if we start fresh:**
- ❌ Test leads
- ⚠️ **Real leads from contact forms** (if any)

**QUESTION:** Have you received any real leads through the website?

---

### **8. PLANS Table**
**What it contains:**
- Available DPC plans (Individual, Family, Plus variants)
- Pricing information
- Plan features
- Stripe price IDs

**Risk Level:** ⚠️ **LOW** - You have this in seed files (`seedPlans.cjs`)

**What you'd lose:** Nothing - can recreate from seed file

---

### **9. LEAD_ACTIVITIES Table**
**What it contains:**
- Agent notes on leads
- Call logs, email logs, meeting notes
- Follow-up tracking

**What you'd lose if we start fresh:**
- ❌ Test activity logs
- ⚠️ **Real agent notes on leads** (if any)

---

### **10. ENROLLMENT_MODIFICATIONS Table**
**What it contains:**
- Audit trail of changes to enrollments
- Who made changes and when
- Consent tracking for modifications

**What you'd lose if we start fresh:**
- ❌ Test audit logs
- ⚠️ **Real audit trail** (if any real modifications)

---

## 🎯 Critical Questions to Answer

Before we proceed, please answer these:

### **Question 1: Real Customers**
❓ **Do you have ANY real customer enrollments in the Neon database?**
- Or is everything test data from development?
- If real customers exist, how many approximately?

### **Question 2: Real Payments**
❓ **Have you processed ANY real payments through Stripe?**
- Are all 22 subscriptions test/demo subscriptions?
- Any actual money collected from real customers?

### **Question 3: Real Commissions**
❓ **Do any agents have unpaid commissions for real enrollments?**
- Any commission records that represent real money owed?

### **Question 4: Real Leads**
❓ **Have you received any real leads through the contact form?**
- Any leads that need follow-up?
- Any important agent notes on leads?

### **Question 5: Agent/Admin Accounts**
❓ **You said agent/admin login info is in Supabase Auth - is this correct?**
- Can your agents/admins log in using Supabase authentication?
- Or are they using the Neon database for authentication?

---

## 💡 Migration Options Based on Your Answers

### **Scenario A: Everything is Test Data**
**If you answer "all test data, no real customers":**

✅ **RECOMMENDED: Fresh Start**
- Create new Supabase database
- Run schema files
- Seed plans from seedPlans.cjs
- Add agent/admin accounts (already in Supabase Auth)
- Start clean
- **Time:** 15 minutes
- **Data Loss:** None that matters (all test data)

---

### **Scenario B: Some Real Data Exists**
**If you have real customers, payments, or commissions:**

⚠️ **REQUIRED: Data Export/Migration**
- Must attempt to wake Neon database
- Export real data carefully
- Import to Supabase
- Verify all real records preserved
- **Time:** 1-2 hours
- **Risk:** Data loss if export fails

**Alternative:** Manual data entry for small amounts of real data

---

### **Scenario C: Mixed - Real Leads Only**
**If only real leads exist (no enrollments yet):**

✅ **HYBRID: Fresh Start + Manual Lead Entry**
- Create fresh Supabase database
- Manually re-enter important leads (10-20 records is manageable)
- Start clean for everything else
- **Time:** 30 minutes
- **Data Loss:** Test data only

---

## 🔍 How to Check What's in Neon (If We Can Wake It)

If we can temporarily wake the Neon database, we should run these queries:

```sql
-- Count real vs test data
SELECT 
  'Users' as table_name,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE role IN ('agent', 'admin', 'super_admin')) as agents_admins,
  COUNT(*) FILTER (WHERE role IN ('member', 'user')) as test_members
FROM users;

SELECT 
  'Members' as table_name,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE email LIKE '%test%' OR email LIKE '%demo%') as likely_test
FROM members;

SELECT 
  'Subscriptions' as table_name,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'active') as active
FROM subscriptions;

SELECT 
  'Payments' as table_name,
  COUNT(*) as total,
  SUM(amount) as total_amount,
  COUNT(*) FILTER (WHERE status = 'succeeded') as successful
FROM payments;

SELECT 
  'Commissions' as table_name,
  COUNT(*) as total,
  SUM(commission_amount) as total_commissions,
  COUNT(*) FILTER (WHERE payment_status = 'unpaid') as unpaid
FROM commissions;

SELECT 
  'Leads' as table_name,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE email NOT LIKE '%test%') as likely_real
FROM leads;
```

---

## 🎯 My Recommendation

Based on what you've told me:

1. ✅ **Agent/Admin logins are in Supabase Auth** (your statement)
2. ✅ **Plans are in seed files** (seedPlans.cjs exists)
3. ⚠️ **83+ users mentioned** - mostly/all test?
4. ⚠️ **22 subscriptions** - test or real?

**I recommend:**

### **Option 1: Fresh Start (if all test data)**
- Zero data loss risk
- Clean slate
- 15 minutes
- Preserves what matters (agents in Supabase Auth, plans in code)

### **Option 2: Wake & Export (if real data exists)**
- Try to wake Neon endpoint using Neon API
- Export critical data
- More complex but safer
- 1-2 hours

---

## ❓ Please Confirm

**Please answer these key questions:**

1. **Do you have ANY real customer enrollments?** (yes/no)
2. **Have you collected ANY real payments?** (yes/no)
3. **Are there unpaid commissions for real enrollments?** (yes/no)
4. **Do you have real leads that need preserving?** (yes/no)
5. **Can your agents/admins log in via Supabase Auth right now?** (yes/no)

Based on your answers, I'll recommend the safest path forward.

---

**Created:** October 12, 2025  
**Status:** Awaiting user confirmation on real vs test data
