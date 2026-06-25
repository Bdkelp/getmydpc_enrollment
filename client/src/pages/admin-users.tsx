import { useState } from 'react';
import AppShell from '@/components/AppShell';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { useAdminUsersQueries } from "@/hooks/useAdminUsersQueries";
import { useAdminUsersMutations } from "@/hooks/useAdminUsersMutations";
import { useAuth } from "@/hooks/useAuth";
import { hasAtLeastRole } from "@/lib/roles";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { CardDescription } from "@/components/ui/card";
import { 
  Search, 
  Shield, 
  UserCheck, 
  User, 
  AlertCircle, 
  Ban, 
  Mail, 
  Eye,
  CreditCard,
  MapPin,
  Trash2,
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
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  bankName?: string;
  routingNumber?: string;
  accountNumber?: string;
  accountType?: string;
  accountHolderName?: string;
  subscription?: {
    status: string;
    planName: string;
    amount: number;
  };
}

const AGENT_SCOPE_ROLES = new Set(['agent', 'agency_admin', 'agency_manager', 'user']);
const PLATFORM_ADMIN_ROLES = new Set(['admin', 'super_admin']);

const isAgentScopeRole = (role?: string) => AGENT_SCOPE_ROLES.has(String(role || '').toLowerCase());
const isPlatformAdminRole = (role?: string) => PLATFORM_ADMIN_ROLES.has(String(role || '').toLowerCase());
const isStaffProfileRole = (role?: string) => isAgentScopeRole(role) || isPlatformAdminRole(role);

