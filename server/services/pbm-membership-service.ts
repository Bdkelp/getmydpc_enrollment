import { transaction } from "../lib/neonDb";
import {
  canWithdrawPbmChange,
  getPbmEffectiveDate,
  getPbmAmountDelta,
  resolvePbmRequestError,
} from "./pbm-membership-policy";
import { resolveEstablishedBillingAnchorDay } from "./recurring-billing-cycle-policy";

export type PbmRequestStatus = "pending" | "applied" | "withdrawn";
export type PbmFulfillmentStatus = "Pending Submission" | "Submitted" | "Confirmed";


export async function requestPbmChange(input: {
  memberId: number;
  targetEnabled: boolean;
  actorId: string;
  actorRole: string;
}) {
  return transaction(async (client) => {
    const result = await client.query(
      `SELECT m.id AS member_id, m.add_rx_valet AS current_enabled,
              m.status AS member_status, s.id AS subscription_id,
              s.status AS subscription_status,
              TO_CHAR(s.next_billing_date, 'YYYY-MM-DD') AS next_billing_date,
              TO_CHAR(s.current_period_start, 'YYYY-MM-DD') AS current_period_start,
              m.first_payment_date, m.enrollment_date, s.amount
       FROM public.members m
       JOIN public.subscriptions s ON s.member_id = m.id
       WHERE m.id = $1
       ORDER BY s.created_at DESC NULLS LAST, s.id DESC
       LIMIT 1 FOR UPDATE OF m, s`,
      [input.memberId],
    );
    const row = result.rows[0];
    if (!row) throw Object.assign(new Error("Active DPC subscription not found"), { status: 404 });
    if (!row.next_billing_date) {
      throw Object.assign(new Error("Subscription is missing its next billing date"), { status: 409 });
    }
    const businessDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    const billingAnchorDay = resolveEstablishedBillingAnchorDay({
      scheduledCycleDate: row.next_billing_date,
      currentPeriodStart: row.current_period_start,
      historicalAnchorSource: row.first_payment_date || row.enrollment_date || null,
    });
    const cycleStarted = await client.query(
      `SELECT 1 FROM public.recurring_billing_cycles
       WHERE subscription_id = $1 AND cycle_date = $2::date LIMIT 1`,
      [row.subscription_id, row.next_billing_date],
    );
    const effectiveDate = getPbmEffectiveDate({
      nextBillingDate: row.next_billing_date,
      businessDate,
      billingAnchorDay,
      currentCycleStarted: cycleStarted.rows.length > 0,
    });
    const currentEnabled = row.current_enabled === true;
    const pending = await client.query(
      `SELECT id FROM public.pbm_membership_changes
       WHERE subscription_id = $1 AND request_status = 'pending' LIMIT 1`,
      [row.subscription_id],
    );
    const policyError = resolvePbmRequestError({
      inScope: true,
      memberActive: row.member_status === "active",
      subscriptionActive: row.subscription_status === "active",
      currentEnabled,
      targetEnabled: input.targetEnabled,
      hasPendingChange: pending.rows.length > 0,
    });
    if (policyError) throw Object.assign(new Error(policyError.message), { status: policyError.status });
    const amountDelta = getPbmAmountDelta(currentEnabled, input.targetEnabled);
    const inserted = await client.query(
      `INSERT INTO public.pbm_membership_changes
         (member_id, subscription_id, current_enabled, target_enabled, amount_delta,
          effective_date, requested_by, requested_by_role)
       VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8)
       RETURNING *`,
      [input.memberId, row.subscription_id, currentEnabled, input.targetEnabled,
        amountDelta, effectiveDate, input.actorId, input.actorRole],
    );
    const change = inserted.rows[0];
    await client.query(
      `INSERT INTO public.pbm_membership_change_events
         (change_id, event_type, old_value, new_value, note, actor_id, actor_role)
       VALUES ($1, 'requested', $2, $3, $4, $5, $6)`,
      [change.id, currentEnabled ? "enabled" : "disabled",
        input.targetEnabled ? "enabled" : "disabled",
        `PBM change scheduled for recurring cycle ${effectiveDate}; the current paid period is not refunded`,
        input.actorId, input.actorRole],
    );
    return change;
  });
}

