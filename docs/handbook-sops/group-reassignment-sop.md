# SOP: Group Reassignment and In-house Assignment

## Scope
Use this SOP to train admins and super admins on:
- Reassigning a group from one agent to another.
- Handling groups created as In-house (admin serviced).

## Roles Allowed
- Admin
- Super Admin

## Reassign Group: Standard Procedure
1. Open Group Enrollment and select the target group.
2. Open the group details modal.
3. Click Reassign Group.
4. In New Agent, select the destination agent.
5. Set the Effective Date.
6. Enter a clear Reason.
7. Add Notes if additional audit context is needed.
8. Keep or change transfer options:
   - Transfer linked employees (always enforced).
   - Transfer open enrollments/opportunities/tasks.
   - Keep previous agent read-only access.
9. Click Confirm Reassignment.
10. Verify success toast and assignment history.

## Field Behavior
- New Agent: Required. Determines current owner.
- Effective Date: Required for audit/report timing.
- Reason: Operational justification.
- Notes: Optional details.
- Transfer linked employees: Always on and enforced.
- Transfer open workflows: Optional handoff of active work.
- Previous agent read-only: Optional visibility for transition.

## In-house (Admin Serviced): What Is Different
When a group is created with In-house selected:
- No current assigned agent is set.
- Admins can still access and edit the group.
- Agents do not automatically see the group unless they are assigned or explicitly granted read-only access through reassignment metadata.

Operationally, the process differs at handoff time:
1. If group remains In-house, admin team owns work and updates.
2. If ownership needs to move to an agent, use Reassign Group and select a real agent.
3. After reassignment, the selected agent becomes current owner and assignment filtering applies.

## Access and Visibility Summary
- Admin/super admin: Full access regardless of assignment.
- Agent: Access only when current assignee or listed in read-only agent ids.

## Training Notes
- Use meaningful Reason values (for example: territory handoff, staffing change, ownership correction).
- Keep Notes concise but audit-friendly.
- During transitions, keep previous agent read-only checked unless there is a reason to remove it.
- Confirm the group appears in the new owner's queue after reassignment.

## Quick Script for Trainers
1. "We only use this modal to change operational ownership."
2. "Pick the new agent and effective date."
3. "Document reason and notes for audit traceability."
4. "Choose whether open work moves and whether prior owner keeps read-only access."
5. "Confirm, then verify queue visibility and history entry."
