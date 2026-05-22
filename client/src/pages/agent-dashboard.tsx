import { useState } from "react";
import AppShell from "@/components/AppShell";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Download, Users, DollarSign, Phone, UserPlus, TrendingUp, AlertCircle, Shield, User, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PerformanceGoals } from "@shared/performanceGoals";
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
import { Input } from "@/components/ui/input";
import { hasAtLeastRole, normalizeRole } from "@/lib/roles";
import { LIFECYCLE_ALERT_LEGEND, getLifecycleAlertBadgeClasses, getLifecycleAlertLabel } from "@/lib/lifecycleAlertUi";
import {
  getLifecyclePendingBadgeClasses,
  getLifecyclePendingLabel,
  getLifecyclePaymentRiskBadgeClasses,
  getLifecyclePaymentRiskLabel,
  getLifecycleSubscriptionBadgeClasses,
  getLifecycleSubscriptionLabel,
} from "@/lib/lifecycleSummaryUi";
import { useAgentDashboardFilters } from "@/hooks/useAgentDashboardFilters";
import { useAgentDashboardQueries } from "@/hooks/useAgentDashboardQueries";
import { useAgentDashboardMutations } from "@/hooks/useAgentDashboardMutations";
import { useAgentDashboardUiState } from "@/hooks/useAgentDashboardUiState";

interface AgentStats {
  totalEnrollments: number;
  monthlyEnrollments: number;
  totalCommission: number;
  monthlyCommission: number;
  activeLeads: number;
  conversionRate: number;
  leads: any[];
  monthlyRevenue?: number;
  yearlyRevenue?: number;
  totalRevenue?: number;
  performanceGoals?: PerformanceGoals;
  performanceGoalsMeta?: {
    hasOverride?: boolean;
  };
}

interface Enrollment {
  id: string;
  createdAt: string;
  firstName: string;
  lastName: string;
  planId?: number;
  planName: string;
  memberType: string;
  totalMonthlyPrice: number;
  commissionAmount: number;
  status: string;
  pendingReason?: string;
  pendingDetails?: string;
  subscriptionId?: number;
  memberPublicId?: string | null;
  customerNumber?: string | null;
  payment_status?: string | null;
  payment_id?: number | null;
  subscriptionStatus?: string | null;
  nextBillingDate?: string | null;
  subscriptionEndDate?: string | null;
  lifecycleSummary?: {
    subscriptionStatus?: string | null;
    pendingAction?: string | null;
    nextBillingDate?: string | null;
    accessThroughDate?: string | null;
    paidThroughDate?: string | null;
    paymentRiskStatus?: string;
    commissionStatus?: string | null;
  };
  businessCategory?: 'individual' | 'family' | 'group' | string;
  source?: 'individual' | 'group' | string;
  groupName?: string | null;
}

interface PlanOption {
  id: number;
  name: string;
  price: number | string;
}

interface LifecycleAlertSummary {
  generatedAt: string;
  horizonDays: number;
  billing: {
    dueSoon: number;
    overdue: number;
    failed: number;
    stalePending: number;
    totalAttention: number;
    nextCycleDate: string | null;
  };
  commissions: {
    dueSoon: number;
    overdue: number;
    unscheduled: number;
    pending: number;
    totalAttention: number;
    nextEligibleDate: string | null;
  };
  totals: {
    totalAttention: number;
  };
  billingItems: Array<{
    kind: 'due_soon' | 'overdue' | 'failed' | 'stale_pending';
    subscriptionId?: number | null;
    memberId: number;
    memberLabel: string;
    referenceDate: string | null;
    details?: string | null;
  }>;
  commissionItems: Array<{
    kind: 'due_soon' | 'overdue' | 'unscheduled';
    commissionId: string;
    memberId: number;
    memberLabel: string;
    referenceDate: string | null;
    amount: number;
  }>;
}

type GoalPeriodKey = "weekly" | "monthly" | "quarterly";
type PlanGoalField = "weeklyEnrollments" | "monthlyEnrollments" | "quarterlyEnrollments";

