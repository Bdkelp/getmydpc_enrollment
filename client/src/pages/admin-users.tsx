import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";

// API request helper function
async function apiRequest(url: string, options: RequestInit = {}) {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { CardDescription } from "@/components/ui/card";
import { 
  ChevronLeft, 
  Search, 
  Users, 
  Shield, 
  UserCheck, 
  User, 
  AlertCircle, 
  Edit, 
  Ban, 
  Calendar, 
  Mail, 
  Phone 
} from "lucide-react";

interface UserType {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  agentNumber?: string;
  isActive: boolean;
  approvalStatus: string;
  createdAt: string;
  createdBy?: string; // UUID of admin who created this user
  createdByAdmin?: { id: string; firstName: string; lastName: string; email: string }; // Creator info
  lastLoginAt?: string;
  emailVerified: boolean;
  subscription?: {
    status: string;
    planName: string;
    amount: number;
  };
}

export default function AdminUsers() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('members');

  // Test authentication on mount
  useEffect(() => {
    import('@/lib/supabase').then(({ getSession }) => {
      getSession().then(session => {
        console.log('[AdminUsers] Current session:', {
          hasSession: !!session,
          hasToken: !!session?.access_token,
          tokenPreview: session?.access_token?.substring(0, 20) + '...'
        });
      });
    });
  }, []);

  // Set up real-time subscriptions
  useEffect(() => {
    console.log('[AdminUsers] Setting up real-time subscriptions...');

    // Subscribe to users table changes
    const usersSubscription = supabase
      .channel('users-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'users' },
        (payload) => {
          console.log('[AdminUsers] Users table change:', payload);
          queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
          toast({
            title: "Data Updated",
            description: "User data has been updated in real-time",
          });
        }
      )
      .subscribe();

    // Subscribe to subscriptions table changes
    const subscriptionsSubscription = supabase
      .channel('subscriptions-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'subscriptions' },
        (payload) => {
          console.log('[AdminUsers] Subscriptions table change:', payload);
          queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
        }
      )
      .subscribe();

    // Subscribe to payments table changes
    const paymentsSubscription = supabase
      .channel('payments-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'payments' },
        (payload) => {
          console.log('[AdminUsers] Payments table change:', payload);
          queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
        }
      )
      .subscribe();

    return () => {
      console.log('[AdminUsers] Cleaning up subscriptions...');
      supabase.removeChannel(usersSubscription);
      supabase.removeChannel(subscriptionsSubscription);
      supabase.removeChannel(paymentsSubscription);
    };
  }, [queryClient, toast]);

  // Fetch users (agents and admins from Supabase)
  const { data: usersData, isLoading, error } = useQuery({
    queryKey: ['/api/admin/users'],
    queryFn: async () => {
      console.log('[AdminUsers] Fetching users...');
      const data = await apiRequest('/api/admin/users');
      console.log('[AdminUsers] Fetched users:', data);
      return data;
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Fetch DPC members (from Neon database)
  const { data: dpcMembersData, isLoading: membersLoading, error: membersError } = useQuery({
    queryKey: ['/api/admin/members'],
    queryFn: async () => {
      console.log('[AdminUsers] Fetching DPC members...');
      const data = await apiRequest('/api/admin/members');
      console.log('[AdminUsers] Fetched DPC members:', data);
      return data;
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Fetch pending users
  const { data: pendingUsers = [] } = useQuery({
    queryKey: ['/api/admin/pending-users'],
    queryFn: async () => {
      console.log('[AdminUsers] Fetching pending users...');
      const data = await apiRequest('/api/admin/pending-users');
      console.log('[AdminUsers] Fetched pending users:', data);
      return data;
    },
    refetchInterval: 10000, // Check for pending users every 10 seconds
  });

  // Fetch login sessions
  const { data: loginSessions = [] } = useQuery({
    queryKey: ['/api/admin/login-sessions'],
    queryFn: async () => {
      console.log('[AdminUsers] Fetching login sessions...');
      const data = await apiRequest('/api/admin/login-sessions');
      console.log('[AdminUsers] Fetched login sessions:', data);
      return data;
    },
    refetchInterval: 60000, // Refresh every minute
  });

  // Update user role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const response = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({ role }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        let errorMessage = 'Failed to update user role';
        try {
          const parsedError = JSON.parse(errorData);
          errorMessage = parsedError.message || errorMessage;
        } catch {
          errorMessage = errorData || errorMessage;
        }
        throw new Error(errorMessage);
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "User role updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: (error: Error) => {
      console.error('[AdminUsers] Error updating role:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update user role.",
        variant: "destructive",
      });
    },
  });

  // Update agent number mutation
  const updateAgentNumberMutation = useMutation({
    mutationFn: async ({ userId, agentNumber }: { userId: string; agentNumber: string }) => {
      const response = await fetch(`/api/admin/users/${userId}/agent-number`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({ agentNumber }),
      });

      if (!response.ok) {
        throw new Error('Failed to update agent number');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Agent number updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update agent number.",
        variant: "destructive",
      });
    },
  });

  // Suspend user mutation (for agents/admins)
  const suspendUserMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason?: string }) => {
      const response = await fetch(`/api/admin/users/${userId}/suspend`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({ reason }),
      });

      if (!response.ok) {
        throw new Error('Failed to suspend user');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "User suspended successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to suspend user.",
        variant: "destructive",
      });
    },
  });

  // Suspend DPC member mutation (for members in Neon database)
  const suspendMemberMutation = useMutation({
    mutationFn: async ({ customerId, reason }: { customerId: string; reason?: string }) => {
      const response = await fetch(`/api/admin/members/${customerId}/suspend`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({ reason }),
      });

      if (!response.ok) {
        throw new Error('Failed to suspend member');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Member suspended successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/members'] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to suspend member.",
        variant: "destructive",
      });
    },
  });

  // Reactivate user mutation (for agents/admins)
  const reactivateUserMutation = useMutation({
    mutationFn: async ({ userId, reactivateSubscriptions }: { userId: string; reactivateSubscriptions: boolean }) => {
      const response = await fetch(`/api/admin/users/${userId}/reactivate`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({ reactivateSubscriptions }),
      });

      if (!response.ok) {
        throw new Error('Failed to reactivate user');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "User reactivated successfully.",
      });
      // Invalidate queries to refresh the user list and show updated status
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/pending-users'] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reactivate user.",
        variant: "destructive",
      });
    },
  });

  // Reactivate DPC member mutation (for members in Neon database)
  const reactivateMemberMutation = useMutation({
    mutationFn: async ({ customerId }: { customerId: string }) => {
      const response = await fetch(`/api/admin/members/${customerId}/reactivate`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to reactivate member');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Member reactivated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/members'] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reactivate member.",
        variant: "destructive",
      });
    },
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
        description: "The user has been approved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/pending-users'] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to approve user. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Safe array handling for users data (agents and admins)
  const rawUsers = usersData?.users;
  const safeUsers = Array.isArray(rawUsers) ? rawUsers : [];
  const safeUsersData = usersData || { users: [], totalCount: 0 };

  // Safe array handling for DPC members data (from Neon database)
  const rawMembers = dpcMembersData?.members;
  const safeMembers = Array.isArray(rawMembers) ? rawMembers : [];

  // Filter users by role
  const members = safeMembers; // DPC members from Neon database
  const agents = safeUsers.filter((u: UserType) => u && u.role === 'agent');
  const admins = safeUsers.filter((u: UserType) => u && u.role === 'admin');

  // Search filter
  const filterBySearch = (users: UserType[]) => {
    if (!searchTerm) return users;
    const searchLower = searchTerm.toLowerCase();
    return users.filter((user: UserType) => {
      if (!user || typeof user !== 'object') return false;
      return (
        user.email?.toLowerCase().includes(searchLower) ||
        user.firstName?.toLowerCase().includes(searchLower) ||
        user.lastName?.toLowerCase().includes(searchLower)
      );
    });
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin':
        return 'default';
      case 'agent':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
        return <Shield className="h-3 w-3" />;
      case 'agent':
        return <UserCheck className="h-3 w-3" />;
      default:
        return <User className="h-3 w-3" />;
    }
  };

  const UserTable = ({ users, showRole = false, showPlan = true }: { users: UserType[], showRole?: boolean, showPlan?: boolean }) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            {showRole && <TableHead>Role</TableHead>}
            <TableHead>Agent Number</TableHead>
            {showPlan && <TableHead>Plan</TableHead>}
            <TableHead>Status</TableHead>
            <TableHead>Created By</TableHead>
            <TableHead>Joined</TableHead>
            <TableHead>Last Login</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.length === 0 ? (
            <TableRow>
              <TableCell colSpan={showRole ? 9 : 8} className="text-center py-8 text-gray-500">
                No users found in this category
              </TableCell>
            </TableRow>
          ) : (
            users.map((user: UserType) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-medical-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-medical-blue-600 font-semibold text-sm">
                        {user.firstName?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || 'U'}
                        {user.lastName?.[0]?.toUpperCase() || user.email?.[1]?.toUpperCase() || 'U'}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {user.firstName && user.lastName 
                          ? `${user.firstName} ${user.lastName}` 
                          : user.firstName || user.lastName || user.email?.split('@')[0] || 'User'
                        }
                      </p>
                      <p className="text-sm text-gray-500">{user.email}</p>
                    </div>
                  </div>
                </TableCell>
                {showRole && (
                  <TableCell>
                    <Select
                      value={user.role}
                      onValueChange={(value) => {
                        updateRoleMutation.mutate({ userId: user.id, role: value });
                      }}
                      disabled={updateRoleMutation.isPending}
                    >
                      <SelectTrigger className="w-[120px]">
                        <SelectValue>
                          <div className="flex items-center gap-1">
                            {getRoleIcon(user.role)}
                            <span className="capitalize">{user.role}</span>
                          </div>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">
                          <div className="flex items-center gap-2">
                            <Shield className="h-3 w-3" />
                            Admin
                          </div>
                        </SelectItem>
                        <SelectItem value="agent">
                          <div className="flex items-center gap-2">
                            <UserCheck className="h-3 w-3" />
                            Agent
                          </div>
                        </SelectItem>
                        <SelectItem value="member">
                          <div className="flex items-center gap-2">
                            <User className="h-3 w-3" />
                            DPC Member
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                )}
                <TableCell>
                  {user.role === 'agent' || user.role === 'admin' ? (
                    <Input
                      id={`agent-number-${user.id}`}
                      name="agentNumber"
                      type="text"
                      placeholder="MPPSA231154"
                      defaultValue={user.agentNumber || ''}
                      className="w-[140px]"
                      maxLength={12}
                      style={{ textTransform: 'uppercase' }}
                      autoComplete="off"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const value = e.currentTarget.value.trim().toUpperCase();
                          if (value !== (user.agentNumber || '')) {
                            updateAgentNumberMutation.mutate({
                              userId: user.id,
                              agentNumber: value
                            });
                          }
                        }
                      }}
                      onBlur={(e) => {
                        const value = e.target.value.trim().toUpperCase();
                        if (value !== (user.agentNumber || '')) {
                          updateAgentNumberMutation.mutate({
                            userId: user.id,
                            agentNumber: value
                          });
                        }
                      }}
                      disabled={updateAgentNumberMutation.isPending}
                    />
                  ) : (
                    <span className="text-gray-400 text-sm">N/A</span>
                  )}
                </TableCell>
                {showPlan && (
                  <TableCell>
                    {user.subscription ? (
                      <Badge variant="outline" className="text-blue-600">
                        {user.subscription.planName} - ${user.subscription.amount}/mo
                      </Badge>
                    ) : user.role === 'member' || user.role === 'user' ? (
                      <Badge variant="outline" className="text-gray-600">
                        No Active Plan
                      </Badge>
                    ) : (
                      <span className="text-gray-400 text-sm">N/A</span>
                    )}
                  </TableCell>
                )}
                <TableCell>
                  <div className="space-y-1">
                    <Badge
                      variant={user.approvalStatus === 'approved' && user.isActive ? 'default' : 
                              user.approvalStatus === 'pending' ? 'secondary' : 
                              user.approvalStatus === 'suspended' || !user.isActive ? 'destructive' : 'outline'}
                      className={user.approvalStatus === 'approved' && user.isActive ? 'bg-green-100 text-green-800 border-green-200' : ''}
                    >
                      {user.approvalStatus === 'suspended' || (!user.isActive && user.approvalStatus !== 'pending') ? 'Suspended' : 
                       user.approvalStatus === 'approved' && user.isActive ? 'Active' : 
                       user.approvalStatus === 'pending' ? 'Pending' : 'Unknown'}
                    </Badge>
                    {user.emailVerified && (
                      <Badge variant="outline" className="text-green-600">
                        <Mail className="h-3 w-3 mr-1" />
                        Verified
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {user.createdBy && user.createdByAdmin ? (
                    <div className="flex flex-col text-sm">
                      <span className="font-medium text-gray-900">
                        {user.createdByAdmin.firstName} {user.createdByAdmin.lastName}
                      </span>
                      <span className="text-gray-500 text-xs">{user.createdByAdmin.email}</span>
                    </div>
                  ) : (
                    <span className="text-gray-400 text-sm">Self-registered</span>
                  )}
                </TableCell>
                <TableCell>
                  {user.createdAt ? (() => {
                    try {
                      const date = new Date(user.createdAt);
                      return !isNaN(date.getTime()) ? format(date, 'MMM d, yyyy') : 'Invalid Date';
                    } catch (e) {
                      return 'Invalid Date';
                    }
                  })() : 'Unknown'}
                </TableCell>
                <TableCell>
                  {user.lastLoginAt ? (() => {
                    try {
                      const date = new Date(user.lastLoginAt);
                      return !isNaN(date.getTime()) ? format(date, 'MMM d, h:mm a') : 'Invalid Date';
                    } catch (e) {
                      return 'Invalid Date';
                    }
                  })() : 'Never'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end space-x-2">
                    {user.approvalStatus === 'pending' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-600 hover:text-green-700"
                        onClick={() => approveUserMutation.mutate(user.id)}
                        disabled={approveUserMutation.isPending}
                      >
                        Approve
                      </Button>
                    )}
                    {(user.role === 'member' || user.role === 'user') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setLocation(`/admin/enrollment/${user.id}`)}
                      >
                        View DPC Details
                      </Button>
                    )}
                    {(user.approvalStatus === 'suspended' || !user.isActive) && user.approvalStatus !== 'pending' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-green-600 hover:text-green-700"
                        onClick={() => {
                          const userName = user.firstName && user.lastName 
                            ? `${user.firstName} ${user.lastName}` 
                            : user.firstName || user.lastName || user.email || 'this user';
                          
                          if (user.role === 'member' && (user as any).customerNumber) {
                            // DPC Member - use member reactivation mutation
                            const confirmReactivation = confirm(
                              `Reactivate membership for ${userName}?`
                            );
                            if (!confirmReactivation) return;
                            reactivateMemberMutation.mutate({ 
                              customerId: (user as any).customerNumber 
                            });
                          } else if (user.role === 'member' || user.role === 'user') {
                            // Legacy user - use user reactivation
                            const reactivateSubscriptions = confirm(
                              `Reactivate account for ${userName}? Would you also like to reactivate their subscription?`
                            );
                            reactivateUserMutation.mutate({ 
                              userId: user.id, 
                              reactivateSubscriptions 
                            });
                          } else {
                            // Agents and admins
                            const confirmReactivation = confirm(
                              `Reactivate ${user.role} account for ${userName}?`
                            );
                            if (!confirmReactivation) return;
                            reactivateUserMutation.mutate({ 
                              userId: user.id, 
                              reactivateSubscriptions: false 
                            });
                          }
                        }}
                        disabled={reactivateUserMutation.isPending || reactivateMemberMutation.isPending}
                      >
                        <UserCheck className="h-3 w-3 mr-1" />
                        {(reactivateUserMutation.isPending || reactivateMemberMutation.isPending) ? 'Reactivating...' : 'Reactivate'}
                      </Button>
                    ) : user.isActive && user.approvalStatus === 'approved' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => {
                          const reason = prompt("Reason for suspension (optional):");
                          if (reason !== null) { // User didn't cancel
                            // Check if this is a DPC member
                            if (user.role === 'member' && (user as any).customerNumber) {
                              suspendMemberMutation.mutate({ customerId: (user as any).customerNumber, reason });
                            } else {
                              suspendUserMutation.mutate({ userId: user.id, reason });
                            }
                          }
                        }}
                        disabled={suspendUserMutation.isPending || suspendMemberMutation.isPending}
                      >
                        <Ban className="h-3 w-3 mr-1" />
                        {(suspendUserMutation.isPending || suspendMemberMutation.isPending) ? 'Suspending...' : 'Suspend'}
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Button
                variant="ghost"
                onClick={() => setLocation('/admin')}
                className="mr-4"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back to Dashboard
              </Button>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">User Management</h1>
                <p className="text-sm text-gray-600">Manage users by role</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Badge variant="outline" className="text-blue-600 border-blue-600">
                <Users className="h-3 w-3 mr-1" />
                {safeUsersData.totalCount || 0} Total Users
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">DPC Members</p>
                  <p className="text-2xl font-bold text-gray-900">{members.length}</p>
                </div>
                <User className="h-8 w-8 text-gray-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Agents</p>
                  <p className="text-2xl font-bold text-gray-900">{agents.length}</p>
                </div>
                <UserCheck className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Administrators</p>
                  <p className="text-2xl font-bold text-gray-900">{admins.length}</p>
                </div>
                <Shield className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Pending Approval</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {safeUsers.filter((u: UserType) => u && u.approvalStatus === 'pending').length}
                  </p>
                </div>
                <AlertCircle className="h-8 w-8 text-yellow-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Search Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                id="admin-users-search"
                name="userSearch"
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                autoComplete="off"
              />
            </div>
          </CardContent>
        </Card>

        {/* Users Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-3 w-full mb-4">
            <TabsTrigger value="members">
              DPC Members ({filterBySearch(members).length})
            </TabsTrigger>
            <TabsTrigger value="agents">
              Agents ({filterBySearch(agents).length})
            </TabsTrigger>
            <TabsTrigger value="admins">
              Administrators ({filterBySearch(admins).length})
            </TabsTrigger>
          </TabsList>

          {/* Members Tab */}
          <TabsContent value="members">
            <Card>
              <CardHeader>
                <CardTitle>DPC Members</CardTitle>
                <CardDescription>
                  Active subscribers and enrolled members in the Direct Primary Care program
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <LoadingSpinner />
                  </div>
                ) : error ? (
                  <div className="text-center py-8 text-red-500">
                    Error loading users: {error.message}
                  </div>
                ) : (
                  <UserTable users={filterBySearch(members)} showRole={false} showPlan={true} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Agents Tab */}
          <TabsContent value="agents">
            <Card>
              <CardHeader>
                <CardTitle>Agents</CardTitle>
                <CardDescription>
                  Sales agents who can enroll members and track commissions
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <LoadingSpinner />
                  </div>
                ) : error ? (
                  <div className="text-center py-8 text-red-500">
                    Error loading users: {error.message}
                  </div>
                ) : (
                  <UserTable users={filterBySearch(agents)} showRole={false} showPlan={false} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Admins Tab */}
          <TabsContent value="admins">
            <Card>
              <CardHeader>
                <CardTitle>Administrators</CardTitle>
                <CardDescription>
                  System administrators with full access to manage the platform
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <LoadingSpinner />
                  </div>
                ) : error ? (
                  <div className="text-center py-8 text-red-500">
                    Error loading users: {error.message}
                  </div>
                ) : (
                  <UserTable users={filterBySearch(admins)} showRole={false} showPlan={false} />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}