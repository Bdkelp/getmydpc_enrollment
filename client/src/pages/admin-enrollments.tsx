import React, { useState, useEffect } from "react"; // Added React import
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useDebugLog } from "@/hooks/useDebugLog";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
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
import { Navigate } from "wouter/use-location";

interface Enrollment {
  id: string;
  createdAt: string;
  firstName: string;
  lastName: string;
  email: string;
  planName: string;
  memberType: string;
  monthlyPrice: number;
  status: string;
  enrolledBy: string;
  enrolledByAgentId: string;
  subscriptionId?: number;
}

interface Agent {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  agentNumber?: string;
}

export default function AdminEnrollments() {
  const { log, logError, logWarning } = useDebugLog("AdminEnrollments");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  log("Component mounted", { user: user?.email, authLoading });

  // Check if user is admin
  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        console.log("[AdminEnrollments] No user found, redirecting to login");
        setLocation("/login");
      } else if (user.role !== "admin") {
        console.log("[AdminEnrollments] User role is not admin:", user.role);
        setLocation("/no-access");
      } else {
        console.log("[AdminEnrollments] Admin access confirmed for:", user.email);
      }
    }
  }, [user, authLoading, setLocation]);

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

  // Fetch all agents for the filter dropdown
  const { data: agents } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
    enabled: !!user && user.role === "admin",
  });

  // Fetch enrollments with filters
  const {
    data: enrollments,
    isLoading: enrollmentsLoading,
    error: enrollmentsError,
  } = useQuery<Enrollment[]>({
    queryKey: ["/api/admin/enrollments", dateFilter, selectedAgentId],
    queryFn: async () => {
      try {
        const params = new URLSearchParams({
          startDate: dateFilter.startDate,
          endDate: dateFilter.endDate,
          ...(selectedAgentId !== "all" && { agentId: selectedAgentId }),
        });

        console.log(
          "[AdminEnrollments] Fetching enrollments with params:",
          params.toString(),
        );
        const response = await apiRequest(`/api/admin/enrollments?${params}`, {
          method: "GET",
        });
        console.log("[AdminEnrollments] Response:", response);

        // Ensure we return an array
        return Array.isArray(response) ? response : [];
      } catch (error) {
        console.error("[AdminEnrollments] Error fetching enrollments:", error);
        throw error;
      }
    },
    enabled: !!user && user.role === "admin",
    retry: (failureCount, error: any) => {
      // Don't retry on auth errors
      if (error?.message?.includes("401") || error?.message?.includes("403")) {
        return false;
      }
      return failureCount < 2;
    },
  });

  // Export enrollments mutation
  const exportMutation = useMutation({
    mutationFn: async () => {
      const params = new URLSearchParams({
        startDate: dateFilter.startDate,
        endDate: dateFilter.endDate,
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

  const handleNewEnrollment = () => {
    setLocation("/registration");
  };

  const handleGenerateAgentNumber = (agentId: string) => {
    generateAgentNumberMutation.mutate(agentId);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-100 text-green-800">Active</Badge>;
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      case "cancelled":
        return <Badge className="bg-red-100 text-red-800">Cancelled</Badge>;
      default:
        return <Badge>{status}</Badge>;
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
        enrollment.email?.toLowerCase().includes(searchTerm.toLowerCase());

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
          ? Number(enrollment.monthlyPrice || 0)
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

  if (user.role !== "admin") {
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

        {/* Filters */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div>
                <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
                  Search
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="search"
                    type="text"
                    placeholder="Name or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="agent-filter" className="block text-sm font-medium text-gray-700 mb-1">
                  Agent
                </label>
                <Select
                  id="agent-filter"
                  value={selectedAgentId}
                  onValueChange={setSelectedAgentId}
                >
                  <SelectTrigger>
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
                <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <Select id="status-filter" value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label htmlFor="start-date" className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <Input
                  id="start-date"
                  type="date"
                  value={dateFilter.startDate}
                  onChange={(e) =>
                    setDateFilter({ ...dateFilter, startDate: e.target.value })
                  }
                />
              </div>

              <div>
                <label htmlFor="end-date" className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <Input
                  id="end-date"
                  type="date"
                  value={dateFilter.endDate}
                  onChange={(e) =>
                    setDateFilter({ ...dateFilter, endDate: e.target.value })
                  }
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
                    <TableHead>Member Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Enrolled By</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {safeFilteredEnrollments.map((enrollment) => (
                    <TableRow key={enrollment.id}>
                      <TableCell>
                        {format(new Date(enrollment.createdAt), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="font-medium">
                        {enrollment.firstName} {enrollment.lastName}
                      </TableCell>
                      <TableCell>{enrollment.email}</TableCell>
                      <TableCell>{enrollment.planName}</TableCell>
                      <TableCell className="capitalize">
                        {enrollment.memberType}
                      </TableCell>
                      <TableCell>${enrollment.monthlyPrice}</TableCell>
                      <TableCell>{getStatusBadge(enrollment.status)}</TableCell>
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