# Group Enrollment Census Import SOP

## Purpose
Define a standard, repeatable process for importing and validating group census data so household records are linked correctly and do not appear as separate memberships/plans.

## Scope
- Roles: Admins, Agents, Operations.
- Flows: Group enrollment census upload and sync.
- Environments: Production and lower environments.

## Required Input Standards
- `relationship` (required): `primary`, `spouse`, or `dependent`.
- `plan tier` (recommended anchor): `member_only`, `member_spouse`, `member_child`, or `family`.
- `business unit` (optional): informational only; not required for mapping.
- SSN fields:
  - `employee ssn` for primary rows.
  - `dependent ssn` for dependent rows.
- Optional profile fields may be blank or `N/A` (for example `work email`). Do not fabricate values.

## Household ID Standard
- One family uses one shared `householdBaseNumber`.
- `householdMemberNumber` format:
  - Primary: `<householdBaseNumber>-00`
  - Dependents: `<householdBaseNumber>-01`, `-02`, `-03`, and so on.
- Expected pattern: one primary + zero or more dependents.

## Procedure (Admins and Agents)
1. Open the target group record in Group Enrollment.
2. Confirm the group is the correct one (name, assignment, status).
3. Upload census via the census import/sync flow.
4. Wait for completion response.
5. If partial failures occur, download failed rows CSV immediately.
6. Verify at least one multi-person household in the member table:
   - One primary row only.
   - Dependents are linked under the same household base.
   - Household member numbers follow `-00/-01/-02...`.
   - Dependents do not carry separate plan-level amounts unless explicitly intended.
7. If manual corrections are needed, edit rows and save, then refresh group detail.

## Validation Checklist
- No household has more than one active primary.
- No dependent exists without a primary household anchor.
- Relationship values are normalized (`primary/spouse/dependent`).
- Optional fields with `N/A` are accepted and stored as empty optional values.
- Primary and dependents do not appear as separate memberships/plans.

## Error Handling and Escalation
1. Import fails for specific rows:
   - Export failed rows CSV.
   - Capture group ID, file name, and timestamp.
   - Escalate to engineering with CSV attached.
2. Relationship change saves but does not reflect:
   - Refresh group detail.
   - Reopen member edit drawer.
   - If still incorrect, escalate with member ID/group ID and screenshot.
3. Household linking appears broken:
   - Confirm `relationship` and `plan tier` source values.
   - Retry sync after correcting source rows.

## Production Rollout Notes
- Deploy latest `main` before running imports.
- Run one pilot group first, then broader batch.
- Keep a copy of source file and failed rows CSV for audit.

## Ownership
- Process owner: Enrollment Operations.
- Technical owner: Engineering.
- Last reviewed: 2026-03-29.
