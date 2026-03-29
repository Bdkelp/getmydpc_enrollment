# SOP: Group Enrollment Reporting and Commission Attribution

## Scope
Use this SOP to operate group enrollment reporting, attribution, and payout eligibility.

Covers:
- Membership totals and analytics treatment for group enrollments.
- Agent/admin attribution rules for group business.
- Commission eligibility and payout timing policy.
- Reassignment behavior for ongoing group payments.

## Roles
- Agent
- Admin
- Super Admin
- Finance Operations

## Core Policy
1. One group member enrollment record equals one membership for reporting.
2. Group enrollments must be included in business totals, with segmentation between:
   - Individual enrollment path
   - Group enrollment path
3. Coverage labels are interchangeable for analytics normalization:
   - Employee-only and member-only are equivalent
   - Employee + dependents and member + dependents are equivalent
4. Split attribution is allowed for group business.
5. Split percentages must be whole numbers (no decimals).
6. Reassignment changes apply on the next effective date/cycle for ongoing payments.
7. Commission payout window:
   - Cutoff: Sunday at 23:59 ET
   - Payout: Friday after cutoff
   - If after cutoff, payment is deferred to the next payout cycle
8. Commission eligibility requires captured payment.

## Reporting Standard
1. Include both enrollment paths in platform totals.
2. Preserve source segmentation in dashboards and exports.
3. Do not collapse group and individual channels into a single unlabeled number.
4. Maintain consistency for:
   - Total memberships
   - New enrollments
   - Cancellations/terminations
   - Revenue summary fields

## Attribution Standard
1. Use assigned group owner as primary reporting owner for current-cycle group membership counts.
2. If split attribution is configured:
   - Percent allocations must sum to 100.
   - Percent allocations must be integer values.
3. Reassignment event must store:
   - Previous owner
   - New owner
   - Effective date
   - Whether prior owner keeps read-only visibility

## Commission Eligibility Workflow
1. Confirm enrollment/payment status reaches captured state.
2. Confirm assignment and split attribution state effective for the cycle.
3. Compute payout eligibility date using weekly cutoff and Friday payout policy.
4. Queue for payout only when payment-captured and date-eligible.
5. If not eligible by cutoff, carry forward to next cycle.

## Reassignment Workflow for Ongoing Payments
1. Admin sets reassignment with effective date.
2. Existing cycle remains on prior assignment policy.
3. Next cycle uses new assignment policy.
4. Apply split logic based on effective assignment at cycle boundary.
5. Keep immutable audit history for every assignment change.

## Operational Validation Checklist
- [ ] Group memberships appear in total membership cards.
- [ ] Dashboards show individual versus group segmentation.
- [ ] Group enrollments affect agent and admin totals.
- [ ] Split attribution enforces whole-number percentages.
- [ ] Reassignment is applied on next cycle, not retroactively.
- [ ] Only payment-captured records are commission-eligible.
- [ ] Sunday 23:59 ET cutoff and Friday payout timing are respected.

## Escalation
- Product owner: policy interpretation conflicts.
- Engineering: data-path or analytics parity defects.
- Finance operations: payout timing and captured-payment disputes.
