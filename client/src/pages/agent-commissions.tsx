import React from "react";
import AppShell from "@/components/AppShell";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { DollarSign, TrendingUp, Calendar, Download, AlertTriangle } from "lucide-react";
import { useAgentCommissionsFilters } from "@/hooks/useAgentCommissionsFilters";
import { useAgentCommissionsQueries, type AgentLedgerRow } from "@/hooks/useAgentCommissionsQueries";
import { useAgentCommissionsDerived } from "@/hooks/useAgentCommissionsDerived";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LIFECYCLE_ALERT_LEGEND, getLifecycleAlertBadgeClasses, getLifecycleAlertLabel } from "@/lib/lifecycleAlertUi";

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'active': return <Badge className="bg-green-100 text-green-800">Active</Badge>;
    case 'cancelled': return <Badge className="bg-red-100 text-red-800">Cancelled</Badge>;
    case 'pending': return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
    default: return <Badge>{status}</Badge>;
  }
};

const getPaymentBadge = (status: string) => {
  switch (status) {
    case 'paid': return <Badge className="bg-blue-100 text-blue-800">Paid</Badge>;
    case 'unpaid': return <Badge className="bg-gray-100 text-gray-800">Unpaid</Badge>;
    case 'cancelled': return <Badge className="bg-red-100 text-red-800">Cancelled</Badge>;
    default: return <Badge>{status}</Badge>;
  }
};

const getLedgerStatusBadge = (status: AgentLedgerRow['displayStatus']) => {
  switch (status) {
    case 'pending': return <Badge className="bg-yellow-100 text-yellow-800">Pending (Earned)</Badge>;
    case 'scheduled': return <Badge className="bg-blue-100 text-blue-800">Scheduled</Badge>;
    case 'carry_forward': return <Badge className="bg-amber-100 text-amber-800">Carry Forward (&lt;$25)</Badge>;
    case 'paid': return <Badge className="bg-green-100 text-green-800">Paid</Badge>;
    case 'held': return <Badge className="bg-orange-100 text-orange-800">Held</Badge>;
    case 'reversed':
    default: return <Badge className="bg-red-100 text-red-800">Reversed</Badge>;
  }
};

