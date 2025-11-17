# Quick Reference: Certification Logging & User Seeding

## 🚀 Get Started in 5 Minutes

### Step 1: Enable Certification Logging
```bash
# Add to .env
ENABLE_CERTIFICATION_LOGGING=true
EPX_ENVIRONMENT=sandbox

# Restart server
npm run dev
```

### Step 2: Create Test Users
```bash
npm run seed:users
```

Output:
```
✅ Successfully created/updated 5 users:

   ADMIN        | MPP0001 | admin1@getmydpc.com
   ADMIN        | MPP0002 | admin2@getmydpc.com
   ADMIN        | MPP0003 | admin3@getmydpc.com
   AGENT        | MPP0004 | agent1@getmydpc.com
   AGENT        | MPP0005 | agent2@getmydpc.com
```

### Step 3: Generate Test Logs
```bash
npm run cert:generate-test-logs
```

### Step 4: Export for Submission
```bash
npm run cert:export-logs
```

File created: `logs/certification/summaries/EPX_CERTIFICATION_EXPORT_[DATE].txt`

---

## 🔐 Test Credentials

```
Admin (Full Access):
  Email: admin1@getmydpc.com
  Password: AdminPass123!@#
  Role: Admin
  Agent #: MPP0001

Agent (Limited Access):
  Email: agent1@getmydpc.com
  Password: AgentPass123!@#
  Role: Agent
  Agent #: MPP0004
```

---

## 📋 NPM Commands

```bash
# Certification Logging
npm run cert:generate-test-logs      # Create sample transactions
npm run cert:export-logs             # Export to .txt file

# User Management
npm run seed:users                   # Create 5 test users

# Development
npm run dev                          # Start with logging enabled
npm run build                        # Build for production
```

---

## 🌐 API Endpoints (After Enabling)

```bash
# Check logging status
curl http://localhost:3000/api/epx/certification/toggle

# Get summary
curl http://localhost:3000/api/epx/certification/summary

# View report
curl http://localhost:3000/api/epx/certification/report

# Export logs
curl -X POST http://localhost:3000/api/epx/certification/export
```

---

## 📁 File Locations

```
logs/certification/
├── raw-requests/                   # Individual transaction logs
│   ├── TEST_1234567890_001.txt
│   ├── TEST_1234567890_002.txt
│   └── ...
└── summaries/                      # Compiled exports
    └── EPX_CERTIFICATION_EXPORT_2024-01-15.txt
```

---

## 🔒 What Gets Masked

- Card numbers: `4111****1111` (first 4 + last 4)
- CVV/CVC: `***MASKED***`
- Auth codes: `A1B2****XYZ9` (first 4 + last 4)
- Customer IDs: `***CUSTOMER_ID***`
- Emails: `te***@***`
- API keys: `sk_****...****` (first 4 + last 4)

---

## ⚡ Real Transaction Logging

Once enabled, automatic logging captures:

1. **Create Payment**
   - User initiates payment
   - Auto-logged to `logs/certification/raw-requests/`

2. **Payment Callback**
   - EPX returns result
   - Auto-logged to `logs/certification/raw-requests/`

3. **Export**
   - Run `npm run cert:export-logs`
   - All transactions compiled to single .txt file
   - Ready for processor submission

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Logs not created | Verify `ENABLE_CERTIFICATION_LOGGING=true` in .env, restart server |
| Users not found | Run `npm run seed:users` again (idempotent) |
| Export empty | Run `npm run cert:generate-test-logs` first |
| Login fails | Check user created: verify in Supabase dashboard |
| No logs dir | Script creates automatically in `logs/certification/` |

---

## 📊 What's Logged for Each Transaction

```
✓ Transaction ID
✓ Customer ID (masked)
✓ Amount
✓ Request headers + body
✓ Response headers + body
✓ Processing time (ms)
✓ IP address
✓ User agent
✓ Environment (sandbox/production)
✓ Timestamp
```

---

## 🎯 Submit to Processor

1. Generate: `npm run cert:export-logs`
2. Review: Open `.txt` file
3. Verify: All sensitive data masked
4. Submit: Send file to processor
   - Email: [processor certification email]
   - Subject: "EPX Hosted Checkout Certification - Request/Response Logs"
   - Attachment: `EPX_CERTIFICATION_EXPORT_*.txt`

---

## ⚙️ Environment Variables

```bash
# Required
ENABLE_CERTIFICATION_LOGGING=true|false
EPX_ENVIRONMENT=sandbox|production

# Default
# If not set, logging disabled
# If not set, sandbox assumed
```

---

## 📚 Full Documentation

- **CERTIFICATION_LOGGING_GUIDE.md** - Complete certification logging guide
- **SETUP_GUIDE_CERTIFICATION_AND_USERS.md** - Full integration guide
- **IMPLEMENTATION_SUMMARY.md** - Implementation details and checklist

---

## ✨ Status

✅ Certification logging implemented
✅ User seeding implemented
✅ Documentation complete
✅ Ready for production use

---

**Version:** 1.0
**Last Updated:** January 2024
**Status:** Production Ready
