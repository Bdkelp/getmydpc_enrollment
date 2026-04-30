import { useState, ChangeEvent, FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatDistanceToNow, format } from "date-fns";
import { Clock, CheckCircle, AlertTriangle } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────
type PaymentEnvironmentValue = "sandbox" | "production";

interface PaymentEnvironmentResponse {
  success: boolean;
  environment: PaymentEnvironmentValue;
  updatedAt: string | null;
  updatedBy: string | null;
  allowed?: PaymentEnvironmentValue[];
  previousEnvironment?: PaymentEnvironmentValue;
}

const MANUAL_TRANSACTION_TYPES = [
  { value: "CCE1", label: "Initial Capture (CCE1)", description: "Purchase auth & capture" },
  { value: "CCE9", label: "Refund (CCE9)", description: "Return capture" },
] as const;

const getManualTranLabel = (value: string): string => {
  const match = MANUAL_TRANSACTION_TYPES.find((opt) => opt.value === value);
  return match ? match.label : value;
};

type ManualTransactionForm = {
  memberId: string;
  transactionId: string;
  authGuid: string;
  amount: string;
  description: string;
  tranType: string;
};

type CancelSubscriptionForm = {
  subscriptionId: string;
  transactionId: string;
  reason: string;
};

// ── Hook ───────────────────────────────────────────────────────────────────
export function useAdminEPXOperations(
  isSuperAdmin: boolean,
  isAuthenticated: boolean,
  isAdminUser: boolean
) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State
  const [manualTransactionForm, setManualTransactionForm] = useState<ManualTransactionForm>({
    memberId: "",
    transactionId: "",
    authGuid: "",
    amount: "",
    description: "Manual EPX action from dashboard",
    tranType: MANUAL_TRANSACTION_TYPES[0].value,
  });
  const [manualTransactionResult, setManualTransactionResult] = useState<any | null>(null);
  const [cancelSubscriptionForm, setCancelSubscriptionForm] = useState<CancelSubscriptionForm>({
    subscriptionId: "",
    transactionId: "",
    reason: "Subscription cancellation via admin dashboard",
  });
  const [cancelSubscriptionResult, setCancelSubscriptionResult] = useState<any | null>(null);
  const [manualConfirmPayload, setManualConfirmPayload] = useState<{
    payload: Record<string, any>;
    amount: number;
    tranType: string;
    memberId?: number;
  } | null>(null);
  const [cancelConfirmPayload, setCancelConfirmPayload] = useState<{
    payload: Record<string, any>;
    subscriptionId?: number;
    transactionId?: string;
  } | null>(null);
  const [hostedConfirmPayload, setHostedConfirmPayload] = useState<{
    memberId: number;
    amount: number;
    description?: string;
    transactionId?: string;
  } | null>(null);

  const ensureSuperAdmin = (label: string): boolean => {
    if (isSuperAdmin) return true;
    toast({ title: "Super admin access required", description: `${label} is limited to super admins.`, variant: "destructive" });
    return false;
  };

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: paymentEnvironmentDetails, isLoading: paymentEnvironmentLoading } =
    useQuery<PaymentEnvironmentResponse>({
      queryKey: ["/api/admin/payments/environment"],
      enabled: isAuthenticated && isAdminUser,
    });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const manualTransactionMutation = useMutation({
    mutationFn: async (payload: Record<string, any>) =>
      apiRequest("/api/admin/payments/manual-transaction", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: (data) => {
      setManualTransactionResult(data);
      toast({ title: "EPX request submitted", description: "Review the response below for details." });
    },
    onError: (error: any) => {
      toast({ title: "Unable to submit", description: error?.message || "Check console for additional details.", variant: "destructive" });
    },
  });

  const cancelSubscriptionMutation = useMutation({
    mutationFn: async (payload: Record<string, any>) =>
      apiRequest("/api/admin/payments/cancel-subscription", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: (data, variables) => {
      setCancelSubscriptionResult({ ...data, request: variables });
      toast({ title: "Cancellation request submitted", description: "Review the response below for EPX confirmation." });
    },
    onError: (error: any) => {
      toast({ title: "Unable to cancel subscription", description: error?.message || "Check console for additional details.", variant: "destructive" });
    },
  });

  const updatePaymentEnvironmentMutation = useMutation({
    mutationFn: async (nextEnvironment: PaymentEnvironmentValue) =>
      apiRequest("/api/admin/payments/environment", { method: "POST", body: JSON.stringify({ environment: nextEnvironment }) }),
    onSuccess: (data: PaymentEnvironmentResponse) => {
      toast({ title: "Payment environment updated", description: `Environment now set to ${(data?.environment || "production").toUpperCase()}.` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payments/environment"] });
    },
    onError: (error: any) => {
      toast({ title: "Unable to update environment", description: error?.message || "Check console for additional details.", variant: "destructive" });
    },
  });

  // ── Derived: payment environment display ─────────────────────────────────
  const paymentEnvironment = paymentEnvironmentDetails?.environment;
  const isPaymentEnvironmentProduction = paymentEnvironment === "production";
  const paymentEnvironmentBadgeLabel = paymentEnvironmentLoading
    ? "Checking..."
    : paymentEnvironmentDetails
    ? isPaymentEnvironmentProduction
      ? "Live Production"
      : "Sandbox / Test"
    : "Unavailable";
  const paymentEnvironmentBadgeClasses = isPaymentEnvironmentProduction
    ? "bg-emerald-600 text-white hover:bg-emerald-600"
    : "bg-amber-500 text-white hover:bg-amber-500";
  const paymentEnvironmentButtonTarget: PaymentEnvironmentValue = isPaymentEnvironmentProduction ? "sandbox" : "production";
  const paymentEnvironmentButtonLabel =
    paymentEnvironmentButtonTarget === "production" ? "Switch to Production" : "Switch to Sandbox";

  let paymentEnvironmentUpdatedText: string | null = null;
  if (paymentEnvironmentDetails?.updatedAt) {
    try {
      paymentEnvironmentUpdatedText = `Updated ${formatDistanceToNow(new Date(paymentEnvironmentDetails.updatedAt), { addSuffix: true })}`;
    } catch {
      paymentEnvironmentUpdatedText = `Updated ${format(new Date(paymentEnvironmentDetails.updatedAt), "MMM d, h:mm a")}`;
    }
    if (paymentEnvironmentDetails?.updatedBy) {
      paymentEnvironmentUpdatedText += ` by ${paymentEnvironmentDetails.updatedBy}`;
    }
  }

  const environmentAlertTitle = paymentEnvironmentLoading
    ? "Confirming EPX environment"
    : isPaymentEnvironmentProduction
    ? "Live EPX controls"
    : "Sandbox mode active";
  const environmentAlertDescription = paymentEnvironmentLoading
    ? "Retrieving your current EPX environment before enabling manual controls."
    : isPaymentEnvironmentProduction
    ? "Charges, refunds, and voids are transmitted to EPX immediately. Double-check every identifier before continuing."
    : "Transactions currently route to the EPX sandbox. Switch to production before running live dollars.";
  const environmentAlertClasses = isPaymentEnvironmentProduction
    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
    : "border-amber-300 bg-amber-50 text-amber-900";
  const EnvironmentAlertIcon = paymentEnvironmentLoading ? Clock : isPaymentEnvironmentProduction ? CheckCircle : AlertTriangle;

  // ── Hosted checkout helpers ───────────────────────────────────────────────
  const openHostedCheckoutTab = (url: string) => {
    const hostedWindow = window.open(url, "_blank", "noopener,noreferrer");
    if (hostedWindow) {
      hostedWindow.focus();
      toast({ title: "Hosted checkout opened", description: "Complete the payment in the new tab." });
    } else {
      toast({ title: "Allow pop-ups to continue", description: `Open this link manually if no tab appeared: ${url}`, variant: "destructive" });
    }
  };

  const buildAdminCheckoutUrl = (params: { memberId: number; amount: number; description?: string; transactionId?: string }) => {
    const search = new URLSearchParams({ memberId: String(params.memberId), amount: params.amount.toFixed(2), autoLaunch: "1" });
    if (params.description) search.set("description", params.description);
    if (params.transactionId) search.set("transactionId", params.transactionId);
    return `/admin/payments/checkout?${search.toString()}`;
  };

  const launchAdminHostedCheckout = (params: { memberId: number; amount: number; description?: string; transactionId?: string }) => {
    openHostedCheckoutTab(buildAdminCheckoutUrl(params));
  };

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handlePaymentEnvironmentChange = (nextEnvironment: PaymentEnvironmentValue) => {
    if (!ensureSuperAdmin("Update payment environment")) return;
    updatePaymentEnvironmentMutation.mutate(nextEnvironment);
  };

  const handleManualFieldChange =
    (field: keyof ManualTransactionForm) => (event: ChangeEvent<HTMLInputElement>) => {
      setManualTransactionForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const handleManualTranTypeChange = (value: string) => {
    setManualTransactionForm((prev) => ({ ...prev, tranType: value }));
  };

  const handleManualTransactionSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ensureSuperAdmin("Manual EPX transactions")) return;

    if (!manualTransactionForm.memberId.trim() && !manualTransactionForm.transactionId.trim() && !manualTransactionForm.authGuid.trim()) {
      toast({ title: "Provide member info", description: "Enter a member ID, transaction ID, or AUTH GUID before submitting.", variant: "destructive" });
      return;
    }

    const amountInput = manualTransactionForm.amount.trim();
    if (!amountInput) { toast({ title: "Amount required", description: "Sales and refunds must include a dollar amount.", variant: "destructive" }); return; }
    const parsedAmount = parseFloat(amountInput);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) { toast({ title: "Invalid amount", description: "Enter a positive dollar amount.", variant: "destructive" }); return; }

    const payload: Record<string, any> = { tranType: manualTransactionForm.tranType, description: manualTransactionForm.description.trim() || undefined, amount: parsedAmount };

    if (manualTransactionForm.memberId.trim()) {
      const memberIdNumber = Number(manualTransactionForm.memberId.trim());
      if (!Number.isFinite(memberIdNumber)) { toast({ title: "Invalid member ID", description: "Member ID must be numeric.", variant: "destructive" }); return; }
      payload.memberId = memberIdNumber;
    }
    if (manualTransactionForm.transactionId.trim()) payload.transactionId = manualTransactionForm.transactionId.trim();
    if (manualTransactionForm.authGuid.trim()) payload.authGuid = manualTransactionForm.authGuid.trim();

    setManualTransactionResult(null);
    setManualConfirmPayload({ payload, amount: parsedAmount, tranType: manualTransactionForm.tranType, memberId: payload.memberId });
  };

  const resetManualTransactionForm = () => {
    setManualTransactionForm({ memberId: "", transactionId: "", authGuid: "", amount: "", description: "Manual EPX action from dashboard", tranType: MANUAL_TRANSACTION_TYPES[0].value });
    setManualTransactionResult(null);
  };

  const handleCancelFieldChange =
    (field: keyof CancelSubscriptionForm) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setCancelSubscriptionForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const resetCancelSubscriptionForm = () => {
    setCancelSubscriptionForm({ subscriptionId: "", transactionId: "", reason: "Subscription cancellation via admin dashboard" });
    setCancelSubscriptionResult(null);
  };

  const handleCancelSubscriptionSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ensureSuperAdmin("Subscription cancellations")) return;

    if (!cancelSubscriptionForm.subscriptionId.trim() && !cancelSubscriptionForm.transactionId.trim()) {
      toast({ title: "Provide subscription context", description: "Enter a subscription ID or reference transaction ID.", variant: "destructive" }); return;
    }

    const payload: Record<string, any> = {};
    if (cancelSubscriptionForm.subscriptionId.trim()) {
      const parsed = Number(cancelSubscriptionForm.subscriptionId.trim());
      if (!Number.isFinite(parsed)) { toast({ title: "Invalid subscription ID", description: "Subscription ID must be numeric.", variant: "destructive" }); return; }
      payload.subscriptionId = parsed;
    }
    if (cancelSubscriptionForm.transactionId.trim()) payload.transactionId = cancelSubscriptionForm.transactionId.trim();
    if (cancelSubscriptionForm.reason.trim()) payload.reason = cancelSubscriptionForm.reason.trim();

    setCancelSubscriptionResult(null);
    setCancelConfirmPayload({ payload, subscriptionId: payload.subscriptionId, transactionId: payload.transactionId });
  };

  const executeManualTransaction = () => {
    if (!manualConfirmPayload) return;
    if (!ensureSuperAdmin("Manual EPX transactions")) { setManualConfirmPayload(null); return; }
    manualTransactionMutation.mutate(manualConfirmPayload.payload, { onSettled: () => setManualConfirmPayload(null) });
  };

  const executeCancelSubscription = () => {
    if (!cancelConfirmPayload) return;
    if (!ensureSuperAdmin("Subscription cancellations")) { setCancelConfirmPayload(null); return; }
    cancelSubscriptionMutation.mutate(cancelConfirmPayload.payload, { onSettled: () => setCancelConfirmPayload(null) });
  };

  const handleHostedCheckoutRequest = () => {
    if (!ensureSuperAdmin("Hosted checkout launcher")) return;
    const memberIdRaw = manualTransactionForm.memberId.trim();
    if (!memberIdRaw) { toast({ title: "Member required", description: "Enter the member ID to launch hosted checkout.", variant: "destructive" }); return; }
    const memberIdNumber = Number(memberIdRaw);
    if (!Number.isFinite(memberIdNumber)) { toast({ title: "Invalid member ID", description: "Member ID must be numeric before opening hosted checkout.", variant: "destructive" }); return; }
    const parsedAmount = parseFloat(manualTransactionForm.amount || "0");
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) { toast({ title: "Invalid amount", description: "Hosted checkout requires a positive USD amount.", variant: "destructive" }); return; }
    if (manualTransactionForm.tranType !== "CCE1") { toast({ title: "Hosted checkout is for initial captures only", description: "Switch the transaction type to CCE1 to collect a new payment.", variant: "destructive" }); return; }
    setHostedConfirmPayload({ memberId: memberIdNumber, amount: parsedAmount, description: manualTransactionForm.description.trim() || undefined, transactionId: manualTransactionForm.transactionId.trim() || undefined });
  };

  const finalizeHostedCheckoutLaunch = () => {
    if (!hostedConfirmPayload) return;
    if (!ensureSuperAdmin("Hosted checkout launcher")) { setHostedConfirmPayload(null); return; }
    launchAdminHostedCheckout({ memberId: hostedConfirmPayload.memberId, amount: hostedConfirmPayload.amount, description: hostedConfirmPayload.description, transactionId: hostedConfirmPayload.transactionId });
    setHostedConfirmPayload(null);
  };

  return {
    // Form state
    manualTransactionForm,
    manualTransactionResult,
    setManualTransactionResult,
    cancelSubscriptionForm,
    cancelSubscriptionResult,
    setCancelSubscriptionResult,
    // Helpers
    getManualTranLabel,
    // Confirm payloads
    manualConfirmPayload,
    setManualConfirmPayload,
    cancelConfirmPayload,
    setCancelConfirmPayload,
    hostedConfirmPayload,
    setHostedConfirmPayload,
    // Mutations
    manualTransactionMutation,
    cancelSubscriptionMutation,
    updatePaymentEnvironmentMutation,
    // Payment environment display
    paymentEnvironmentLoading,
    paymentEnvironmentBadgeLabel,
    paymentEnvironmentBadgeClasses,
    paymentEnvironmentButtonTarget,
    paymentEnvironmentButtonLabel,
    paymentEnvironmentUpdatedText,
    environmentAlertTitle,
    environmentAlertDescription,
    environmentAlertClasses,
    EnvironmentAlertIcon,
    // Handlers
    handlePaymentEnvironmentChange,
    handleManualFieldChange,
    handleManualTranTypeChange,
    handleManualTransactionSubmit,
    resetManualTransactionForm,
    handleCancelFieldChange,
    resetCancelSubscriptionForm,
    handleCancelSubscriptionSubmit,
    executeManualTransaction,
    executeCancelSubscription,
    handleHostedCheckoutRequest,
    finalizeHostedCheckoutLaunch,
  };
}
