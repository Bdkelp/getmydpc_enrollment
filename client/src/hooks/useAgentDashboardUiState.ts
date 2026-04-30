import { useState } from "react";

interface EnrollmentLike {
  id: string;
  planId?: number;
  planName: string;
  memberType: string;
  totalMonthlyPrice: number;
  payment_id?: number | null;
  payment_status?: string | null;
}

interface UserLike {
  firstName?: string;
  name?: string;
  email?: string;
}

export function useAgentDashboardUiState() {
  const [selectedEnrollment, setSelectedEnrollment] = useState<EnrollmentLike | null>(null);
  const [showPendingDialog, setShowPendingDialog] = useState(false);
  const [consentType, setConsentType] = useState<string>("");
  const [consentNotes, setConsentNotes] = useState<string>("");
  const [showMembershipDialog, setShowMembershipDialog] = useState(false);
  const [membershipTarget, setMembershipTarget] = useState<EnrollmentLike | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [selectedMemberType, setSelectedMemberType] = useState<string>("");
  const [membershipReason, setMembershipReason] = useState<string>("");

  const getTimeOfDayGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const getUserName = (user?: UserLike) => {
    if (user?.firstName) return user.firstName;
    if (user?.name) return user.name.split(" ")[0];
    if (user?.email) return user.email.split("@")[0];
    return "Agent";
  };

  const handlePendingClick = (enrollment: EnrollmentLike) => {
    setSelectedEnrollment(enrollment);
    setShowPendingDialog(true);
  };

  const openMembershipDialog = (enrollment: EnrollmentLike) => {
    setMembershipTarget(enrollment);
    setSelectedPlanId(String(enrollment.planId || ""));
    setSelectedMemberType(enrollment.memberType || "member-only");
    setMembershipReason("");
    setShowMembershipDialog(true);
  };

  const closeMembershipDialog = () => {
    setShowMembershipDialog(false);
    setMembershipTarget(null);
  };

  const clearPendingDialogState = () => {
    setShowPendingDialog(false);
    setSelectedEnrollment(null);
    setConsentType("");
    setConsentNotes("");
  };

  const hasSuccessfulPayment = (paymentStatus?: string | null) => {
    const normalized = (paymentStatus || "").toLowerCase();
    return normalized === "succeeded" || normalized === "success" || normalized === "completed";
  };

  const getEnrollmentPaymentStatus = (enrollment: EnrollmentLike): string => {
    return String(
      enrollment.payment_status ||
        (enrollment as any).paymentStatus ||
        (enrollment as any).commissionStatus ||
        (enrollment as any).commission_status ||
        "",
    )
      .trim()
      .toLowerCase();
  };

  const openEnrollmentCheckout = (
    enrollment: EnrollmentLike,
    setLocation: (path: string) => void,
  ) => {
    const params = new URLSearchParams({
      memberId: String(enrollment.id),
      amount: String(enrollment.totalMonthlyPrice || 0),
      description: `Enrollment payment for member #${enrollment.id}`,
    });

    if (enrollment.payment_id) {
      params.set("retryPaymentId", String(enrollment.payment_id));
      params.set("retryMemberId", String(enrollment.id));
    }

    setLocation(`/payments/checkout?${params.toString()}`);
  };

  return {
    selectedEnrollment,
    setSelectedEnrollment,
    showPendingDialog,
    setShowPendingDialog,
    consentType,
    setConsentType,
    consentNotes,
    setConsentNotes,
    showMembershipDialog,
    setShowMembershipDialog,
    membershipTarget,
    setMembershipTarget,
    selectedPlanId,
    setSelectedPlanId,
    selectedMemberType,
    setSelectedMemberType,
    membershipReason,
    setMembershipReason,
    getTimeOfDayGreeting,
    getUserName,
    handlePendingClick,
    openMembershipDialog,
    closeMembershipDialog,
    clearPendingDialogState,
    hasSuccessfulPayment,
    getEnrollmentPaymentStatus,
    openEnrollmentCheckout,
  };
}
