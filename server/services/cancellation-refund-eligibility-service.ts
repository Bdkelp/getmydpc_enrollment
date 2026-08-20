export const CANCELLATION_REASON_CODES = [
  "member_requested",
  "non_payment",
  "duplicate_enrollment",
  "ineligible",
  "group_termination",
  "deceased",
  "fraud_or_terms",
  "admin_other",
] as const;

export type CancellationReasonCode = (typeof CANCELLATION_REASON_CODES)[number];
export type ServiceUsageStatus = "yes" | "no" | "unknown";
export type RefundEligibility = "eligible" | "not_eligible" | "review_required";

const REASON_LABELS: Record<CancellationReasonCode, string> = {
  member_requested: "Member Requested",
  non_payment: "Non-Payment",
  duplicate_enrollment: "Duplicate / Enrollment Error",
  ineligible: "Enrollment Not Valid / Ineligible",
  group_termination: "Group / Employer Termination",
  deceased: "Deceased Member",
  fraud_or_terms: "Administrative / Terms Violation",
  admin_other: "Administrative Cancellation",
};

export function normalizeCancellationReasonCode(value?: string | null): CancellationReasonCode {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if ((CANCELLATION_REASON_CODES as readonly string[]).includes(normalized)) {
    return normalized as CancellationReasonCode;
  }
  if (normalized.includes("payment") || normalized.includes("billing") || normalized.includes("declin")) return "non_payment";
  if (normalized.includes("member") && normalized.includes("request")) return "member_requested";
  if (normalized.includes("duplicate")) return "duplicate_enrollment";
  if (normalized.includes("ineligible") || normalized.includes("invalid")) return "ineligible";
  if (normalized.includes("group") || normalized.includes("employer")) return "group_termination";
  if (normalized.includes("deceased")) return "deceased";
  if (normalized.includes("fraud") || normalized.includes("term")) return "fraud_or_terms";
  return "admin_other";
}

export function getCancellationReasonLabel(code?: string | null): string {
  return REASON_LABELS[normalizeCancellationReasonCode(code)];
}

function calendarDate(value: string | Date | null | undefined): Date | null {
  const raw = value instanceof Date ? value.toISOString() : String(value || "");
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function evaluateRefundEligibility(input: {
  reasonCode?: string | null;
  membershipStartDate?: string | Date | null;
  cancellationRequestedAt?: string | Date | null;
  serviceUsageStatus?: ServiceUsageStatus | null;
  refundWindowDays?: number;
}): {
  eligibility: RefundEligibility;
  reason: string;
  withinRefundWindow: boolean | null;
  refundStatus: "not_applicable" | "pending_manual_refund";
} {
  const reasonCode = normalizeCancellationReasonCode(input.reasonCode);
  if (reasonCode !== "member_requested") {
    return { eligibility: "not_eligible", reason: "cancellation_not_member_requested", withinRefundWindow: null, refundStatus: "not_applicable" };
  }
  const start = calendarDate(input.membershipStartDate);
  const requested = calendarDate(input.cancellationRequestedAt);
  if (!start || !requested) {
    return { eligibility: "review_required", reason: "membership_start_date_unavailable", withinRefundWindow: null, refundStatus: "not_applicable" };
  }
  const windowDays = input.refundWindowDays ?? 14;
  const deadline = new Date(start);
  deadline.setUTCDate(deadline.getUTCDate() + windowDays);
  if (requested.getTime() > deadline.getTime()) {
    return { eligibility: "not_eligible", reason: "outside_14_day_window", withinRefundWindow: false, refundStatus: "not_applicable" };
  }
  if (input.serviceUsageStatus === "yes") {
    return { eligibility: "not_eligible", reason: "service_usage", withinRefundWindow: true, refundStatus: "not_applicable" };
  }
  if (input.serviceUsageStatus !== "no") {
    return { eligibility: "review_required", reason: "service_usage_unknown", withinRefundWindow: true, refundStatus: "not_applicable" };
  }
  return { eligibility: "eligible", reason: "within_14_days_no_service_usage", withinRefundWindow: true, refundStatus: "pending_manual_refund" };
}