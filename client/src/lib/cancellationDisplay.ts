import { formatCalendarDate } from "./dateDisplay";

const SAFE_REASON_LABELS: Record<string, string> = {
  member_requested: "Member requested cancellation",
  member_cancelled: "Member requested cancellation",
  non_payment: "Non-Payment",
  duplicate_enrollment: "Duplicate / Enrollment Error",
  ineligible: "Enrollment Not Valid / Ineligible",
  group_termination: "Group / Employer Termination",
  deceased: "Deceased Member",
  fraud_or_terms: "Administrative / Terms Violation",
  admin_other: "Administrative Cancellation",
  admin_initiated: "Cancelled by MPP administration",
  system_initiated: "System-initiated cancellation",
  payment_issue: "Membership cancelled due to payment issue",
};

export function getSafeCancellationReason(reason?: string | null): string {
  const normalized = String(reason || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (!normalized) return "Reason not specified";
  if (SAFE_REASON_LABELS[normalized]) return SAFE_REASON_LABELS[normalized];
  if (normalized.includes("payment") || normalized.includes("declin") || normalized.includes("billing")) {
    return SAFE_REASON_LABELS.payment_issue;
  }
  if (normalized.includes("member_requested") || normalized.includes("member_request") || normalized === "cancelled_per_member_request") {
    return SAFE_REASON_LABELS.member_requested;
  }
  if (normalized.includes("admin") || normalized.includes("staff")) {
    return SAFE_REASON_LABELS.admin_initiated;
  }
  if (normalized.includes("system") || normalized.includes("scheduled")) {
    return SAFE_REASON_LABELS.system_initiated;
  }
  return "Reason not specified";
}

export function getCancellationDateLabel(value?: string | Date | null): string {
  return value ? formatCalendarDate(value) : "Date unavailable";
}