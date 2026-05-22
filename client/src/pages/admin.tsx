import AppShell from "@/components/AppShell";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

import { hasAtLeastRole, isSuperAdmin as isSuperAdminRole } from "@/lib/roles";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { AdminCreateUserDialog } from "@/components/admin-create-user-dialog";
import DashboardStats from "@/components/DashboardStats";
import { Shield } from "lucide-react";
import { useLocation } from "wouter";
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
import { useAdminDashboardMetrics } from "@/hooks/useAdminDashboardMetrics";
import { useAdminAuthGuard } from "@/hooks/useAdminAuthGuard";
import { useAdminUserDialogState } from "@/hooks/useAdminUserDialogState";
const ENROLLMENT_RECORD_VIEW_KEY = "adminEnrollmentRecordsView";

export default function Admin() {
  const { toast } = useToast();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const isAdminUser = hasAtLeastRole(user?.role, "admin");
  const isSuperAdmin = isSuperAdminRole(user?.role);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const {
    assignAgentNumberDialog,
    setAssignAgentNumberDialog,
    agentNumberInput,
    setAgentNumberInput,
    createUserDialogOpen,
    setCreateUserDialogOpen,
    editUserDialog,
    setEditUserDialog,
    editFormData,
    setEditFormData,
  } = useAdminUserDialogState();

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
    handleAdHocHostedCheckoutRequest,
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

  const {
    statsLoading,
    statsError,
    lifecycleAlerts,
  } = useAdminDashboardMetrics(isAuthenticated, isAdminUser);

  useAdminAuthGuard({ isAuthenticated, isAdminUser, authLoading, user, toast, statsError, usersError });

  const getEnrollmentRecordsRoute = () => {
    const savedView = window.localStorage.getItem(ENROLLMENT_RECORD_VIEW_KEY);
    return savedView === "groups" ? "/admin/groups" : "/admin/enrollments";
  };



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
          handleAdHocHostedCheckoutRequest={handleAdHocHostedCheckoutRequest}
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