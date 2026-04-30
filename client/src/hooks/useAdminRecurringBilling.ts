import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// ── Types ──────────────────────────────────────────────────────────────────
interface RecurringDuePreviewRow {
  subscriptionId: number;
  memberId: number;
  memberOrAccountName: string;
  payerType: string;
  amount: number | string;
  nextBillingDate: string | null;
  readinessState: string;
}

interface RecurringWorkflowResponse {
  success: boolean;
  mode: "preview" | "live";
  duePreview?: {
    dueCount: number;
    rows: RecurringDuePreviewRow[];
    estimatedCommissionImpact: {
      potentialSuccessfulPayments: number;
      estimatedCommissionEntries: number;
      note: string;
    };
    note: string;
  };
  billingSummary?: {
    totalDue: number;
    processed: number;
    succeeded: number;
    failed: number;
    skipped: number;
  };
  commissionSummary?: {
    successfulPaymentsThatCreatedCommissionEntries: number;
    totalCommissionEntriesCreated: number;
    payoutBatchesAffectedGenerated: Array<{
      id: string;
      batchName: string;
      totalRecords: number;
      totalAmount: number;
    }>;
    membersOrAccountsWithNoCommissionBecausePaymentFailedSkipped: Array<{
      memberId: number;
      memberOrAccountName: string;
      payerType: "member" | "group";
      reason: string;
    }>;
  };
}

// ── Hook ───────────────────────────────────────────────────────────────────
export function useAdminRecurringBilling(isSuperAdmin: boolean) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [confirmLiveRecurringOpen, setConfirmLiveRecurringOpen] = useState(false);
  const [previewRecurringDialogOpen, setPreviewRecurringDialogOpen] = useState(false);
  const [liveRecurringOutcomeOpen, setLiveRecurringOutcomeOpen] = useState(false);
  const [recurringWorkflowResult, setRecurringWorkflowResult] = useState<RecurringWorkflowResponse | null>(null);

  const ensureSuperAdmin = (label: string): boolean => {
    if (isSuperAdmin) return true;
    toast({ title: "Super admin access required", description: `${label} is limited to super admins.`, variant: "destructive" });
    return false;
  };

  const recurringWorkflowMutation = useMutation({
    mutationFn: async (mode: "preview" | "live") =>
      apiRequest("/api/admin/diagnostic/recurring-billing/operator-workflow", {
        method: "POST",
        body: JSON.stringify({ mode }),
      }),
    onSuccess: (data: RecurringWorkflowResponse) => {
      setRecurringWorkflowResult(data);
      const isPreview = data.mode === "preview";
      const summary = data.billingSummary || {};
      const totalDue = Number((summary as any).totalDue || 0);
      const succeeded = Number((summary as any).succeeded || 0);
      const failed = Number((summary as any).failed || 0);
      const skipped = Number((summary as any).skipped || 0);

      if (isPreview) {
        setPreviewRecurringDialogOpen(true);
        setLiveRecurringOutcomeOpen(false);
      } else {
        setLiveRecurringOutcomeOpen(true);
        setPreviewRecurringDialogOpen(false);
      }

      toast({
        title: isPreview
          ? "Recurring billing preview complete"
          : "Recurring billing + commission update complete",
        description: isPreview
          ? totalDue > 0
            ? `Found ${totalDue} due memberships/accounts in preview. No payments or commissions were created.`
            : "No due memberships/accounts were found in preview. No payments or commissions were created."
          : `Live run summary: succeeded ${succeeded}, failed ${failed}, skipped ${skipped}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lifecycle-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/commissions/payout-dashboard"] });
    },
    onError: (error: any) => {
      toast({
        title: "Recurring workflow failed",
        description: error?.message || "Unable to run recurring billing workflow right now.",
        variant: "destructive",
      });
    },
  });

  const handlePreviewRecurringBilling = () => {
    setPreviewRecurringDialogOpen(false);
    setLiveRecurringOutcomeOpen(false);
    setRecurringWorkflowResult(null);
    recurringWorkflowMutation.mutate("preview");
  };

  const handleOpenLiveRecurringConfirmation = () => {
    if (!ensureSuperAdmin("Run recurring billing + commission update")) return;
    setConfirmLiveRecurringOpen(true);
  };

  const executeLiveRecurringWorkflow = () => {
    if (!ensureSuperAdmin("Run recurring billing + commission update")) {
      setConfirmLiveRecurringOpen(false);
      return;
    }
    setConfirmLiveRecurringOpen(false);
    setLiveRecurringOutcomeOpen(false);
    setRecurringWorkflowResult(null);
    recurringWorkflowMutation.mutate("live");
  };

  const liveBillingSummary = recurringWorkflowResult?.billingSummary;
  const liveCommissionSummary = recurringWorkflowResult?.commissionSummary;
  const previewRows = recurringWorkflowResult?.duePreview?.rows || [];
  const previewDueCount = Number(recurringWorkflowResult?.duePreview?.dueCount || 0);

  const handleCopyLiveRecurringSummary = async () => {
    const summaryText = [
      "Recurring Billing Run Summary",
      `Total due: ${Number(liveBillingSummary?.totalDue || 0)}`,
      `Processed: ${Number(liveBillingSummary?.processed || 0)}`,
      `Succeeded: ${Number(liveBillingSummary?.succeeded || 0)}`,
      `Failed: ${Number(liveBillingSummary?.failed || 0)}`,
      `Skipped: ${Number(liveBillingSummary?.skipped || 0)}`,
      `Commission entries created: ${Number(liveCommissionSummary?.totalCommissionEntriesCreated || 0)}`,
    ].join("\n");

    try {
      if (!navigator?.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(summaryText);
      toast({ title: "Run summary copied", description: "Recurring run proof details copied to clipboard." });
    } catch (error: any) {
      toast({
        title: "Unable to copy summary",
        description: error?.message || "Copy failed. Please copy values manually from this dialog.",
        variant: "destructive",
      });
    }
  };

  return {
    confirmLiveRecurringOpen,
    setConfirmLiveRecurringOpen,
    previewRecurringDialogOpen,
    setPreviewRecurringDialogOpen,
    liveRecurringOutcomeOpen,
    setLiveRecurringOutcomeOpen,
    recurringWorkflowResult,
    recurringWorkflowMutation,
    handlePreviewRecurringBilling,
    handleOpenLiveRecurringConfirmation,
    executeLiveRecurringWorkflow,
    previewRows,
    previewDueCount,
    liveBillingSummary,
    liveCommissionSummary,
    handleCopyLiveRecurringSummary,
  };
}
