import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, TrendingUp, TrendingDown, Users, DollarSign, UserPlus, UserMinus, Calendar } from "lucide-react";
import { Link } from "wouter";
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

interface AnalyticsData {
  overview: {
    totalMembers: number;
    activeSubscriptions: number;
    monthlyRevenue: number;
    averageRevenue: number;
    churnRate: number;
    growthRate: number;
    newEnrollmentsThisMonth: number;
    cancellationsThisMonth: number;
  };
  planBreakdown: Array<{
    planName: string;
    planId: number;
    memberCount: number;
    monthlyRevenue: number;
    percentage: number;
  }>;
  recentEnrollments: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    planName: string;
    amount: number;
    enrolledDate: string;
    status: string;
  }>;
  monthlyTrends: Array<{
    month: string;
    enrollments: number;
    cancellations: number;
    netGrowth: number;
    revenue: number;
  }>;
  agentPerformance: Array<{
    agentId: string;
    agentName: string;
    agentNumber: string;
    totalEnrollments: number;
    totalCommissions: number;
    paidCommissions: number;
    pendingCommissions: number;
    monthlyEnrollments: number;
    conversionRate: number;
    averageCommission: number;
  }>;
  memberReports: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    planName: string;
    status: string;
    enrolledDate: string;
    lastPayment: string;
    totalPaid: number;
    agentName: string;
  }>;
  commissionReports: Array<{
    id: string;
    agentName: string;
    agentNumber: string;
    memberName: string;
    planName: string;
    commissionAmount: number;
    totalPlanCost: number;
    status: string;
    paymentStatus: string;
    createdDate: string;
    paidDate: string | null;
  }>;
  revenueBreakdown: {
    totalRevenue: number;
    subscriptionRevenue: number;
    oneTimeRevenue: number;
    refunds: number;
    netRevenue: number;
    projectedAnnualRevenue: number;
    averageRevenuePerUser: number;
    revenueByMonth: Array<{
      month: string;
      revenue: number;
      subscriptions: number;
      oneTime: number;
      refunds: number;
    }>;
  };
}