export default function AgentCommissions() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const {
    dateFilter,
    setDateFilter,
    ledgerStatusFilter,
    setLedgerStatusFilter,
    ledgerPayoutPeriodFilter,
    setLedgerPayoutPeriodFilter,
    ledgerMemberNameFilter,
    setLedgerMemberNameFilter,
    resetLedgerFilters,
    focusMemberId,
    focusCommissionId,
  } = useAgentCommissionsFilters();

  const {
    stats,
    statsLoading,
    statsError,
    commissions,
    commissionsLoading,
    commissionsError,
    lifecycleAlerts,
    agentLedger,
    ledgerLoading,
    ledgerError,
  } = useAgentCommissionsQueries({
    dateFilter,
    ledgerStatusFilter,
    ledgerPayoutPeriodFilter,
    ledgerMemberNameFilter,
  });

  const { safeCommissions, safeStats, businessMix, nextScheduledPayout, handleExport } =
    useAgentCommissionsDerived({
      commissions,
      stats,
      agentLedger,
      focusMemberId,
      focusCommissionId,
      dateFilter,
    });

  if (statsError || commissionsError || ledgerError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md p-6">
          <CardContent>
            <h2 className="text-xl font-bold text-red-600 mb-2">Failed to Load Commissions</h2>
            <p className="text-gray-600 mb-4">
              {commissionsError ? String(commissionsError) : ledgerError ? String(ledgerError) : String(statsError)}
            </p>
            <Button onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/agent/commission-stats"] });
              queryClient.invalidateQueries({ queryKey: ["/api/agent/commissions"] });
              queryClient.invalidateQueries({ queryKey: ["/api/agent/commission-ledger"] });
            }}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (statsLoading || commissionsLoading || ledgerLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <AppShell
      title="Commission Tracking"
      breadcrumb={["Agent"]}
      actions={
        <Button onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />
          Export Report
        </Button>
      }
    >

        {(focusMemberId || focusCommissionId) && (
          <Card className="mb-6 border-blue-200 bg-blue-50/50">
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <p className="text-sm text-blue-900">
                Focused view{focusMemberId ? ` for member #${focusMemberId}` : ''}{focusCommissionId ? ` and commission ${focusCommissionId}` : ''}.
              </p>
              <Button size="sm" variant="outline" onClick={() => setLocation('/agent/commissions')}>
                Clear Focus
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">This Month</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${safeStats.mtd.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">Month-to-date earnings</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">This Year</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${safeStats.ytd.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">Year-to-date earnings</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Lifetime Earned</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${safeStats.lifetime.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">All time earnings</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Commissions</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${safeStats.pending.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">Awaiting payment</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Individual Business</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">${businessMix.individual.amount.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">{businessMix.individual.count} commissions</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Family Business</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">${businessMix.family.amount.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">{businessMix.family.count} commissions</p>
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
                Recurring Billing & Commission Alerts
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
                          onClick={() => setLocation(`/agent?memberId=${item.memberId}&alertType=${item.kind}`)}
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
                          onClick={() => setLocation(`/agent/commissions?memberId=${item.memberId}&commissionId=${item.commissionId}&alertType=${item.kind}`)}
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
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  name="startDate"
                  type="date"
                  autoComplete="off"
                  value={dateFilter.startDate}
                  onChange={(e) => setDateFilter(prev => ({ ...prev, startDate: e.target.value }))}
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  name="endDate"
                  type="date"
                  autoComplete="off"
                  value={dateFilter.endDate}
                  onChange={(e) => setDateFilter(prev => ({ ...prev, endDate: e.target.value }))}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Agent Commissions</CardTitle>
            <p className="text-sm text-gray-500">Read-only payout lifecycle view for your commission records.</p>
          </CardHeader>
          <CardContent>
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Next Scheduled Payout</p>
                  {nextScheduledPayout ? (
                    <p className="text-lg font-semibold text-blue-900">
                      ${Number(nextScheduledPayout.amount || 0).toFixed(2)} on {format(new Date(nextScheduledPayout.date), 'MM/dd/yyyy')}
                    </p>
                  ) : (
                    <p className="text-sm text-blue-900">No scheduled payout rows yet. Run ledger sync and batch generation to populate upcoming payout details.</p>
                  )}
                </div>
                {nextScheduledPayout && (
                  <div className="text-sm text-blue-800">
                    {nextScheduledPayout.rowCount} scheduled line item(s)
                  </div>
                )}
              </div>
            </div>

            {Number(agentLedger?.summary?.carryForwardTotal || 0) > 0 && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-800">
                  ${Number(agentLedger?.summary?.carryForwardTotal || 0).toFixed(2)} is being carried forward.
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  Your current cycle total is below the $25.00 minimum payout threshold. This amount will be combined with your next cycle and released automatically once the combined total meets the threshold.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Pending Total</CardTitle></CardHeader>
                <CardContent><div className="text-xl font-bold">${Number(agentLedger?.summary?.pendingTotal || 0).toFixed(2)}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Scheduled Total</CardTitle></CardHeader>
                <CardContent><div className="text-xl font-bold text-blue-700">${Number(agentLedger?.summary?.scheduledTotal || 0).toFixed(2)}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Carry Forward (&lt;$25)</CardTitle></CardHeader>
                <CardContent><div className="text-xl font-bold text-amber-700">${Number(agentLedger?.summary?.carryForwardTotal || 0).toFixed(2)}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Paid Total</CardTitle></CardHeader>
                <CardContent><div className="text-xl font-bold text-green-700">${Number(agentLedger?.summary?.paidTotal || 0).toFixed(2)}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Reversals/Adjustments</CardTitle></CardHeader>
                <CardContent><div className="text-xl font-bold text-red-700">${Number(agentLedger?.summary?.reversalsAdjustmentsTotal || 0).toFixed(2)}</div></CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div>
                <Label>Status</Label>
                <Select value={ledgerStatusFilter} onValueChange={(value: any) => setLedgerStatusFilter(value)}>
                  <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="carry_forward">Carry Forward (&lt;$25)</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="held">Held</SelectItem>
                    <SelectItem value="reversed">Reversed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Payout Period</Label>
                <Select value={ledgerPayoutPeriodFilter} onValueChange={(value: any) => setLedgerPayoutPeriodFilter(value)}>
                  <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="1st-cycle">1st-cycle</SelectItem>
                    <SelectItem value="15th-cycle">15th-cycle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="ledgerMemberName">Member Name</Label>
                <Input
                  id="ledgerMemberName"
                  value={ledgerMemberNameFilter}
                  onChange={(e) => setLedgerMemberNameFilter(e.target.value)}
                  placeholder="Search member"
                />
              </div>
              <div className="flex items-end">
                <Button variant="outline" onClick={resetLedgerFilters}>Reset Filters</Button>
              </div>
            </div>

            {Array.isArray(agentLedger?.rows) && agentLedger.rows.length > 0 ? (
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member Name</TableHead>
                    <TableHead>Member ID</TableHead>
                    <TableHead>Membership Tier</TableHead>
                    <TableHead>Effective Date</TableHead>
                    <TableHead>Commission Type</TableHead>
                    <TableHead>Commission Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payout Batch / Schedule</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agentLedger.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.memberName || 'N/A'}</TableCell>
                      <TableCell className="font-mono text-xs">{row.memberId || '-'}</TableCell>
                      <TableCell>{row.membershipTier || '-'}</TableCell>
                      <TableCell>{row.effectiveDate ? format(new Date(row.effectiveDate), 'MM/dd/yyyy') : '-'}</TableCell>
                      <TableCell className="capitalize">{row.commissionType}</TableCell>
                      <TableCell className="font-semibold">${Number(row.commissionAmount || 0).toFixed(2)}</TableCell>
                      <TableCell>{getLedgerStatusBadge(row.displayStatus)}</TableCell>
                      <TableCell>
                        {row.displayStatus === 'pending' && (
                          <div className="text-xs text-gray-600">Earned and not yet assigned to a payout batch</div>
                        )}
                        {row.displayStatus === 'scheduled' && (
                          <div className="text-xs text-blue-700">
                            <div>Batch: {row.payoutBatchName || row.payoutBatchId || 'Pending Batch'}</div>
                            <div>Expected Pay: {row.scheduledPayDate ? format(new Date(row.scheduledPayDate), 'MM/dd/yyyy') : 'TBD'}</div>
                          </div>
                        )}
                        {row.displayStatus === 'carry_forward' && (
                          <div className="text-xs text-amber-700">
                            <div>Held for minimum payout threshold ($25.00)</div>
                            <div>Will release automatically once cycle total reaches threshold</div>
                          </div>
                        )}
                        {row.displayStatus === 'paid' && (
                          <div className="text-xs text-green-700">
                            <div>Paid: {row.paidAt ? format(new Date(row.paidAt), 'MM/dd/yyyy') : 'Recorded'}</div>
                            <div>Ref: {row.statementNumber || row.payoutBatchId || 'N/A'}</div>
                          </div>
                        )}
                        {(row.displayStatus === 'held' || row.displayStatus === 'reversed') && (
                          <div className="text-xs text-red-700">
                            <div>Batch: {row.payoutBatchName || row.payoutBatchId || 'N/A'}</div>
                            {row.scheduledPayDate && <div>Cycle: {format(new Date(row.scheduledPayDate), 'MM/dd/yyyy')}</div>}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500">No agent commission ledger records for the selected filters.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Commission Table */}
        <Card>
          <CardHeader>
            <CardTitle>Commission Details</CardTitle>
          </CardHeader>
          <CardContent>
            {Array.isArray(safeCommissions) && safeCommissions.length > 0 ? (
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Member</TableHead>
                    <TableHead>Member ID</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Segment</TableHead>
                    <TableHead>Plan Cost</TableHead>
                    <TableHead>Commission</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {safeCommissions.map((commission, index) => {
                    if (!commission || !commission.id) return null;
                    const commissionKey = `${commission.id}-${index}`;
                    
                    return (
                      <TableRow key={commissionKey}>
                        <TableCell>
                          {commission.createdAt ? format(new Date(commission.createdAt), "MM/dd/yyyy") : 'N/A'}
                        </TableCell>
                        <TableCell>{commission.userName || 'N/A'}</TableCell>
                        <TableCell className="font-mono text-xs">
                          #{commission.memberId ?? '—'}
                          {commission.membershipId && (
                            <div className="text-[11px] text-gray-500">Customer: {commission.membershipId}</div>
                          )}
                        </TableCell>
                        <TableCell>{commission.planName || commission.planTier || 'N/A'}</TableCell>
                        <TableCell>{commission.planType || 'N/A'}</TableCell>
                        <TableCell className="capitalize">{commission.businessCategory || 'individual'}</TableCell>
                        <TableCell>
                          ${(commission.totalPlanCost && typeof commission.totalPlanCost === 'number') ? commission.totalPlanCost.toFixed(2) : '0.00'}
                        </TableCell>
                        <TableCell className="font-semibold">
                          ${(commission.commissionAmount && typeof commission.commissionAmount === 'number') ? commission.commissionAmount.toFixed(2) : '0.00'}
                        </TableCell>
                        <TableCell>{getStatusBadge(commission.status || 'unknown')}</TableCell>
                        <TableCell>
                          {getPaymentBadge(commission.paymentStatus || 'unknown')}
                          {commission.paymentDate && (
                            <div className="text-xs text-gray-500 mt-1">
                              {format(new Date(commission.paymentDate), "MM/dd/yyyy")}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  }).filter(Boolean)}
                </TableBody>
              </Table>
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-500">No commissions found for the selected date range.</p>
              </div>
            )}
          </CardContent>
        </Card>
    </AppShell>
  );
}