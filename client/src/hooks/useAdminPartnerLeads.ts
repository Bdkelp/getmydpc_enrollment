import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type PartnerLeadStatus = "new" | "contacted" | "qualified" | "enrolled" | "closed_lost";
type PartnerLeadStatusFilter = PartnerLeadStatus | "all";

interface PartnerLeadAdminNote {
  id: string;
  message: string;
  createdAt: string;
  createdBy?: string | null;
}

interface PartnerLeadRecord {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message?: string | null;
  status: string;
  agencyName: string;
  agencyWebsite?: string | null;
  statesServed?: string | null;
  experienceLevel?: string | null;
  volumeEstimate?: string | null;
  createdAt?: string;
  updatedAt?: string;
  adminNotes?: PartnerLeadAdminNote[];
}

interface PartnerLeadResponse {
  leads: PartnerLeadRecord[];
  total: number;
  filter: string;
  timestamp: string;
}

const PARTNER_LEAD_STATUS_VALUES: PartnerLeadStatus[] = ["new", "contacted", "qualified", "enrolled", "closed_lost"];

const PARTNER_LEAD_STATUS_OPTIONS: { value: PartnerLeadStatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "enrolled", label: "Enrolled" },
  { value: "closed_lost", label: "Closed - Lost" },
];

const isPartnerLeadStatus = (value: string): value is PartnerLeadStatus =>
  PARTNER_LEAD_STATUS_VALUES.includes(value as PartnerLeadStatus);

export function useAdminPartnerLeads(isAuthenticated: boolean, isAdminUser: boolean) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [partnerLeadFilter, setPartnerLeadFilter] = useState<PartnerLeadStatusFilter>("all");
  const [selectedPartnerLead, setSelectedPartnerLead] = useState<PartnerLeadRecord | null>(null);
  const [partnerLeadStatusSelection, setPartnerLeadStatusSelection] = useState<PartnerLeadStatus>("new");
  const [partnerLeadNote, setPartnerLeadNote] = useState("");

  const { data: partnerLeadResponse, isLoading: partnerLeadsLoading } = useQuery<PartnerLeadResponse>({
    queryKey: ["/api/admin/partner-leads", partnerLeadFilter],
    enabled: isAuthenticated && isAdminUser,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (partnerLeadFilter !== "all") {
        params.set("status", partnerLeadFilter);
      }
      const path = params.size ? `/api/admin/partner-leads?${params.toString()}` : "/api/admin/partner-leads";
      return apiRequest(path);
    },
  });

  const updatePartnerLeadMutation = useMutation({
    mutationFn: async ({ id, status, adminNote }: { id: number; status: string; adminNote?: string }) => {
      return apiRequest(`/api/admin/partner-leads/${id}`, {
        method: "PUT",
        body: JSON.stringify({ status, adminNote }),
      });
    },
    onSuccess: () => {
      toast({
        title: "Partner lead updated",
        description: "Status and notes saved successfully.",
      });
      setSelectedPartnerLead(null);
      setPartnerLeadNote("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partner-leads"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update lead",
        description: error?.message || "Please try again or refresh the page.",
        variant: "destructive",
      });
    },
  });

  const partnerLeads = partnerLeadResponse?.leads ?? [];
  const partnerLeadCount = partnerLeadResponse?.total ?? partnerLeads.length;

  const openPartnerLeadDialog = (lead: PartnerLeadRecord) => {
    setSelectedPartnerLead(lead);
    setPartnerLeadStatusSelection(isPartnerLeadStatus(lead.status) ? lead.status : "new");
    setPartnerLeadNote("");
  };

  const handlePartnerLeadUpdate = async () => {
    if (!selectedPartnerLead) return;
    try {
      await updatePartnerLeadMutation.mutateAsync({
        id: selectedPartnerLead.id,
        status: partnerLeadStatusSelection,
        adminNote: partnerLeadNote.trim() || undefined,
      });
    } catch {
      // Error handling is managed in the mutation.
    }
  };

  return {
    partnerLeads,
    partnerLeadCount,
    partnerLeadsLoading,
    partnerLeadFilter,
    setPartnerLeadFilter,
    selectedPartnerLead,
    setSelectedPartnerLead,
    partnerLeadStatusSelection,
    setPartnerLeadStatusSelection,
    partnerLeadNote,
    setPartnerLeadNote,
    updatePartnerLeadMutation,
    openPartnerLeadDialog,
    handlePartnerLeadUpdate,
    statusOptions: PARTNER_LEAD_STATUS_OPTIONS as Array<{ value: string; label: string }>,
  };
}