export default function AdminAnalytics() {
  const { toast } = useToast();
  const [timeRange, setTimeRange] = useState("30");
  const [selectedReport, setSelectedReport] = useState("overview");
  const [exportFormat, setExportFormat] = useState("csv");
  const [emailAddress, setEmailAddress] = useState("");

  // Fetch analytics data
  const { data: analytics, isLoading, refetch } = useQuery<AnalyticsData>({
    queryKey: ['/api/admin/analytics', timeRange],
    queryFn: async () => {
      const response = await apiRequest(`/api/admin/analytics?days=${timeRange}`, {
        method: "GET"
      });
      return response; // apiRequest already returns parsed JSON
    }
  });

  // Safe array handling for all analytics data arrays
  const safePlanBreakdown = Array.isArray(analytics?.planBreakdown) ? analytics.planBreakdown : [];
  const safeRecentEnrollments = Array.isArray(analytics?.recentEnrollments) ? analytics.recentEnrollments : [];
  const safeMonthlyTrends = Array.isArray(analytics?.monthlyTrends) ? analytics.monthlyTrends : [];

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
        return analytics?.memberReports || [];
      case 'agents':
        return analytics?.agentPerformance || [];
      case 'commissions':
        return analytics?.commissionReports || [];
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link href="/admin">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Dashboard
                </Button>
              </Link>
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-6 w-6 text-blue-600" />
                <h1 className="text-2xl font-bold text-gray-900">Analytics & Reports</h1>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select time range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="365">Last year</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center space-x-2">
                <Select value={selectedReport} onValueChange={setSelectedReport}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Select report" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="overview">Overview</SelectItem>
                    <SelectItem value="members">Members</SelectItem>
                    <SelectItem value="agents">Agent Performance</SelectItem>
                    <SelectItem value="commissions">Commissions</SelectItem>
                    <SelectItem value="revenue">Revenue Details</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={exportFormat} onValueChange={setExportFormat}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue placeholder="Format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="xlsx">Excel</SelectItem>
                    <SelectItem value="pdf">PDF</SelectItem>
                  </SelectContent>
                </Select>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={exportAnalytics}
                  disabled={!analytics}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading ? (
          <div className="text-center py-8">Loading analytics...</div>
        ) : analytics ? (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 flex items-center justify-between">
                    Total Members
                    <Users className="h-4 w-4 text-blue-500" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{analytics.overview.totalMembers}</div>
                  <p className="text-xs text-gray-500 mt-1">Active subscriptions: {analytics.overview.activeSubscriptions}</p>
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
                    {safePlanBreakdown.map((plan) => (
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
                    {safeMonthlyTrends.map((trend, index) => (
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
                    type="email"
                    placeholder="Email report to..."
                    value={emailAddress}
                    onChange={(e) => setEmailAddress(e.target.value)}
                    className="px-3 py-1 border rounded text-sm w-48"
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
                          <TableHead>Member Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Plan</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Enrolled Date</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {safeRecentEnrollments.map((enrollment) => (
                          <TableRow key={enrollment.id}>
                            <TableCell className="font-medium">
                              {enrollment.firstName} {enrollment.lastName}
                            </TableCell>
                            <TableCell>{enrollment.email}</TableCell>
                            <TableCell>{enrollment.planName}</TableCell>
                            <TableCell className="text-right">{formatCurrency(enrollment.amount)}</TableCell>
                            <TableCell>{format(new Date(enrollment.enrolledDate), 'MMM dd, yyyy')}</TableCell>
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
                          <TableHead>Email</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Plan</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Enrolled</TableHead>
                          <TableHead className="text-right">Total Paid</TableHead>
                          <TableHead>Agent</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(analytics?.memberReports || []).map((member) => (
                          <TableRow key={member.id}>
                            <TableCell className="font-medium">
                              {member.firstName} {member.lastName}
                            </TableCell>
                            <TableCell>{member.email}</TableCell>
                            <TableCell>{member.phone}</TableCell>
                            <TableCell>{member.planName}</TableCell>
                            <TableCell>
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                member.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                              }`}>
                                {member.status}
                              </span>
                            </TableCell>
                            <TableCell>{format(new Date(member.enrolledDate), 'MMM dd, yyyy')}</TableCell>
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
                          <TableHead className="text-right">Monthly Enrollments</TableHead>
                          <TableHead className="text-right">Total Commissions</TableHead>
                          <TableHead className="text-right">Paid</TableHead>
                          <TableHead className="text-right">Pending</TableHead>
                          <TableHead className="text-right">Conversion %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(analytics?.agentPerformance || []).map((agent) => (
                          <TableRow key={agent.agentId}>
                            <TableCell className="font-medium">{agent.agentName}</TableCell>
                            <TableCell>{agent.agentNumber}</TableCell>
                            <TableCell className="text-right">{agent.totalEnrollments}</TableCell>
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
                          <TableHead>Plan</TableHead>
                          <TableHead className="text-right">Commission</TableHead>
                          <TableHead className="text-right">Plan Cost</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Payment</TableHead>
                          <TableHead>Created</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(analytics?.commissionReports || []).map((commission) => (
                          <TableRow key={commission.id}>
                            <TableCell className="font-medium">{commission.agentName}</TableCell>
                            <TableCell>{commission.agentNumber}</TableCell>
                            <TableCell>{commission.memberName}</TableCell>
                            <TableCell>{commission.planName}</TableCell>
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
                            <TableCell>{format(new Date(commission.createdDate), 'MMM dd, yyyy')}</TableCell>
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
                          {(analytics?.revenueBreakdown?.revenueByMonth || []).map((month, index) => (
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
      </div>
    </div>
  );
}