import React, { useState } from "react";
import AppShell from "@/components/AppShell";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { DollarSign, Calendar, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import { hasAtLeastRole } from "@/lib/roles";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { LIFECYCLE_ALERT_LEGEND, getLifecycleAlertBadgeClasses, getLifecycleAlertLabel } from "@/lib/lifecycleAlertUi";
import { useAdminCommissionsFilters } from "@/hooks/useAdminCommissionsFilters";
import { useAdminCommissionsQueries } from "@/hooks/useAdminCommissionsQueries";
import { useAdminCommissionsMutations } from "@/hooks/useAdminCommissionsMutations";
import { useAdminCommissionsDerived } from "@/hooks/useAdminCommissionsDerived";

interface Commission {
  id: string;
  agentId: string;
  memberId: string;
  membershipId?: string;
  commissionAmount: number;
  coverageType: string;
  status: string;
  paymentStatus: string;
  paymentDate?: string;
  createdAt: string;
  userName: string;
  planType: string;
  paymentCaptured?: boolean;
  paymentIntentId?: string;
  paymentCapturedAt?: string;
  eligibleForPayoutAt?: string;
  businessCategory?: 'individual' | 'family' | 'group';
  groupName?: string;
  membershipFee?: number;
  commissionType?: 'direct' | 'override';
  isClawedBack?: boolean;
  clawbackReason?: string;
  agentName?: string;
  agentNumber?: string;
  agentEmail?: string;
  planName?: string;
  planTier?: string;
  effectiveDate?: string;
}

interface PayoutBatchSummary {
  id: string;
  batch_name: string;
  batch_type: '1st-cycle' | '15th-cycle';
  cutoff_date: string;
  scheduled_pay_date: string;
  total_amount: number;
  total_agents: number;
  total_records: number;
  status: 'draft' | 'ready' | 'exported' | 'paid';
  created_at: string;
  paid_at?: string | null;
}

interface PayoutDashboardSummary {
  nextPayoutDate: string;
  draftBatches: PayoutBatchSummary[];
  totalPayableAmount: number;
  totalAgents: number;
  counts: {
    new: number;
    renewal: number;
    adjustmentOrReversal: number;
    cancellations: number;
  };
  cancellations?: {
    heldCount: number;
    heldAmount: number;
    pendingReversalCount: number;
    pendingReversalAmount: number;
    paidReversalCount: number;
    paidReversalAmount: number;
  };
}

interface PayoutBatchDetail {
  batch: PayoutBatchSummary;
  rows: Array<{
    id: string;
    member_name: string;
    member_id: string;
    membership_tier?: string | null;
    coverage_type?: string | null;
    commission_amount: number;
    commission_type: string;
    status: string;
    cancellation_date?: string | null;
    cancellation_reason?: string | null;
  }>;
  carryForwardCandidates?: Array<{
    agentId: string;
    agentName: string;
    writingNumber?: string | null;
    currentCarryForwardTotal: number;
    existingPayableTotal: number;
    resultingPayoutAmount: number;
    rowCount: number;
    rowIds: string[];
    rows: Array<{
      id: string;
      member_name: string;
      member_id?: string | null;
      commission_amount: number;
      commission_type: string;
      status: string;
    }>;
  }>;
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

export default function AdminCommissions() {
  const [locationPath, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdminUser = hasAtLeastRole(user?.role, 'admin');

  const {
    dateFilter,
    setDateFilter,
    selectedCommissions,
    setSelectedCommissions,
    focusMemberId,
    focusCommissionId,
    handleQuickSelectWeek,
  } = useAdminCommissionsFilters(locationPath);

  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [isBatchDetailOpen, setIsBatchDetailOpen] = useState(false);
  const [isOverrideConfirmOpen, setIsOverrideConfirmOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [selectedCarryForwardCandidate, setSelectedCarryForwardCandidate] = useState<PayoutBatchDetail['carryForwardCandidates'][number] | null>(null);

  const {
    commissions,
    isLoading,
    lifecycleAlerts,
    payoutDashboard,
    isPayoutDashboardLoading,
    selectedBatchDetail,
    isBatchDetailLoading,
  } = useAdminCommissionsQueries({
    isAdminUser,
    userId: user?.id,
    dateFilter,
    selectedBatchId,
    isBatchDetailOpen,
  });

  const {
    syncLedgerMutation,
    generateBatchesMutation,
    markBatchPaidMutation,
    overrideCarryForwardMutation,
    handleExportBatchCsv,
  } = useAdminCommissionsMutations({
    dateFilter,
    selectedBatchId,
    toast,
    setSelectedCommissions,
    setIsOverrideConfirmOpen,
    setOverrideReason,
    setSelectedCarryForwardCandidate,
  });

  const {
    safeCommissions,
    unpaidCommissions,
    paidCommissions,
    scheduledCommissions,
    totalUnpaid,
    totalPaid,
    totalScheduled,
    selectedTotal,
    businessMix,
    availableAgents,
    handleSelectAll,
    handleSelectCommission,
  } = useAdminCommissionsDerived({
    commissions,
    focusMemberId,
    focusCommissionId,
    selectedCommissions,
    setSelectedCommissions,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <AppShell title="Commission Management" breadcrumb={["Admin"]}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-1 sm:px-2 md:px-0">

        {(focusMemberId || focusCommissionId) && (
          <Card className="mb-6 border-bright-teal-blue-200 bg-sky-aqua-50/70">
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <p className="text-sm text-deep-twilight-900">
                Focused view{focusMemberId ? ` for member #${focusMemberId}` : ''}{focusCommissionId ? ` and commission ${focusCommissionId}` : ''}.
              </p>
              <Button size="sm" variant="outline" onClick={() => setLocation('/admin/commissions')}>
                Clear Focus
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Unpaid</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${totalUnpaid.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">{unpaidCommissions.length} commissions</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">${totalPaid.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">{paidCommissions.length} commissions</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Scheduled Payments</CardTitle>
              <Clock className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">${totalScheduled.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">{scheduledCommissions.length} upcoming</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Selected for Payment</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${selectedTotal.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">{selectedCommissions.size} selected</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Individual / Family Business</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">${businessMix.individualFamily.amount.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">{businessMix.individualFamily.count} commissions</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Group Business</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">${businessMix.group.amount.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">{businessMix.group.count} commissions</p>
            </CardContent>
          </Card>
        </div>

        {!!lifecycleAlerts && (
          <Card className="mb-8 border-orange-200 bg-orange-50/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                Recurring Lifecycle Alerts (Next {lifecycleAlerts.horizonDays} Days)
              </CardTitle>
              <div className="mt-2 flex flex-wrap gap-2">
                {LIFECYCLE_ALERT_LEGEND.map((kind) => (
                  <span key={kind} className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getLifecycleAlertBadgeClasses(kind)}`}>
                    {getLifecycleAlertLabel(kind)}
                  </span>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="space-y-1">
                  <div className="font-semibold text-gray-900">Member Billing</div>
                  <div>Due Soon: <span className="font-medium">{lifecycleAlerts.billing.dueSoon}</span></div>
                  <div>Overdue: <span className="font-medium text-red-700">{lifecycleAlerts.billing.overdue}</span></div>
                  <div>Failed: <span className="font-medium text-red-700">{lifecycleAlerts.billing.failed}</span></div>
                  <div>Stale Pending: <span className="font-medium">{lifecycleAlerts.billing.stalePending}</span></div>
                </div>
                <div className="space-y-1">
                  <div className="font-semibold text-gray-900">Commission Payouts</div>
                  <div>Due Soon: <span className="font-medium">{lifecycleAlerts.commissions.dueSoon}</span></div>
                  <div>Overdue: <span className="font-medium text-red-700">{lifecycleAlerts.commissions.overdue}</span></div>
                  <div>Unscheduled: <span className="font-medium text-red-700">{lifecycleAlerts.commissions.unscheduled}</span></div>
                  <div>Pending Total: <span className="font-medium">{lifecycleAlerts.commissions.pending}</span></div>
                </div>
                <div className="space-y-2">
                  <div className="font-semibold text-gray-900">Attention Required</div>
                  <Badge variant={lifecycleAlerts.totals.totalAttention > 0 ? 'destructive' : 'secondary'}>
                    {lifecycleAlerts.totals.totalAttention} Active Alerts
                  </Badge>
                  <div className="text-xs text-gray-600">
                    Next Billing Cycle: {lifecycleAlerts.billing.nextCycleDate ? format(new Date(lifecycleAlerts.billing.nextCycleDate), 'MMM dd, yyyy') : 'N/A'}
                  </div>
                  <div className="text-xs text-gray-600">
                    Next Payout Eligibility: {lifecycleAlerts.commissions.nextEligibleDate ? format(new Date(lifecycleAlerts.commissions.nextEligibleDate), 'MMM dd, yyyy') : 'N/A'}
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-lg border border-orange-100 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-2">Top Billing Alerts</p>
                  {(lifecycleAlerts.billingItems || []).slice(0, 4).length > 0 ? (
                    <div className="space-y-2">
                      {(lifecycleAlerts.billingItems || []).slice(0, 4).map((item, idx) => (
                        <button
                          key={`${item.kind}-${item.memberId}-${idx}`}
                          type="button"
                          onClick={() => setLocation(`/admin/enrollments?memberId=${item.memberId}&alertType=${item.kind}`)}
                          className="w-full text-sm flex items-center justify-between gap-3 rounded px-2 py-1 text-left hover:bg-orange-50"
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
                <div className="rounded-lg border border-orange-100 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-2">Top Commission Alerts</p>
                  {(lifecycleAlerts.commissionItems || []).slice(0, 4).length > 0 ? (
                    <div className="space-y-2">
                      {(lifecycleAlerts.commissionItems || []).slice(0, 4).map((item, idx) => (
                        <button
                          key={`${item.kind}-${item.commissionId}-${idx}`}
                          type="button"
                          onClick={() => setLocation(`/admin/commissions?memberId=${item.memberId}&commissionId=${item.commissionId}&alertType=${item.kind}`)}
                          className="w-full text-sm flex items-center justify-between gap-3 rounded px-2 py-1 text-left hover:bg-orange-50"
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

        {/* Date Filters */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Filter by Date Range</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 md:flex-row md:items-end">
              <div className="w-full md:flex-1">
                <Label htmlFor="startDate">Start Date (Sunday)</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={dateFilter.startDate}
                  onChange={(e) => setDateFilter(prev => ({ ...prev, startDate: e.target.value }))}
                />
              </div>
              <div className="w-full md:flex-1">
                <Label htmlFor="endDate">End Date (Saturday)</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={dateFilter.endDate}
                  onChange={(e) => setDateFilter(prev => ({ ...prev, endDate: e.target.value }))}
                />
              </div>
              <Button onClick={handleQuickSelectWeek} variant="outline" className="w-full md:w-auto">
                Current Week
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Recurring Commission Payout Ledger</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-4">
              <div className="rounded border p-3 bg-white">
                <p className="text-xs text-gray-500">Next Payout Date</p>
                <p className="text-lg font-semibold">{payoutDashboard?.nextPayoutDate ? format(new Date(payoutDashboard.nextPayoutDate), 'MM/dd/yyyy') : 'N/A'}</p>
              </div>
              <div className="rounded border p-3 bg-white">
                <p className="text-xs text-gray-500">Total Payable</p>
                <p className="text-lg font-semibold">${Number(payoutDashboard?.totalPayableAmount || 0).toFixed(2)}</p>
              </div>
              <div className="rounded border p-3 bg-white">
                <p className="text-xs text-gray-500">Agents To Pay</p>
                <p className="text-lg font-semibold">{payoutDashboard?.totalAgents || 0}</p>
              </div>
              <div className="rounded border p-3 bg-white">
                <p className="text-xs text-gray-500">New / Renewal / Adj-Reversal / Cancellation</p>
                <p className="text-sm font-semibold">
                  {(payoutDashboard?.counts?.new || 0)} / {(payoutDashboard?.counts?.renewal || 0)} / {(payoutDashboard?.counts?.adjustmentOrReversal || 0)} / {(payoutDashboard?.counts?.cancellations || 0)}
                </p>
              </div>
              <div className="rounded border p-3 bg-white">
                <p className="text-xs text-gray-500">Held Cancellations</p>
                <p className="text-sm font-semibold">
                  {(payoutDashboard?.cancellations?.heldCount || 0)} row(s) · ${Number(payoutDashboard?.cancellations?.heldAmount || 0).toFixed(2)}
                </p>
              </div>
              <div className="rounded border p-3 bg-white">
                <p className="text-xs text-gray-500">Reversal Pipeline (Pending / Paid)</p>
                <p className="text-sm font-semibold">
                  {(payoutDashboard?.cancellations?.pendingReversalCount || 0)} / {(payoutDashboard?.cancellations?.paidReversalCount || 0)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  ${Number(payoutDashboard?.cancellations?.pendingReversalAmount || 0).toFixed(2)} / ${Number(payoutDashboard?.cancellations?.paidReversalAmount || 0).toFixed(2)}
                </p>
              </div>
            </div>

            <div className="mb-4 flex flex-col gap-2 sm:flex-row">
              <Button className="w-full sm:w-auto" variant="outline" onClick={() => syncLedgerMutation.mutate()} disabled={syncLedgerMutation.isPending || isPayoutDashboardLoading}>
                {syncLedgerMutation.isPending ? 'Syncing...' : 'Sync Ledger From Existing Commissions'}
              </Button>
              <Button className="w-full sm:w-auto" onClick={() => generateBatchesMutation.mutate()} disabled={generateBatchesMutation.isPending || isPayoutDashboardLoading}>
                {generateBatchesMutation.isPending ? 'Generating...' : 'Generate Draft Payout Batches'}
              </Button>
            </div>

            {(payoutDashboard?.draftBatches || []).length === 0 ? (
              <p className="text-sm text-gray-500">No draft or export-ready payout batches yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Cutoff</TableHead>
                    <TableHead>Scheduled Pay Date</TableHead>
                    <TableHead>Records</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(payoutDashboard?.draftBatches || []).map((batch) => (
                    <TableRow key={batch.id}>
                      <TableCell className="font-medium">{batch.batch_name}</TableCell>
                      <TableCell>{batch.batch_type}</TableCell>
                      <TableCell>{batch.cutoff_date}</TableCell>
                      <TableCell>{batch.scheduled_pay_date}</TableCell>
                      <TableCell>{batch.total_records} ({batch.total_agents} agents)</TableCell>
                      <TableCell>${Number(batch.total_amount || 0).toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant={batch.status === 'paid' ? 'secondary' : 'outline'}>{batch.status}</Badge>
                        {batch.status === 'paid' && batch.paid_at && (
                          <p className="text-xs text-gray-500 mt-1">{format(new Date(batch.paid_at), 'MM/dd/yyyy')}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedBatchId(batch.id);
                              setIsBatchDetailOpen(true);
                            }}
                          >
                            View
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleExportBatchCsv(batch.id, 'quickbooks-csv')}>
                            QB CSV
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleExportBatchCsv(batch.id, 'hexona-csv')}>
                            Hexona CSV
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => markBatchPaidMutation.mutate(batch.id)}
                            disabled={markBatchPaidMutation.isPending || batch.status === 'paid' || Number(batch.total_records || 0) === 0}
                            title={Number(batch.total_records || 0) === 0 ? 'No payable ledger rows in this batch.' : undefined}
                          >
                            Mark Paid
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Commission Table with Tabs */}
        <Card>
          <CardHeader>
            <CardTitle>Commission Details</CardTitle>
              <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              These legacy commission records are historical only. Legacy direct-pay routes are disabled. Use the ledger batch workflow above for scheduling, export, and payment actions.
            </p>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="all" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="all">All ({safeCommissions.length})</TabsTrigger>
                <TabsTrigger value="unpaid">Unpaid ({unpaidCommissions.length})</TabsTrigger>
                <TabsTrigger value="scheduled">Scheduled ({scheduledCommissions.length})</TabsTrigger>
                <TabsTrigger value="paid">Paid ({paidCommissions.length})</TabsTrigger>
              </TabsList>

              {/* All Commissions Tab */}
              <TabsContent value="all">
                {safeCommissions.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={unpaidCommissions.length > 0 && selectedCommissions.size === unpaidCommissions.length}
                            onCheckedChange={handleSelectAll}
                          />
                        </TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Agent</TableHead>
                        <TableHead>Member</TableHead>
                        <TableHead>Group</TableHead>
                        <TableHead>Member ID</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Membership Fee</TableHead>
                        <TableHead>Commission</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Payment Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {safeCommissions.map((commission) => (
                        <TableRow key={commission.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedCommissions.has(commission.id)}
                              onCheckedChange={(checked) => handleSelectCommission(commission.id, checked as boolean)}
                              disabled={commission.paymentStatus === 'paid'}
                            />
                          </TableCell>
                          <TableCell>
                            {format(new Date(commission.createdAt), "MM/dd/yyyy")}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{commission.agentNumber || commission.agentId.slice(0, 8)}</TableCell>
                          <TableCell>{commission.userName}</TableCell>
                          <TableCell>{commission.groupName || '-'}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {commission.memberId ? `#${commission.memberId}` : '-'}
                            {commission.membershipId && (
                              <div className="text-[11px] text-gray-500">Customer: {commission.membershipId}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{commission.planName || commission.coverageType}</Badge>
                          </TableCell>
                          <TableCell className="font-semibold">
                            ${Number(commission.membershipFee || commission.totalPlanCost || 0).toFixed(2)}
                          </TableCell>
                          <TableCell className="font-semibold">
                            ${commission.commissionAmount.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            {commission.paymentStatus === 'paid' ? (
                              <Badge className="bg-green-100 text-green-800">Paid</Badge>
                            ) : (
                              <Badge className="bg-yellow-100 text-yellow-800">Unpaid</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {commission.paymentDate
                              ? format(new Date(commission.paymentDate), "MM/dd/yyyy")
                              : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-gray-500">No commissions found for the selected date range.</p>
                  </div>
                )}
              </TabsContent>

              {/* Unpaid Commissions Tab */}
              <TabsContent value="unpaid">
                {unpaidCommissions.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={unpaidCommissions.length > 0 && selectedCommissions.size === unpaidCommissions.length}
                            onCheckedChange={handleSelectAll}
                          />
                        </TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Agent</TableHead>
                        <TableHead>Member</TableHead>
                        <TableHead>Group</TableHead>
                        <TableHead>Member ID</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Membership Fee</TableHead>
                        <TableHead>Commission</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unpaidCommissions.map((commission) => (
                        <TableRow key={commission.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedCommissions.has(commission.id)}
                              onCheckedChange={(checked) => handleSelectCommission(commission.id, checked as boolean)}
                            />
                          </TableCell>
                          <TableCell>
                            {format(new Date(commission.createdAt), "MM/dd/yyyy")}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{commission.agentNumber || commission.agentId.slice(0, 8)}</TableCell>
                          <TableCell>{commission.userName}</TableCell>
                          <TableCell>{commission.groupName || '-'}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {commission.memberId ? `#${commission.memberId}` : '-'}
                            {commission.membershipId && (
                              <div className="text-[11px] text-gray-500">Customer: {commission.membershipId}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{commission.planName || commission.coverageType}</Badge>
                          </TableCell>
                          <TableCell className="font-semibold">
                            ${Number(commission.membershipFee || commission.totalPlanCost || 0).toFixed(2)}
                          </TableCell>
                          <TableCell className="font-semibold">
                            ${commission.commissionAmount.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-gray-500">No unpaid commissions found.</p>
                  </div>
                )}
              </TabsContent>

              {/* Scheduled Payments Tab */}
              <TabsContent value="scheduled">
                {scheduledCommissions.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Scheduled Date</TableHead>
                        <TableHead>Agent</TableHead>
                        <TableHead>Member</TableHead>
                        <TableHead>Group</TableHead>
                        <TableHead>Member ID</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Membership Fee</TableHead>
                        <TableHead>Commission</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scheduledCommissions.map((commission) => (
                        <TableRow key={commission.id}>
                          <TableCell>
                            {commission.paymentDate && (
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4 text-blue-600" />
                                {format(new Date(commission.paymentDate), "MM/dd/yyyy")}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{commission.agentNumber || commission.agentId.slice(0, 8)}</TableCell>
                          <TableCell>{commission.userName}</TableCell>
                          <TableCell>{commission.groupName || '-'}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {commission.memberId ? `#${commission.memberId}` : '-'}
                            {commission.membershipId && (
                              <div className="text-[11px] text-gray-500">Customer: {commission.membershipId}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{commission.planName || commission.coverageType}</Badge>
                          </TableCell>
                          <TableCell className="font-semibold">
                            ${Number(commission.membershipFee || commission.totalPlanCost || 0).toFixed(2)}
                          </TableCell>
                          <TableCell className="font-semibold">
                            ${commission.commissionAmount.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-gray-500">No scheduled payments found.</p>
                  </div>
                )}
              </TabsContent>

              {/* Paid Commissions Tab */}
              <TabsContent value="paid">
                {paidCommissions.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Payment Date</TableHead>
                        <TableHead>Agent</TableHead>
                        <TableHead>Member</TableHead>
                        <TableHead>Group</TableHead>
                        <TableHead>Member ID</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Membership Fee</TableHead>
                        <TableHead>Commission</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paidCommissions.map((commission) => (
                        <TableRow key={commission.id}>
                          <TableCell>
                            {commission.paymentDate ? (
                              <div className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-green-600" />
                                {format(new Date(commission.paymentDate), "MM/dd/yyyy")}
                              </div>
                            ) : '-'}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{commission.agentNumber || commission.agentId.slice(0, 8)}</TableCell>
                          <TableCell>{commission.userName}</TableCell>
                          <TableCell>{commission.groupName || '-'}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {commission.memberId ? `#${commission.memberId}` : '-'}
                            {commission.membershipId && (
                              <div className="text-[11px] text-gray-500">Customer: {commission.membershipId}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{commission.planName || commission.coverageType}</Badge>
                          </TableCell>
                          <TableCell className="font-semibold text-green-600">
                            ${Number(commission.membershipFee || commission.totalPlanCost || 0).toFixed(2)}
                          </TableCell>
                          <TableCell className="font-semibold text-green-600">
                            ${commission.commissionAmount.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-gray-500">No paid commissions found.</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Dialog open={isBatchDetailOpen} onOpenChange={setIsBatchDetailOpen}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Payout Batch Detail</DialogTitle>
              <DialogDescription>
                Review line items before export and mark-paid actions.
              </DialogDescription>
            </DialogHeader>

            {isBatchDetailLoading ? (
              <div className="py-10 flex justify-center">
                <LoadingSpinner />
              </div>
            ) : !selectedBatchDetail ? (
              <p className="text-sm text-gray-500">No batch details found.</p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                  <div className="rounded border p-3"><span className="font-medium">Batch:</span> {selectedBatchDetail.batch.batch_name}</div>
                  <div className="rounded border p-3"><span className="font-medium">Type:</span> {selectedBatchDetail.batch.batch_type}</div>
                  <div className="rounded border p-3"><span className="font-medium">Cutoff:</span> {selectedBatchDetail.batch.cutoff_date}</div>
                  <div className="rounded border p-3"><span className="font-medium">Pay Date:</span> {selectedBatchDetail.batch.scheduled_pay_date}</div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Member ID</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead>Coverage</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Cancellation</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(selectedBatchDetail.rows || []).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.member_name}</TableCell>
                        <TableCell>{row.member_id || '-'}</TableCell>
                        <TableCell>{row.membership_tier || '-'}</TableCell>
                        <TableCell>{row.coverage_type || '-'}</TableCell>
                        <TableCell>{row.commission_type}</TableCell>
                        <TableCell>{row.status}</TableCell>
                        <TableCell>
                          {row.cancellation_date
                            ? `${row.cancellation_date}${row.cancellation_reason ? ` (${row.cancellation_reason})` : ''}`
                            : '-'}
                        </TableCell>
                        <TableCell className="text-right font-semibold">${Number(row.commission_amount || 0).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {isAdminUser && Array.isArray(selectedBatchDetail.carryForwardCandidates) && selectedBatchDetail.carryForwardCandidates.length > 0 && (
                  <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-4">
                    <div className="text-sm font-semibold text-amber-900">Carry-Forward / Under-Minimum Overrides</div>
                    <p className="text-xs text-amber-800">
                      Admin and super-admin can manually release under-minimum rows. Every action requires a reason and is audit logged.
                    </p>
                    <div className="space-y-3">
                      {selectedBatchDetail.carryForwardCandidates.map((candidate) => (
                        <div key={`${candidate.agentId}-${candidate.rowCount}`} className="rounded border bg-white p-3 text-sm">
                          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                            <div><span className="font-medium">Agent:</span> {candidate.agentName}</div>
                            <div><span className="font-medium">Carry Forward Total:</span> ${Number(candidate.currentCarryForwardTotal || 0).toFixed(2)}</div>
                            <div><span className="font-medium">Rows:</span> {candidate.rowCount}</div>
                            <div><span className="font-medium">Resulting Payout:</span> ${Number(candidate.resultingPayoutAmount || 0).toFixed(2)}</div>
                            <div className="flex justify-start md:justify-end">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedCarryForwardCandidate(candidate);
                                  setOverrideReason('');
                                  setIsOverrideConfirmOpen(true);
                                }}
                              >
                                Release Under-Minimum
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={isOverrideConfirmOpen} onOpenChange={setIsOverrideConfirmOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Confirm Under-Minimum Release</DialogTitle>
              <DialogDescription>
                This action will release carry-forward rows into payable status and create an audit event.
              </DialogDescription>
            </DialogHeader>

            {!selectedCarryForwardCandidate ? (
              <p className="text-sm text-gray-500">No carry-forward candidate selected.</p>
            ) : (
              <div className="space-y-4 text-sm">
                <div className="rounded border p-3 bg-white space-y-1">
                  <div><span className="font-medium">Agent:</span> {selectedCarryForwardCandidate.agentName}</div>
                  <div><span className="font-medium">Current Carry-Forward Total:</span> ${Number(selectedCarryForwardCandidate.currentCarryForwardTotal || 0).toFixed(2)}</div>
                  <div><span className="font-medium">Rows Being Released:</span> {selectedCarryForwardCandidate.rowCount}</div>
                  <div><span className="font-medium">Resulting Payout Amount:</span> ${Number(selectedCarryForwardCandidate.resultingPayoutAmount || 0).toFixed(2)}</div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="overrideReason">Reason (required)</Label>
                  <Input
                    id="overrideReason"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Enter reason for manual under-minimum release"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsOverrideConfirmOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      if (!selectedBatchId || !selectedCarryForwardCandidate) return;
                      overrideCarryForwardMutation.mutate({
                        batchId: selectedBatchId,
                        agentId: selectedCarryForwardCandidate.agentId,
                        reason: overrideReason.trim(),
                      });
                    }}
                    disabled={overrideCarryForwardMutation.isPending || !overrideReason.trim()}
                  >
                    {overrideCarryForwardMutation.isPending ? 'Releasing...' : 'Confirm Release'}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
