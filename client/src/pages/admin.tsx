import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { isUnauthorizedError } from "@/lib/authUtils";
import { hasAtLeastRole, isSuperAdmin as isSuperAdminRole } from "@/lib/roles";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { AdminCreateUserDialog } from "@/components/admin-create-user-dialog";
import DashboardStats from "@/components/DashboardStats";
import EPXHostedPayment from "@/components/EPXHostedPayment";
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
  Lock,
  BarChart,
  User,
  FileText,
  AlertTriangle,
  Target,
  Bell
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getDefaultAvatar, getUserInitials } from "@/lib/avatarUtils";
import { LIFECYCLE_ALERT_LEGEND, getLifecycleAlertBadgeClasses, getLifecycleAlertLabel } from "@/lib/lifecycleAlertUi";
import { Switch } from "@/components/ui/switch";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { WelcomeCard } from "@/components/admin/WelcomeCard";
import { LifecycleAlertsCard } from "@/components/admin/LifecycleAlertsCard";
import { PendingApprovalsCard } from "@/components/admin/PendingApprovalsCard";
import { SystemActivityCard } from "@/components/admin/SystemActivityCard";
import { AdminQuickActions } from "@/components/admin/AdminQuickActions";
import { AdminUsersTableCard } from "@/components/admin/AdminUsersTableCard";
import { AdminUserDialogs } from "@/components/admin/AdminUserDialogs";
import { PartnerLeadDialog } from "@/components/admin/PartnerLeadDialog";
import { RecurringBillingDialogs } from "@/components/admin/RecurringBillingDialogs";
import { AdminConfirmationDialogs } from "@/components/admin/AdminConfirmationDialogs";
import { RecurringBillingControlPanel } from "@/components/admin/RecurringBillingControlPanel";
import { ManualEPXTransactionCard } from "@/components/admin/ManualEPXTransactionCard";
import { SubscriptionCancellationCard } from "@/components/admin/SubscriptionCancellationCard";
import { PartnerLeadsTableCard } from "@/components/admin/PartnerLeadsTableCard";
import { useAdminRecurringBilling } from "@/hooks/useAdminRecurringBilling";
import { useAdminEPXOperations } from "@/hooks/useAdminEPXOperations";
import { useAdminPartnerLeads } from "@/hooks/useAdminPartnerLeads";
import { useAdminUserManagement } from "@/hooks/useAdminUserManagement";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";

