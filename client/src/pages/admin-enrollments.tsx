import React, { useState, useEffect } from "react"; // Added React import
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useDebugLog } from "@/hooks/useDebugLog";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { hasAtLeastRole } from "@/lib/roles";
import {
  Download,
  Users,
  Calendar,
  Search,
  Filter,
  ChevronLeft,
  Plus,
  FileEdit,
  DollarSign,
  AlertTriangle,
  ShieldCheck,
  Archive,
  Undo2,
  RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface Enrollment {
  id: string;
  createdAt: string;
  firstName: string;
  lastName: string;
  email: string;
  planName: string;
  memberType: string;
  totalMonthlyPrice: number;
  status: string;
  enrolledBy: string;
  enrolledByAgentId: string;
  subscriptionId?: number;
  memberPublicId?: string | null;
  customerNumber?: string | null;
  // Payment fields
  payment_id?: number | null;
  payment_status?: string | null;
  payment_amount?: number | string | null;
  transaction_id?: string | null;
  payment_date?: string | null;
  epx_auth_guid?: string | null;
}

interface Agent {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  agentNumber?: string;
}

interface MembershipSummary {
  total: number;
  active: number;
  test: number;
  archived: number;
  generatedAt?: string;
}

interface DuplicateMembershipMember {
  id: number;
  firstName: string;
  lastName: string;
  email?: string;
  customerNumber?: string;
  memberPublicId?: string;
  status?: string;
  isActive?: boolean;
  isTestMember?: boolean;
  archivedAt?: string;
  archiveReason?: string;
  planId?: number;
  totalMonthlyPrice?: number | string;
  createdAt?: string;
}

interface DuplicateMembershipGroup {
  matchFields: {
    firstName: string;
    lastName: string;
    dateOfBirth: string | null;
  };
  count: number;
  members: DuplicateMembershipMember[];
}

const toUTCISODate = (dateString: string, endOfDay = false) => {
  if (!dateString) return "";
  const [year, month, day] = dateString.split("-").map(Number);
  if ([year, month, day].some((value) => Number.isNaN(value))) {
    return "";
  }
  const date = new Date(Date.UTC(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0));
  return date.toISOString();
};

const buildDateRangeParams = (startDate: string, endDate: string) => {
  const startDateISO = toUTCISODate(startDate) || startDate;
  const endDateISO = toUTCISODate(endDate, true) || endDate;
  return { startDate: startDateISO, endDate: endDateISO };
};

const formatCurrency = (value?: number | string | null) => {
  if (value === null || value === undefined) {
    return "$0.00";
  }
  const numeric = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(numeric)) {
    return "$0.00";
  }
  return `$${numeric.toFixed(2)}`;
};