export async function withdrawPbmChange(input: {
  memberId: number;
  actorId: string;
  actorRole: string;
}) {
  return transaction(async (client) => {
    await client.query(
      `SELECT s.id FROM public.subscriptions s
       JOIN public.pbm_membership_changes c ON c.subscription_id = s.id
       WHERE c.member_id = $1 AND c.request_status = 'pending'
       FOR UPDATE OF s`,
      [input.memberId],
    );
    const found = await client.query(
      `SELECT c.id, c.fulfillment_status,
              EXISTS (
                SELECT 1 FROM public.recurring_billing_cycles r
                WHERE r.subscription_id = c.subscription_id
                  AND r.cycle_date = c.effective_date
              ) AS billing_cycle_started
       FROM public.pbm_membership_changes c
       WHERE c.member_id = $1 AND c.request_status = 'pending'
       FOR UPDATE`,
      [input.memberId],
    );
    const change = found.rows[0];
    if (!change) throw Object.assign(new Error("No pending PBM change to withdraw"), { status: 404 });
    if (!canWithdrawPbmChange(change.fulfillment_status, change.billing_cycle_started === true)) {
      const message = change.billing_cycle_started
        ? "The recurring billing cycle has started; the PBM request can no longer be withdrawn for that cycle"
        : "PBM eligibility was already submitted; contact operations to record a correction";
      throw Object.assign(new Error(message), { status: 409 });
    }
    const updated = await client.query(
      `UPDATE public.pbm_membership_changes
       SET request_status = 'withdrawn', withdrawn_at = NOW(), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [change.id],
    );
    await client.query(
      `INSERT INTO public.pbm_membership_change_events
         (change_id, event_type, old_value, new_value, note, actor_id, actor_role)
       VALUES ($1, 'withdrawn', 'pending', 'withdrawn',
               'Pending PBM change withdrawn before its effective billing cycle', $2, $3)`,
      [change.id, input.actorId, input.actorRole],
    );
    return updated.rows[0];
  });
}

export async function updatePbmFulfillment(input: {
  changeId: number;
  status: PbmFulfillmentStatus;
  actorId: string;
  actorRole: string;
  note?: string;
}) {
  return transaction(async (client) => {
    const found = await client.query(
      `SELECT id, fulfillment_status, request_status
       FROM public.pbm_membership_changes WHERE id = $1 FOR UPDATE`,
      [input.changeId],
    );
    const change = found.rows[0];
    if (!change) throw Object.assign(new Error("PBM operations task not found"), { status: 404 });
    if (change.request_status === "withdrawn") {
      throw Object.assign(new Error("Withdrawn PBM tasks cannot be updated"), { status: 409 });
    }
    const allowed: Record<PbmFulfillmentStatus, string[]> = {
      "Pending Submission": ["Pending Submission", "Submitted"],
      Submitted: ["Submitted", "Confirmed"],
      Confirmed: ["Confirmed"],
    };
    if (!allowed[input.status]?.includes(change.fulfillment_status)) {
      throw Object.assign(new Error("PBM fulfillment status cannot move backwards"), { status: 409 });
    }
    const updated = await client.query(
      `UPDATE public.pbm_membership_changes
       SET fulfillment_status = $2, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [input.changeId, input.status],
    );
    if (change.fulfillment_status !== input.status || input.note?.trim()) {
      await client.query(
        `INSERT INTO public.pbm_membership_change_events
           (change_id, event_type, old_value, new_value, note, actor_id, actor_role)
         VALUES ($1, 'fulfillment_status_changed', $2, $3, $4, $5, $6)`,
        [input.changeId, change.fulfillment_status, input.status,
          input.note?.trim() || null, input.actorId, input.actorRole],
      );
    }
    return updated.rows[0];
  });
}

export async function applyPbmChangeAfterSuccessfulCycle(input: {
  subscriptionId: number;
  memberId: number;
  cycleDate: string;
  cycleAmount: string;
}) {
  return transaction(async (client) => {
    await client.query(`SELECT id FROM public.members WHERE id = $1 FOR UPDATE`, [input.memberId]);
    await client.query(
      `SELECT id FROM public.subscriptions WHERE id = $1 AND member_id = $2 FOR UPDATE`,
      [input.subscriptionId, input.memberId],
    );
    const result = await client.query(
      `SELECT * FROM public.pbm_membership_changes
       WHERE subscription_id = $1 AND request_status = 'pending'
         AND effective_date <= $2::date
       FOR UPDATE`,
      [input.subscriptionId, input.cycleDate],
    );
    const change = result.rows[0];
    if (!change) return null;
    await client.query(
      `UPDATE public.subscriptions SET amount = $2, updated_at = NOW()
       WHERE id = $1 AND member_id = $3`,
      [input.subscriptionId, input.cycleAmount, input.memberId],
    );
    await client.query(
      `UPDATE public.members
       SET add_rx_valet = $2,
           total_monthly_price = COALESCE(total_monthly_price, 0) + $3,
           updated_at = NOW()
       WHERE id = $1`,
      [input.memberId, change.target_enabled, change.amount_delta],
    );
    await client.query(
      `UPDATE public.pbm_membership_changes
       SET request_status = 'applied', applied_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [change.id],
    );
    await client.query(
      `INSERT INTO public.pbm_membership_change_events
         (change_id, event_type, old_value, new_value, note, actor_id, actor_role)
       VALUES ($1, 'applied', $2, $3, 'Applied after successful recurring payment', 'billing-worker', 'system')`,
      [change.id, change.current_enabled ? "enabled" : "disabled",
        change.target_enabled ? "enabled" : "disabled"],
    );
    return change;
  });
}
