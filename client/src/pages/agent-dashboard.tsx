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
import { Download, Users, DollarSign, Phone, UserPlus, TrendingUp, AlertCircle, Shield, User } from "lucide-react";
import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getDefaultAvatar, getUserInitials } from "@/lib/avatarUtils";
import DashboardStats from "@/components/DashboardStats";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

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
  totalMonthlyPrice: number;
  commissionAmount: number;
  status: string;
  pendingReason?: string;
  pendingDetails?: string;
  subscriptionId?: number;
}

export default function AgentDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  
  // For admin/super_admin: allow viewing other agents' dashboards
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const viewingAgentId = selectedAgentId || user?.id;
  const isAdminViewing = (user?.role === 'admin' || user?.role === 'super_admin') && selectedAgentId;
  
  // Get current time of day for personalized greeting
  const getTimeOfDayGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };
  
  // Get user's first name for personalized greeting
  const getUserName = () => {
    if (user?.firstName) return user.firstName;
    if (user?.name) return user.name.split(' ')[0];
    if (user?.email) return user.email.split('@')[0];
    return "Agent";
  };
  
  const [dateFilter, setDateFilter] = useState({
    startDate: format(new Date(new Date().setDate(1)), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
  });
  const [selectedEnrollment, setSelectedEnrollment] = useState<Enrollment | null>(null);
  const [showPendingDialog, setShowPendingDialog] = useState(false);
  const [consentType, setConsentType] = useState<string>("");
  const [consentNotes, setConsentNotes] = useState<string>("");

  // For admin/super_admin: fetch all agents for selector
  const { data: allAgents } = useQuery({
    queryKey: ["/api/agents"],
    enabled: user?.role === 'admin' || user?.role === 'super_admin',
  });

  // Get agent stats (for selected agent if admin, or current user)
  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery<AgentStats>({
    queryKey: ["/api/agent/stats", viewingAgentId],
    queryFn: () => apiRequest("GET", `/api/agent/stats${viewingAgentId && viewingAgentId !== user?.id ? `?agentId=${viewingAgentId}` : ''}`),
    enabled: !!viewingAgentId,
  });

  // Log errors for debugging
  if (statsError) {
    console.error('[Agent Dashboard] Stats error:', statsError);
  }

  // Get recent enrollments (for selected agent if admin, or current user)
  const { data: enrollments, isLoading: enrollmentsLoading, error: enrollmentsError } = useQuery<Enrollment[]>({
    queryKey: ["/api/agent/enrollments", viewingAgentId, dateFilter],
    queryFn: () => apiRequest("GET", `/api/agent/enrollments?${new URLSearchParams({
      ...(viewingAgentId && viewingAgentId !== user?.id ? { agentId: viewingAgentId } : {}),
      ...dateFilter
    }).toString()}`),
    enabled: !!viewingAgentId,
  });

  // Log errors for debugging
  if (enrollmentsError) {
    console.error('[Agent Dashboard] Enrollments error:', enrollmentsError);
  }

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
          window.location.href = "/login";
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

  const handlePendingClick = (enrollment: Enrollment) => {
    setSelectedEnrollment(enrollment);
    setShowPendingDialog(true);
  };
  
  const handleLeadClick = (leadId: number) => {
    setLocation(`/agent/leads/${leadId}`);
  };

  const handleResolvePending = async () => {
    if (!selectedEnrollment || !consentType || !consentNotes) {
      toast({
        title: "Missing Information",
        description: "Please provide consent type and notes before proceeding.",
        variant: "destructive",
      });
      return;
    }

    try {
      await apiRequest("PUT", `/api/enrollment/${selectedEnrollment.id}/resolve`, {
        subscriptionId: selectedEnrollment.subscriptionId,
        consentType,
        consentNotes,
        modifiedBy: user?.id,
      });

      toast({
        title: "Enrollment Updated",
        description: "The enrollment has been resolved with member consent.",
      });

      setShowPendingDialog(false);
      setSelectedEnrollment(null);
      setConsentType("");
      setConsentNotes("");
      
      // Refresh enrollments
      queryClient.invalidateQueries({ queryKey: ["/api/agent/enrollments"] });
    } catch (error) {
      toast({
        title: "Update Failed", 
        description: "Failed to update enrollment. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (statsLoading || enrollmentsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  // Show error state if data failed to load
  if (statsError || enrollmentsError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Error Loading Dashboard
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 mb-4">
              We couldn't load your agent dashboard. Please try refreshing the page.
            </p>
            {statsError && (
              <div className="text-sm text-gray-600 mb-2">
                <strong>Stats Error:</strong> {String(statsError)}
              </div>
            )}
            {enrollmentsError && (
              <div className="text-sm text-gray-600 mb-4">
                <strong>Enrollments Error:</strong> {String(enrollmentsError)}
              </div>
            )}
            <Button onClick={() => window.location.reload()} className="w-full">
              Reload Page
            </Button>
          </CardContent>
        </Card>
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
              <Avatar className="h-8 w-8 mr-3">
                <AvatarImage 
                  src={user?.profileImageUrl || getDefaultAvatar(user?.id || '', `${user?.firstName || ''} ${user?.lastName || ''}`)} 
                  alt="Profile" 
                />
                <AvatarFallback className="bg-blue-600 text-white text-sm">
                  {getUserInitials(`${user?.firstName || ''} ${user?.lastName || ''}`)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Agent Dashboard</h1>
                <span className="text-sm text-gray-500">
                  Welcome back, {user?.firstName} | Agent #: {user?.agentNumber || 'Not assigned'}
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {(user?.role === 'admin' || user?.role === 'super_admin') && (
                <Button variant="outline" onClick={() => setLocation('/admin')}>
                  <Shield className="h-4 w-4 mr-2" />
                  Back to Admin View
                </Button>
              )}
              <Button
                onClick={handleNewEnrollment}
                className="bg-green-600 hover:bg-green-700 text-white shadow-lg animate-pulse-slow"
              >
                <UserPlus className="mr-2 h-4 w-4" />
                New Enrollment
              </Button>
              <Button variant="outline" onClick={() => setLocation('/profile')}>
                <User className="mr-2 h-4 w-4" />
                Profile
              </Button>
              <Button variant="outline" onClick={async () => {
                const { signOut } = await import("@/lib/supabase");
                await signOut();
                window.location.href = "/";
              }}>
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Agent Selector for Admin/Super_Admin */}
        {(user?.role === 'admin' || user?.role === 'super_admin') && (
          <Card className="mb-6 bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <Shield className="h-5 w-5 text-blue-600" />
                <div className="flex-1">
                  <label className="text-sm font-medium text-blue-900 mb-2 block">
                    {user?.role === 'super_admin' ? '🎸 Backstage Pass:' : '👔 Admin View:'} View Any Agent's Dashboard
                  </label>
                  <Select
                    value={selectedAgentId || user?.id || ''}
                    onValueChange={(value) => setSelectedAgentId(value === user?.id ? null : value)}
                  >
                    <SelectTrigger className="w-full md:w-96 bg-white">
                      <SelectValue placeholder="Select an agent to view" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={user?.id || ''}>
                        {user?.firstName} {user?.lastName} (Your Dashboard)
                      </SelectItem>
                      {Array.isArray(allAgents) && allAgents.filter((agent: any) => 
                        agent.role === 'agent' && agent.id !== user?.id
                      ).map((agent: any) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.agentNumber} - {agent.firstName} {agent.lastName} ({agent.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {isAdminViewing && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedAgentId(null)}
                  >
                    View My Dashboard
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Personalized Welcome Message */}
        <Card className="mb-8 bg-gradient-to-r from-green-500 to-green-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold mb-1">
                  {getTimeOfDayGreeting()}, {getUserName()}! 🎯
                </h2>
                <p className="text-green-100">
                  Your sales dashboard is ready. Keep up the excellent work helping members access quality healthcare membership!
                </p>
                <div className="mt-4 flex items-center space-x-6">
                  <div>
                    <p className="text-sm text-green-200">This Month's Goal</p>
                    <p className="text-lg font-semibold">
                      {stats?.monthlyEnrollments || 0} / 10 enrollments
                    </p>
                  </div>
                  <div className="border-l border-green-300 pl-6">
                    <p className="text-sm text-green-200">Commission Earned</p>
                    <p className="text-lg font-semibold">
                      ${stats?.monthlyCommission?.toFixed(2) || "0.00"}
                    </p>
                  </div>
                  <div className="border-l border-green-300 pl-6">
                    <p className="text-sm text-green-200">Leads to Follow Up</p>
                    <p className="text-lg font-semibold flex items-center">
                      <Phone className="h-5 w-5 mr-1" />
                      {stats?.activeLeads || 0} active
                    </p>
                  </div>
                </div>
              </div>
              <div className="hidden md:block">
                <TrendingUp className="h-24 w-24 text-green-200 opacity-50" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Enhanced Dashboard Stats */}
        <DashboardStats userRole="agent" agentId={viewingAgentId} />

        {/* Recent Enrollments */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Recent Enrollments</CardTitle>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label htmlFor="dashboardStartDate" className="text-sm text-gray-600">From:</label>
                  <input
                    id="dashboardStartDate"
                    name="startDate"
                    type="date"
                    autoComplete="off"
                    value={dateFilter.startDate}
                    onChange={(e) => setDateFilter({ ...dateFilter, startDate: e.target.value })}
                    className="px-3 py-1 border rounded"
                  />
                  <label htmlFor="dashboardEndDate" className="text-sm text-gray-600">To:</label>
                  <input
                    id="dashboardEndDate"
                    name="endDate"
                    type="date"
                    autoComplete="off"
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
                  {Array.isArray(enrollments) && enrollments.map((enrollment: any) => (
                    <tr 
                      key={enrollment.id} 
                      className={`border-b hover:bg-gray-50 ${enrollment.status === 'pending' ? 'cursor-pointer' : ''}`}
                      onClick={() => enrollment.status === 'pending' && handlePendingClick(enrollment)}
                    >
                      <td className="py-2">{format(new Date(enrollment.createdAt), "MM/dd/yyyy")}</td>
                      <td className="py-2">{enrollment.firstName} {enrollment.lastName}</td>
                      <td className="py-2">{enrollment.planName}</td>
                      <td className="py-2">{enrollment.memberType}</td>
                      <td className="py-2">${enrollment.totalMonthlyPrice}</td>
                      <td className="py-2 text-green-600">${enrollment.commissionAmount ? Number(enrollment.commissionAmount).toFixed(2) : '0.00'}</td>
                      <td className="py-2">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          enrollment.status === 'active' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {enrollment.status}
                          {enrollment.status === 'pending' && (
                            <span className="ml-1">ⓘ</span>
                          )}
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
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Leads to Follow Up</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/agent/leads")}
            >
              View All Leads
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Array.isArray(stats?.leads) && stats.leads.map((lead: any) => (
                <div 
                  key={lead.id} 
                  className="flex justify-between items-center p-3 bg-gray-50 rounded hover:bg-gray-100 cursor-pointer transition-colors"
                  onClick={() => handleLeadClick(lead.id)}
                >
                  <div>
                    <p className="font-medium">{lead.name}</p>
                    <p className="text-sm text-gray-600">{lead.phone} • {lead.email}</p>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <p className="text-sm text-gray-600">Last updated: {format(new Date(lead.lastContact), "MM/dd")}</p>
                    <span className={`text-sm font-medium px-2 py-1 rounded-full ${
                      lead.status === 'new' ? 'bg-blue-100 text-blue-700' :
                      lead.status === 'contacted' ? 'bg-yellow-100 text-yellow-700' :
                      lead.status === 'qualified' ? 'bg-green-100 text-green-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {lead.status.charAt(0).toUpperCase() + lead.status.slice(1)}
                    </span>
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

      {/* Pending Enrollment Dialog */}
      <Dialog open={showPendingDialog} onOpenChange={setShowPendingDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              Pending Enrollment Details
            </DialogTitle>
            <DialogDescription>
              Review why this enrollment is pending and record member consent for any changes.
            </DialogDescription>
          </DialogHeader>
          
          {selectedEnrollment && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold mb-2">Member Information</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="font-medium">Name:</span> {selectedEnrollment.firstName} {selectedEnrollment.lastName}</div>
                  <div><span className="font-medium">Plan:</span> {selectedEnrollment.planName}</div>
                  <div><span className="font-medium">Type:</span> {selectedEnrollment.memberType}</div>
                  <div><span className="font-medium">Monthly:</span> ${selectedEnrollment.totalMonthlyPrice}</div>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
                <h4 className="font-semibold mb-2 text-yellow-800">Pending Reason</h4>
                <p className="text-sm">
                  <span className="font-medium">Status:</span> {selectedEnrollment.pendingReason || "Payment Required"}
                </p>
                {selectedEnrollment.pendingDetails && (
                  <p className="text-sm mt-2">
                    <span className="font-medium">Details:</span> {selectedEnrollment.pendingDetails}
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold">Record Member Consent</h4>
                <div>
                  <Label htmlFor="consentType" className="text-sm font-medium">Consent Type *</Label>
                  <Select value={consentType} onValueChange={setConsentType} name="consentType">
                    <SelectTrigger id="consentType">
                      <SelectValue placeholder="Select consent type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="verbal">Verbal Consent</SelectItem>
                      <SelectItem value="written">Written Consent</SelectItem>
                      <SelectItem value="email">Email Consent</SelectItem>
                      <SelectItem value="recorded">Recorded Call</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="consentNotes" className="text-sm font-medium">Consent Notes *</Label>
                  <Textarea
                    id="consentNotes"
                    name="consentNotes"
                    autoComplete="off"
                    value={consentNotes}
                    onChange={(e) => setConsentNotes(e.target.value)}
                    placeholder="Describe how consent was obtained, what was discussed, and any specific member requests..."
                    rows={4}
                    className="mt-1"
                  />
                </div>

                <div className="bg-blue-50 p-3 rounded text-sm">
                  <p className="font-medium text-blue-800">Important:</p>
                  <p className="text-blue-700">Once submitted, enrollment modifications cannot be altered without new member consent.</p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPendingDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleResolvePending}
              disabled={!consentType || !consentNotes}
              className="bg-medical-blue-600 hover:bg-medical-blue-700 text-white"
            >
              Resolve with Consent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}