export default function AgentDashboard() {
  const [locationPath, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdminUser = hasAtLeastRole(user?.role, 'admin');
  const isAgentOrAbove = hasAtLeastRole(user?.role, 'agent');
  
  // For admin/super_admin: allow viewing other agents' dashboards
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const viewingAgentId = selectedAgentId || user?.id;
  const isAdminViewing = isAdminUser && selectedAgentId;

  const [dateFilter, setDateFilter] = useState({
    startDate: format(new Date(new Date().setDate(1)), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
  });

  const {
    selectedEnrollment,
    showPendingDialog,
    setShowPendingDialog,
    consentType,
    setConsentType,
    consentNotes,
    setConsentNotes,
    showMembershipDialog,
    setShowMembershipDialog,
    membershipTarget,
    selectedPlanId,
    setSelectedPlanId,
    selectedMemberType,
    setSelectedMemberType,
    membershipReason,
    setMembershipReason,
    getTimeOfDayGreeting,
    getUserName,
    handlePendingClick,
    openMembershipDialog,
    closeMembershipDialog,
    clearPendingDialogState,
    hasSuccessfulPayment,
    getEnrollmentPaymentStatus,
    openEnrollmentCheckout,
  } = useAgentDashboardUiState();

  const {
    allAgents,
    stats,
    statsLoading,
    statsError,
    enrollments,
    enrollmentsLoading,
    enrollmentsError,
    availablePlans,
    lifecycleAlerts,
  } = useAgentDashboardQueries({
    isAdminUser,
    viewingAgentId,
    currentUserId: user?.id,
    dateFilter,
  });

  const {
    businessFilter,
    setBusinessFilter,
    pendingActionFilter,
    setPendingActionFilter,
    paymentRiskFilter,
    setPaymentRiskFilter,
    accessWindowFilter,
    setAccessWindowFilter,
    filteredEnrollments,
    focusMemberId,
  } = useAgentDashboardFilters(enrollments, locationPath);

  // Log errors for debugging
  if (statsError) {
    console.error('[Agent Dashboard] Stats error:', statsError);
  }

  // Log errors for debugging
  if (enrollmentsError) {
    console.error('[Agent Dashboard] Enrollments error:', enrollmentsError);
  }

  const { downloadMutation, membershipMutation, handleResolvePending: resolvePending } =
    useAgentDashboardMutations({
      dateFilter,
      viewingAgentId,
      toast,
      onMembershipSuccess: () => {
        closeMembershipDialog();
      },
      onResolvePendingSuccess: () => {
        clearPendingDialogState();
      },
    });

  const handleNewEnrollment = () => {
    setLocation("/registration");
  };

  const handleLeadClick = (leadId: number) => {
    setLocation(`/agent/leads/${leadId}`);
  };

  const handleResolvePending = async () => {
    await resolvePending({
      selectedEnrollment,
      consentType,
      consentNotes,
      userId: user?.id,
    });
  };

  const formatCurrency = (value?: number | null) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value ?? 0);

  const formatInteger = (value?: number | null) =>
    new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0,
    }).format(value ?? 0);

  const goalPeriodSummaries: Array<{ key: GoalPeriodKey; label: string; helper: string }> = [
    { key: "weekly", label: "Weekly Targets", helper: "Track your weekly pace" },
    { key: "monthly", label: "Monthly Targets", helper: "Primary scorecard" },
    { key: "quarterly", label: "Quarterly Targets", helper: "Longer-term focus" },
  ];

  const planGoalFields: Array<{ key: PlanGoalField; label: string }> = [
    { key: "weeklyEnrollments", label: "Weekly" },
    { key: "monthlyEnrollments", label: "Monthly" },
    { key: "quarterlyEnrollments", label: "Quarterly" },
  ];

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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-sky-aqua-50 via-white to-french-blue-50">
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

  const performanceGoals = stats?.performanceGoals;
  const monthlyGoalEnrollments = performanceGoals?.monthly?.enrollments ?? 0;
  const monthlyGoalRevenue = performanceGoals?.monthly?.revenue ?? 0;
  const monthlyGoalCommissions = performanceGoals?.monthly?.commissions ?? 0;

  const currentMonthlyEnrollments = stats?.monthlyEnrollments || 0;
  const currentMonthlyRevenue = stats?.monthlyRevenue || 0;
  const currentMonthlyCommission = stats?.monthlyCommission || 0;

  const computeProgress = (current: number, goal: number) => {
    if (!goal || goal <= 0) return 0;
    return Math.min(100, Math.round((current / goal) * 100));
  };

  const enrollmentProgress = computeProgress(currentMonthlyEnrollments, monthlyGoalEnrollments);
  const revenueProgress = computeProgress(currentMonthlyRevenue, monthlyGoalRevenue);
  const commissionProgress = computeProgress(currentMonthlyCommission, monthlyGoalCommissions);
  const goalSourceLabel = performanceGoals
    ? (stats?.performanceGoalsMeta?.hasOverride ? "Custom goal active" : "Default platform goal")
    : "Goal targets not configured yet";

  return (
    <AppShell
      title="Agent Dashboard"
      breadcrumb={["Agent"]}
      actions={
        <>
          {isAdminUser && (
            <Button variant="outline" onClick={() => setLocation('/admin')}>
              <Shield className="h-4 w-4 mr-2" />
              Admin View
            </Button>
          )}
          <Button
            onClick={handleNewEnrollment}
            className="border-0 bg-gradient-to-r from-deep-twilight-600 via-french-blue-500 to-bright-teal-blue-500 text-sky-aqua-50 shadow-colored hover:from-deep-twilight-500 hover:to-turquoise-surf-500"
          >
            <UserPlus className="mr-2 h-4 w-4" />
            New Enrollment
          </Button>
        </>
      }
    >

        {/* Agent Selector for Admin/Super_Admin */}
        {isAdminUser && (
          <Card className="mb-6 border-french-blue-200 bg-french-blue-50/70">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <Shield className="h-5 w-5 text-french-blue-600" />
                <div className="flex-1">
                  <label className="mb-2 block text-sm font-medium text-deep-twilight-900">
                    {user?.role === 'super_admin' ? '🎸 Backstage Pass:' : '👔 Admin View:'} View Any Agent's Dashboard
                  </label>
                  <Select
                    value={selectedAgentId || user?.id || ''}
                    onValueChange={(value) => setSelectedAgentId(value === user?.id ? null : value)}
                  >
                    <SelectTrigger className="w-full bg-white md:w-96 border-french-blue-200 focus:ring-bright-teal-blue-500">
                      <SelectValue placeholder="Select an agent to view" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={user?.id || ''}>
                        {user?.firstName} {user?.lastName} (Your Dashboard)
                      </SelectItem>
                      {Array.isArray(allAgents) && allAgents
                        .filter((agent: any) => normalizeRole(agent.role) === 'agent' && agent.id !== user?.id)
                        .map((agent: any) => (
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLocation('/admin/users')}
                >
                  Open Agent DB View
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLocation('/admin/users?tab=members')}
                >
                  Open Member Billing View
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Personalized Welcome Message */}
        <Card className="mb-8 border-0 bg-gradient-to-r from-deep-twilight-700 via-french-blue-600 to-bright-teal-blue-600 text-sky-aqua-50 shadow-colored">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold mb-1">
                  {getTimeOfDayGreeting()}, {getUserName(user)}.
                </h2>
                <p className="text-sky-aqua-100">
                  Your sales dashboard is ready. Keep up the excellent work helping members access quality healthcare membership!
                </p>
                <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <div className="bg-white/10 rounded-lg p-4">
                    <p className="text-sm text-sky-aqua-100">Monthly Enrollment Goal</p>
                    <p className="text-lg font-semibold">{currentMonthlyEnrollments} / {monthlyGoalEnrollments || "—"}</p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-deep-twilight-900/35">
                      <div className="h-full bg-white rounded-full transition-all" style={{ width: `${enrollmentProgress}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-sky-aqua-100">{goalSourceLabel}</p>
                  </div>
                  <div className="bg-white/10 rounded-lg p-4">
                    <p className="text-sm text-sky-aqua-100">Monthly Revenue</p>
                    <p className="text-lg font-semibold">{formatCurrency(currentMonthlyRevenue)}</p>
                    <p className="text-xs text-sky-aqua-100">Goal: {monthlyGoalRevenue ? formatCurrency(monthlyGoalRevenue) : "No goal"} ({revenueProgress}%)</p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-deep-twilight-900/35">
                      <div className="h-full bg-white rounded-full transition-all" style={{ width: `${revenueProgress}%` }} />
                    </div>
                  </div>
                  <div className="bg-white/10 rounded-lg p-4">
                    <p className="text-sm text-sky-aqua-100">Monthly Commission</p>
                    <p className="text-lg font-semibold">{formatCurrency(currentMonthlyCommission)}</p>
                    <p className="text-xs text-sky-aqua-100">Goal: {monthlyGoalCommissions ? formatCurrency(monthlyGoalCommissions) : "No goal"} ({commissionProgress}%)</p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-deep-twilight-900/35">
                      <div className="h-full bg-white rounded-full transition-all" style={{ width: `${revenueProgress}%` }} />
                    </div>
                  </div>
                  <div className="bg-white/10 rounded-lg p-4">
                    <p className="text-sm text-sky-aqua-100">Leads to Follow Up</p>
                    <p className="text-lg font-semibold flex items-center">
                      <Phone className="h-5 w-5 mr-2" />
                      {stats?.activeLeads || 0}
                    </p>
                    <p className="mt-1 text-xs text-sky-aqua-100">Conversion Rate: {(stats?.conversionRate || 0).toFixed(1)}%</p>
                  </div>
                </div>
              </div>
              <div className="hidden md:block">
                <TrendingUp className="h-24 w-24 text-sky-aqua-200 opacity-60" />
              </div>
            </div>
          </CardContent>
        </Card>

        {!!lifecycleAlerts && (
          <Card className="mb-8 border-bright-teal-blue-200 bg-sky-aqua-50/60">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-deep-twilight-800">
                    <AlertCircle className="h-4 w-4" />
                    Recurring Lifecycle Alerts (Next {lifecycleAlerts.horizonDays} Days)
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {LIFECYCLE_ALERT_LEGEND.map((kind) => (
                      <span key={kind} className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getLifecycleAlertBadgeClasses(kind)}`}>
                        {getLifecycleAlertLabel(kind)}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Billing Due Soon</p>
                      <p className="text-lg font-semibold text-gray-900">{lifecycleAlerts.billing.dueSoon}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Billing Overdue + Failed</p>
                      <p className="text-lg font-semibold text-red-700">{lifecycleAlerts.billing.overdue + lifecycleAlerts.billing.failed}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Commissions Due Soon</p>
                      <p className="text-lg font-semibold text-gray-900">{lifecycleAlerts.commissions.dueSoon}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Commissions Overdue + Unscheduled</p>
                      <p className="text-lg font-semibold text-red-700">{lifecycleAlerts.commissions.overdue + lifecycleAlerts.commissions.unscheduled}</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge variant={lifecycleAlerts.totals.totalAttention > 0 ? 'destructive' : 'secondary'}>
                    {lifecycleAlerts.totals.totalAttention} Active Alerts
                  </Badge>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setLocation('/agent')}>
                      Review Billing
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setLocation('/agent/commissions')}>
                      Review Commissions
                    </Button>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-lg border border-french-blue-100 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-2">Top Billing Alerts</p>
                  {(lifecycleAlerts.billingItems || []).slice(0, 4).length > 0 ? (
                    <div className="space-y-2">
                      {(lifecycleAlerts.billingItems || []).slice(0, 4).map((item, idx) => (
                        <button
                          key={`${item.kind}-${item.memberId}-${idx}`}
                          type="button"
                          onClick={() => setLocation(`/agent?memberId=${item.memberId}&alertType=${item.kind}`)}
                          className="w-full text-sm flex items-center justify-between gap-3 rounded px-2 py-1 text-left hover:bg-french-blue-50"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 truncate">{item.memberLabel}</p>
                            <p className="text-xs">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${getLifecycleAlertBadgeClasses(item.kind)}`}>
                                {getLifecycleAlertLabel(item.kind)}
                              </span>
                            </p>
                          </div>
                          <span className="text-xs text-gray-500 whitespace-nowrap">
                            {item.referenceDate ? format(new Date(item.referenceDate), 'MMM d') : 'N/A'}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No billing alerts in the selected horizon.</p>
                  )}
                </div>
                <div className="rounded-lg border border-french-blue-100 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-2">Top Commission Alerts</p>
                  {(lifecycleAlerts.commissionItems || []).slice(0, 4).length > 0 ? (
                    <div className="space-y-2">
                      {(lifecycleAlerts.commissionItems || []).slice(0, 4).map((item, idx) => (
                        <button
                          key={`${item.kind}-${item.commissionId}-${idx}`}
                          type="button"
                          onClick={() => setLocation(`/agent/commissions?memberId=${item.memberId}&commissionId=${item.commissionId}&alertType=${item.kind}`)}
                          className="w-full text-sm flex items-center justify-between gap-3 rounded px-2 py-1 text-left hover:bg-french-blue-50"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 truncate">{item.memberLabel}</p>
                            <p className="text-xs text-gray-500 flex items-center gap-2">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${getLifecycleAlertBadgeClasses(item.kind)}`}>
                                {getLifecycleAlertLabel(item.kind)}
                              </span>
                              <span>${item.amount.toFixed(2)}</span>
                            </p>
                          </div>
                          <span className="text-xs text-gray-500 whitespace-nowrap">
                            {item.referenceDate ? format(new Date(item.referenceDate), 'MMM d') : 'N/A'}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No commission alerts in the selected horizon.</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        
        {performanceGoals && (
          <Card className="mb-8 border border-french-blue-200 bg-white shadow-soft">
            <CardHeader className="pb-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm text-french-blue-700 uppercase tracking-wide font-semibold">Performance Goals</p>
                  <h3 className="text-2xl font-semibold text-deep-twilight-800 mt-1">
                    {stats?.performanceGoalsMeta?.hasOverride ? 'Custom targets for your desk' : 'Platform targets applied to you'}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Weekly, monthly, and quarterly goals are pulled directly from the admin console.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-french-blue-200 bg-french-blue-50 text-french-blue-700">
                    {stats?.performanceGoalsMeta?.hasOverride ? 'Agent Override Active' : 'Default Platform Goal'}
                  </Badge>
                  {isAdminUser && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation('/admin/performance-goals')}
                    >
                      Manage Goals
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                {goalPeriodSummaries.map(({ key, label, helper }) => (
                  <div key={key} className="space-y-3 rounded-xl border border-french-blue-100 bg-french-blue-50/60 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase text-french-blue-700 tracking-wide">{helper}</p>
                        <p className="text-lg font-semibold text-deep-twilight-800">{label}</p>
                      </div>
                      <Target className="h-4 w-4 text-french-blue-600" />
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-gray-500">Enrollments</p>
                        <p className="font-semibold text-gray-900">{formatInteger(performanceGoals[key].enrollments)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Revenue</p>
                        <p className="font-semibold text-gray-900">{formatCurrency(performanceGoals[key].revenue)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Commissions</p>
                        <p className="font-semibold text-gray-900">{formatCurrency(performanceGoals[key].commissions)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Leads</p>
                        <p className="font-semibold text-gray-900">{formatInteger(performanceGoals[key].leads)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-french-blue-600" />
                  <p className="text-sm font-semibold text-deep-twilight-800">Plan Enrollment Targets</p>
                </div>
                {performanceGoals.productGoals?.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 uppercase text-xs tracking-wide">
                          <th className="py-2">Plan</th>
                          {planGoalFields.map((field) => (
                            <th key={field.key} className="py-2">{field.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {performanceGoals.productGoals.map((planGoal) => (
                          <tr key={`${planGoal.planId}-${planGoal.planName || 'plan'}`} className="border-t">
                            <td className="py-2 font-medium text-gray-900">
                              {planGoal.planName || `Plan #${planGoal.planId}`}
                            </td>
                            {planGoalFields.map((field) => (
                              <td key={field.key} className="py-2 text-gray-800">
                                {planGoal[field.key] ?? '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">
                    No plan-specific enrollment targets yet. You can add them from the admin Performance Goals page.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Enhanced Dashboard Stats */}
        <DashboardStats userRole="agent" agentId={viewingAgentId} />

        {/* Recent Enrollments */}
        <Card className="border-french-blue-100">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-deep-twilight-900">Recent Enrollments</CardTitle>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1 rounded-md border border-french-blue-100 bg-white p-1">
                  <Button
                    variant={businessFilter === 'all' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setBusinessFilter('all')}
                  >
                    All
                  </Button>
                  <Button
                    variant={businessFilter === 'individual' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setBusinessFilter('individual')}
                  >
                    Individual
                  </Button>
                  <Button
                    variant={businessFilter === 'group' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setBusinessFilter('group')}
                  >
                    Group
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="dashboardStartDate" className="text-sm text-gray-600">From:</label>
                  <input
                    id="dashboardStartDate"
                    name="startDate"
                    type="date"
                    autoComplete="off"
                    value={dateFilter.startDate}
                    onChange={(e) => setDateFilter({ ...dateFilter, startDate: e.target.value })}
                    className="rounded border border-french-blue-200 px-3 py-1"
                  />
                  <label htmlFor="dashboardEndDate" className="text-sm text-gray-600">To:</label>
                  <input
                    id="dashboardEndDate"
                    name="endDate"
                    type="date"
                    autoComplete="off"
                    value={dateFilter.endDate}
                    onChange={(e) => setDateFilter({ ...dateFilter, endDate: e.target.value })}
                    className="rounded border border-french-blue-200 px-3 py-1"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">Pending:</label>
                  <Select value={pendingActionFilter} onValueChange={setPendingActionFilter}>
                    <SelectTrigger className="h-9 w-[180px] border-french-blue-200">
                      <SelectValue placeholder="All pending" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All pending</SelectItem>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="member_cancelled">Member Cancelled</SelectItem>
                      <SelectItem value="plan_change">Plan Change</SelectItem>
                      <SelectItem value="payment_delinquent">Payment Delinquent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">Risk:</label>
                  <Select value={paymentRiskFilter} onValueChange={setPaymentRiskFilter}>
                    <SelectTrigger className="h-9 w-[140px] border-french-blue-200">
                      <SelectValue placeholder="All risk" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All risk</SelectItem>
                      <SelectItem value="ok">OK</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                      <SelectItem value="unknown">Unknown</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">Access:</label>
                  <Select value={accessWindowFilter} onValueChange={setAccessWindowFilter}>
                    <SelectTrigger className="h-9 w-[200px] border-french-blue-200">
                      <SelectValue placeholder="All access windows" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All access windows</SelectItem>
                      <SelectItem value="has_access_through">Has access-through date</SelectItem>
                      <SelectItem value="missing_access_through">Missing access-through date</SelectItem>
                      <SelectItem value="access_ended">Access ended</SelectItem>
                      <SelectItem value="access_active_or_future">Access active/future</SelectItem>
                    </SelectContent>
                  </Select>
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
            {focusMemberId && (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-french-blue-200 bg-french-blue-50/60 p-3">
                <p className="text-sm text-deep-twilight-900">Focused member view: #{focusMemberId}</p>
                <Button size="sm" variant="outline" onClick={() => setLocation('/agent')}>
                  Clear Focus
                </Button>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Date</th>
                    <th className="text-left py-2">Member ID</th>
                    <th className="text-left py-2">Member Name</th>
                    <th className="text-left py-2">Plan</th>
                    <th className="text-left py-2">Type</th>
                    <th className="text-left py-2">Monthly</th>
                    <th className="text-left py-2">Commission</th>
                    <th className="text-left py-2">Enrolled By</th>
                    <th className="text-left py-2">Status</th>
                    <th className="text-left py-2">Lifecycle</th>
                    <th className="text-left py-2">Payment</th>
                    <th className="text-left py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEnrollments.map((enrollment: any) => (
                    <tr 
                      key={enrollment.id} 
                      className={`border-b border-french-blue-100 hover:bg-french-blue-50/40 ${enrollment.status === 'pending' ? 'cursor-pointer' : ''}`}
                      onClick={() => enrollment.status === 'pending' && handlePendingClick(enrollment)}
                    >
                      <td className="py-2">{format(new Date(enrollment.createdAt), "MM/dd/yyyy")}</td>
                      <td className="py-2 font-mono text-xs">
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
                      </td>
                      <td className="py-2">{enrollment.firstName} {enrollment.lastName}</td>
                      <td className="py-2">{enrollment.planName}</td>
                      <td className="py-2">{enrollment.memberType}</td>
                      <td className="py-2">${enrollment.totalMonthlyPrice}</td>
                      <td className="py-2 text-green-600">${enrollment.commissionAmount ? Number(enrollment.commissionAmount).toFixed(2) : '0.00'}</td>
                      <td className="py-2">
                        {enrollment.enrolledBy && enrollment.enrolledBy.includes('Downline') ? (
                          <span className="text-xs text-blue-600" title={enrollment.enrolledByAgentName || ''}>
                            {enrollment.enrollingAgentNumber || 'Downline'}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-600">Self</span>
                        )}
                      </td>
                      <td className="py-2">
                        <span className={`rounded-full px-2 py-1 text-xs ${
                          enrollment.status === 'active' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-bright-teal-blue-100 text-bright-teal-blue-800'
                        }`}>
                          {enrollment.status}
                          {enrollment.status === 'pending' && (
                            <span className="ml-1">ⓘ</span>
                          )}
                        </span>
                      </td>
                      <td className="py-2 text-xs">
                        {(() => {
                          const lifecycle = enrollment.lifecycleSummary;

                          return (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-gray-500">Sub:</span>
                                <Badge className={getLifecycleSubscriptionBadgeClasses(lifecycle?.subscriptionStatus)}>
                                  {getLifecycleSubscriptionLabel(lifecycle?.subscriptionStatus)}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-gray-500">Pending:</span>
                                <Badge className={getLifecyclePendingBadgeClasses(lifecycle?.pendingAction)}>
                                  {getLifecyclePendingLabel(lifecycle?.pendingAction)}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-gray-500">Risk:</span>
                                <Badge className={getLifecyclePaymentRiskBadgeClasses(lifecycle?.paymentRiskStatus)}>
                                  {getLifecyclePaymentRiskLabel(lifecycle?.paymentRiskStatus)}
                                </Badge>
                              </div>
                              <div>
                                <span className="text-gray-500">Next:</span>{' '}
                                <span className="font-medium">
                                  {lifecycle?.nextBillingDate ? format(new Date(lifecycle.nextBillingDate), 'MMM d, yyyy') : 'n/a'}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-500">Through:</span>{' '}
                                <span className="font-medium">
                                  {lifecycle?.accessThroughDate ? format(new Date(lifecycle.accessThroughDate), 'MMM d, yyyy') : 'n/a'}
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-2">
                        {(() => {
                          const enrollmentCategory = String(enrollment.businessCategory || enrollment.source || '').toLowerCase();
                          const isGroupEnrollment = enrollmentCategory === 'group' || Boolean((enrollment as any).groupName);
                          if (isGroupEnrollment) {
                            return null;
                          }

                          const paymentStatus = getEnrollmentPaymentStatus(enrollment);
                          const canAttemptPayment = !hasSuccessfulPayment(paymentStatus);

                          if (!canAttemptPayment) {
                            return null;
                          }

                          const buttonLabel = paymentStatus === 'failed' || paymentStatus === 'declined'
                            ? 'Retry'
                            : 'Launch';

                          return (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              openEnrollmentCheckout(enrollment, setLocation);
                            }}
                          >
                            {buttonLabel}
                          </Button>
                          );
                        })()}
                      </td>
                      <td className="py-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            openMembershipDialog(enrollment);
                          }}
                        >
                          Manage
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredEnrollments.length === 0 && (
                <p className="text-center py-8 text-gray-500">No enrollments found for this period</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Leads to Follow Up */}
        <Card className="mt-6 border-french-blue-100">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-deep-twilight-900">Leads to Follow Up</CardTitle>
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
                  className="flex cursor-pointer items-center justify-between rounded border border-french-blue-100 bg-french-blue-50/50 p-3 transition-colors hover:bg-french-blue-100/60"
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

      {/* Pending Enrollment Dialog */}
      <Dialog open={showPendingDialog} onOpenChange={setShowPendingDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-french-blue-600" />
              Pending Enrollment Details
            </DialogTitle>
            <DialogDescription>
              Review why this enrollment is pending and record member consent for any changes.
            </DialogDescription>
          </DialogHeader>
          
          {selectedEnrollment && (
            <div className="space-y-4">
              <div className="rounded-lg border border-french-blue-100 bg-french-blue-50/50 p-4">
                <h4 className="font-semibold mb-2">Member Information</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="font-medium">Name:</span> {selectedEnrollment.firstName} {selectedEnrollment.lastName}</div>
                  <div className="col-span-2 font-mono text-xs text-gray-700">
                    <span className="font-sans font-medium text-gray-900 mr-1">Member ID:</span>
                    #{selectedEnrollment.id}
                    {selectedEnrollment.memberPublicId && (
                      <div className="text-[11px] text-gray-500">Public: {selectedEnrollment.memberPublicId}</div>
                    )}
                    {selectedEnrollment.customerNumber && (
                      <div className="text-[11px] text-gray-500">Customer: {selectedEnrollment.customerNumber}</div>
                    )}
                  </div>
                  <div><span className="font-medium">Plan:</span> {selectedEnrollment.planName}</div>
                  <div><span className="font-medium">Type:</span> {selectedEnrollment.memberType}</div>
                  <div><span className="font-medium">Monthly:</span> ${selectedEnrollment.totalMonthlyPrice}</div>
                </div>
              </div>

              <div className="rounded-lg border border-bright-teal-blue-200 bg-sky-aqua-50 p-4">
                <h4 className="mb-2 font-semibold text-deep-twilight-800">Pending Reason</h4>
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

                <div className="rounded border border-french-blue-200 bg-french-blue-50 p-3 text-sm">
                  <p className="font-medium text-deep-twilight-800">Important:</p>
                  <p className="text-french-blue-800">Once submitted, enrollment modifications cannot be altered without new member consent.</p>
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

      <Dialog open={showMembershipDialog} onOpenChange={setShowMembershipDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Change Membership</DialogTitle>
            <DialogDescription>
              Apply upgrade, downgrade, cancellation, or reactivation based on member request.
            </DialogDescription>
          </DialogHeader>

          {membershipTarget && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded p-3 text-sm">
                <div className="font-medium">{membershipTarget.firstName} {membershipTarget.lastName}</div>
                <div className="text-gray-600">Current plan: {membershipTarget.planName}</div>
                <div className="text-gray-600">Current type: {membershipTarget.memberType}</div>
              </div>

              <div>
                <Label>Plan</Label>
                <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePlans.map((plan) => (
                      <SelectItem key={plan.id} value={String(plan.id)}>
                        {plan.name} (${Number(plan.price || 0).toFixed(2)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Coverage Type</Label>
                <Select value={selectedMemberType} onValueChange={setSelectedMemberType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select coverage type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member-only">Member Only</SelectItem>
                    <SelectItem value="member-spouse">Member + Spouse</SelectItem>
                    <SelectItem value="member-children">Member + Children</SelectItem>
                    <SelectItem value="family">Family</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Reason / Consent Notes</Label>
                <Input
                  value={membershipReason}
                  onChange={(e) => setMembershipReason(e.target.value)}
                  placeholder="Document caller request"
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex flex-wrap gap-2 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setShowMembershipDialog(false)}
              disabled={membershipMutation.isPending}
            >
              Close
            </Button>
            <Button
              variant="outline"
              disabled={!membershipTarget || membershipMutation.isPending}
              onClick={() =>
                membershipTarget &&
                membershipMutation.mutate({
                  memberId: membershipTarget.id,
                  action: 'cancel',
                  reason: membershipReason.trim() || 'Cancelled per member request',
                })
              }
            >
              Schedule Cancellation
            </Button>
            <Button
              variant="outline"
              disabled={!membershipTarget || membershipMutation.isPending}
              onClick={() =>
                membershipTarget &&
                membershipMutation.mutate({
                  memberId: membershipTarget.id,
                  action: 'reactivate',
                  reason: membershipReason.trim() || 'Reactivated per member request',
                })
              }
            >
              Reactivate
            </Button>
            <Button
              disabled={!membershipTarget || membershipMutation.isPending}
              onClick={() => {
                if (!membershipTarget) return;
                const requestedPlanId = selectedPlanId ? Number(selectedPlanId) : undefined;
                const requestedMemberType =
                  selectedMemberType && selectedMemberType !== membershipTarget.memberType
                    ? selectedMemberType
                    : undefined;

                if (!requestedPlanId && !requestedMemberType) {
                  toast({
                    title: 'No change selected',
                    description: 'Choose a different plan or coverage type.',
                    variant: 'destructive',
                  });
                  return;
                }

                membershipMutation.mutate({
                  memberId: membershipTarget.id,
                  action: 'change',
                  planId: requestedPlanId,
                  memberType: requestedMemberType,
                  reason: membershipReason.trim() || undefined,
                });
              }}
            >
              Apply Change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}