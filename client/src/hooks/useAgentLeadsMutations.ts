import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export function useAgentLeadsMutations() {
  const { toast } = useToast();

  const updateLeadMutation = useMutation({
    mutationFn: ({ leadId, status }: { leadId: number; status: string }) =>
      apiRequest(`/api/leads/${leadId}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent/leads"] });
      toast({ title: "Lead Updated", description: "Lead status has been updated successfully." });
    },
  });

  const addActivityMutation = useMutation({
    mutationFn: ({ leadId, activityType, notes }: { leadId: number; activityType: string; notes: string }) =>
      apiRequest(`/api/leads/${leadId}/activities`, {
        method: "POST",
        body: JSON.stringify({ activityType, notes }),
      }),
    onSuccess: (_, __, context) => {
      toast({ title: "Activity Added", description: "Activity has been recorded successfully." });
    },
  });

  const addLeadMutation = useMutation({
    mutationFn: (leadData: { firstName: string; lastName: string; email: string; phone: string; message: string }) =>
      apiRequest("/api/leads", {
        method: "POST",
        body: JSON.stringify(leadData),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent/leads"] });
      toast({ title: "Lead Added", description: "New lead has been created successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add lead. Please try again.", variant: "destructive" });
    },
  });

  return { updateLeadMutation, addActivityMutation, addLeadMutation };
}