// Type definitions for API responses
interface AdminStats {
  totalUsers: number;
  monthlyRevenue: number;
  individualMonthlyRevenue?: number;
  familyMonthlyRevenue?: number;
  groupMonthlyRevenue?: number;
  newEnrollments: number;
  churnRate: number;
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

interface RecurringDuePreviewRow {
  subscriptionId: number;
  memberId: number;
  memberOrAccountName: string;
  payerType: 'member' | 'group';
  amount: number;
  nextBillingDate: string | null;
  readinessState: string;
  skipReason: string | null;
  chargeAttemptResult: string | null;
}

interface RecurringWorkflowResponse {
  success: boolean;
  mode: 'preview' | 'live';
  run?: {
    startedAt: string;
    completedAt: string;
    mode: string;
    metrics?: {
      processed: number;
      skipped: number;
      errors: number;
    };
  };
  duePreview?: {
    dueCount: number;
    rows: RecurringDuePreviewRow[];
    estimatedCommissionImpact: {
      potentialSuccessfulPayments: number;
      estimatedCommissionEntries: number;
      note: string;
    };
    note: string;
  };
  dueRows?: RecurringDuePreviewRow[];
  billingSummary?: {
    totalDue: number;
    processed: number;
    succeeded: number;
    failed: number;
    skipped: number;
  };
  commissionSummary?: {
    successfulPaymentsThatCreatedCommissionEntries: number;
    totalCommissionEntriesCreated: number;
    payoutBatchesAffectedGenerated: Array<{
      id: string;
      batchName: string;
      totalRecords: number;
      totalAmount: number;
    }>;
    membersOrAccountsWithNoCommissionBecausePaymentFailedSkipped: Array<{
      memberId: number;
      memberOrAccountName: string;
      payerType: 'member' | 'group';
      reason: string;
    }>;
  };
}

const ENROLLMENT_RECORD_VIEW_KEY = "adminEnrollmentRecordsView";

export default function Admin() {
  const { toast } = useToast();
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const isAdminUser = hasAtLeastRole(user?.role, "admin");
  const isSuperAdmin = isSuperAdminRole(user?.role);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [assignAgentNumberDialog, setAssignAgentNumberDialog] = useState<{ open: boolean; userId: string; currentNumber: string | null }>({ open: false, userId: '', currentNumber: null });
  const [agentNumberInput, setAgentNumberInput] = useState('');
  const [createUserDialogOpen, setCreateUserDialogOpen] = useState(false);
  const [editUserDialog, setEditUserDialog] = useState<{ open: boolean; user: any | null }>({ open: false, user: null });
  const [editFormData, setEditFormData] = useState({ firstName: '', lastName: '', email: '', phone: '' });

  const {
    confirmLiveRecurringOpen,
    setConfirmLiveRecurringOpen,
    previewRecurringDialogOpen,
    setPreviewRecurringDialogOpen,
    liveRecurringOutcomeOpen,
    setLiveRecurringOutcomeOpen,
    recurringWorkflowResult,
    recurringWorkflowMutation,
    handlePreviewRecurringBilling,
    handleOpenLiveRecurringConfirmation,
    executeLiveRecurringWorkflow,
    previewRows,
    previewDueCount,
    liveBillingSummary,
    liveCommissionSummary,
    handleCopyLiveRecurringSummary,
  } = useAdminRecurringBilling(isSuperAdmin);

  const {
    manualTransactionForm,
    manualTransactionResult,
    setManualTransactionResult,
    cancelSubscriptionForm,
    cancelSubscriptionResult,
    setCancelSubscriptionResult,
    getManualTranLabel,
    manualConfirmPayload,
    setManualConfirmPayload,
    cancelConfirmPayload,
    setCancelConfirmPayload,
    hostedConfirmPayload,
    setHostedConfirmPayload,
    manualTransactionMutation,
    cancelSubscriptionMutation,
    updatePaymentEnvironmentMutation,
    paymentEnvironmentLoading,
    paymentEnvironmentBadgeLabel,
    paymentEnvironmentBadgeClasses,
    paymentEnvironmentButtonTarget,
    paymentEnvironmentButtonLabel,
    paymentEnvironmentUpdatedText,
    environmentAlertTitle,
    environmentAlertDescription,
    environmentAlertClasses,
    EnvironmentAlertIcon,
    handlePaymentEnvironmentChange,
    handleManualFieldChange,
    handleManualTranTypeChange,
    handleManualTransactionSubmit,
    resetManualTransactionForm,
    handleCancelFieldChange,
    resetCancelSubscriptionForm,
    handleCancelSubscriptionSubmit,
    executeManualTransaction,
    executeCancelSubscription,
    handleHostedCheckoutRequest,
    finalizeHostedCheckoutLaunch,
  } = useAdminEPXOperations(isSuperAdmin, isAuthenticated, isAdminUser);

  const {
    partnerLeads,
    partnerLeadCount,
    partnerLeadsLoading,
    partnerLeadFilter,
    setPartnerLeadFilter,
    selectedPartnerLead,
    setSelectedPartnerLead,
    partnerLeadStatusSelection,
    setPartnerLeadStatusSelection,
    partnerLeadNote,
    setPartnerLeadNote,
    updatePartnerLeadMutation,
    openPartnerLeadDialog,
    handlePartnerLeadUpdate,
    statusOptions,
  } = useAdminPartnerLeads(isAuthenticated, isAdminUser);

  const {
    usersData,
    usersLoading,
    usersError,
    refetch,
    pendingUsers,
    pendingLoading,
    allLoginSessions,
    sessionsLoading,
    approveUserMutation,
    rejectUserMutation,
  } = useAdminUserManagement(isAuthenticated, isAdminUser);

  const getEnrollmentRecordsRoute = () => {
    const savedView = window.localStorage.getItem(ENROLLMENT_RECORD_VIEW_KEY);
    return savedView === "groups" ? "/admin/groups" : "/admin/enrollments";
  };

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

    if (!authLoading && user && !isAdminUser) {
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
          queryClient.invalidateQueries({ queryKey: ["/api/admin/lifecycle-alerts"] });
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
          queryClient.invalidateQueries({ queryKey: ["/api/admin/lifecycle-alerts"] });
        }
      )
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'payments' },
        (payload) => {
          console.log('[AdminDashboard] Payments change detected:', payload);
          queryClient.invalidateQueries({ queryKey: ["/api/admin/revenue"] });
          queryClient.invalidateQueries({ queryKey: ["/api/admin/lifecycle-alerts"] });
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
    enabled: isAuthenticated && isAdminUser,
  });

  const { data: lifecycleAlerts } = useQuery<LifecycleAlertSummary>({
    queryKey: ["/api/admin/lifecycle-alerts"],
    enabled: isAuthenticated && isAdminUser,
    queryFn: async () => {
      return apiRequest('/api/admin/lifecycle-alerts?days=7');
    },
    refetchInterval: 60_000,
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

  if (authLoading || statsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isAuthenticated || !user || !isAdminUser) {
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

  const superAdminRestricted = !isSuperAdmin;

  return (
    <AppShell title="Admin Dashboard" breadcrumb={["Admin"]}>
      <AdminQuickActions
        enrollmentRecordsRoute={getEnrollmentRecordsRoute()}
        onNavigate={setLocation}
        onCreateUser={() => setCreateUserDialogOpen(true)}
        onPreviewRecurringBilling={handlePreviewRecurringBilling}
        onOpenLiveRecurringConfirmation={handleOpenLiveRecurringConfirmation}
        recurringPending={recurringWorkflowMutation.isPending}
        superAdminRestricted={superAdminRestricted}
        lastRecurringMode={recurringWorkflowResult?.mode}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Personalized Welcome Message */}
        <WelcomeCard user={user} />

        {/* Recurring Lifecycle Alerts */}
        <LifecycleAlertsCard lifecycleAlerts={lifecycleAlerts} />

        {/* Enhanced Dashboard Stats */}
        <DashboardStats userRole="admin" />

        <RecurringBillingControlPanel
          recurringWorkflowResult={recurringWorkflowResult}
          recurringWorkflowPending={recurringWorkflowMutation.isPending}
          superAdminRestricted={superAdminRestricted}
          handlePreviewRecurringBilling={handlePreviewRecurringBilling}
          handleOpenLiveRecurringConfirmation={handleOpenLiveRecurringConfirmation}
        />

        {superAdminRestricted && (
          <Alert className="mb-8 border-amber-300 bg-amber-50 text-amber-900">
            <div className="flex gap-3">
              <Shield className="h-5 w-5" />
              <div>
                <AlertTitle>Limited control mode</AlertTitle>
                <AlertDescription>
                  You are signed in as an admin. Viewing analytics is allowed, but EPX live controls, cancellations, and certification tools
                  stay disabled unless a super admin is present.
                </AlertDescription>
              </div>
            </div>
          </Alert>
        )}

        <ManualEPXTransactionCard
          manualTransactionForm={manualTransactionForm}
          manualTransactionResult={manualTransactionResult}
          manualTransactionPending={manualTransactionMutation.isPending}
          superAdminRestricted={superAdminRestricted}
          isSuperAdmin={isSuperAdmin}
          paymentEnvironmentBadgeClasses={paymentEnvironmentBadgeClasses}
          paymentEnvironmentBadgeLabel={paymentEnvironmentBadgeLabel}
          paymentEnvironmentLoading={paymentEnvironmentLoading}
          paymentEnvironmentButtonTarget={paymentEnvironmentButtonTarget}
          paymentEnvironmentButtonLabel={paymentEnvironmentButtonLabel}
          updatePaymentEnvironmentPending={updatePaymentEnvironmentMutation.isPending}
          paymentEnvironmentUpdatedText={paymentEnvironmentUpdatedText}
          environmentAlertClasses={environmentAlertClasses}
          environmentAlertTitle={environmentAlertTitle}
          environmentAlertDescription={environmentAlertDescription}
          EnvironmentAlertIcon={EnvironmentAlertIcon}
          handlePaymentEnvironmentChange={handlePaymentEnvironmentChange}
          setManualTransactionResult={setManualTransactionResult}
          resetManualTransactionForm={resetManualTransactionForm}
          handleManualTransactionSubmit={handleManualTransactionSubmit}
          handleManualFieldChange={handleManualFieldChange}
          handleManualTranTypeChange={handleManualTranTypeChange}
          handleHostedCheckoutRequest={handleHostedCheckoutRequest}
        />

        <SubscriptionCancellationCard
          cancelSubscriptionForm={cancelSubscriptionForm}
          cancelSubscriptionResult={cancelSubscriptionResult}
          cancelSubscriptionPending={cancelSubscriptionMutation.isPending}
          superAdminRestricted={superAdminRestricted}
          setCancelSubscriptionResult={setCancelSubscriptionResult}
          resetCancelSubscriptionForm={resetCancelSubscriptionForm}
          handleCancelSubscriptionSubmit={handleCancelSubscriptionSubmit}
          handleCancelFieldChange={handleCancelFieldChange}
        />


        <PartnerLeadsTableCard
          partnerLeads={partnerLeads}
          partnerLeadCount={partnerLeadCount}
          partnerLeadsLoading={partnerLeadsLoading}
          partnerLeadFilter={partnerLeadFilter}
          setPartnerLeadFilter={setPartnerLeadFilter}
          openPartnerLeadDialog={openPartnerLeadDialog}
        />

        {/* Pending Approvals Section */}
        <PendingApprovalsCard
          pendingLoading={pendingLoading}
          pendingUsers={pendingUsers}
          approveUserMutation={approveUserMutation}
          rejectUserMutation={rejectUserMutation}
        />

        {/* System Login Activity */}
        <SystemActivityCard
          sessionsLoading={sessionsLoading}
          allLoginSessions={allLoginSessions}
        />

        {/* Members Management Table */}
        <AdminUsersTableCard
          usersLoading={usersLoading}
          usersData={usersData}
          setAgentNumberInput={setAgentNumberInput}
          setAssignAgentNumberDialog={setAssignAgentNumberDialog}
          setEditFormData={setEditFormData}
          setEditUserDialog={setEditUserDialog}
          toast={toast}
          refetch={refetch}
        />
        
        <AdminUserDialogs
          assignAgentNumberDialog={assignAgentNumberDialog}
          setAssignAgentNumberDialog={setAssignAgentNumberDialog}
          agentNumberInput={agentNumberInput}
          setAgentNumberInput={setAgentNumberInput}
          editUserDialog={editUserDialog}
          setEditUserDialog={setEditUserDialog}
          editFormData={editFormData}
          setEditFormData={setEditFormData}
          refetch={refetch}
          toast={toast}
        />

        <PartnerLeadDialog
          selectedPartnerLead={selectedPartnerLead}
          setSelectedPartnerLead={setSelectedPartnerLead}
          partnerLeadStatusSelection={partnerLeadStatusSelection}
          setPartnerLeadStatusSelection={setPartnerLeadStatusSelection}
          partnerLeadNote={partnerLeadNote}
          setPartnerLeadNote={setPartnerLeadNote}
          updatePartnerLeadMutation={updatePartnerLeadMutation}
          handlePartnerLeadUpdate={handlePartnerLeadUpdate}
          statusOptions={statusOptions}
        />

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

        <AdminConfirmationDialogs
          manualConfirmPayload={manualConfirmPayload}
          setManualConfirmPayload={setManualConfirmPayload}
          manualTransactionPending={manualTransactionMutation.isPending}
          getManualTranLabel={getManualTranLabel}
          executeManualTransaction={executeManualTransaction}
          cancelConfirmPayload={cancelConfirmPayload}
          setCancelConfirmPayload={setCancelConfirmPayload}
          cancelSubscriptionPending={cancelSubscriptionMutation.isPending}
          executeCancelSubscription={executeCancelSubscription}
          hostedConfirmPayload={hostedConfirmPayload}
          setHostedConfirmPayload={setHostedConfirmPayload}
          finalizeHostedCheckoutLaunch={finalizeHostedCheckoutLaunch}
        />

        <RecurringBillingDialogs
          recurringWorkflowMutation={recurringWorkflowMutation}
          confirmLiveRecurringOpen={confirmLiveRecurringOpen}
          setConfirmLiveRecurringOpen={setConfirmLiveRecurringOpen}
          executeLiveRecurringWorkflow={executeLiveRecurringWorkflow}
          previewRecurringDialogOpen={previewRecurringDialogOpen}
          setPreviewRecurringDialogOpen={setPreviewRecurringDialogOpen}
          previewDueCount={previewDueCount}
          previewRows={previewRows}
          handleOpenLiveRecurringConfirmation={handleOpenLiveRecurringConfirmation}
          superAdminRestricted={superAdminRestricted}
          liveRecurringOutcomeOpen={liveRecurringOutcomeOpen}
          setLiveRecurringOutcomeOpen={setLiveRecurringOutcomeOpen}
          liveBillingSummary={liveBillingSummary}
          liveCommissionSummary={liveCommissionSummary}
          handleCopyLiveRecurringSummary={handleCopyLiveRecurringSummary}
        />



      </div>
    </AppShell>
  );

}