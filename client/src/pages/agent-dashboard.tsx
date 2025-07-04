import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Download, Users, DollarSign, Phone, UserPlus, TrendingUp } from "lucide-react";
import { format } from "date-fns";

interface AgentStats {
  totalEnrollments: number;
  monthlyEnrollments: number;
  totalCommission: number;
  monthlyCommission: number;
  activeLeads: number;
  conversionRate: number;
  leads: any[];
}

interface Enrollment {
  id: string;
  createdAt: string;
  firstName: string;
  lastName: string;
  planName: string;
  memberType: string;
  monthlyPrice: number;
  commission: number;
  status: string;
}

export default function AgentDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [dateFilter, setDateFilter] = useState({
    startDate: format(new Date(new Date().setDate(1)), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
  });

  // Get agent stats
  const { data: stats, isLoading: statsLoading } = useQuery<AgentStats>({
    queryKey: ["/api/agent/stats"],
  });

  // Get recent enrollments
  const { data: enrollments, isLoading: enrollmentsLoading } = useQuery<Enrollment[]>({
    queryKey: ["/api/agent/enrollments", dateFilter],
  });

  // Download enrollments spreadsheet
  const downloadMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/agent/export-enrollments", dateFilter);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `enrollments-${dateFilter.startDate}-to-${dateFilter.endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Export Failed",
        description: "Unable to download enrollments spreadsheet.",
        variant: "destructive",
      });
    },
  });

  const handleNewEnrollment = () => {
    setLocation("/registration");
  };

  if (statsLoading || enrollmentsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">Agent Dashboard</h1>
              <span className="ml-4 text-sm text-gray-500">
                Welcome back, {user?.firstName} | Agent #: {user?.agentNumber || 'Not assigned'}
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <Button
                onClick={handleNewEnrollment}
                className="bg-green-600 hover:bg-green-700 text-white shadow-lg animate-pulse-slow"
              >
                <UserPlus className="mr-2 h-4 w-4" />
                New Enrollment
              </Button>
              <Button variant="outline" onClick={() => window.location.href = "/api/logout"}>
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Enrollments</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalEnrollments || 0}</div>
              <p className="text-xs text-muted-foreground">This month: {stats?.monthlyEnrollments || 0}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Commission</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${stats?.totalCommission?.toFixed(2) || "0.00"}</div>
              <p className="text-xs text-muted-foreground">This month: ${stats?.monthlyCommission?.toFixed(2) || "0.00"}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Leads</CardTitle>
              <Phone className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.activeLeads || 0}</div>
              <p className="text-xs text-muted-foreground">Follow up needed</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.conversionRate?.toFixed(1) || "0"}%</div>
              <p className="text-xs text-muted-foreground">Last 30 days</p>
            </CardContent>
          </Card>
        </div>

        {/* Recent Enrollments */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Recent Enrollments</CardTitle>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">From:</label>
                  <input
                    type="date"
                    value={dateFilter.startDate}
                    onChange={(e) => setDateFilter({ ...dateFilter, startDate: e.target.value })}
                    className="px-3 py-1 border rounded"
                  />
                  <label className="text-sm text-gray-600">To:</label>
                  <input
                    type="date"
                    value={dateFilter.endDate}
                    onChange={(e) => setDateFilter({ ...dateFilter, endDate: e.target.value })}
                    className="px-3 py-1 border rounded"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadMutation.mutate()}
                  disabled={downloadMutation.isPending}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Date</th>
                    <th className="text-left py-2">Member Name</th>
                    <th className="text-left py-2">Plan</th>
                    <th className="text-left py-2">Type</th>
                    <th className="text-left py-2">Monthly</th>
                    <th className="text-left py-2">Commission</th>
                    <th className="text-left py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {enrollments?.map((enrollment: any) => (
                    <tr key={enrollment.id} className="border-b hover:bg-gray-50">
                      <td className="py-2">{format(new Date(enrollment.createdAt), "MM/dd/yyyy")}</td>
                      <td className="py-2">{enrollment.firstName} {enrollment.lastName}</td>
                      <td className="py-2">{enrollment.planName}</td>
                      <td className="py-2">{enrollment.memberType}</td>
                      <td className="py-2">${enrollment.monthlyPrice}</td>
                      <td className="py-2 text-green-600">${enrollment.commission?.toFixed(2)}</td>
                      <td className="py-2">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          enrollment.status === 'active' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {enrollment.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(!enrollments || enrollments.length === 0) && (
                <p className="text-center py-8 text-gray-500">No enrollments found for this period</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Leads to Follow Up */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Leads to Follow Up</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats?.leads?.map((lead: any) => (
                <div key={lead.id} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <div>
                    <p className="font-medium">{lead.name}</p>
                    <p className="text-sm text-gray-600">{lead.phone} • {lead.email}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Last contact: {format(new Date(lead.lastContact), "MM/dd")}</p>
                    <p className="text-sm font-medium text-orange-600">Follow up needed</p>
                  </div>
                </div>
              ))}
              {(!stats?.leads || stats.leads.length === 0) && (
                <p className="text-center py-4 text-gray-500">No pending leads</p>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}