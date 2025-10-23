# Archive Directory

This folder contains code and documentation that is NOT currently active in production but may be needed in the future.

## Folders:

### `/epx-server-post-future`
**EPX Server Post Implementation** (Recurring Billing)
- Files for future recurring payment implementation
- Archived on: October 23, 2025
- Why: Caused production issues during initial rollout, needs proper planning
- When to use: After we plan EPX Server Post integration properly

**Files:**
- `epx-server-post-routes.ts` - API endpoints for tokenization/recurring billing
- `epx-server-post-service.ts` - Service layer for EPX Server Post
- `recurring-billing-scheduler.ts` - Monthly auto-charge scheduler

### `/debug-scripts`
**Temporary debugging tools**
- One-time scripts used to investigate issues
- Kept for reference but not needed in production

### `/completed-migrations`
**Database migration scripts**
- Already run in production
- Kept for reference and potential rollback scenarios
- Do NOT run these again unless rolling back database

### `/old-docs`
**Outdated documentation**
- Documentation for features that were rolled back or replaced
- Kept for historical reference

---

## How to Restore Files:

If you need to bring back archived code:

```bash
# Copy from archive back to original location
Copy-Item "archive/epx-server-post-future/epx-server-post-routes.ts" "server/routes/"
```

## Rollback Points:

- **Pre-cleanup**: Tag `rollback-pre-cleanup-20251023-065136`
  - Use if cleanup caused issues
  - Command: `git reset --hard rollback-pre-cleanup-20251023-065136`
