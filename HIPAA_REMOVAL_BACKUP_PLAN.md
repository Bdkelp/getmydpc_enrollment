# HIPAA Compliance Removal - Backup Plan

**Date:** November 5, 2025  
**Purpose:** Remove HIPAA encryption from member SSN storage (non-insurance DPC product)  
**Scope:** Members only - keep agent/admin SSN for commission purposes

---

## 📋 Changes Being Made

### Files Modified:
- `server/storage.ts` (2 lines only)

### Specific Changes:
1. **Line 4057** - `createMember` function: Remove `encryptSensitiveData()` wrapper from member SSN
2. **Line 4198** - `updateMember` function: Remove `encryptSensitiveData()` wrapper from member SSN

### What's NOT Changed:
✅ Agent/Admin SSN processing (still used for commission/tax purposes)  
✅ Payment token encryption (security best practice)  
✅ All encryption utility functions (kept for future use)  
✅ SSN formatting functions (still needed for validation)

---

## 🔄 Rollback Strategy

### If Issues Occur:
1. **Immediate Rollback:** Git revert the commit
2. **Manual Rollback:** Restore the 2 lines with encryption

### Rollback Commands:
```bash
# Git rollback (if committed)
git log --oneline -5
git revert <commit-hash>

# Manual rollback (restore these exact lines):
# Line 4057: ssn: memberData.ssn ? encryptSensitiveData(formatSSN(memberData.ssn)) : null,
# Line 4198: ssn: data.ssn ? encryptSensitiveData(formatSSN(data.ssn)) : undefined,
```

---

## 🧪 Testing Plan

### Test Cases:
1. **Member Registration** - Verify new members can register with SSN
2. **Member Updates** - Verify existing members can be updated
3. **Admin Functions** - Verify admin can view/manage members
4. **Agent Functions** - Verify agent commission calculations still work
5. **Payment Flow** - Verify EPX payment processing unaffected

### Expected Results:
- Member SSN stored as plain text (9 digits)
- Agent/admin functionality unchanged
- No impact on payments or commissions

---

## 📊 Risk Assessment

- **Risk Level:** Very Low ⭐
- **Impact Scope:** Member data storage only
- **Business Continuity:** No interruption expected
- **Rollback Time:** < 5 minutes

---

## 🔍 Validation Steps

After changes:
1. Check database - member SSN should be 9 digits (not encrypted)
2. Test member creation through registration flow
3. Verify admin dashboard shows members correctly
4. Confirm agent commissions still calculate properly

---

## 📞 Emergency Contacts

If issues arise:
- **Developer:** Available for immediate rollback
- **Database:** Supabase dashboard accessible
- **Deployment:** Railway auto-deploys from main branch

---

**Note:** This is a minimal-risk change affecting only member SSN encryption. Agent/admin SSN processing remains intact for legitimate business purposes (commission identification and tax reporting).