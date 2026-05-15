import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatLocalDate } from "@shared/localDate";
import { API_URL } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";

interface DateFilter {
  startDate: string;
  endDate: string;
}

interface BatchDetailRow {
  id: string;
  status: string;
}

interface BatchDetailResponse {
  rows?: BatchDetailRow[];
}

interface UseAdminCommissionsMutationsParams {
  dateFilter: DateFilter;
  selectedBatchId: string | null;
  toast: (args: { title: string; description: string; variant?: "default" | "destructive" }) => void;
  setSelectedCommissions: (value: Set<string>) => void;
  setIsOverrideConfirmOpen: (open: boolean) => void;
  setOverrideReason: (reason: string) => void;
  setSelectedCarryForwardCandidate: (candidate: any) => void;
}

export function useAdminCommissionsMutations({
  dateFilter,
  selectedBatchId,
  toast,
  setSelectedCommissions,
  setIsOverrideConfirmOpen,
  setOverrideReason,
  setSelectedCarryForwardCandidate,
}: UseAdminCommissionsMutationsParams) {
  const queryClient = useQueryClient();

  const syncLedgerMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/admin/commissions/ledger/sync", {
        method: "POST",
        body: JSON.stringify({
          startDate: dateFilter.startDate,
          endDate: dateFilter.endDate,
        }),
      });
    },
    onSuccess: (result: any) => {
      toast({
        title: "Ledger Synced",
        description: `Inserted ${result?.inserted || 0} row(s), newly eligible since last payout ${result?.newlyEligible || 0}, skipped ${result?.skipped || 0}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/commissions/payout-dashboard"] });
    },
    onError: (error: any) => {
      toast({ title: "Sync Failed", description: error?.message || "Unable to sync ledger.", variant: "destructive" });
    },
  });

  const generateBatchesMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/admin/commissions/payout-batches/generate", {
        method: "POST",
        body: JSON.stringify({ cutoffDate: formatLocalDate(new Date()) }),
      });
    },
    onSuccess: (result: any) => {
      toast({
        title: "Draft Batches Generated",
        description: `${result?.count || 0} payout batch(es) were generated.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/commissions/payout-dashboard"] });
    },
    onError: (error: any) => {
      toast({ title: "Batch Generation Failed", description: error?.message || "Unable to generate payout batches.", variant: "destructive" });
    },
  });

  const markBatchPaidMutation = useMutation({
    mutationFn: async (batchId: string) => {
      let detail = queryClient.getQueryData(["/api/admin/commissions/payout-batches", batchId]) as BatchDetailResponse | undefined;
      if (!detail) {
        detail = await apiRequest(`/api/admin/commissions/payout-batches/${batchId}`, { method: "GET" });
      }

      const queuedCount = (detail?.rows || []).filter((row) => String(row?.status || '').toLowerCase() === 'queued').length;
      if (queuedCount === 0) {
        throw new Error("This batch has no queued ledger rows to mark as paid.");
      }

      return await apiRequest(`/api/admin/commissions/payout-batches/${batchId}/mark-paid`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      toast({ title: "Batch Marked Paid", description: "All included ledger records were updated to paid." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/commissions/payout-dashboard"] });
      if (selectedBatchId) {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/commissions/payout-batches", selectedBatchId] });
      }
    },
    onError: (error: any) => {
      toast({ title: "Mark Paid Failed", description: error?.message || "Unable to mark batch paid.", variant: "destructive" });
    },
  });

  const overrideCarryForwardMutation = useMutation({
    mutationFn: async (payload: { batchId: string; agentId: string; reason: string }) => {
      return await apiRequest(`/api/admin/commissions/payout-batches/${payload.batchId}/override-carry-forward`, {
        method: "POST",
        body: JSON.stringify({ agentId: payload.agentId, reason: payload.reason }),
      });
    },
    onSuccess: (result: any) => {
      toast({
        title: "Under-Minimum Release Applied",
        description: `Released ${result?.releasedRows || 0} row(s) for under-minimum payout override.`,
      });
      setIsOverrideConfirmOpen(false);
      setOverrideReason("");
      setSelectedCarryForwardCandidate(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/commissions/payout-dashboard"] });
      if (selectedBatchId) {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/commissions/payout-batches", selectedBatchId] });
      }
    },
    onError: (error: any) => {
      toast({ title: "Under-Minimum Release Failed", description: error?.message || "Unable to override under-minimum payout rows.", variant: "destructive" });
    },
  });

  const handleExportBatchCsv = async (batchId: string, formatType: "quickbooks-csv" | "hexona-csv") => {
    try {
      const params = new URLSearchParams({ format: formatType });
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const response = await fetch(`${API_URL}/api/admin/commissions/payout-batches/${batchId}/export?${params.toString()}`, {
        method: "GET",
        credentials: "include",
        headers: {
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Export failed with status ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const prefix = formatType === "quickbooks-csv" ? "quickbooks" : "hexona";
      link.download = `${prefix}-payout-batch-${batchId}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      queryClient.invalidateQueries({ queryKey: ["/api/admin/commissions/payout-dashboard"] });
      if (selectedBatchId) {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/commissions/payout-batches", selectedBatchId] });
      }

      toast({
        title: "Batch Export Complete",
        description: formatType === "quickbooks-csv" ? "QuickBooks CSV exported." : "Hexona CSV exported.",
      });
    } catch (error: any) {
      toast({ title: "Batch Export Failed", description: error?.message || "Unable to export batch CSV.", variant: "destructive" });
    }
  };

  return {
    syncLedgerMutation,
    generateBatchesMutation,
    markBatchPaidMutation,
    overrideCarryForwardMutation,
    handleExportBatchCsv,
  };
}
