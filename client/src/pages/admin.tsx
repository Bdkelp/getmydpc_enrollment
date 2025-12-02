import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { isUnauthorizedError } from "@/lib/authUtils";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { AdminCreateUserDialog } from "@/components/admin-create-user-dialog";
import DashboardStats from "@/components/DashboardStats";
import { 
  Users, 
  DollarSign, 
  UserPlus, 
  UserX, 
  Search, 
  Download,
  Plus,
  TrendingUp,
  Heart,
  CheckCircle,
  XCircle,
  Clock,
  Shield,
  BarChart,
  User,
  FileText
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getDefaultAvatar, getUserInitials } from "@/lib/avatarUtils";
import { Switch } from "@/components/ui/switch";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

// Type definitions for API responses
interface AdminStats {
  totalUsers: number;
  monthlyRevenue: number;
  newEnrollments: number;
  churnRate: number;
}

interface UserData {
  users: any[];
  totalCount: number;
}

interface PendingUser {
  id: string;
  email: string;
  created_at: string;
  [key: string]: any;
}

export default function Admin() {
  const { toast } = useToast();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [assignAgentNumberDialog, setAssignAgentNumberDialog] = useState<{ open: boolean; userId: string; currentNumber: string | null }>({ open: false, userId: '', currentNumber: null });
  const [agentNumberInput, setAgentNumberInput] = useState('');
  const [createUserDialogOpen, setCreateUserDialogOpen] = useState(false);
  const [editUserDialog, setEditUserDialog] = useState<{ open: boolean; user: any | null }>({ open: false, user: null });
  const [editFormData, setEditFormData] = useState({ firstName: '', lastName: '', email: '', phone: '' });

  // Test authentication
  useEffect(() => {
    const testAuth = async () => {
      const { getSession } = await import("@/lib/supabase");
      const session = await getSession();
      console.log('[Admin Page] Authentication Test:', {
        hasSession: !!session,
        hasToken: !!session?.access_token,
        tokenPreview: session?.access_token?.substring(0, 30) + '...',
        userEmail: session?.user?.email,
        currentUser: user,
        isAuthenticated
      });
    };
    testAuth();
  }, [user, isAuthenticated]);

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
    return "Admin";
  };

  // Redirect if not authenticated or not admin
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
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

    if (!authLoading && user && user.role !== "admin" && user.role !== "super_admin") {
      toast({
        title: "Access Denied",
        description: "Admin access required.",
        variant: "destructive",
      });
      return;
    }
  }, [isAuthenticated, authLoading, user, toast]);

  // Set up real-time subscriptions for dashboard data
  useEffect(() => {
    console.log('[AdminDashboard] Setting up real-time subscriptions...');

    // Subscribe to key table changes that affect dashboard stats
    const dashboardSubscription = supabase
      .channel('dashboard-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'users' },
        (payload) => {
          console.log('[AdminDashboard] Users change detected:', payload);
          queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
          queryClient.invalidateQueries({ queryKey: ["/api/admin/revenue"] });
          queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-users"] });
          queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }); // Invalidate users query for table updates
        }
      )
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'subscriptions' },
        (payload) => {
          console.log('[AdminDashboard] Subscriptions change detected:', payload);
          queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
          queryClient.invalidateQueries({ queryKey: ["/api/admin/revenue"] });
        }
      )
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'payments' },
        (payload) => {
          console.log('[AdminDashboard] Payments change detected:', payload);
          queryClient.invalidateQueries({ queryKey: ["/api/admin/revenue"] });
          toast({
            title: "Payment Activity",
            description: "New payment activity detected",
          });
        }
      )
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'commissions' },
        (payload) => {
          console.log('[AdminDashboard] Commissions change detected:', payload);
          queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
          queryClient.invalidateQueries({ queryKey: ["/api/admin/analytics"] });
          queryClient.invalidateQueries({ queryKey: ["/api/admin/data-viewer"] });
          toast({
            title: "Commission Update",
            description: "Commission data has been updated",
          });
        }
      )
      .subscribe();

    return () => {
      console.log('[AdminDashboard] Cleaning up real-time subscriptions...');
      dashboardSubscription.unsubscribe();
    };
  }, [queryClient, toast]);


  const { data: adminStats, isLoading: statsLoading, error: statsError } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
  });

  // Handle stats error
  useEffect(() => {
    if (statsError && isUnauthorizedError(statsError as Error)) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/login";
      }, 500);
    }
  }, [statsError, toast]);

  const { data: usersData, isLoading: usersLoading, error: usersError, refetch } = useQuery<UserData>({
    queryKey: ["/api/admin/users"],
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
  });

  // Handle users error
  useEffect(() => {
    if (usersError && isUnauthorizedError(usersError as Error)) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/login";
      }, 500);
    }
  }, [usersError, toast]);

  // Fetch pending users
  const { data: pendingUsers, isLoading: pendingLoading } = useQuery<PendingUser[]>({
    queryKey: ["/api/admin/pending-users"],
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
  });

  // Fetch all login sessions for monitoring
  const { data: allLoginSessions = [], isLoading: sessionsLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/login-sessions"],
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
  });

  // Approve user mutation
  const approveUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest(`/api/admin/approve-user/${userId}`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      toast({
        title: "User Approved",
        description: "The user has been approved and can now access the platform.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to approve user. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Reject user mutation
  const rejectUserMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason: string }) => {
      return apiRequest(`/api/admin/reject-user/${userId}`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: () => {
      toast({
        title: "User Rejected",
        description: "The user has been rejected.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-users"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reject user. Please try again.",
        variant: "destructive",
      });
    },
  });

  if (authLoading || statsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isAuthenticated || !user || (user.role !== "admin" && user.role !== "super_admin")) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
              <p className="text-gray-600 mb-4">Admin access required to view this page.</p>
              <Button onClick={() => window.location.href = "/"}>
                Return to Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stats = [
    {
      icon: Users,
      label: "Total System Users",
      value: adminStats?.totalUsers?.toLocaleString() || "0",
      change: "",
      changeType: "positive",
      bgColor: "bg-blue-100",
      iconColor: "text-blue-600",
    },
    {
      icon: DollarSign,
      label: "Monthly Revenue",
      value: `$${(adminStats?.monthlyRevenue || 0).toLocaleString()}`,
      change: "",
      changeType: "positive",
      bgColor: "bg-green-100",
      iconColor: "text-green-600",
    },
    {
      icon: UserPlus,
      label: "New Enrollments",
      value: (adminStats?.newEnrollments || 0).toLocaleString(),
      change: "",
      changeType: "positive",
      bgColor: "bg-orange-100",
      iconColor: "text-orange-600",
    },
    {
      icon: UserX,
      label: "Churn Rate",
      value: `${adminStats?.churnRate || 0}%`,
      change: "",
      changeType: "negative",
      bgColor: "bg-red-100",
      iconColor: "text-red-600",
    },
  ];



  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Heart className="text-medical-blue-600 h-8 w-8 mr-3" />
              <span className="text-xl font-bold text-gray-900">MyPremierPlans</span>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/">
                <Button variant="ghost">
                  Home
                </Button>
              </Link>
              <Link href="/admin">
                <Button variant="ghost">
                  Admin
                </Button>
              </Link>
              <Link href="/agent">
                <Button variant="ghost">
                  Agent View
                </Button>
              </Link>
              <Link href="/quiz">
                <Button variant="ghost">
                  Quiz
                </Button>
              </Link>
              <Button variant="ghost" onClick={() => setLocation('/profile')}>
                <User className="mr-2 h-4 w-4" />
                Profile
              </Button>
              <div className="flex items-center space-x-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage 
                    src={user?.profile_image_url || getDefaultAvatar(user?.id || '', user?.full_name)} 
                    alt={user?.full_name || "Admin"} 
                  />
                  <AvatarFallback className="bg-medical-blue-600 text-white">
                    {getUserInitials(user?.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden sm:block">
                  <p className="text-sm font-medium text-gray-900">{user?.full_name || 'Admin User'}</p>
                  <p className="text-xs text-gray-500">Administrator</p>
                </div>
              </div>
              <Button variant="ghost" onClick={async () => {
                const { signOut } = await import("@/lib/supabase");
                await signOut();
                window.location.href = "/";
              }}>
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Admin Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
              <p className="text-gray-600 mt-1">Manage users, plans, and system settings</p>
            </div>
            
            {/* Responsive Navigation Grid - 4x2 layout (8 buttons) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Button 
                variant="outline"
                className="w-full border-blue-500 text-blue-600 hover:bg-blue-50 h-20 flex flex-col items-center justify-center"
                onClick={() => setCreateUserDialogOpen(true)}
              >
                <UserPlus className="h-5 w-5 mb-1" />
                <span className="text-sm font-medium">Create User</span>
              </Button>
              <Link href="/registration">
                <Button className="w-full bg-white hover:bg-gray-100 text-black border border-gray-300 h-20 flex flex-col items-center justify-center">
                  <UserPlus className="h-5 w-5 mb-1" />
                  <span className="text-sm font-medium">Enroll Member</span>
                </Button>
              </Link>
              <Button variant="outline" 
                      className="w-full border-orange-500 text-orange-600 hover:bg-orange-50 h-20 flex flex-col items-center justify-center"
                      onClick={() => setLocation('/admin/leads')}>
                <Users className="h-5 w-5 mb-1" />
                <span className="text-sm font-medium">Leads</span>
              </Button>
              <Button variant="outline" 
                      className="w-full border-blue-500 text-blue-600 hover:bg-blue-50 h-20 flex flex-col items-center justify-center"
                      onClick={() => setLocation('/admin/enrollments')}>
                <Users className="h-5 w-5 mb-1" />
                <span className="text-sm font-medium">Enrollments</span>
              </Button>
              <Button variant="outline" 
                      className="w-full border-red-500 text-red-600 hover:bg-red-50 h-20 flex flex-col items-center justify-center"
                      onClick={() => setLocation('/admin/users')}>
                <Shield className="h-5 w-5 mb-1" />
                <span className="text-sm font-medium">Users</span>
              </Button>
              <Link href="/admin/analytics">
                <Button variant="outline" className="w-full border-green-500 text-green-600 hover:bg-green-50 h-20 flex flex-col items-center justify-center">
                  <BarChart className="h-5 w-5 mb-1" />
                  <span className="text-sm font-medium">Analytics</span>
                </Button>
              </Link>
              <Link href="/admin/commissions">
                <Button variant="outline" className="w-full border-emerald-500 text-emerald-600 hover:bg-emerald-50 h-20 flex flex-col items-center justify-center">
                  <DollarSign className="h-5 w-5 mb-1" />
                  <span className="text-sm font-medium">Commissions</span>
                </Button>
              </Link>
              <Link href="/admin/discount-codes">
                <Button variant="outline" className="w-full border-purple-500 text-purple-600 hover:bg-purple-50 h-20 flex flex-col items-center justify-center">
                  <FileText className="h-5 w-5 mb-1" />
                  <span className="text-sm font-medium">Discount Codes</span>
                </Button>
              </Link>
              <Link href="/admin/agent-hierarchy">
                <Button variant="outline" className="w-full border-indigo-500 text-indigo-600 hover:bg-indigo-50 h-20 flex flex-col items-center justify-center">
                  <Users className="h-5 w-5 mb-1" />
                  <span className="text-sm font-medium">Agent Hierarchy</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Personalized Welcome Message */}
        <Card className="mb-8 bg-gradient-to-r from-medical-blue-500 to-medical-blue-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold mb-1">
                  {getTimeOfDayGreeting()}, {getUserName()}! 👋
                </h2>
                <p className="text-blue-100">
                  Welcome to your admin dashboard. You have full system access to manage the platform.
                </p>
                <div className="mt-4 flex items-center space-x-6">
                  <div>
                    <p className="text-sm text-blue-100 font-medium">Platform Status</p>
                    <p className="text-lg font-semibold flex items-center">
                      <CheckCircle className="h-5 w-5 mr-1" />
                      All Systems Operational
                    </p>
                  </div>
                  <div className="border-l border-blue-300 pl-6">
                    <p className="text-sm text-blue-100 font-medium">Last Login</p>
                    <p className="text-lg font-semibold">
                      {user?.lastLoginAt ? format(new Date(user.lastLoginAt), 'MMM d, h:mm a') : 'First login'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="hidden md:block">
                <Shield className="h-24 w-24 text-blue-200 opacity-50" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Enhanced Dashboard Stats */}
        <DashboardStats userRole="admin" />

        {/* Pending Approvals Section */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-yellow-600" />
                <h2 className="text-lg font-semibold text-gray-900">Pending User Approvals</h2>
                {pendingUsers && pendingUsers.length > 0 && (
                  <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                    {pendingUsers.length} pending
                  </span>
                )}
              </div>
              <Button variant="ghost" className="text-medical-blue-600 hover:text-medical-blue-700">
                View All
              </Button>
            </div>

            <div className="space-y-4">
              {pendingLoading ? (
                <div className="text-center py-4 text-gray-500">Loading pending users...</div>
              ) : pendingUsers && pendingUsers.length > 0 ? (
                pendingUsers.map((user: any) => {
                  const riskLevel = user.suspiciousFlags?.length > 2 ? 'critical' : 
                                   user.suspiciousFlags?.length > 0 ? 'high' : 'low';
                  const registeredAt = new Date(user.createdAt).toLocaleString();

                  return (
                <div key={user.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="font-medium text-gray-900">{user.firstName} {user.lastName}</p>
                        <p className="text-sm text-gray-600">{user.email}</p>
                        <p className="text-xs text-gray-500 mt-1">Registered {registeredAt}</p>
                      </div>
                      <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                        riskLevel === 'critical' ? 'bg-red-100 text-red-800' :
                        riskLevel === 'high' ? 'bg-orange-100 text-orange-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {riskLevel === 'critical' ? 'Critical Risk' :
                         riskLevel === 'high' ? 'High Risk' : 'Low Risk'}
                      </div>
                    </div>
                    {user.suspiciousFlags && user.suspiciousFlags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {user.suspiciousFlags.map((flag: string, idx: number) => (
                          <span key={idx} className="text-xs bg-yellow-50 text-yellow-700 px-2 py-1 rounded">
                            {flag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="text-green-600 hover:text-green-700 hover:bg-green-50"
                      onClick={() => approveUserMutation.mutate(user.id)}
                      disabled={approveUserMutation.isPending}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => rejectUserMutation.mutate({ userId: user.id, reason: 'Failed security check' })}
                      disabled={rejectUserMutation.isPending}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                  </div>
                </div>
                  );
                })
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Shield className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p>No pending users to review</p>
                  <p className="text-sm mt-1">All users have been approved or rejected</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* System Login Activity */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-semibold text-gray-900">Recent System Activity</h2>
              </div>
              <Button variant="ghost" className="text-medical-blue-600 hover:text-medical-blue-700">
                View All Sessions
              </Button>
            </div>

            <div className="space-y-3">
              {sessionsLoading ? (
                <div className="text-center py-4 text-gray-500">Loading login activity...</div>
              ) : allLoginSessions && allLoginSessions.length > 0 ? (
                allLoginSessions.slice(0, 8).map((session: any) => (
                  <div key={session.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className={`w-3 h-3 rounded-full ${
                        session.is_active ? 'bg-green-500' : 'bg-gray-300'
                      }`} />
                      <div>
                        <p className="font-medium text-gray-900">
                          {session.users?.firstName} {session.users?.lastName}
                        </p>
                        <p className="text-sm text-gray-600">{session.users?.email}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">
                        {session.device_type} • {session.browser}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(session.login_time).toLocaleDateString()} at{' '}
                        {new Date(session.login_time).toLocaleTimeString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        session.users?.role === 'admin' ? 'bg-red-100 text-red-800' :
                        session.users?.role === 'agent' ? 'bg-blue-100 text-blue-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {session.users?.role}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Clock className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p>No recent login activity</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Members Management Table */}
        <Card className="mt-8">
          <CardContent className="p-0">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-lg font-semibold text-gray-900">All App Users (Agents & Admins)</h2>
                <div className="mt-4 sm:mt-0">
                  <div className="relative">
                    <Input 
                      id="admin-user-search"
                      name="userSearch"
                      placeholder="Search users..." 
                      className="pl-10 pr-4 py-2"
                      autoComplete="off"
                    />
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              {usersLoading ? (
                <div className="flex justify-center py-8">
                  <LoadingSpinner />
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Role
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Agent Number
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {usersData?.users?.map((user: any) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          {user.firstName} {user.lastName}
                          {user.role === 'agent' && (
                            <span className="ml-2 text-xs text-blue-600 font-medium">(Staff)</span>
                          )}
                        </TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Badge variant={user.role === 'admin' ? 'default' : user.role === 'agent' ? 'secondary' : 'outline'}>
                            {user.role === 'agent' ? 'Agent (Staff)' : user.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <span>{user.agentNumber || 'Not Assigned'}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-blue-600 hover:text-blue-900 p-1 h-6"
                              onClick={() => {
                                setAgentNumberInput(user.agentNumber || '');
                                setAssignAgentNumberDialog({ open: true, userId: user.id, currentNumber: user.agentNumber });
                              }}
                            >
                              {user.agentNumber ? 'Edit' : 'Assign'}
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col space-y-1">
                            <div className="flex items-center space-x-2">
                              <Badge 
                                variant={user.approvalStatus === 'approved' ? 'default' : 
                                        user.approvalStatus === 'suspended' ? 'destructive' : 
                                        user.approvalStatus === 'rejected' ? 'outline' : 'secondary'}
                                className={user.approvalStatus === 'approved' ? 'bg-green-100 text-green-800' : ''}
                              >
                                {user.approvalStatus || 'pending'}
                              </Badge>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Switch
                                checked={user.isActive}
                                onCheckedChange={async () => {
                                try {
                                  // Get Supabase session for authentication
                                  const { supabase } = await import('@/lib/supabase');
                                  const { data: { session } } = await supabase.auth.getSession();
                                  
                                  if (!session?.access_token) {
                                    throw new Error('Authentication required');
                                  }
                                  
                                  const response = await fetch(`/api/admin/users/${user.id}/toggle-status`, {
                                    method: 'PUT',
                                    headers: {
                                      'Authorization': `Bearer ${session.access_token}`,
                                      'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                      isActive: !user.isActive,
                                      userRole: user.role // Send role to backend for proper handling
                                    })
                                  });

                                  if (!response.ok) {
                                    const errorData = await response.json();
                                    throw new Error(errorData.message || 'Failed to update status');
                                  }

                                  toast({
                                    title: "Success",
                                    description: `${user.role === 'agent' ? 'Agent' : 'User'} ${!user.isActive ? 'activated' : 'deactivated'} successfully`,
                                  });

                                  // Refresh data
                                  refetch();
                                } catch (error: any) {
                                  toast({
                                    title: "Error",
                                    description: error.message || "Failed to update user status",
                                    variant: "destructive"
                                  });
                                }
                              }}
                              />
                              <span className="text-sm">{user.isActive ? 'Active' : 'Inactive'}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-medical-blue-600 hover:text-medical-blue-900 mr-3"
                            onClick={() => {
                              setEditFormData({
                                firstName: user.firstName || '',
                                lastName: user.lastName || '',
                                email: user.email || '',
                                phone: user.phone || ''
                              });
                              setEditUserDialog({ open: true, user });
                            }}
                          >
                            Edit
                          </Button>
                          {user.isActive ? (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-red-600 hover:text-red-900"
                              onClick={async () => {
                                try {
                                  // Get Supabase session for authentication
                                  const { supabase } = await import('@/lib/supabase');
                                  const { data: { session } } = await supabase.auth.getSession();
                                  
                                  if (!session?.access_token) {
                                    throw new Error('Authentication required');
                                  }
                                  
                                  const response = await fetch(`/api/admin/users/${user.id}/suspend`, {
                                    method: 'PUT',
                                    headers: {
                                      'Authorization': `Bearer ${session.access_token}`,
                                      'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                      reason: 'Suspended by administrator'
                                    })
                                  });

                                  if (!response.ok) {
                                    const errorData = await response.json();
                                    throw new Error(errorData.message || 'Failed to suspend user');
                                  }

                                  toast({
                                    title: "Success",
                                    description: `User suspended successfully`,
                                  });

                                  // Refresh data
                                  refetch();
                                } catch (error: any) {
                                  toast({
                                    title: "Error",
                                    description: error.message || "Failed to suspend user",
                                    variant: "destructive"
                                  });
                                }
                              }}
                            >
                              Suspend
                            </Button>
                          ) : (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-green-600 hover:text-green-900"
                              onClick={async () => {
                                try {
                                  // Get Supabase session for authentication
                                  const { supabase } = await import('@/lib/supabase');
                                  const { data: { session } } = await supabase.auth.getSession();
                                  
                                  if (!session?.access_token) {
                                    throw new Error('Authentication required');
                                  }
                                  
                                  const response = await fetch(`/api/admin/users/${user.id}/reactivate`, {
                                    method: 'PUT',
                                    headers: {
                                      'Authorization': `Bearer ${session.access_token}`,
                                      'Content-Type': 'application/json'
                                    }
                                  });

                                  if (!response.ok) {
                                    const errorData = await response.json();
                                    throw new Error(errorData.message || 'Failed to reactivate user');
                                  }

                                  toast({
                                    title: "Success",
                                    description: `User reactivated successfully`,
                                  });

                                  // Refresh data
                                  refetch();
                                } catch (error: any) {
                                  toast({
                                    title: "Error",
                                    description: error.message || "Failed to reactivate user",
                                    variant: "destructive"
                                  });
                                }
                              }}
                            >
                              Reactivate
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination */}
            <div className="px-6 py-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  Showing <span className="font-medium">1</span> to{" "}
                  <span className="font-medium">{Math.min(10, usersData?.users?.length || 0)}</span> of{" "}
                  <span className="font-medium">{usersData?.totalCount || 0}</span> results
                </div>
                <div className="flex items-center space-x-2">
                  <Button variant="ghost" size="sm" disabled>
                    Previous
                  </Button>
                  <Button size="sm" className="bg-white hover:bg-gray-100 text-black border border-gray-300">
                    1
                  </Button>
                  <Button variant="ghost" size="sm">
                    2
                  </Button>
                  <Button variant="ghost" size="sm">
                    3
                  </Button>
                  <Button variant="ghost" size="sm">
                    Next
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Agent Number Assignment Dialog */}
        <Dialog open={assignAgentNumberDialog.open} onOpenChange={(open) => setAssignAgentNumberDialog({ ...assignAgentNumberDialog, open })}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {assignAgentNumberDialog.currentNumber ? 'Edit Agent Number' : 'Assign Agent Number'}
              </DialogTitle>
              <DialogDescription>
                Enter a unique agent number for commission tracking. Each agent/admin must have a unique identifier.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="agent-number" className="text-right">
                  Agent Number
                </Label>
                <Input
                  id="agent-number"
                  value={agentNumberInput}
                  onChange={(e) => setAgentNumberInput(e.target.value.toUpperCase())}
                  placeholder="e.g., MPP0001"
                  className="col-span-3"
                  maxLength={10}
                />
              </div>
              <div className="space-y-2 ml-[108px]">
                <div className="text-sm text-gray-600 font-medium">Format Guidelines:</div>
                <div className="text-sm text-gray-500">
                  • Standard format: <span className="font-mono bg-gray-100 px-1">MPP####</span> (e.g., MPP0001, MPP0100)
                </div>
                <div className="text-sm text-gray-500">
                  • Admins typically use: MPP0001 - MPP0099
                </div>
                <div className="text-sm text-gray-500">
                  • Agents typically use: MPP0100 and above
                </div>
                {assignAgentNumberDialog.currentNumber && (
                  <div className="text-sm text-blue-600 mt-2">
                    Current: <span className="font-mono font-bold">{assignAgentNumberDialog.currentNumber}</span>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setAssignAgentNumberDialog({ open: false, userId: '', currentNumber: null })}
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (!agentNumberInput) {
                    toast({
                      title: "Error",
                      description: "Agent number cannot be empty",
                      variant: "destructive"
                    });
                    return;
                  }
                  
                  // Validate format (must start with MPP and have 4 digits)
                  if (!agentNumberInput.match(/^MPP\d{4}$/)) {
                    toast({
                      title: "Error",
                      description: "Agent number must be in format MPP#### (e.g., MPP0001)",
                      variant: "destructive"
                    });
                    return;
                  }

                  try {
                    const { supabase } = await import('@/lib/supabase');
                    const { data: { session } } = await supabase.auth.getSession();
                    
                    if (!session?.access_token) {
                      throw new Error('Authentication required');
                    }
                    
                    const response = await fetch(`/api/admin/users/${assignAgentNumberDialog.userId}/assign-agent-number`, {
                      method: 'PUT',
                      headers: {
                        'Authorization': `Bearer ${session.access_token}`,
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({
                        agentNumber: agentNumberInput
                      })
                    });

                    if (!response.ok) {
                      const errorData = await response.json();
                      throw new Error(errorData.message || 'Failed to assign agent number');
                    }

                    toast({
                      title: "Success",
                      description: `Agent number ${agentNumberInput} assigned successfully`,
                    });

                    setAssignAgentNumberDialog({ open: false, userId: '', currentNumber: null });
                    setAgentNumberInput('');
                    refetch();
                  } catch (error: any) {
                    toast({
                      title: "Error",
                      description: error.message || "Failed to assign agent number",
                      variant: "destructive"
                    });
                  }
                }}
              >
                {assignAgentNumberDialog.currentNumber ? 'Update' : 'Assign'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit User Dialog */}
        <Dialog open={editUserDialog.open} onOpenChange={(open) => setEditUserDialog({ open, user: null })}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit User Information</DialogTitle>
              <DialogDescription>
                Update user profile information for {editUserDialog.user?.email}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-firstName" className="text-right">
                  First Name
                </Label>
                <Input
                  id="edit-firstName"
                  name="firstName"
                  value={editFormData.firstName}
                  onChange={(e) => setEditFormData({ ...editFormData, firstName: e.target.value })}
                  className="col-span-3"
                  autoComplete="given-name"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-lastName" className="text-right">
                  Last Name
                </Label>
                <Input
                  id="edit-lastName"
                  name="lastName"
                  value={editFormData.lastName}
                  onChange={(e) => setEditFormData({ ...editFormData, lastName: e.target.value })}
                  className="col-span-3"
                  autoComplete="family-name"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-email" className="text-right">
                  Email
                </Label>
                <Input
                  id="edit-email"
                  name="email"
                  type="email"
                  value={editFormData.email}
                  onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                  className="col-span-3"
                  autoComplete="email"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-phone" className="text-right">
                  Phone
                </Label>
                <Input
                  id="edit-phone"
                  name="phone"
                  type="tel"
                  value={editFormData.phone}
                  onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                  className="col-span-3"
                  autoComplete="tel"
                  placeholder="(555) 555-5555"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setEditUserDialog({ open: false, user: null })}
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (!editFormData.firstName || !editFormData.lastName || !editFormData.email) {
                    toast({
                      title: "Error",
                      description: "First name, last name, and email are required",
                      variant: "destructive"
                    });
                    return;
                  }

                  try {
                    const { supabase } = await import('@/lib/supabase');
                    const { data: { session } } = await supabase.auth.getSession();
                    
                    if (!session?.access_token) {
                      throw new Error('Authentication required');
                    }
                    
                    const response = await fetch(`/api/admin/users/${editUserDialog.user.id}`, {
                      method: 'PUT',
                      headers: {
                        'Authorization': `Bearer ${session.access_token}`,
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({
                        firstName: editFormData.firstName,
                        lastName: editFormData.lastName,
                        email: editFormData.email,
                        phone: editFormData.phone
                      })
                    });

                    if (!response.ok) {
                      const errorData = await response.json();
                      throw new Error(errorData.message || 'Failed to update user');
                    }

                    toast({
                      title: "Success",
                      description: "User information updated successfully",
                    });

                    setEditUserDialog({ open: false, user: null });
                    refetch();
                  } catch (error: any) {
                    toast({
                      title: "Error",
                      description: error.message || "Failed to update user",
                      variant: "destructive"
                    });
                  }
                }}
              >
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Admin Create User Dialog */}
        <AdminCreateUserDialog 
          isOpen={createUserDialogOpen}
          onClose={() => setCreateUserDialogOpen(false)}
          onUserCreated={(user) => {
            toast({
              title: "Success",
              description: `User account created: ${user.email}`,
            });
            queryClient.invalidateQueries({ queryKey: ['users'] });
          }}
        />
      </div>
    </div>
  );
}