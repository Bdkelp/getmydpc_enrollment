import React, { useEffect } from "react";
import AppShell from "@/components/AppShell";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useDebugLog } from "@/hooks/useDebugLog";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { hasAtLeastRole } from "@/lib/roles";
import {
  Download,
  Users,
  Calendar,
  Search,
  Filter,
  Plus,
  FileEdit,
  DollarSign,
  AlertTriangle,
  ShieldCheck,
  Archive,
  Undo2,
  RefreshCw,
  Trash2,
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
import { getLifecycleAlertBadgeClasses, getLifecycleAlertLabel } from "@/lib/lifecycleAlertUi";
import {
  getLifecyclePendingBadgeClasses,
  getLifecyclePendingLabel,
  getLifecyclePaymentRiskBadgeClasses,
  getLifecyclePaymentRiskLabel,
  getLifecycleSubscriptionBadgeClasses,
  getLifecycleSubscriptionLabel,
} from "@/lib/lifecycleSummaryUi";
import { useEnrollmentFilters } from "@/hooks/useEnrollmentFilters";
import { useEnrollmentQueries } from "@/hooks/useEnrollmentQueries";
import { useEnrollmentMutations } from "@/hooks/useEnrollmentMutations";
import { useEnrollmentData } from "@/hooks/useEnrollmentData";
import { useEnrollmentFormatters } from "@/hooks/useEnrollmentFormatters";

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
  memberPublicId?: string | null;
  customerNumber?: string | null;
  payment_id?: number | null;
  payment_status?: string | null;
  payment_amount?: number | string | null;
  transaction_id?: string | null;
  payment_date?: string | null;
  epx_auth_guid?: string | null;
  subscriptionId?: number | null;
  subscriptionStatus?: string | null;
  nextBillingDate?: string | null;
  subscriptionEndDate?: string | null;
  subscriptionPendingReason?: string | null;
  subscriptionPendingDetails?: any;
  lifecycleSummary?: {
    subscriptionStatus?: string | null;
    pendingAction?: string | null;
    nextBillingDate?: string | null;
    accessThroughDate?: string | null;
    paidThroughDate?: string | null;
    paymentRiskStatus?: string;
    commissionStatus?: string | null;
  };
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

const ENROLLMENT_RECORD_VIEW_KEY = "adminEnrollmentRecordsView";

function formatDob(dob?: string | null) {
  if (!dob) {
    return "Not provided";
  }
  const digits = dob.replace(/\D/g, "");
  if (digits.length !== 8) {
    return dob;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function hasSuccessfulPayment(paymentStatus?: string | null): boolean {
  const normalized = (paymentStatus || '').toLowerCase();
  return normalized === 'succeeded' || normalized === 'success' || normalized === 'completed';
}

function toMoneyNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const cleaned = String(value ?? '').replace(/[^\d.-]/g, '');
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getLifecycleSummary(enrollment: Enrollment) {
  return enrollment.lifecycleSummary || {
    subscriptionStatus: enrollment.subscriptionStatus || null,
    pendingAction: enrollment.subscriptionPendingReason || null,
    nextBillingDate: enrollment.nextBillingDate || null,
    accessThroughDate: enrollment.subscriptionEndDate || null,
    paymentRiskStatus: String(enrollment.payment_status || '').toLowerCase() || 'unknown',
    commissionStatus: null,
  };
}

export default function AdminEnrollments() {
  const { log } = useDebugLog("AdminEnrollments");
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const isAdminUser = hasAtLeastRole(user?.role, "admin");

  // Use custom hooks for state management
  const filters = useEnrollmentFilters();
  const queries = useEnrollmentQueries(
    user,
    isAdminUser,
    filters.dateFilter,
    filters.selectedAgentId,
    filters.showMembershipOversight,
  );
  const mutations = useEnrollmentMutations(filters.dateFilter, filters.selectedAgentId);
  const enrollmentData = useEnrollmentData(
    queries.enrollments,
    filters.searchTerm,
    filters.statusFilter,
    filters.pendingActionFilter,
    filters.paymentRiskFilter,
    filters.accessWindowFilter,
    filters.focusMemberId,
    filters.focusAlertType,
  );
  const formatters = useEnrollmentFormatters();

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

  useEffect(() => {
    if (!authLoading && user && isAdminUser) {
      window.localStorage.setItem(ENROLLMENT_RECORD_VIEW_KEY, "people");
    }
  }, [authLoading, user, isAdminUser]);

  // Event handlers
  const handleNewEnrollment = () => {
    setLocation("/registration");
  };

  const handleGenerateAgentNumber = (agentId: string) => {
    mutations.generateAgentNumberMutation.mutate(agentId);
  };

  const handleStatusChange = (memberId: string, newStatus: string) => {
    if (!newStatus) return;
    mutations.updateStatusMutation.mutate({
      memberId,
      status: filters.normalizeStatusForApi(newStatus),
    });
  };

  const handleActivateNow = (enrollment: Enrollment) => {
    const confirmOverride = window.confirm(
      `Activate membership for ${enrollment.firstName} ${enrollment.lastName} immediately?`,
    );

    if (!confirmOverride) {
      return;
    }

    mutations.activateNowMutation.mutate({
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
      mutations.toggleTestFlagMutation.mutate({ memberId: member.id, isTestMember: false });
      return;
    }

    const reason = window.prompt(
      `Optional note for marking ${member.firstName} ${member.lastName} as a test membership`,
      "Duplicate enrollment",
    );
    mutations.toggleTestFlagMutation.mutate({
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

    mutations.archiveMembershipMutation.mutate({
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

    mutations.restoreMembershipMutation.mutate({
      memberId: member.id,
      targetStatus: targetStatus?.trim() ? targetStatus.trim() : undefined,
    });
  };

  const handleHardDeleteMemberRecord = (member: DuplicateMembershipMember) => {
    if (!member?.id) {
      return;
    }

    const confirmed = window.confirm(
      `Permanently delete membership for ${member.firstName} ${member.lastName}? This cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    const reason = window.prompt(
      "Optional reason for permanent deletion",
      "Duplicate membership cleanup",
    );
    if (reason === null) {
      return;
    }

    mutations.hardDeleteMembershipMutation.mutate({
      memberId: member.id,
      reason: reason?.trim() ? reason.trim() : undefined,
    });
  };

  const openHostedCheckout = (enrollment: Enrollment) => {
    const monthlyPrice = toMoneyNumber(enrollment.totalMonthlyPrice);
    const params = new URLSearchParams({
      memberId: enrollment.id.toString(),
      amount: String(monthlyPrice),
      description: `Enrollment payment for member #${enrollment.id}`,
    });

    if (enrollment.payment_id) {
      params.set('retryPaymentId', String(enrollment.payment_id));
      params.set('retryMemberId', enrollment.id.toString());
    }

    setLocation(`/admin/payments/checkout?${params.toString()}`);
  };

  const activeFilterCount =
    (filters.selectedAgentId !== "all" ? 1 : 0) +
    (filters.statusFilter !== "all" ? 1 : 0) +
    (filters.pendingActionFilter !== "all" ? 1 : 0) +
    (filters.paymentRiskFilter !== "all" ? 1 : 0) +
    (filters.accessWindowFilter !== "all" ? 1 : 0) +
    (filters.focusMemberId ? 1 : 0) +
    (filters.focusAlertType ? 1 : 0);

  return (
    <ErrorBoundary>
      <AppShell>
        {/* Auth Loading Screen */}
        {authLoading ? (
          <div className="flex items-center justify-center h-screen">
            <LoadingSpinner />
          </div>
        ) : !user ? (
          <div>Not authenticated</div>
        ) : !isAdminUser ? (
          <div>Not authorized</div>
        ) : (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Enrollment Records</h1>
                <p className="mt-2 text-sm text-gray-600">
                  Manage DPC enrollments, members, and agents
                </p>
                <div className="mt-3 w-fit rounded-lg border border-gray-200 bg-gray-50 p-1">
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      className="bg-white text-gray-900 shadow-sm hover:bg-white"
                    >
                      People
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-gray-600 hover:text-gray-900"
                      onClick={() => {
                        window.localStorage.setItem(ENROLLMENT_RECORD_VIEW_KEY, "groups");
                        setLocation("/admin/groups");
                      }}
                    >
                      Groups
                    </Button>
                  </div>
                </div>
              </div>
              <Button
                onClick={handleNewEnrollment}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="mr-2 h-4 w-4" />
                New Enrollment
              </Button>
            </div>

            {/* Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600">
                    Active Members
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{enrollmentData.activePeopleCount}</div>
                  <p className="text-xs text-gray-500 mt-1">
                    ${enrollmentData.averageActiveRevenue.toFixed(0)} avg monthly
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600">
                    Total Revenue
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ${enrollmentData.totalRevenue.toFixed(2)}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Active members only</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600">
                    Est. Commission
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ${enrollmentData.projectedMonthlyCommission.toFixed(2)}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Based on active members</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600">
                    Total Records
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {enrollmentData.filteredEnrollments.length}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {queries.enrollments ? queries.enrollments.length : 0} after filters
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Action Bar */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => mutations.exportMutation.mutate()}
                  disabled={mutations.exportMutation.isPending}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  Export
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => filters.setShowMembershipOversight(!filters.showMembershipOversight)}
                  className={`gap-2 ${filters.showMembershipOversight ? 'bg-blue-50 border-blue-200' : ''}`}
                >
                  <ShieldCheck className="h-4 w-4" />
                  Membership Oversight
                  {filters.showMembershipOversight && (
                    <Badge className="bg-blue-100 text-blue-800 text-xs">
                      ON
                    </Badge>
                  )}
                </Button>
              </div>

              <div className="text-sm text-gray-600">
                {activeFilterCount > 0 && (
                  <span className="font-medium">
                    {activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""} active
                  </span>
                )}
              </div>
            </div>

            {/* Search and Filter Controls */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Filters & Search</CardTitle>
                  <Filter className="h-4 w-4 text-gray-400" />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Search Input */}
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search by name, email, ID, or member public ID"
                    className="pl-10"
                    value={filters.searchTerm}
                    onChange={(e) => filters.setSearchTerm(e.target.value)}
                  />
                </div>

                {/* Filter Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {/* Date Range Filter */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-700">Start Date</label>
                    <Input
                      type="date"
                      value={filters.dateFilter.startDate}
                      onChange={(e) =>
                        filters.setDateFilter({
                          ...filters.dateFilter,
                          startDate: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-700">End Date</label>
                    <Input
                      type="date"
                      value={filters.dateFilter.endDate}
                      onChange={(e) =>
                        filters.setDateFilter({
                          ...filters.dateFilter,
                          endDate: e.target.value,
                        })
                      }
                    />
                  </div>

                  {/* Agent Filter */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-700">Agent</label>
                    <Select
                      value={filters.selectedAgentId}
                      onValueChange={filters.setSelectedAgentId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select agent" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Agents</SelectItem>
                        {queries.agents?.map((agent) => (
                          <SelectItem key={agent.id} value={agent.id}>
                            {agent.firstName} {agent.lastName}
                            {agent.agentNumber && ` (${agent.agentNumber})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Status Filter */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-700">Status</label>
                    <Select
                      value={filters.statusFilter}
                      onValueChange={filters.setStatusFilter}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        {filters.statusOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Pending Action Filter */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-700">Pending Action</label>
                    <Select
                      value={filters.pendingActionFilter}
                      onValueChange={filters.setPendingActionFilter}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="add_spouse_or_dependent">Add Spouse/Dependent</SelectItem>
                        <SelectItem value="confirm_group_ownership">Confirm Group Ownership</SelectItem>
                        <SelectItem value="override_rate">Override Rate</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Payment Risk Filter */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-700">Payment Risk</label>
                    <Select
                      value={filters.paymentRiskFilter}
                      onValueChange={filters.setPaymentRiskFilter}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="succeeded">Succeeded</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="refunded">Refunded</SelectItem>
                        <SelectItem value="unknown">Unknown</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Access Window Filter */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-700">Access Window</label>
                    <Select
                      value={filters.accessWindowFilter}
                      onValueChange={filters.setAccessWindowFilter}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="has_access_through">Has Access Through</SelectItem>
                        <SelectItem value="missing_access_through">Missing Access Through</SelectItem>
                        <SelectItem value="access_ended">Access Ended</SelectItem>
                        <SelectItem value="access_active_or_future">Access Active/Future</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Membership Oversight Section */}
            {filters.showMembershipOversight && (
              <div className="space-y-4">
                <Card className="border-blue-200 bg-blue-50">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-blue-600" />
                      Membership Oversight Dashboard
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Summary Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="p-3 bg-white rounded border">
                        <div className="text-xs text-gray-600 font-medium">Total Members</div>
                        <div className="text-lg font-bold mt-1">
                          {queries.membershipSummaryLoading ? (
                            <LoadingSpinner />
                          ) : (
                            queries.membershipSummary?.total || 0
                          )}
                        </div>
                      </div>
                      <div className="p-3 bg-white rounded border">
                        <div className="text-xs text-gray-600 font-medium">Active</div>
                        <div className="text-lg font-bold text-green-600 mt-1">
                          {queries.membershipSummary?.active || 0}
                        </div>
                      </div>
                      <div className="p-3 bg-white rounded border">
                        <div className="text-xs text-gray-600 font-medium">Test Memberships</div>
                        <div className="text-lg font-bold text-yellow-600 mt-1">
                          {queries.membershipSummary?.test || 0}
                        </div>
                      </div>
                      <div className="p-3 bg-white rounded border">
                        <div className="text-xs text-gray-600 font-medium">Archived</div>
                        <div className="text-lg font-bold text-slate-600 mt-1">
                          {queries.membershipSummary?.archived || 0}
                        </div>
                      </div>
                    </div>

                    {/* Duplicate Memberships Section */}
                    {queries.duplicatesLoading ? (
                      <div className="flex justify-center py-8">
                        <LoadingSpinner />
                      </div>
                    ) : queries.duplicateMemberships && queries.duplicateMemberships.length > 0 ? (
                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-gray-900">
                          Duplicate Memberships ({queries.duplicateMemberships.length})
                        </h3>
                        {queries.duplicateMemberships.map((group, idx) => (
                          <div key={idx} className="border rounded-lg p-3 bg-white">
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <p className="text-sm font-medium text-gray-900">
                                  {group.matchFields.firstName} {group.matchFields.lastName}
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                  DOB: {formatDob(group.matchFields.dateOfBirth)}
                                </p>
                              </div>
                              <Badge className="bg-red-100 text-red-800">
                                {group.count} duplicate{group.count !== 1 ? "s" : ""}
                              </Badge>
                            </div>

                            <div className="space-y-2">
                              {group.members.map((member) => (
                                <div
                                  key={member.id}
                                  className="flex items-center justify-between p-2 bg-gray-50 rounded text-xs"
                                >
                                  <div className="flex-1">
                                    <div className="font-medium text-gray-900">
                                      #{member.id} {member.email}
                                    </div>
                                    <div className="text-gray-600 mt-1">
                                      {member.isTestMember && (
                                        <Badge className="mr-2 bg-yellow-100 text-yellow-800 text-xs">
                                          Test
                                        </Badge>
                                      )}
                                      {member.status && (
                                        <Badge className="mr-2 text-xs">
                                          {member.status}
                                        </Badge>
                                      )}
                                      {member.customerNumber && (
                                        <span className="text-gray-500">
                                          Customer: {member.customerNumber}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex gap-1">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleToggleTestFlag(member)}
                                      disabled={
                                        mutations.toggleTestFlagMutation.isPending ||
                                        member.archivedAt
                                      }
                                      className="text-xs h-7"
                                    >
                                      {member.isTestMember ? "Clear Test" : "Mark Test"}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleArchiveMemberRecord(member)}
                                      disabled={
                                        mutations.archiveMembershipMutation.isPending ||
                                        member.archivedAt
                                      }
                                      className="text-xs h-7"
                                    >
                                      <Archive className="h-3 w-3" />
                                    </Button>
                                    {member.archivedAt && (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => handleRestoreMemberRecord(member)}
                                          disabled={mutations.restoreMembershipMutation.isPending}
                                          className="text-xs h-7"
                                        >
                                          <Undo2 className="h-3 w-3" />
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() =>
                                            handleHardDeleteMemberRecord(member)
                                          }
                                          disabled={
                                            mutations.hardDeleteMembershipMutation.isPending
                                          }
                                          className="text-xs h-7 text-red-600 hover:bg-red-50"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-gray-500">
                        No duplicate memberships detected
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Enrollments Table */}
            {queries.enrollmentsLoading ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : queries.enrollmentsError ? (
              <Card className="border-red-200 bg-red-50">
                <CardHeader>
                  <CardTitle className="text-red-900 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Error Loading Enrollments
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-red-800">
                    {queries.enrollmentsError instanceof Error
                      ? queries.enrollmentsError.message
                      : "Unable to load enrollments. Please try again."}
                  </p>
                </CardContent>
              </Card>
            ) : enrollmentData.filteredEnrollments.length === 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-gray-900">No Enrollments Found</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">
                    {queries.enrollments && queries.enrollments.length > 0
                      ? "No enrollments match your filter criteria."
                      : "No enrollments found for the selected period."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      Enrollments ({enrollmentData.filteredEnrollments.length})
                    </CardTitle>
                    <div className="text-sm text-gray-500">
                      {enrollmentData.filteredEnrollments.length} of{" "}
                      {queries.enrollments ? queries.enrollments.length : 0} records
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Member Info</TableHead>
                          <TableHead>Plan & Price</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Payment</TableHead>
                          <TableHead>Subscription</TableHead>
                          <TableHead>Enrolled By</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {enrollmentData.filteredEnrollments.map((enrollment) => {
                          const lifecycle = getLifecycleSummary(enrollment);
                          const monthlyPrice = toMoneyNumber(enrollment.totalMonthlyPrice);
                          return (
                            <TableRow
                              key={enrollment.id}
                              className={
                                filters.focusMemberId &&
                                (String(enrollment.id) === filters.focusMemberId ||
                                  String(enrollment.memberPublicId) === filters.focusMemberId)
                                  ? "bg-blue-50"
                                  : ""
                              }
                            >
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div>
                                    <p className="text-sm font-medium text-gray-900">
                                      {enrollment.firstName} {enrollment.lastName}
                                    </p>
                                    <p className="text-xs text-gray-500">{enrollment.email}</p>
                                    <p className="text-xs text-gray-400 mt-1">
                                      ID: {enrollment.id}
                                      {enrollment.memberPublicId && ` • Pub: ${enrollment.memberPublicId}`}
                                      {enrollment.customerNumber && ` • Cust: ${enrollment.customerNumber}`}
                                    </p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm">
                                  <p className="font-medium text-gray-900">{enrollment.planName}</p>
                                  <p className="text-xs text-gray-500">{enrollment.memberType}</p>
                                  <p className="text-sm font-semibold text-blue-600 mt-1">
                                    ${monthlyPrice.toFixed(2)}/mo
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="space-y-2">
                                  {formatters.getStatusBadge(enrollment.status)}
                                  {enrollment.lifecycleSummary?.subscriptionStatus && (
                                    <div>
                                      <Badge
                                        className={getLifecycleSubscriptionBadgeClasses(
                                          enrollment.lifecycleSummary.subscriptionStatus,
                                        )}
                                      >
                                        {getLifecycleSubscriptionLabel(
                                          enrollment.lifecycleSummary.subscriptionStatus,
                                        )}
                                      </Badge>
                                    </div>
                                  )}
                                  {lifecycle.pendingAction && (
                                    <div>
                                      <Badge
                                        className={getLifecyclePendingBadgeClasses(
                                          lifecycle.pendingAction,
                                        )}
                                      >
                                        {getLifecyclePendingLabel(lifecycle.pendingAction)}
                                      </Badge>
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="space-y-2">
                                  {formatters.getPaymentStatusBadge(
                                    enrollment.payment_status,
                                    enrollment.transaction_id,
                                  )}
                                  {!hasSuccessfulPayment(enrollment.payment_status) && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => openHostedCheckout(enrollment)}
                                      className="w-full text-xs h-7 gap-1"
                                    >
                                      <DollarSign className="h-3 w-3" />
                                      Process Payment
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-xs space-y-1">
                                  {lifecycle.nextBillingDate && (
                                    <div className="text-gray-900 font-medium">
                                      Next: {format(new Date(lifecycle.nextBillingDate), "MMM d")}
                                    </div>
                                  )}
                                  {lifecycle.accessThroughDate && (
                                    <div className="text-gray-600">
                                      Access: {format(new Date(lifecycle.accessThroughDate), "MMM d")}
                                    </div>
                                  )}
                                  {lifecycle.pendingAction && (
                                    <Badge
                                      className={getLifecyclePendingBadgeClasses(
                                        lifecycle.pendingAction,
                                      )}
                                    >
                                      {getLifecyclePendingLabel(lifecycle.pendingAction)}
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm text-gray-600">
                                  {enrollment.enrolledBy}
                                  {enrollment.enrolledByAgentId && (
                                    <div className="text-xs text-gray-500 mt-1">
                                      ID: {enrollment.enrolledByAgentId}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="min-w-[118px] h-7 border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                                    onClick={() => setLocation(`/admin/enrollment/${enrollment.id}`)}
                                  >
                                    <FileEdit className="h-3 w-3 mr-1" />
                                    View Member
                                  </Button>
                                  {enrollment.status === "pending_activation" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleActivateNow(enrollment)}
                                      disabled={mutations.activateNowMutation.isPending}
                                      className="text-xs h-7"
                                    >
                                      <RefreshCw className="h-3 w-3" />
                                    </Button>
                                  )}
                                  {enrollment.status !== "archived" && (
                                    <Select
                                      value={enrollment.status}
                                      onValueChange={(newStatus) =>
                                        handleStatusChange(enrollment.id, newStatus)
                                      }
                                    >
                                      <SelectTrigger className="w-24 h-7 text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {filters.statusTransitionOptions.map((option) => (
                                          <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </AppShell>
    </ErrorBoundary>
  );
}

