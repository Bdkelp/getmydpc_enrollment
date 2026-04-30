import { useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/apiClient";
import { useToast } from "@/hooks/use-toast";
import type { CertificationExportResponse, CertificationPayment } from "./useEpxCertificationQueries";

export const TRAN_TYPES = [
  { value: "CCE1", label: "MIT (CCE1)" },
  { value: "CCE9", label: "Refund (CCE9)" },
] as const;
export type TranType = (typeof TRAN_TYPES)[number]["value"];

interface EpxMutationCallbacks {
  onResult: (result: any) => void;
  onExport: (result: CertificationExportResponse) => void;
}

export function useEpxCertificationMutations({ onResult, onExport }: EpxMutationCallbacks) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const invalidateLogs = () => {
    queryClient.invalidateQueries({ queryKey: ["epx-cert-logs"] });
    queryClient.invalidateQueries({ queryKey: ["epx-cert-payments"] });
  };

  const runTestMutation = useMutation({
    mutationFn: (payload: Record<string, any>) =>
      apiClient.post("/api/epx/certification/server-post", payload),
    onSuccess: (data) => {
      onResult(data);
      toast({ title: "Server Post submitted", description: "Check the log viewer below for captured samples." });
      invalidateLogs();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to submit Server Post",
        description: error?.message || "See console for details",
        variant: "destructive",
      });
    },
  });

  const exportLogsMutation = useMutation({
    mutationFn: (filename: string) =>
      apiClient.post("/api/epx/certification/export", { filename }),
    onSuccess: (data: CertificationExportResponse) => {
      onExport(data);
      toast({ title: "Export ready", description: `${data.totalEntries} entries bundled into ${data.fileName}` });
      if (Array.isArray(data.entries)) {
        const blob = new Blob([JSON.stringify(data.entries, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = data.fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Export failed",
        description: error?.message || "Unable to export certification logs",
        variant: "destructive",
      });
    },
  });

  const paymentActionMutation = useMutation({
    mutationFn: ({ payment, action }: { payment: CertificationPayment; action: TranType }) => {
      const amountValue = payment.amount ? Number(payment.amount) : 0;
      if (!payment.transactionId && !payment.epxAuthGuid) {
        throw new Error("Payment is missing both transaction ID and AUTH GUID.");
      }
      if (amountValue <= 0) {
        throw new Error("Payment amount missing or invalid.");
      }
      const payload: Record<string, any> = {
        tranType: action,
        transactionId: payment.transactionId,
        memberId: payment.memberId,
        authGuid: payment.epxAuthGuid,
        description: `Toolkit ${action} for payment ${payment.id}`,
        amount: amountValue,
      };
      return apiClient.post("/api/epx/certification/server-post", payload);
    },
    onSuccess: (data) => {
      onResult(data);
      toast({ title: "Server Post submitted", description: "EPX response captured below." });
      invalidateLogs();
    },
    onError: (error: any) => {
      toast({
        title: "Unable to submit",
        description: error?.message || "The requested action could not be sent to EPX.",
        variant: "destructive",
      });
    },
  });

  const runAchRecurringMutation = useMutation({
    mutationFn: (payload: { memberId: number; amount: number; description?: string }) =>
      apiClient.post("/api/payments/ach/recurring", payload),
    onSuccess: (data) => {
      onResult({ request: { endpoint: "/api/payments/ach/recurring" }, response: data });
      toast({ title: "ACH token-based test sent", description: "Recurring/token sale request submitted. Refresh logs/export to capture sample." });
      queryClient.invalidateQueries({ queryKey: ["epx-cert-logs"] });
      queryClient.invalidateQueries({ queryKey: ["epx-cert-payments"] });
      queryClient.invalidateQueries({ queryKey: ["epx-auth-guid"] });
    },
    onError: (error: any) => {
      toast({
        title: "ACH token-based test failed",
        description: error?.message || "Unable to run recurring ACH test",
        variant: "destructive",
      });
    },
  });

  return { runTestMutation, exportLogsMutation, paymentActionMutation, runAchRecurringMutation };
}
