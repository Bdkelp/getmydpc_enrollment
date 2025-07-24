import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { isUnauthorizedError } from "@/lib/authUtils";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
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
  Shield
} from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";

export default function Admin() {
  const { toast } = useToast();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  
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

    if (!authLoading && user && user.role !== "admin") {
      toast({
        title: "Access Denied",
        description: "Admin access required.",
        variant: "destructive",
      });
      return;
    }
  }, [isAuthenticated, authLoading, user, toast]);

  const { data: adminStats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/admin/stats"],
    enabled: isAuthenticated && user?.role === "admin",
    onError: (error: Error) => {
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
    },
  });

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ["/api/admin/users"],
    enabled: isAuthenticated && user?.role === "admin",
    onError: (error: Error) => {
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
    },
  });

  // Fetch pending users
  const { data: pendingUsers, isLoading: pendingLoading } = useQuery({
    queryKey: ["/api/admin/pending-users"],
    enabled: isAuthenticated && user?.role === "admin",
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

  if (!isAuthenticated || !user || user.role !== "admin") {
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
      label: "Total Members",
      value: adminStats?.totalUsers?.toLocaleString() || "0",
      change: "",
      changeType: "positive",
      bgColor: "bg-blue-100",
      iconColor: "text-blue-600",
    },
    {
      icon: DollarSign,
      label: "Monthly Revenue",
      value: `$${adminStats?.monthlyRevenue?.toLocaleString() || "0"}`,
      change: "",
      changeType: "positive",
      bgColor: "bg-green-100",
      iconColor: "text-green-600",
    },
    {
      icon: UserPlus,
      label: "New Enrollments",
      value: adminStats?.newEnrollments?.toLocaleString() || "0",
      change: "",
      changeType: "positive",
      bgColor: "bg-orange-100",
      iconColor: "text-orange-600",
    },
    {
      icon: UserX,
      label: "Churn Rate",
      value: `${adminStats?.churnRate || "0"}%`,
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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
              <p className="text-gray-600 mt-1">Manage users, plans, and system settings</p>
            </div>
            <div className="mt-4 sm:mt-0 flex items-center space-x-4">
              <Link href="/registration">
                <Button className="bg-white hover:bg-gray-100 text-black border border-gray-300">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Enroll Member
                </Button>
              </Link>
              <Link href="/admin/leads">
                <Button variant="outline" className="border-orange-500 text-orange-600 hover:bg-orange-50">
                  <Users className="h-4 w-4 mr-2" />
                  Lead Management
                </Button>
              </Link>
              <Link href="/admin/enrollments">
                <Button variant="outline" className="border-blue-500 text-blue-600 hover:bg-blue-50">
                  <Users className="h-4 w-4 mr-2" />
                  View Enrollments
                </Button>
              </Link>
              <Link href="/agent">
                <Button variant="outline">
                  <Users className="h-4 w-4 mr-2" />
                  Agent View
                </Button>
              </Link>
              <Button className="bg-green-600 hover:bg-green-700 text-white">
                <Download className="h-4 w-4 mr-2" />
                Export Data
              </Button>
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
                    <p className="text-sm text-blue-200">Platform Status</p>
                    <p className="text-lg font-semibold flex items-center">
                      <CheckCircle className="h-5 w-5 mr-1" />
                      All Systems Operational
                    </p>
                  </div>
                  <div className="border-l border-blue-300 pl-6">
                    <p className="text-sm text-blue-200">Last Login</p>
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
        
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => (
            <Card key={index}>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className={`p-3 rounded-full ${stat.bgColor}`}>
                    <stat.icon className={`${stat.iconColor} h-6 w-6`} />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">{stat.label}</p>
                    <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                  </div>
                </div>
                {stat.change && (
                  <div className="mt-4 flex items-center text-sm">
                    <span className={`font-medium ${
                      stat.changeType === "positive" ? "text-green-600" : "text-red-600"
                    }`}>
                      {stat.change}
                    </span>
                    <span className="text-gray-600 ml-2">from last month</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

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

        {/* Quick Actions */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link href="/registration">
                <Button className="w-full justify-start" variant="outline">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Enroll New Member
                </Button>
              </Link>
              <Link href="/admin/enrollments">
                <Button className="w-full justify-start" variant="outline">
                  <Users className="h-4 w-4 mr-2" />
                  View All Enrollments
                </Button>
              </Link>
              <Link href="/admin/leads">
                <Button className="w-full justify-start" variant="outline">
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Manage Leads
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Members Management Table */}
        <Card className="mt-8">
          <CardContent className="p-0">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-lg font-semibold text-gray-900">All Members</h2>
                <div className="mt-4 sm:mt-0 flex items-center space-x-4">
                  <div className="relative">
                    <Input 
                      placeholder="Search members..." 
                      className="pl-10 pr-4 py-2"
                    />
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  </div>
                  <Select defaultValue="all">
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Plans</SelectItem>
                      <SelectItem value="individual">Individual</SelectItem>
                      <SelectItem value="family">Family</SelectItem>
                      <SelectItem value="group">Group</SelectItem>
                    </SelectContent>
                  </Select>
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
                        Member
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Plan
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Joined
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {usersData?.users?.map((user: any) => (
                      <tr key={user.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="w-10 h-10 medical-blue-100 rounded-full flex items-center justify-center">
                              <span className="text-medical-blue-600 font-semibold text-sm">
                                {user.firstName?.[0]}{user.lastName?.[0]}
                              </span>
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">
                                {user.firstName} {user.lastName}
                              </div>
                              <div className="text-sm text-gray-500">{user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            Individual
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            {user.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <Button variant="ghost" size="sm" className="text-medical-blue-600 hover:text-medical-blue-900 mr-3">
                            Edit
                          </Button>
                          <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-900">
                            Suspend
                          </Button>
                        </td>
                      </tr>
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
      </div>
    </div>
  );
}