const formatDob = (dob?: string | null) => {
  if (!dob) {
    return "Not provided";
  }
  const digits = dob.replace(/\D/g, "");
  if (digits.length !== 8) {
    return dob;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

export default function AdminEnrollments() {
  const { log, logError, logWarning } = useDebugLog("AdminEnrollments");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const isAdminUser = hasAtLeastRole(user?.role, "admin");
  const queryClient = useQueryClient();

  const invalidateMembershipInsights = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/memberships/overview"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/memberships/duplicates"] });
    queryClient.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) && query.queryKey[0] === "/api/admin/enrollments",
    });
  }, [queryClient]);

  log("Component mounted", { user: user?.email, authLoading });

  // Check if user is admin
  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        console.log("[AdminEnrollments] No user found, redirecting to login");
        setLocation("/login");
      } else if (!isAdminUser) {
        console.log("[AdminEnrollments] User role is not admin:", user.role);
        setLocation("/no-access");
      } else {
        console.log("[AdminEnrollments] Admin access confirmed for:", user.email);
      }
    }
  }, [user, authLoading, setLocation, isAdminUser]);

  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState({
    startDate: format(
      new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      "yyyy-MM-dd",
    ), // First day of current month
    endDate: format(new Date(), "yyyy-MM-dd"),
  });
  const [selectedAgentId, setSelectedAgentId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const statusOptions = [
    { value: "pending_activation", label: "Pending Activation" },
    { value: "pending", label: "Pending" },
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
    { value: "cancelled", label: "Cancelled" },
    { value: "suspended", label: "Suspended" },
    { value: "archived", label: "Archived" },
  ];

  // Fetch all agents for the filter dropdown
  const { data: agents } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
    enabled: !!user && isAdminUser,
  });

  // Fetch enrollments with filters
  const {
    data: enrollments,
    isLoading: enrollmentsLoading,
    error: enrollmentsError,
  } = useQuery<Enrollment[]>({
    queryKey: ["/api/admin/enrollments-with-payments", dateFilter, selectedAgentId],
    queryFn: async () => {
      try {
        const params = new URLSearchParams({
          limit: "500",
          ...(selectedAgentId !== "all" && { agentId: selectedAgentId }),
        });

        console.log(
          "[AdminEnrollments] Fetching enrollments with payments:",
          params.toString(),
        );
        const response = await apiRequest(`/api/admin/enrollments-with-payments?${params}`, {
          method: "GET",
        });
        console.log("[AdminEnrollments] Response:", response);

        // Handle the new API response format
        const enrollmentData = response?.enrollments || response;
        return Array.isArray(enrollmentData) ? enrollmentData : [];
      } catch (error) {
        console.error("[AdminEnrollments] Error fetching enrollments:", error);
        throw error;
      }
    },
    enabled: !!user && isAdminUser,
    retry: (failureCount, error: any) => {
      // Don't retry on auth errors
      if (error?.message?.includes("401") || error?.message?.includes("403")) {
        return false;
      }
      return failureCount < 2;
    },
  });

  const {
    data: membershipSummary,
    isLoading: membershipSummaryLoading,
  } = useQuery<MembershipSummary>({
    queryKey: ["/api/admin/memberships/overview"],
    enabled: !!user && isAdminUser,
    staleTime: 60_000,
  });

  const {
    data: duplicateMemberships,
    isLoading: duplicatesLoading,
  } = useQuery<{ groups: DuplicateMembershipGroup[] }>({
    queryKey: ["/api/admin/memberships/duplicates"],
    enabled: !!user && isAdminUser,
    staleTime: 15_000,
  });

  const membershipStats: MembershipSummary = membershipSummary ?? {
    total: 0,
    active: 0,
    test: 0,
    archived: 0,
  };
  const duplicateGroups: DuplicateMembershipGroup[] = Array.isArray(
    duplicateMemberships?.groups,
  )
    ? duplicateMemberships!.groups
    : [];

  // Export enrollments mutation
  const exportMutation = useMutation({
    mutationFn: async () => {
      const { startDate, endDate } = buildDateRangeParams(
        dateFilter.startDate,
        dateFilter.endDate,
      );
      const params = new URLSearchParams({
        startDate,
        endDate,
        ...(selectedAgentId !== "all" && { agentId: selectedAgentId }),
      });

      const response = await fetch(`/api/admin/export-enrollments?${params}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        throw new Error("Failed to export enrollments");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `all-enrollments-${dateFilter.startDate}-to-${dateFilter.endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onError: () => {
      toast({
        title: "Export Failed",
        description: "Unable to download enrollments spreadsheet.",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      toast({
        title: "Export Successful",
        description: "Enrollments spreadsheet downloaded successfully.",
      });
    },
  });

  // Generate agent number mutation
  const generateAgentNumberMutation = useMutation({
    mutationFn: async (agentId: string) => {
      const response = await apiRequest(
        `/api/admin/generate-agent-number/${agentId}`,
        { method: "POST" },
      );
      return response;
    },
    onSuccess: (data) => {
      toast({
        title: "Agent Number Generated",
        description: `Agent number ${data.agentNumber} has been assigned.`,
      });
      // Refresh agents list
      window.location.reload();
    },
    onError: () => {
      toast({
        title: "Generation Failed",
        description: "Unable to generate agent number. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({
      memberId,
      status,
    }: {
      memberId: string;
      status: string;
    }) => {
      return apiRequest(`/api/admin/members/${memberId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
        headers: {
          "Content-Type": "application/json",
        },
      });
    },
    onSuccess: (_data, variables) => {
      toast({
        title: "Status updated",
        description: `Member marked as ${formatStatusLabel(variables.status)}.`,
      });
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) && query.queryKey[0] === "/api/admin/enrollments",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Status update failed",
        description:
          error?.message || "Unable to update membership status. Please try again.",
        variant: "destructive",
      });
    },
  });

  const activateNowMutation = useMutation({
    mutationFn: async ({
      memberId,
      note,
    }: {
      memberId: string;
      note?: string;
    }) => {
      return apiRequest(`/api/admin/members/${memberId}/activate-now`, {
        method: "POST",
        body: JSON.stringify({ note }),
        headers: {
          "Content-Type": "application/json",
        },
      });
    },
    onSuccess: (_data, variables) => {
      toast({
        title: "Membership activated",
        description: `Activation override applied for member #${variables.memberId}.`,
      });
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) && query.queryKey[0] === "/api/admin/enrollments",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Activation failed",
        description:
          error?.message || "Unable to activate membership immediately. Please try again.",
        variant: "destructive",
      });
    },
  });

  const toggleTestFlagMutation = useMutation({
    mutationFn: async ({
      memberId,
      isTestMember,
      reason,
    }: {
      memberId: number;
      isTestMember: boolean;
      reason?: string;
    }) => {
      return apiRequest(`/api/admin/memberships/${memberId}/test`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isTestMember, reason }),
      });
    },
    onSuccess: (_data, variables) => {
      toast({
        title: variables.isTestMember ? "Marked as test membership" : "Test membership cleared",
        description: `Member #${variables.memberId} updated successfully.`,
      });
      invalidateMembershipInsights();
    },
    onError: (error: any) => {
      toast({
        title: "Unable to update test flag",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const archiveMembershipMutation = useMutation({
    mutationFn: async ({ memberId, reason }: { memberId: number; reason?: string }) => {
      return apiRequest(`/api/admin/memberships/${memberId}/archive`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: (_data, variables) => {
      toast({
        title: "Membership archived",
        description: `Member #${variables.memberId} moved to archive.`,
      });
      invalidateMembershipInsights();
    },
    onError: (error: any) => {
      toast({
        title: "Unable to archive membership",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const restoreMembershipMutation = useMutation({
    mutationFn: async ({
      memberId,
      targetStatus,
    }: {
      memberId: number;
      targetStatus?: string;
    }) => {
      return apiRequest(`/api/admin/memberships/${memberId}/restore`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ targetStatus }),
      });
    },
    onSuccess: (_data, variables) => {
      toast({
        title: "Membership restored",
        description: `Member #${variables.memberId} reactivated.`,
      });
      invalidateMembershipInsights();
    },
    onError: (error: any) => {
      toast({
        title: "Unable to restore membership",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleNewEnrollment = () => {
    setLocation("/registration");
  };

  const handleGenerateAgentNumber = (agentId: string) => {
    generateAgentNumberMutation.mutate(agentId);
  };

  const handleStatusChange = (memberId: string, newStatus: string) => {
    if (!newStatus) return;
    updateStatusMutation.mutate({ memberId, status: newStatus });
  };

  const handleActivateNow = (enrollment: Enrollment) => {
    const confirmOverride = window.confirm(
      `Activate membership for ${enrollment.firstName} ${enrollment.lastName} immediately?`,
    );

    if (!confirmOverride) {
      return;
    }

    activateNowMutation.mutate({
      memberId: enrollment.id,
      note: "Manual activation override via admin panel",
    });
  };

  const handleToggleTestFlag = (member: DuplicateMembershipMember) => {
    if (!member?.id) {
      return;
    }

    if (member.isTestMember) {
      if (
        !window.confirm(
          `Remove test membership flag for ${member.firstName} ${member.lastName}?`,
        )
      ) {
        return;
      }
      toggleTestFlagMutation.mutate({ memberId: member.id, isTestMember: false });
      return;
    }

    const reason = window.prompt(
      `Optional note for marking ${member.firstName} ${member.lastName} as a test membership`,
      "Duplicate enrollment",
    );
    toggleTestFlagMutation.mutate({
      memberId: member.id,
      isTestMember: true,
      reason: reason?.trim() ? reason.trim() : undefined,
    });
  };

  const handleArchiveMemberRecord = (member: DuplicateMembershipMember) => {
    if (!member?.id) {
      return;
    }

    if (
      !window.confirm(
        `Archive membership for ${member.firstName} ${member.lastName}? This hides it from reporting but keeps a record.`,
      )
    ) {
      return;
    }

    const reason = window.prompt(
      "Provide a short note for the archive log",
      member.archiveReason || "Duplicate membership detected",
    );
    if (reason === null) {
      return;
    }

    archiveMembershipMutation.mutate({
      memberId: member.id,
      reason: reason?.trim() ? reason.trim() : undefined,
    });
  };

  const handleRestoreMemberRecord = (member: DuplicateMembershipMember) => {
    if (!member?.id) {
      return;
    }

    const targetStatus = window.prompt(
      "Set a status after restoring (leave blank for pending_activation)",
      "pending_activation",
    );
    if (targetStatus === null) {
      return;
    }

    restoreMembershipMutation.mutate({
      memberId: member.id,
      targetStatus: targetStatus?.trim() ? targetStatus.trim() : undefined,
    });
  };

  const formatStatusLabel = (status: string) => {
    switch (status) {
      case "pending_activation":
        return "Pending Activation";
      case "pending":
        return "Pending";
      case "active":
        return "Active";
      case "cancelled":
        return "Cancelled";
      case "inactive":
        return "Inactive";
      case "suspended":
        return "Suspended";
      case "archived":
        return "Archived";
      default:
        return status || "Unknown";
    }
  };

  const getStatusBadge = (status: string) => {
    const label = formatStatusLabel(status);
    switch (status) {
      case "active":
        return <Badge className="bg-green-100 text-green-800">{label}</Badge>;
      case "pending":
      case "pending_activation":
        return <Badge className="bg-yellow-100 text-yellow-800">{label}</Badge>;
      case "cancelled":
      case "inactive":
        return <Badge className="bg-red-100 text-red-800">{label}</Badge>;
      case "suspended":
        return <Badge className="bg-orange-100 text-orange-800">{label}</Badge>;
      case "archived":
        return <Badge className="bg-slate-200 text-slate-700">{label}</Badge>;
      default:
        return <Badge>{label}</Badge>;
    }
  };

  const getPaymentStatusBadge = (paymentStatus?: string | null, transactionId?: string | null) => {
    if (!paymentStatus) {
      return <Badge className="bg-gray-100 text-gray-600">No Payment</Badge>;
    }
    
    switch (paymentStatus.toLowerCase()) {
      case "succeeded":
      case "success":
        return (
          <Badge className="bg-green-100 text-green-800">
            ✓ Paid
            {transactionId && <div className="text-[10px] mt-0.5 opacity-70">#{transactionId.slice(-8)}</div>}
          </Badge>
        );
      case "failed":
      case "declined":
        return <Badge className="bg-red-100 text-red-800">✗ Failed</Badge>;
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-800">⏱ Pending</Badge>;
      case "refunded":
        return <Badge className="bg-purple-100 text-purple-800">↩ Refunded</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-600">{paymentStatus}</Badge>;
    }
  };

  // Filter enrollments based on search and status
  const filteredEnrollments = React.useMemo(() => {
    // Safe array check
    const enrollmentsArray = Array.isArray(enrollments) ? enrollments : [];

    if (enrollmentsArray.length === 0) {
      console.warn("[AdminEnrollments] No enrollments data available");
      return [];
    }

    return enrollmentsArray.filter((enrollment) => {
      if (!enrollment) return false;

      const matchesSearch =
        searchTerm === "" ||
        enrollment.firstName
          ?.toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        enrollment.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        enrollment.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        enrollment.id?.toString().includes(searchTerm) ||
        enrollment.memberPublicId
          ?.toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        enrollment.customerNumber
          ?.toLowerCase()
          .includes(searchTerm.toLowerCase());

      const matchesStatus =
        statusFilter === "all" || enrollment.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [enrollments, searchTerm, statusFilter]);

  // Calculate total revenue - safe array handling
  const totalRevenue = React.useMemo(() => {
    const enrollmentsArray = Array.isArray(filteredEnrollments)
      ? filteredEnrollments
      : [];
    return enrollmentsArray.reduce((sum, enrollment) => {
      return (
        sum +
        (enrollment?.status === "active"
          ? Number(enrollment.totalMonthlyPrice || 0)
          : 0)
      );
    }, 0);
  }, [filteredEnrollments]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Authenticating...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect via useEffect
  }

  if (!isAdminUser) {
    return null; // Will redirect via useEffect
  }

  if (enrollmentsLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading enrollments...</p>
          </div>
        </div>
      </div>
    );
  }

  // Safe array for rendering
  const safeFilteredEnrollments = Array.isArray(filteredEnrollments)
    ? filteredEnrollments
    : [];
  const safeAgents = Array.isArray(agents) ? agents : [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Button
                variant="ghost"
                className="mr-4"
                onClick={() => setLocation("/admin")}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  All Enrollments
                </h1>
                <p className="text-gray-600 mt-1">
                  View and manage all member enrollments across all agents
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="outline" onClick={handleNewEnrollment}>
                <Plus className="h-4 w-4 mr-2" />
                New Enrollment
              </Button>
              <Button
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={() => exportMutation.mutate()}
                disabled={exportMutation.isPending}
              >
                <Download className="h-4 w-4 mr-2" />
                Export All
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-blue-100">
                  <Users className="h-6 w-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">
                    Total Enrollments
                  </p>
                  <p className="text-2xl font-bold text-gray-900">
                    {safeFilteredEnrollments.length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-green-100">
                  <DollarSign className="h-6 w-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">
                    Monthly Revenue
                  </p>
                  <p className="text-2xl font-bold text-gray-900">
                    ${totalRevenue.toFixed(2)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-yellow-100">
                  <Calendar className="h-6 w-6 text-yellow-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">
                    Date Range
                  </p>
                  <p className="text-sm font-bold text-gray-900">
                    {format(new Date(dateFilter.startDate), "MMM d")} -{" "}
                    {format(new Date(dateFilter.endDate), "MMM d")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-purple-100">
                  <Filter className="h-6 w-6 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">
                    Active Filters
                  </p>
                  <p className="text-2xl font-bold text-gray-900">
                    {(selectedAgentId !== "all" ? 1 : 0) +
                      (statusFilter !== "all" ? 1 : 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Membership Oversight */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Membership Oversight</CardTitle>
            <p className="text-sm text-gray-600">
              Monitor live counts, highlight duplicate enrollments, and quarantine records without impacting production data.
            </p>
          </CardHeader>
          <CardContent>
            {membershipSummaryLoading ? (
              <div className="flex items-center justify-center py-6">
                <LoadingSpinner />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/70">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-emerald-100">
                      <ShieldCheck className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-xs uppercase text-slate-500 tracking-wide">Active Members</p>
                      <p className="text-2xl font-semibold text-emerald-700">{membershipStats.active}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 p-4 bg-amber-50/70">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-amber-100">
                      <AlertTriangle className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-xs uppercase text-slate-500 tracking-wide">Test Memberships</p>
                      <p className="text-2xl font-semibold text-amber-700">{membershipStats.test}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 p-4 bg-slate-100/70">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-slate-200">
                      <Archive className="h-5 w-5 text-slate-700" />
                    </div>
                    <div>
                      <p className="text-xs uppercase text-slate-500 tracking-wide">Archived Records</p>
                      <p className="text-2xl font-semibold text-slate-800">{membershipStats.archived}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 p-4 bg-blue-50/70">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-blue-100">
                      <Users className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-xs uppercase text-slate-500 tracking-wide">All Memberships</p>
                      <p className="text-2xl font-semibold text-blue-700">{membershipStats.total}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-8">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Duplicate Candidates</h3>
                  <p className="text-sm text-gray-600">
                    Groups share the same first/last name and date of birth. Archive or flag as test without deleting data.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={invalidateMembershipInsights}
                  disabled={duplicatesLoading}
                >
                  <RefreshCw className="h-4 w-4 mr-2" /> Refresh List
                </Button>
              </div>

              {duplicatesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <LoadingSpinner />
                </div>
              ) : duplicateGroups.length === 0 ? (
                <p className="mt-4 text-sm text-gray-600">
                  No duplicate signals detected with the current heuristic.
                </p>
              ) : (
                <div className="space-y-4 mt-4">
                  {duplicateGroups.map((group, index) => {
                    const groupKey = `${group.matchFields.firstName}-${group.matchFields.lastName}-${group.matchFields.dateOfBirth || 'na'}-${index}`;
                    return (
                      <div
                        key={groupKey}
                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <p className="text-xs uppercase text-slate-500 tracking-wide">Match Group</p>
                            <p className="text-lg font-semibold text-gray-900">
                              {group.matchFields.firstName} {group.matchFields.lastName}
                            </p>
                            <p className="text-sm text-gray-600">
                              DOB: {formatDob(group.matchFields.dateOfBirth)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs uppercase text-slate-500">Records</p>
                            <p className="text-3xl font-bold text-gray-900">{group.count}</p>
                          </div>
                        </div>

                        <div className="mt-4 divide-y divide-slate-200">
                          {group.members.map((member) => (
                            <div
                              key={member.id}
                              className="py-3 grid grid-cols-1 lg:grid-cols-[2fr_1fr_1fr] gap-4"
                            >
                              <div>
                                <p className="font-semibold text-gray-900">
                                  {member.firstName} {member.lastName}
                                </p>
                                <p className="text-sm text-gray-600">
                                  {member.email || "No email on file"}
                                </p>
                                <div className="text-xs text-gray-500 flex flex-wrap gap-3 mt-1">
                                  {member.customerNumber && <span>Customer #{member.customerNumber}</span>}
                                  {member.memberPublicId && <span>Member #{member.memberPublicId}</span>}
                                </div>
                              </div>
                              <div className="flex flex-col gap-2">
                                <div className="flex flex-wrap gap-2">
                                  {member.status && getStatusBadge(member.status)}
                                  {member.isTestMember && (
                                    <Badge className="bg-indigo-100 text-indigo-700">Test</Badge>
                                  )}
                                  {member.archivedAt && (
                                    <Badge className="bg-slate-200 text-slate-700">Archived</Badge>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500">
                                  Added {member.createdAt ? format(new Date(member.createdAt), "MMM d, yyyy") : "N/A"}
                                </p>
                                <p className="text-xs text-gray-500">
                                  Billing {formatCurrency(member.totalMonthlyPrice)}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleToggleTestFlag(member)}
                                  disabled={toggleTestFlagMutation.isPending}
                                >
                                  {member.isTestMember ? "Clear Test Flag" : "Mark Test"}
                                </Button>
                                {!member.archivedAt ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="border-red-200 text-red-600 hover:bg-red-50"
                                    onClick={() => handleArchiveMemberRecord(member)}
                                    disabled={archiveMembershipMutation.isPending}
                                  >
                                    Archive
                                  </Button>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="border-slate-200 text-slate-700 hover:bg-slate-50"
                                    onClick={() => handleRestoreMemberRecord(member)}
                                    disabled={restoreMembershipMutation.isPending}
                                  >
                                    <Undo2 className="h-4 w-4 mr-2" /> Restore
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div>
                <label htmlFor="admin-enrollments-search" className="block text-sm font-medium text-gray-700 mb-1">
                  Search
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="admin-enrollments-search"
                    name="enrollmentSearch"
                    type="text"
                    placeholder="Name or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    autoComplete="off"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="admin-enrollments-agent-filter" className="block text-sm font-medium text-gray-700 mb-1">
                  Agent
                </label>
                <Select
                  value={selectedAgentId}
                  onValueChange={setSelectedAgentId}
                  name="enrollmentAgentFilter"
                >
                  <SelectTrigger id="admin-enrollments-agent-filter">
                    <SelectValue placeholder="All Agents" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Agents</SelectItem>
                    {safeAgents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.firstName} {agent.lastName}
                        {agent.agentNumber && ` (${agent.agentNumber})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label htmlFor="admin-enrollments-status-filter" className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <Select value={statusFilter} onValueChange={setStatusFilter} name="enrollmentStatusFilter">
                  <SelectTrigger id="admin-enrollments-status-filter">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label htmlFor="admin-enrollments-start-date" className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <Input
                  id="admin-enrollments-start-date"
                  name="enrollmentStartDate"
                  type="date"
                  value={dateFilter.startDate}
                  onChange={(e) =>
                    setDateFilter({ ...dateFilter, startDate: e.target.value })
                  }
                  autoComplete="off"
                />
              </div>

              <div>
                <label htmlFor="admin-enrollments-end-date" className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <Input
                  id="admin-enrollments-end-date"
                  name="enrollmentEndDate"
                  type="date"
                  value={dateFilter.endDate}
                  onChange={(e) =>
                    setDateFilter({ ...dateFilter, endDate: e.target.value })
                  }
                  autoComplete="off"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error Display */}
        {enrollmentsError && (
          <Card className="mb-8">
            <CardContent className="p-6">
              <div className="text-center text-red-600">
                <p className="mb-4">
                  Error loading enrollments: {enrollmentsError.message}
                </p>
                <Button onClick={() => window.location.reload()}>Retry</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Enrollments Table */}
        <Card>
          <CardHeader>
            <CardTitle>Enrollment Records</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Member ID</TableHead>
                    <TableHead>Member Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Enrolled By</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {safeFilteredEnrollments.map((enrollment) => (
                    <TableRow key={enrollment.id}>
                      <TableCell>
                        {enrollment.createdAt ? format(new Date(enrollment.createdAt), "MMM d, yyyy") : "N/A"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        #{enrollment.id}
                        {enrollment.memberPublicId && (
                          <div className="text-[11px] text-gray-500">
                            Public: {enrollment.memberPublicId}
                          </div>
                        )}
                        {enrollment.customerNumber && (
                          <div className="text-[11px] text-gray-500">
                            Customer: {enrollment.customerNumber}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {enrollment.firstName} {enrollment.lastName}
                      </TableCell>
                      <TableCell>{enrollment.email}</TableCell>
                      <TableCell>{enrollment.planName}</TableCell>
                      <TableCell className="capitalize">
                        {enrollment.memberType}
                      </TableCell>
                      <TableCell>${enrollment.totalMonthlyPrice}</TableCell>
                      <TableCell>
                        {getPaymentStatusBadge(enrollment.payment_status, enrollment.transaction_id)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2">
                          {getStatusBadge(enrollment.status)}
                          <Select
                            value={enrollment.status}
                            onValueChange={(value) =>
                              handleStatusChange(enrollment.id, value)
                            }
                            disabled={updateStatusMutation.isPending}
                            name={`enrollmentStatus-${enrollment.id}`}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Set status" />
                            </SelectTrigger>
                            <SelectContent>
                              {statusOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {(enrollment.status === "pending_activation" ||
                            enrollment.status === "pending") && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-green-600 text-green-700 hover:bg-green-50"
                              onClick={() => handleActivateNow(enrollment)}
                              disabled={activateNowMutation.isPending}
                            >
                              Activate Now
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{enrollment.enrolledBy}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setLocation(`/admin/enrollment/${enrollment.id}`)
                          }
                        >
                          <FileEdit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {safeFilteredEnrollments.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No enrollments found matching your filters.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Agent Management Section */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Agent Numbers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {safeAgents
                .filter((agent) => agent.agentNumber)
                .map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium">
                        {agent.firstName} {agent.lastName}
                      </p>
                      <p className="text-sm text-gray-600">{agent.email}</p>
                    </div>
                    <div className="flex items-center space-x-4">
                      <Badge variant="outline">
                        {agent.agentNumber || "No Number"}
                      </Badge>
                      {!agent.agentNumber && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleGenerateAgentNumber(agent.id)}
                          disabled={generateAgentNumberMutation.isPending}
                        >
                          Generate Number
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}