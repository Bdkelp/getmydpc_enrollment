import React, { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { DollarSign, TrendingUp, Calendar, Download, ChevronLeft, AlertTriangle } from "lucide-react";
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
import { LIFECYCLE_ALERT_LEGEND, getLifecycleAlertBadgeClasses, getLifecycleAlertLabel } from "@/lib/lifecycleAlertUi";

interface Commission {
  id: number;
  subscriptionId?: number;
  userId?: string;
  userName?: string;
  memberId?: string | number;
  membershipId?: string;
  planName?: string;
  planType?: string;
  planTier?: string;
  commissionAmount?: number;
  totalPlanCost?: number;
  businessCategory?: 'individual' | 'family' | 'group';
  status?: string;
  paymentStatus?: string;
  paymentDate?: string;
  createdAt?: string;
}

interface CommissionStats {
  mtd: number;
  ytd: number;
  lifetime: number;
  pending: number;
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

export default function AgentCommissions() {
  const [locationPath, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [dateFilter, setDateFilter] = useState({
    startDate: format(new Date(new Date().setMonth(new Date().getMonth() - 1)), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
  });
  const [hasExpandedFocusRange, setHasExpandedFocusRange] = useState(false);

  const searchParams = useMemo(() => {
    const query = locationPath.includes('?')
      ? locationPath.slice(locationPath.indexOf('?'))
      : window.location.search;
    return new URLSearchParams(query);
  }, [locationPath]);

  const focusMemberId = searchParams.get('memberId');
  const focusCommissionId = searchParams.get('commissionId');

  useEffect(() => {
    if (hasExpandedFocusRange || (!focusMemberId && !focusCommissionId)) {
      return;
    }

    setDateFilter({
      startDate: format(new Date(new Date().getFullYear() - 1, 0, 1), "yyyy-MM-dd"),
      endDate: format(new Date(), "yyyy-MM-dd"),
    });
    setHasExpandedFocusRange(true);
  }, [focusMemberId, focusCommissionId, hasExpandedFocusRange]);

  // Fetch commission stats (using the new commission-totals endpoint for MTD/YTD/Lifetime)
  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery<CommissionStats>({
    queryKey: ["/api/agent/commission-totals"],
    queryFn: async () => {
      return await apiRequest(`/api/agent/commission-totals`, { method: "GET" });
    },
    enabled: !!user,
    retry: 1,
  });

  // Fetch commissions with filters
  const { data: commissions, isLoading: commissionsLoading, error: commissionsError } = useQuery<Commission[]>({
    queryKey: ["/api/agent/commissions", dateFilter.startDate, dateFilter.endDate],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: dateFilter.startDate,
        endDate: dateFilter.endDate,
      });
      return await apiRequest(`/api/agent/commissions?${params}`, { method: "GET" });
    },
    enabled: !!user && !!dateFilter.startDate && !!dateFilter.endDate,
    retry: 1,
  });

  const { data: lifecycleAlerts } = useQuery<LifecycleAlertSummary>({
    queryKey: ["/api/agent/lifecycle-alerts"],
    queryFn: async () => {
      return await apiRequest('/api/agent/lifecycle-alerts?days=7', { method: 'GET' });
    },
    enabled: !!user,
    retry: 1,
    refetchInterval: 60_000,
  });

  const handleExport = async () => {
    try {
      const params = new URLSearchParams({
        startDate: dateFilter.startDate,
        endDate: dateFilter.endDate,
      });

      const response = await fetch(`/api/agent/export-commissions?${params}`, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `commissions-${dateFilter.startDate}-to-${dateFilter.endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Export Successful",
        description: "Your commission report has been downloaded.",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Unable to download commission report.",
        variant: "destructive",
      });
    }
  };

  // Safe array handling for commissions data with comprehensive checks
  const safeCommissions = useMemo(() => {
    const all = Array.isArray(commissions) ? commissions : [];

    if (!focusMemberId && !focusCommissionId) {
      return all;
    }

    return all.filter((commission) => {
      const memberMatch = focusMemberId
        ? String(commission.memberId || '') === focusMemberId
        : true;
      const commissionMatch = focusCommissionId
        ? String(commission.id || '') === focusCommissionId
        : true;
      return memberMatch && commissionMatch;
    });
  }, [commissions, focusMemberId, focusCommissionId]);

  // Safe stats object with defaults and null checks
  const safeStats = useMemo(() => {
    return {
      mtd: (stats && typeof stats.mtd === 'number') ? stats.mtd : 0,
      ytd: (stats && typeof stats.ytd === 'number') ? stats.ytd : 0,
      lifetime: (stats && typeof stats.lifetime === 'number') ? stats.lifetime : 0,
      pending: (stats && typeof stats.pending === 'number') ? stats.pending : 0
    };
  }, [stats]);

  const businessMix = useMemo(() => {
    return safeCommissions.reduce(
      (acc, commission) => {
        const category = commission.businessCategory || 'individual';
        const amount = Number(commission.commissionAmount || 0);

        if (category === 'family') {
          acc.family.count += 1;
          acc.family.amount += amount;
        } else if (category === 'group') {
          acc.group.count += 1;
          acc.group.amount += amount;
        } else {
          acc.individual.count += 1;
          acc.individual.amount += amount;
        }

        return acc;
      },
      {
        individual: { count: 0, amount: 0 },
        family: { count: 0, amount: 0 },
        group: { count: 0, amount: 0 },
      }
    );
  }, [safeCommissions]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800">Active</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-800">Cancelled</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getPaymentBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-blue-100 text-blue-800">Paid</Badge>;
      case 'unpaid':
        return <Badge className="bg-gray-100 text-gray-800">Unpaid</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-800">Cancelled</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  // Show errors if any
  if (statsError || commissionsError) {
    console.error('[AgentCommissions] Query errors:', { statsError, commissionsError });
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md p-6">
          <CardContent>
            <h2 className="text-xl font-bold text-red-600 mb-2">Failed to Load Commissions</h2>
            <p className="text-gray-600 mb-4">
              {commissionsError ? String(commissionsError) : String(statsError)}
            </p>
            <Button onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/agent/commission-stats"] });
              queryClient.invalidateQueries({ queryKey: ["/api/agent/commissions"] });
            }}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (statsLoading || commissionsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Button
                variant="ghost"
                onClick={() => setLocation('/agent')}
                className="mr-4"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back to Dashboard
              </Button>
              <h1 className="text-2xl font-bold text-gray-900">Commission Tracking</h1>
            </div>
            <Button onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
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
            <div className="flex gap-4">
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

        {/* Commission Table */}
        <Card>
          <CardHeader>
            <CardTitle>Commission Details</CardTitle>
          </CardHeader>
          <CardContent>
            {Array.isArray(safeCommissions) && safeCommissions.length > 0 ? (
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
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-500">No commissions found for the selected date range.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}