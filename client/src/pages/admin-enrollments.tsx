import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
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
  DollarSign
} from "lucide-react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState({
    startDate: format(new Date(new Date().setMonth(new Date().getMonth() - 1)), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
  });
  const [selectedAgentId, setSelectedAgentId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Fetch all agents for the filter dropdown
  const { data: agents } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  // Fetch enrollments with filters
  const { data: enrollments, isLoading: enrollmentsLoading } = useQuery<Enrollment[]>({
    queryKey: ["/api/admin/enrollments", dateFilter, selectedAgentId],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: dateFilter.startDate,
        endDate: dateFilter.endDate,
        ...(selectedAgentId !== "all" && { agentId: selectedAgentId }),
      });
      
      const response = await apiRequest(`/api/admin/enrollments?${params}`);
      if (!response.ok) {
        throw new Error("Failed to fetch enrollments");
      }
      return response.json();
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
      
      const response = await apiRequest("POST", `/api/admin/export-enrollments?${params}`);
      if (!response.ok) {
        throw new Error("Failed to export enrollments");
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
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
      const response = await apiRequest("POST", `/api/admin/generate-agent-number/${agentId}`);
      if (!response.ok) {
        throw new Error("Failed to generate agent number");
      }
      return response.json();
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
  const filteredEnrollments = enrollments?.filter(enrollment => {
    const matchesSearch = searchTerm === "" || 
      enrollment.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      enrollment.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      enrollment.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || enrollment.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Calculate total revenue
  const totalRevenue = filteredEnrollments?.reduce((sum, enrollment) => {
    return sum + (enrollment.status === "active" ? Number(enrollment.monthlyPrice) : 0);
  }, 0) || 0;

  if (enrollmentsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

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
                <h1 className="text-2xl font-bold text-gray-900">All Enrollments</h1>
                <p className="text-gray-600 mt-1">View and manage all member enrollments across all agents</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Button
                variant="outline"
                onClick={handleNewEnrollment}
              >
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
                  <p className="text-sm font-medium text-gray-600">Total Enrollments</p>
                  <p className="text-2xl font-bold text-gray-900">{filteredEnrollments?.length || 0}</p>
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
                  <p className="text-sm font-medium text-gray-600">Monthly Revenue</p>
                  <p className="text-2xl font-bold text-gray-900">${totalRevenue.toFixed(2)}</p>
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
                  <p className="text-sm font-medium text-gray-600">Date Range</p>
                  <p className="text-sm font-bold text-gray-900">
                    {format(new Date(dateFilter.startDate), 'MMM d')} - {format(new Date(dateFilter.endDate), 'MMM d')}
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
                  <p className="text-sm font-medium text-gray-600">Active Filters</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {(selectedAgentId !== "all" ? 1 : 0) + (statusFilter !== "all" ? 1 : 0)}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Search
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Name or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Agent
                </label>
                <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Agents" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Agents</SelectItem>
                    {agents?.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.firstName} {agent.lastName} 
                        {agent.agentNumber && ` (${agent.agentNumber})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <Input
                  type="date"
                  value={dateFilter.startDate}
                  onChange={(e) => setDateFilter({ ...dateFilter, startDate: e.target.value })}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <Input
                  type="date"
                  value={dateFilter.endDate}
                  onChange={(e) => setDateFilter({ ...dateFilter, endDate: e.target.value })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

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
                  {filteredEnrollments?.map((enrollment) => (
                    <TableRow key={enrollment.id}>
                      <TableCell>{format(new Date(enrollment.createdAt), 'MMM d, yyyy')}</TableCell>
                      <TableCell className="font-medium">
                        {enrollment.firstName} {enrollment.lastName}
                      </TableCell>
                      <TableCell>{enrollment.email}</TableCell>
                      <TableCell>{enrollment.planName}</TableCell>
                      <TableCell className="capitalize">{enrollment.memberType}</TableCell>
                      <TableCell>${enrollment.monthlyPrice}</TableCell>
                      <TableCell>{getStatusBadge(enrollment.status)}</TableCell>
                      <TableCell>{enrollment.enrolledBy}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setLocation(`/admin/enrollment/${enrollment.id}`)}
                        >
                          <FileEdit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {filteredEnrollments?.length === 0 && (
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
              {agents?.filter(agent => agent.agentNumber).map((agent) => (
                <div key={agent.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium">{agent.firstName} {agent.lastName}</p>
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