export default function AdminUsers() {
  const [, setLocation] = useLocation();
  const { user: currentUser } = useAuth();
  const isCurrentUserSuperAdmin = hasAtLeastRole(currentUser?.role, "super_admin");
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState(() => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    return tab === 'members' || tab === 'agents' || tab === 'admins' ? tab : 'members';
  });
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [selectedProfileUser, setSelectedProfileUser] = useState<UserType | null>(null);

  const { usersData, isLoading, error, dpcMembersData, membersLoading, membersError } = useAdminUsersQueries();
  const {
    updateRoleMutation,
    updateAgentNumberMutation,
    suspendUserMutation,
    suspendMemberMutation,
    reactivateUserMutation,
    reactivateMemberMutation,
    approveUserMutation,
    removeUserMutation,
    startImpersonationMutation,
  } = useAdminUsersMutations();

  // Safe array handling for users data (agents and admins)
  const rawUsers = usersData?.users;
  const safeUsers = Array.isArray(rawUsers) ? rawUsers : [];

  // Safe array handling for DPC members data (from Neon database)
  const rawMembers = dpcMembersData?.members;
  const safeMembers = Array.isArray(rawMembers) ? rawMembers : [];

  // Filter users by role
  const members = safeMembers; // DPC members from Neon database
  const agents = safeUsers.filter((u: UserType) => u && isAgentScopeRole(u.role));
  const admins = safeUsers.filter((u: UserType) => u && isPlatformAdminRole(u.role));

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
      case 'super_admin':
        return 'destructive'; // Red badge for super admin
      case 'admin':
        return 'default';
      case 'agency_admin':
      case 'agency_manager':
      case 'agent':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'super_admin':
        return <Shield className="h-3 w-3 text-red-600" />;
      case 'admin':
        return <Shield className="h-3 w-3" />;
      case 'agency_admin':
      case 'agency_manager':
      case 'agent':
        return <UserCheck className="h-3 w-3" />;
      default:
        return <User className="h-3 w-3" />;
    }
  };

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'super_admin':
        return 'Super Admin';
      case 'admin':
        return 'Admin';
      case 'agency_admin':
        return 'Agency Admin';
      case 'agency_manager':
        return 'Agency Manager';
      case 'agent':
        return 'Agent';
      case 'user':
        return 'Basic User';
      default:
        return role;
    }
  };

  const maskAccountNumber = (value?: string) => {
    if (!value) return 'Not provided';
    const clean = String(value).replace(/\D/g, '');
    const last4 = clean.slice(-4);
    return last4 ? `••••${last4}` : 'Not provided';
  };

  const maskRoutingNumber = (value?: string) => {
    if (!value) return 'Not provided';
    const clean = String(value).replace(/\D/g, '');
    if (clean.length < 4) return 'Provided';
    return `•••••${clean.slice(-4)}`;
  };

  const hasPayoutProfile = (user: UserType) =>
    Boolean(
      user.bankName &&
      user.routingNumber &&
      user.accountNumber &&
      user.accountType &&
      user.accountHolderName,
    );

  const hasAddressProfile = (user: UserType) =>
    Boolean(user.address && user.city && user.state && user.zipCode);

  const UserTable = ({ users, showRole = false, showPlan = true }: { users: UserType[], showRole?: boolean, showPlan?: boolean }) => (
    <div className="w-full overflow-x-auto">
      <Table className="min-w-[1220px]">
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
            <TableHead className="text-right min-w-[260px]">Actions</TableHead>
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
                    <div className="w-10 h-10 bg-sky-aqua-50 rounded-full flex items-center justify-center">
                      <span className="text-french-blue-700 font-semibold text-sm">
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
                      {isStaffProfileRole(user.role) && (
                        <div className="mt-1 flex items-center gap-2">
                          <Badge variant="outline" className={hasAddressProfile(user) ? 'text-green-700 border-green-300' : 'text-amber-700 border-amber-300'}>
                            <MapPin className="h-3 w-3 mr-1" />
                            {hasAddressProfile(user) ? 'Address Complete' : 'Address Missing'}
                          </Badge>
                          <Badge variant="outline" className={hasPayoutProfile(user) ? 'text-green-700 border-green-300' : 'text-amber-700 border-amber-300'}>
                            <CreditCard className="h-3 w-3 mr-1" />
                            {hasPayoutProfile(user) ? 'Payout Profile Set' : 'Payout Profile Missing'}
                          </Badge>
                        </div>
                      )}
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
                            <span>{getRoleDisplayName(user.role)}</span>
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
                        <SelectItem value="agency_admin">
                          <div className="flex items-center gap-2">
                            <UserCheck className="h-3 w-3" />
                            Agency Admin
                          </div>
                        </SelectItem>
                        <SelectItem value="agency_manager">
                          <div className="flex items-center gap-2">
                            <UserCheck className="h-3 w-3" />
                            Agency Manager
                          </div>
                        </SelectItem>
                        <SelectItem value="agent">
                          <div className="flex items-center gap-2">
                            <UserCheck className="h-3 w-3" />
                            Agent
                          </div>
                        </SelectItem>
                        <SelectItem value="user">
                          <div className="flex items-center gap-2">
                            <User className="h-3 w-3" />
                            Basic User
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                )}
                <TableCell>
                  {isStaffProfileRole(user.role) ? (
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
                <TableCell className="text-right min-w-[260px]">
                  <div className="flex items-center justify-end space-x-2">
                    {isStaffProfileRole(user.role) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedProfileUser(user);
                          setProfileDialogOpen(true);
                        }}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View Profile
                      </Button>
                    )}
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
                    {user.role !== 'member' && user.id && (
                      <>
                        {isCurrentUserSuperAdmin &&
                          user.id !== currentUser?.id &&
                          user.role !== 'super_admin' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-indigo-600 hover:text-indigo-700"
                              onClick={() => {
                                const userName = user.firstName && user.lastName
                                  ? `${user.firstName} ${user.lastName}`
                                  : user.firstName || user.lastName || user.email || "this user";
                                const reason = prompt(
                                  `Reason for live drop-in as ${userName}:`,
                                  "Support investigation",
                                );
                                if (reason === null) return;

                                startImpersonationMutation.mutate(
                                  {
                                    targetUserId: user.id,
                                    reason: reason.trim() || "Super admin live drop-in",
                                    durationMinutes: 60,
                                  },
                                  {
                                    onSuccess: () => {
                                      setLocation('/agent');
                                    },
                                  },
                                );
                              }}
                              disabled={startImpersonationMutation.isPending}
                            >
                              {startImpersonationMutation.isPending ? 'Starting...' : 'Drop In'}
                            </Button>
                          )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => {
                          const userName = user.firstName && user.lastName
                            ? `${user.firstName} ${user.lastName}`
                            : user.firstName || user.lastName || user.email || 'this user';
                          const confirmRemove = confirm(
                            `Remove ${userName} from active access? This sets the account inactive and suspended.`
                          );
                          if (!confirmRemove) return;
                          removeUserMutation.mutate(user.id);
                        }}
                        disabled={removeUserMutation.isPending}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        {removeUserMutation.isPending ? 'Removing...' : 'Remove'}
                      </Button>
                      </>
                    )}
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
    <AppShell title="User Management" breadcrumb={["Admin"]}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-1 sm:px-2 md:px-0">

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
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
                  <p className="text-sm font-medium text-gray-600">Agents & Users</p>
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
              Agents & Users ({filterBySearch(agents).length})
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
                <CardTitle>Agents & Agency Users</CardTitle>
                <CardDescription>
                  Sales, agency, and basic users who can be managed by platform admins
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
                  <UserTable users={filterBySearch(agents)} showRole={true} showPlan={false} />
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
                  <UserTable users={filterBySearch(admins)} showRole={true} showPlan={false} />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Agent Profile Details</DialogTitle>
              <DialogDescription>
                Admin-only profile and payout visibility for staff and agents.
              </DialogDescription>
            </DialogHeader>

            {selectedProfileUser && (
              <div className="space-y-4 text-sm">
                <div className="rounded-md border p-3">
                  <p className="font-medium text-gray-900 mb-2">Identity</p>
                  <p><span className="text-gray-500">Name:</span> {selectedProfileUser.firstName} {selectedProfileUser.lastName}</p>
                  <p><span className="text-gray-500">Email:</span> {selectedProfileUser.email}</p>
                  <p><span className="text-gray-500">Role:</span> {getRoleDisplayName(selectedProfileUser.role)}</p>
                  <p><span className="text-gray-500">Agent #:</span> {selectedProfileUser.agentNumber || 'Not assigned'}</p>
                </div>

                <div className="rounded-md border p-3">
                  <p className="font-medium text-gray-900 mb-2">Address</p>
                  <p><span className="text-gray-500">Address:</span> {selectedProfileUser.address || 'Not provided'}</p>
                  <p><span className="text-gray-500">City/State/Zip:</span> {selectedProfileUser.city || '—'}, {selectedProfileUser.state || '—'} {selectedProfileUser.zipCode || '—'}</p>
                </div>

                <div className="rounded-md border p-3">
                  <p className="font-medium text-gray-900 mb-2">Payout / Banking</p>
                  <p><span className="text-gray-500">Bank Name:</span> {selectedProfileUser.bankName || 'Not provided'}</p>
                  <p><span className="text-gray-500">Account Holder:</span> {selectedProfileUser.accountHolderName || 'Not provided'}</p>
                  <p><span className="text-gray-500">Account Type:</span> {selectedProfileUser.accountType || 'Not provided'}</p>
                  <p><span className="text-gray-500">Routing Number:</span> {maskRoutingNumber(selectedProfileUser.routingNumber)}</p>
                  <p><span className="text-gray-500">Account Number:</span> {maskAccountNumber(selectedProfileUser.accountNumber)}</p>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}