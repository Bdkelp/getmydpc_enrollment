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
}

export default function AdminAnalytics() {
  const { toast } = useToast();
  const [timeRange, setTimeRange] = useState("30");

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

  const exportAnalytics = () => {
    if (!analytics) {
      toast({
        title: "No Data",
        description: "No analytics data available to export",
        variant: "destructive"
      });
      return;
    }

    // Create comprehensive CSV with all data
    const csvSections = [];
    
    // Overview section
    csvSections.push('OVERVIEW METRICS');
    csvSections.push('Metric,Value');
    csvSections.push(`Total Members,${analytics.overview.totalMembers}`);
    csvSections.push(`Active Subscriptions,${analytics.overview.activeSubscriptions}`);
    csvSections.push(`Monthly Revenue,$${analytics.overview.monthlyRevenue.toFixed(2)}`);
    csvSections.push(`Average Revenue per Member,$${analytics.overview.averageRevenue.toFixed(2)}`);
    csvSections.push(`Churn Rate,${analytics.overview.churnRate.toFixed(1)}%`);
    csvSections.push(`Growth Rate,${analytics.overview.growthRate.toFixed(1)}%`);
    csvSections.push(`New Enrollments This Month,${analytics.overview.newEnrollmentsThisMonth}`);
    csvSections.push(`Cancellations This Month,${analytics.overview.cancellationsThisMonth}`);
    csvSections.push('');
    
    // Plan breakdown section
    csvSections.push('PLAN BREAKDOWN');
    csvSections.push('Plan Name,Members,Monthly Revenue,Percentage');
    analytics.planBreakdown.forEach(plan => {
      csvSections.push(`${plan.planName},${plan.memberCount},$${plan.monthlyRevenue.toFixed(2)},${plan.percentage.toFixed(1)}%`);
    });
    csvSections.push('');
    
    // Monthly trends section
    csvSections.push('MONTHLY TRENDS');
    csvSections.push('Month,Enrollments,Cancellations,Net Growth,Revenue');
    analytics.monthlyTrends.forEach(trend => {
      csvSections.push(`${trend.month},${trend.enrollments},${trend.cancellations},${trend.netGrowth},$${trend.revenue.toFixed(2)}`);
    });
    csvSections.push('');
    
    // Recent enrollments section
    csvSections.push('RECENT ENROLLMENTS');
    csvSections.push('Name,Email,Plan,Amount,Enrolled Date,Status');
    analytics.recentEnrollments.forEach(enrollment => {
      csvSections.push(`"${enrollment.firstName} ${enrollment.lastName}",${enrollment.email},${enrollment.planName},$${enrollment.amount},${enrollment.enrolledDate},${enrollment.status}`);
    });

    const csvContent = csvSections.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics_report_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    toast({
      title: "Export Successful",
      description: "Analytics report exported to CSV",
    });
  };

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
              <Button 
                variant="outline" 
                size="sm"
                onClick={exportAnalytics}
                disabled={!analytics}
              >
                <Download className="h-4 w-4 mr-2" />
                Export Report
              </Button>
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
                    {analytics.planBreakdown.map((plan) => (
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
                    {analytics.monthlyTrends.map((trend, index) => (
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

            {/* Recent Enrollments */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Enrollments</CardTitle>
              </CardHeader>
              <CardContent>
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
                    {analytics.recentEnrollments.map((enrollment) => (
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