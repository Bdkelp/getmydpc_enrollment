import { useState } from "react";
import AppShell from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, TrendingUp, TrendingDown, Users, DollarSign, UserPlus, UserMinus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminAnalyticsQuery } from "@/hooks/useAdminAnalyticsQuery";

interface CommissionRunSummaryRow {
  monthKey: string;
  monthLabel: string;
  membershipsAdded: number;
  membershipsAddedIndividualFamily: number;
  membershipsAddedGroup: number;
  commissionRecords: number;
  commissionAmount: number;
  commissionsPaidCount: number;
  commissionsPaidAmount: number;
}

interface CommissionRunSummary {
  generatedAt: string;
  months: number;
  since: string | null;
  membership: {
    totalRecords: number;
    monthOverMonth: {
      current: number;
      previous: number;
      delta: number;
      deltaPct: number | null;
    };
    addedSince: number | null;
  };
  commissions: {
    totalRecords: number;
    monthOverMonthCount: {
      current: number;
      previous: number;
      delta: number;
      deltaPct: number | null;
    };
    monthOverMonthAmount: {
      current: number;
      previous: number;
      delta: number;
      deltaPct: number | null;
    };
    addedSinceCount: number | null;
    addedSinceAmount: number | null;
  };
  payoutReadiness: {
    nextPayoutDate: string | null;
    totalPayableAmount: number;
    totalAgents: number;
    draftBatchCount: number;
  };
  monthlyRows: CommissionRunSummaryRow[];
}

export default function AdminAnalytics() {
  const { toast } = useToast();
  const [timeRange, setTimeRange] = useState("30");
  const [selectedReport, setSelectedReport] = useState("overview");
  const [exportFormat, setExportFormat] = useState("csv");
  const [emailAddress, setEmailAddress] = useState("");
  const [commissionReportMonths, setCommissionReportMonths] = useState("6");
  const [commissionReportSince, setCommissionReportSince] = useState("");
  const [commissionRunSummary, setCommissionRunSummary] = useState<CommissionRunSummary | null>(null);
  const [commissionRunSummaryLoading, setCommissionRunSummaryLoading] = useState(false);
  const [commissionRunSummaryError, setCommissionRunSummaryError] = useState<string | null>(null);

  const {
    analytics,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
    dataUpdatedAt,
    safePlanBreakdown,
    safeRecentEnrollments,
    safeMonthlyTrends,
    safeMemberReports,
    safeAgentPerformance,
    safeCommissionReports,
    safeRevenueByMonth,
  } = useAdminAnalyticsQuery(timeRange);

  const renderEmptyRow = (colSpan: number, message: string) => (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-8 text-center text-sm text-gray-500">
        {message}
      </TableCell>
    </TableRow>
  );

  const exportReport = async (reportType: string, format: string, email?: string) => {
    if (!analytics) {
      toast({
        title: "No Data",
        description: "No analytics data available to export",
        variant: "destructive"
      });
      return;
    }

    try {
      const response = await apiRequest('/api/admin/reports/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reportType,
          format,
          timeRange,
          email,
          data: getReportData(reportType)
        })
      });

      if (email) {
        toast({
          title: "Report Sent",
          description: `Report has been sent to ${email}`,
        });
      } else {
        // Handle direct download
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${reportType}_report_${new Date().toISOString().split('T')[0]}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        toast({
          title: "Export Successful",
          description: `${reportType} report downloaded`,
        });
      }
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export report",
        variant: "destructive"
      });
    }
  };

  const getReportData = (reportType: string) => {
    switch (reportType) {
      case 'members':
        return safeMemberReports;
      case 'agents':
        return safeAgentPerformance;
      case 'commissions':
        return safeCommissionReports;
      case 'revenue':
        return analytics?.revenueBreakdown || {};
      default:
        return analytics;
    }
  };

  const exportAnalytics = () => exportReport(selectedReport, exportFormat);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDateSafe = (value: string | null | undefined) => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return format(parsed, 'MMM dd, yyyy');
  };

  const lastRefreshedLabel = dataUpdatedAt
    ? format(new Date(dataUpdatedAt), 'MMM dd, yyyy h:mm:ss a')
    : 'Never';

  const handleRefresh = async () => {
    try {
      await refetch();
      toast({
        title: 'Analytics refreshed',
        description: 'Latest analytics data loaded successfully.',
      });
    } catch (refreshError) {
      toast({
        title: 'Refresh failed',
        description: 'Unable to refresh analytics right now.',
        variant: 'destructive',
      });
    }
  };

  const loadCommissionRunSummary = async () => {
    try {
      setCommissionRunSummaryLoading(true);
      setCommissionRunSummaryError(null);

      const params = new URLSearchParams({ months: commissionReportMonths || "6" });
      if (commissionReportSince) {
        params.set("since", commissionReportSince);
      }

      const result = await apiRequest(`/api/admin/reports/commission-run-summary?${params.toString()}`, {
        method: "GET",
      });

      setCommissionRunSummary(result as CommissionRunSummary);
      toast({
        title: "Commission run report ready",
        description: `Loaded ${result?.monthlyRows?.length || 0} month(s) of reporting data.`,
      });
    } catch (error: any) {
      const message = error?.message || "Failed to load commission run report";
      setCommissionRunSummaryError(message);
      toast({ title: "Commission report failed", description: message, variant: "destructive" });
    } finally {
      setCommissionRunSummaryLoading(false);
    }
  };

  const downloadCommissionRunSummaryCsv = async (formatType: "summary-csv" | "ops-csv" = "summary-csv") => {
    try {
      const params = new URLSearchParams({
        months: commissionReportMonths || "6",
        download: "csv",
        format: formatType,
      });
      if (commissionReportSince) {
        params.set("since", commissionReportSince);
      }

      const response = await fetch(`/api/admin/reports/commission-run-summary?${params.toString()}`, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to download commission run CSV");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const filenamePrefix = formatType === "ops-csv" ? "commission-run-ops" : "commission-run-summary";
      link.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: formatType === "ops-csv" ? "Commission ops CSV downloaded" : "Commission run CSV downloaded",
        description:
          formatType === "ops-csv"
            ? "Agent-grouped payout operations file is ready."
            : "The commission run summary file is ready.",
      });
    } catch (error: any) {
      toast({
        title: "Download failed",
        description: error?.message || "Unable to download commission run summary CSV.",
        variant: "destructive",
      });
    }
  };

  return (
    <AppShell
      title="Analytics & Reports"
      breadcrumb={["Admin"]}
      actions={
        <>
          <Select value={timeRange} onValueChange={setTimeRange} name="analyticsTimeRange">
            <SelectTrigger id="admin-analytics-time-range" className="w-[150px] h-8 text-sm">
              <SelectValue placeholder="Time range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedReport} onValueChange={setSelectedReport} name="analyticsReport">
            <SelectTrigger id="admin-analytics-report-select" className="w-[150px] h-8 text-sm">
              <SelectValue placeholder="Report type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="overview">Overview</SelectItem>
              <SelectItem value="members">Members</SelectItem>
              <SelectItem value="agents">Agent Performance</SelectItem>
              <SelectItem value="commissions">Commissions</SelectItem>
              <SelectItem value="revenue">Revenue Details</SelectItem>
            </SelectContent>
          </Select>
          <Select value={exportFormat} onValueChange={setExportFormat} name="analyticsExportFormat">
            <SelectTrigger id="admin-analytics-export-format" className="w-[90px] h-8 text-sm">
              <SelectValue placeholder="Format" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="csv">CSV</SelectItem>
              <SelectItem value="xlsx">Excel</SelectItem>
              <SelectItem value="pdf">PDF</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportAnalytics} disabled={!analytics}>
            <Download className="h-4 w-4 mr-1" />
            Export
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
            {isFetching ? 'Refreshing...' : 'Refresh'}
          </Button>
        </>
      }
    >

        {isLoading ? (
          <div className="text-center py-8">Loading analytics...</div>
        ) : isError ? (
          <Card className="mb-6 border-red-200 bg-red-50">
            <CardContent className="py-4 text-sm text-red-700">
              Analytics request failed: {(error as Error)?.message || 'Unknown error'}
            </CardContent>
          </Card>
        ) : analytics ? (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 flex items-center justify-between">
                    Total Members
                    <Users className="h-4 w-4 text-blue-500" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{analytics.overview.totalMembers}</div>
                  <p className="text-xs text-gray-500 mt-1">
                    Active subscriptions: {analytics.overview.activeSubscriptions}
                    {' | '}Individual/Family: {(analytics.overview.sourceBreakdown?.individualMembers ?? 0) + (analytics.overview.sourceBreakdown?.familyMembers ?? 0)}
                    {' | '}Group: {analytics.overview.sourceBreakdown?.groupMembers ?? 0}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 flex items-center justify-between">
                    Monthly Revenue
                    <DollarSign className="h-4 w-4 text-green-500" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(analytics.overview.monthlyRevenue)}</div>
                  <p className="text-xs text-gray-500 mt-1">Avg per member: {formatCurrency(analytics.overview.averageRevenue)}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Individual/Family: {formatCurrency((analytics.overview.sourceBreakdown?.individualMonthlyRevenue ?? 0) + (analytics.overview.sourceBreakdown?.familyMonthlyRevenue ?? 0))}
                    {' | '}Group: {formatCurrency(analytics.overview.sourceBreakdown?.groupMonthlyRevenue ?? 0)}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 flex items-center justify-between">
                    Growth Rate
                    {analytics.overview.growthRate >= 0 ? 
                      <TrendingUp className="h-4 w-4 text-green-500" /> :
                      <TrendingDown className="h-4 w-4 text-red-500" />
                    }
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${analytics.overview.growthRate >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {analytics.overview.growthRate >= 0 ? '+' : ''}{analytics.overview.growthRate.toFixed(1)}%
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Net growth this period</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 flex items-center justify-between">
                    Churn Rate
                    <UserMinus className="h-4 w-4 text-orange-500" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600">{analytics.overview.churnRate.toFixed(1)}%</div>
                  <p className="text-xs text-gray-500 mt-1">Cancellations: {analytics.overview.cancellationsThisMonth}</p>
                </CardContent>
              </Card>
            </div>

            <Card className="mb-8">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Analytics Data Health</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 text-sm text-gray-600 md:grid-cols-4 lg:grid-cols-8">
                  <div>Plans: <span className="font-semibold text-gray-900">{safePlanBreakdown.length}</span></div>
                  <div>Recent: <span className="font-semibold text-gray-900">{safeRecentEnrollments.length}</span></div>
                  <div>Trends: <span className="font-semibold text-gray-900">{safeMonthlyTrends.length}</span></div>
                  <div>Members: <span className="font-semibold text-gray-900">{safeMemberReports.length}</span></div>
                  <div>Agents: <span className="font-semibold text-gray-900">{safeAgentPerformance.length}</span></div>
                  <div>Commissions: <span className="font-semibold text-gray-900">{safeCommissionReports.length}</span></div>
                  <div>Revenue rows: <span className="font-semibold text-gray-900">{safeRevenueByMonth.length}</span></div>
                  <div>Window: <span className="font-semibold text-gray-900">{timeRange}d</span></div>
                </div>
              </CardContent>
            </Card>

            <Card className="mb-8">
              <CardHeader>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <CardTitle>Commission Run Report</CardTitle>
                    <p className="text-sm text-gray-500 mt-1">
                      Membership and commission month-over-month movement with payout readiness.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={commissionReportMonths} onValueChange={setCommissionReportMonths} name="commissionRunMonths">
                      <SelectTrigger className="w-[120px] h-8 text-sm">
                        <SelectValue placeholder="Months" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">3 months</SelectItem>
                        <SelectItem value="6">6 months</SelectItem>
                        <SelectItem value="12">12 months</SelectItem>
                        <SelectItem value="18">18 months</SelectItem>
                        <SelectItem value="24">24 months</SelectItem>
                      </SelectContent>
                    </Select>
                    <input
                      type="date"
                      value={commissionReportSince}
                      onChange={(event) => setCommissionReportSince(event.target.value)}
                      className="h-8 rounded border px-2 text-sm"
                    />
                    <Button size="sm" variant="outline" onClick={loadCommissionRunSummary} disabled={commissionRunSummaryLoading}>
                      {commissionRunSummaryLoading ? "Loading..." : "Load Report"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => downloadCommissionRunSummaryCsv("summary-csv")}>
                      <Download className="h-4 w-4 mr-1" />
                      Download Summary CSV
                    </Button>
                    <Button size="sm" onClick={() => downloadCommissionRunSummaryCsv("ops-csv")}>
                      <Download className="h-4 w-4 mr-1" />
                      Download Ops CSV
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {commissionRunSummaryError && (
                  <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {commissionRunSummaryError}
                  </div>
                )}

                {commissionRunSummary && (
                  <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Membership MoM</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">{commissionRunSummary.membership.monthOverMonth.current}</div>
                          <p className="text-xs text-gray-500">Delta: {commissionRunSummary.membership.monthOverMonth.delta}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Commission Records MoM</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">{commissionRunSummary.commissions.monthOverMonthCount.current}</div>
                          <p className="text-xs text-gray-500">Delta: {commissionRunSummary.commissions.monthOverMonthCount.delta}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Commission Amount MoM</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">{formatCurrency(commissionRunSummary.commissions.monthOverMonthAmount.current)}</div>
                          <p className="text-xs text-gray-500">Delta: {formatCurrency(commissionRunSummary.commissions.monthOverMonthAmount.delta)}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Next Payout Readiness</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-sm font-semibold">{formatDateSafe(commissionRunSummary.payoutReadiness.nextPayoutDate || null)}</div>
                          <p className="text-xs text-gray-500">Payable: {formatCurrency(commissionRunSummary.payoutReadiness.totalPayableAmount)}</p>
                        </CardContent>
                      </Card>
                    </div>

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Month</TableHead>
                          <TableHead className="text-right">Memberships Added</TableHead>
                          <TableHead className="text-right">I/F Added</TableHead>
                          <TableHead className="text-right">Group Added</TableHead>
                          <TableHead className="text-right">Commission Records</TableHead>
                          <TableHead className="text-right">Commission Amount</TableHead>
                          <TableHead className="text-right">Paid Count</TableHead>
                          <TableHead className="text-right">Paid Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(commissionRunSummary.monthlyRows || []).map((row) => (
                          <TableRow key={row.monthKey}>
                            <TableCell className="font-medium">{row.monthLabel}</TableCell>
                            <TableCell className="text-right">{row.membershipsAdded}</TableCell>
                            <TableCell className="text-right">{row.membershipsAddedIndividualFamily}</TableCell>
                            <TableCell className="text-right">{row.membershipsAddedGroup}</TableCell>
                            <TableCell className="text-right">{row.commissionRecords}</TableCell>
                            <TableCell className="text-right">{formatCurrency(row.commissionAmount)}</TableCell>
                            <TableCell className="text-right">{row.commissionsPaidCount}</TableCell>
                            <TableCell className="text-right">{formatCurrency(row.commissionsPaidAmount)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </>
                )}
              </CardContent>
            </Card>

            {/* This Month Activity */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 flex items-center">
                    <UserPlus className="h-4 w-4 mr-2 text-green-500" />
                    New Enrollments This Month
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-600">
                    {analytics.overview.newEnrollmentsThisMonth}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 flex items-center">
                    <UserMinus className="h-4 w-4 mr-2 text-red-500" />
                    Cancellations This Month
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-red-600">
                    {analytics.overview.cancellationsThisMonth}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Plan Breakdown */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle>Plan Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plan Name</TableHead>
                      <TableHead className="text-right">Members</TableHead>
                      <TableHead className="text-right">Monthly Revenue</TableHead>
                      <TableHead className="text-right">% of Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {safePlanBreakdown.length === 0
                      ? renderEmptyRow(4, 'No plan distribution data available for this period.')
                      : safePlanBreakdown.map((plan) => (
                          <TableRow key={plan.planId}>
                            <TableCell className="font-medium">{plan.planName}</TableCell>
                            <TableCell className="text-right">{plan.memberCount}</TableCell>
                            <TableCell className="text-right">{formatCurrency(plan.monthlyRevenue)}</TableCell>
                            <TableCell className="text-right">{plan.percentage.toFixed(1)}%</TableCell>
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Monthly Trends */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle>Monthly Trends</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Enrollments</TableHead>
                      <TableHead className="text-right">Cancellations</TableHead>
                      <TableHead className="text-right">Net Growth</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {safeMonthlyTrends.length === 0
                      ? renderEmptyRow(5, 'No monthly trend data available for this period.')
                      : safeMonthlyTrends.map((trend, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{trend.month}</TableCell>
                            <TableCell className="text-right text-green-600">+{trend.enrollments}</TableCell>
                            <TableCell className="text-right text-red-600">-{trend.cancellations}</TableCell>
                            <TableCell className={`text-right font-semibold ${trend.netGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {trend.netGrowth >= 0 ? '+' : ''}{trend.netGrowth}
                            </TableCell>
                            <TableCell className="text-right">{formatCurrency(trend.revenue)}</TableCell>
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Report Tabs */}
            <Card className="mb-8">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Detailed Reports</CardTitle>
                <div className="flex items-center space-x-2">
                  <input
                    id="admin-analytics-email"
                    name="reportEmail"
                    type="email"
                    placeholder="Email report to..."
                    value={emailAddress}
                    onChange={(e) => setEmailAddress(e.target.value)}
                    className="px-3 py-1 border rounded text-sm w-48"
                    autoComplete="email"
                  />
                  <Button 
                    size="sm"
                    onClick={() => exportReport(selectedReport, exportFormat, emailAddress)}
                    disabled={!analytics || !emailAddress}
                  >
                    Email Report
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs value={selectedReport} onValueChange={setSelectedReport}>
                  <TabsList className="grid w-full grid-cols-5">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="members">Members</TabsTrigger>
                    <TabsTrigger value="agents">Agents</TabsTrigger>
                    <TabsTrigger value="commissions">Commissions</TabsTrigger>
                    <TabsTrigger value="revenue">Revenue</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Member</TableHead>
                          <TableHead>Member ID</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Plan</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Enrolled Date</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {safeRecentEnrollments.length === 0
                          ? renderEmptyRow(7, 'No recent enrollments found for this period.')
                          : safeRecentEnrollments.map((enrollment) => (
                              <TableRow key={enrollment.id}>
                                <TableCell className="font-medium">
                                  {enrollment.firstName} {enrollment.lastName}
                                </TableCell>
                                <TableCell className="font-mono text-xs">
                                  #{enrollment.memberId || enrollment.id}
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
                                </TableCell>
                                <TableCell>{enrollment.email}</TableCell>
                                <TableCell>{enrollment.planName}</TableCell>
                                <TableCell className="text-right">{formatCurrency(enrollment.amount)}</TableCell>
                                <TableCell>{formatDateSafe(enrollment.enrolledDate)}</TableCell>
                                <TableCell>
                                  <span className={`px-2 py-1 text-xs rounded-full ${
                                    enrollment.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                  }`}>
                                    {enrollment.status}
                                  </span>
                                </TableCell>
                              </TableRow>
                            ))}
                      </TableBody>
                    </Table>
                  </TabsContent>

                  <TabsContent value="members">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Member ID</TableHead>
                          <TableHead>Group Association</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Segment</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Plan</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Enrolled</TableHead>
                          <TableHead className="text-right">Total Paid</TableHead>
                          <TableHead>Agent</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {safeMemberReports.length === 0
                          ? renderEmptyRow(11, 'No member report data available for this period.')
                          : safeMemberReports.map((member) => (
                              <TableRow key={member.id}>
                                <TableCell className="font-medium">
                                  {member.firstName} {member.lastName}
                                </TableCell>
                                <TableCell className="font-mono text-xs">
                                  {member.memberId ? `#${member.memberId}` : '-'}
                                  {member.memberPublicId && (
                                    <div className="text-[11px] text-gray-500">
                                      Public: {member.memberPublicId}
                                    </div>
                                  )}
                                  {member.customerNumber && (
                                    <div className="text-[11px] text-gray-500">
                                      Customer: {member.customerNumber}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>{member.groupName || '-'}</TableCell>
                                <TableCell>{member.email}</TableCell>
                                <TableCell className="capitalize">{member.businessCategory || 'individual'}</TableCell>
                                <TableCell>{member.phone}</TableCell>
                                <TableCell>{member.planName}</TableCell>
                                <TableCell>
                                  <span className={`px-2 py-1 text-xs rounded-full ${
                                    member.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                  }`}>
                                    {member.status}
                                  </span>
                                </TableCell>
                                <TableCell>{formatDateSafe(member.enrolledDate)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(member.totalPaid)}</TableCell>
                                <TableCell>{member.agentName}</TableCell>
                              </TableRow>
                            ))}
                      </TableBody>
                    </Table>
                  </TabsContent>

                  <TabsContent value="agents">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Agent Name</TableHead>
                          <TableHead>Agent #</TableHead>
                          <TableHead className="text-right">Total Enrollments</TableHead>
                          <TableHead className="text-right">Individual</TableHead>
                          <TableHead className="text-right">Family</TableHead>
                          <TableHead className="text-right">Group</TableHead>
                          <TableHead className="text-right">Monthly Enrollments</TableHead>
                          <TableHead className="text-right">Total Commissions</TableHead>
                          <TableHead className="text-right">Paid</TableHead>
                          <TableHead className="text-right">Pending</TableHead>
                          <TableHead className="text-right">Conversion %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {safeAgentPerformance.length === 0
                          ? renderEmptyRow(11, 'No agent performance data available for this period.')
                          : safeAgentPerformance.map((agent) => (
                              <TableRow key={agent.agentId}>
                                <TableCell className="font-medium">{agent.agentName}</TableCell>
                                <TableCell>{agent.agentNumber}</TableCell>
                                <TableCell className="text-right">{agent.totalEnrollments}</TableCell>
                                <TableCell className="text-right">{agent.individualEnrollments ?? 0}</TableCell>
                                <TableCell className="text-right">{agent.familyEnrollments ?? 0}</TableCell>
                                <TableCell className="text-right">{agent.groupEnrollments ?? 0}</TableCell>
                                <TableCell className="text-right">{agent.monthlyEnrollments}</TableCell>
                                <TableCell className="text-right">{formatCurrency(agent.totalCommissions)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(agent.paidCommissions)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(agent.pendingCommissions)}</TableCell>
                                <TableCell className="text-right">{agent.conversionRate.toFixed(1)}%</TableCell>
                              </TableRow>
                            ))}
                      </TableBody>
                    </Table>
                  </TabsContent>

                  <TabsContent value="commissions">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Agent</TableHead>
                          <TableHead>Agent #</TableHead>
                          <TableHead>Member</TableHead>
                          <TableHead>Member ID</TableHead>
                          <TableHead>Group Association</TableHead>
                          <TableHead>Plan</TableHead>
                          <TableHead>Segment</TableHead>
                          <TableHead className="text-right">Commission</TableHead>
                          <TableHead className="text-right">Plan Cost</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Payment</TableHead>
                          <TableHead>Created</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {safeCommissionReports.length === 0
                          ? renderEmptyRow(12, 'No commission report data available for this period.')
                          : safeCommissionReports.map((commission) => (
                              <TableRow key={commission.id}>
                                <TableCell className="font-medium">{commission.agentName}</TableCell>
                                <TableCell>{commission.agentNumber}</TableCell>
                                <TableCell>{commission.memberName}</TableCell>
                                <TableCell className="font-mono text-xs">
                                  {commission.memberId ? `#${commission.memberId}` : '—'}
                                  {commission.memberPublicId && (
                                    <div className="text-[11px] text-gray-500">
                                      Public: {commission.memberPublicId}
                                    </div>
                                  )}
                                  {commission.membershipId && (
                                    <div className="text-[11px] text-gray-500">
                                      Customer: {commission.membershipId}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>{commission.groupName || '-'}</TableCell>
                                <TableCell>{commission.planName}</TableCell>
                                <TableCell className="capitalize">{commission.businessCategory || 'individual'}</TableCell>
                                <TableCell className="text-right">{formatCurrency(commission.commissionAmount)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(commission.totalPlanCost)}</TableCell>
                                <TableCell>
                                  <span className={`px-2 py-1 text-xs rounded-full ${
                                    commission.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                  }`}>
                                    {commission.status}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <span className={`px-2 py-1 text-xs rounded-full ${
                                    commission.paymentStatus === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                                  }`}>
                                    {commission.paymentStatus}
                                  </span>
                                </TableCell>
                                <TableCell>{formatDateSafe(commission.createdDate)}</TableCell>
                              </TableRow>
                            ))}
                      </TableBody>
                    </Table>
                  </TabsContent>

                  <TabsContent value="revenue">
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm">Total Revenue</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold">{formatCurrency(analytics?.revenueBreakdown?.totalRevenue || 0)}</div>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm">Net Revenue</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold">{formatCurrency(analytics?.revenueBreakdown?.netRevenue || 0)}</div>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm">Projected Annual</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold">{formatCurrency(analytics?.revenueBreakdown?.projectedAnnualRevenue || 0)}</div>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm">Individual / Family + Group</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="text-xs text-gray-600 space-y-1">
                              <div>Individual/Family: <span className="font-semibold text-gray-900">{formatCurrency((analytics?.revenueBreakdown?.individualRevenue || 0) + (analytics?.revenueBreakdown?.familyRevenue || 0))}</span></div>
                              <div>Group: <span className="font-semibold text-gray-900">{formatCurrency(analytics?.revenueBreakdown?.groupRevenue || 0)}</span></div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Month</TableHead>
                            <TableHead className="text-right">Revenue</TableHead>
                            <TableHead className="text-right">Subscriptions</TableHead>
                            <TableHead className="text-right">One-Time</TableHead>
                            <TableHead className="text-right">Refunds</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {safeRevenueByMonth.length === 0
                            ? renderEmptyRow(5, 'No revenue trend rows available for this period.')
                            : safeRevenueByMonth.map((month, index) => (
                                <TableRow key={index}>
                                  <TableCell className="font-medium">{month.month}</TableCell>
                                  <TableCell className="text-right">{formatCurrency(month.revenue)}</TableCell>
                                  <TableCell className="text-right">{formatCurrency(month.subscriptions)}</TableCell>
                                  <TableCell className="text-right">{formatCurrency(month.oneTime)}</TableCell>
                                  <TableCell className="text-right text-red-600">-{formatCurrency(month.refunds)}</TableCell>
                                </TableRow>
                              ))}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </>
        ) : (
          <div className="text-center py-8 text-gray-500">
            No analytics data available
          </div>
        )}
    </AppShell>
  );
}