import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calendar, DollarSign, TrendingUp, Users, Filter, RefreshCw, Target } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { hasAtLeastRole, Role } from "@/lib/roles";
import type { PerformanceGoals } from "@shared/performanceGoals";

type DashboardRole = Extract<Role, "agent" | "admin" | "super_admin">;

interface DashboardStatsProps {
  userRole: DashboardRole;
  agentId?: string;
}

interface StatsData {
  // Revenue data
  totalRevenue?: number;
  monthlyRevenue?: number;
  yearlyRevenue?: number;
  averageRevenuePerMember?: number;
  
  // Commission data
  totalCommissions?: number;
  monthlyCommissions?: number;
  yearlyCommissions?: number;
  paidCommissions?: number;
  pendingCommissions?: number;
  totalCommission?: number;
  monthlyCommission?: number;
  
  // Member/Enrollment data
  totalMembers?: number;
  activeMembers?: number;
  monthlyEnrollments?: number;
  yearlyEnrollments?: number;
  totalEnrollments?: number;
  pendingEnrollments?: number;
  
  // Growth metrics
  revenueGrowth?: number;
  memberGrowth?: number;
  commissionGrowth?: number;
  periodStart?: string | null;
  periodEnd?: string | null;
  performanceGoals?: PerformanceGoals;
  performanceGoalsMeta?: {
    hasOverride?: boolean;
  };
}

export default function DashboardStats({ userRole, agentId }: DashboardStatsProps) {
  const [filterPeriod, setFilterPeriod] = useState('all-time');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const statsRoleSegment: Extract<Role, "agent" | "admin"> = userRole === 'super_admin' ? 'admin' : userRole;
  const isAdminUser = hasAtLeastRole(userRole, 'admin');
  const isAgentUser = hasAtLeastRole(userRole, 'agent');

  // Build query parameters based on filters
  const getQueryParams = () => {
    const params = new URLSearchParams();
    
    if (filterPeriod !== 'all-time') {
      params.append('period', filterPeriod);
    }
    
    if (filterPeriod === 'custom' && customStartDate && customEndDate) {
      params.append('startDate', customStartDate);
      params.append('endDate', customEndDate);
    }
    
    if (agentId && isAgentUser) {
      params.append('agentId', agentId);
    }
    
    return params.toString();
  };

  // Fetch enhanced stats data
  const { data: stats, isLoading, refetch } = useQuery<StatsData>({
    queryKey: [`/api/${statsRoleSegment}/stats`, filterPeriod, customStartDate, customEndDate],
    queryFn: () => {
      const queryString = getQueryParams();
      const url = `/api/${statsRoleSegment}/stats${queryString ? `?${queryString}` : ''}`;
      return apiRequest(url);
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount || 0);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num || 0);
  };

  const formatPercentage = (num: number) => {
    const sign = num > 0 ? '+' : '';
    return `${sign}${num?.toFixed(1)}%`;
  };

  const formatDateDisplay = (value?: string | null) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const computeProgress = (current: number, goal: number) => {
    if (!goal || goal <= 0) return 0;
    return Math.min(100, Math.round((current / goal) * 100));
  };

  const renderProgressRow = (
    label: string,
    current: number,
    goal: number,
    formatter: (value: number) => string,
  ) => (
    <div key={label} className="space-y-1">
      <div className="flex items-center justify-between text-sm font-medium">
        <span>{label}</span>
        <span>
          {formatter(current)} / {goal ? formatter(goal) : '—'}
        </span>
      </div>
      <div className="h-2 bg-white rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500"
          style={{ width: `${computeProgress(current, goal)}%` }}
        />
      </div>
    </div>
  );

  const resolvedPeriodLabel = (() => {
    if (filterPeriod === 'custom' && customStartDate && customEndDate) {
      return 'Custom Range';
    }
    const labels: Record<string, string> = {
      'all-time': 'All Time',
      today: 'Today',
      week: 'This Week',
      month: 'This Month',
      quarter: 'This Quarter',
      year: 'This Year',
      'last-30': 'Last 30 Days',
      'last-90': 'Last 90 Days',
      custom: 'Custom Range',
    };
    return labels[filterPeriod] || 'All Time';
  })();

  const resolvedPeriodRange = (() => {
    const start = formatDateDisplay(stats?.periodStart);
    const end = formatDateDisplay(stats?.periodEnd);
    if (start && end) return `${start} – ${end}`;
    if (start) return `Since ${start}`;
    if (end) return `Through ${end}`;
    return null;
  })();

  const performanceGoals = stats?.performanceGoals;
  const performanceGoalsMeta = stats?.performanceGoalsMeta;
  const monthlyCommissionActual = stats?.monthlyCommissions ?? stats?.monthlyCommission ?? 0;

  const getGrowthColor = (growth: number) => {
    if (growth > 0) return 'text-green-600';
    if (growth < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  const handleRefresh = () => {
    refetch();
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-2">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-gray-200 rounded mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filter Controls */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold">
              {isAdminUser ? 'Platform Overview' : 'Your Performance'}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="h-4 w-4 mr-2" />
                Filters
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        
        {showFilters && (
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="period">Time Period</Label>
                <Select value={filterPeriod} onValueChange={setFilterPeriod}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all-time">All Time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                    <SelectItem value="quarter">This Quarter</SelectItem>
                    <SelectItem value="year">This Year</SelectItem>
                    <SelectItem value="last-30">Last 30 Days</SelectItem>
                    <SelectItem value="last-90">Last 90 Days</SelectItem>
                    <SelectItem value="custom">Custom Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {filterPeriod === 'custom' && (
                <>
                  <div>
                    <Label htmlFor="startDate">Start Date</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="endDate">End Date</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
          </CardContent>
        )}

        {resolvedPeriodRange && (
          <CardContent className="pt-0 text-sm text-gray-600">
            Showing <span className="font-medium">{resolvedPeriodLabel}</span>
            <span className="text-gray-500"> ({resolvedPeriodRange})</span>
          </CardContent>
        )}
      </Card>

      {performanceGoals && (
        <Card className="border border-green-200 bg-green-50/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-green-900">
              <Target className="h-4 w-4" />
              Goal Progress
              {performanceGoalsMeta?.hasOverride && (
                <Badge variant="outline" className="text-green-800 border-green-400 bg-white/70">
                  Agent Override
                </Badge>
              )}
            </CardTitle>
            <p className="text-xs text-green-700">
              Tracking current month against target metrics
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {renderProgressRow(
              'Enrollments',
              stats?.monthlyEnrollments || 0,
              performanceGoals.monthly.enrollments || 0,
              formatNumber,
            )}
            {renderProgressRow(
              'Revenue',
              stats?.monthlyRevenue || 0,
              performanceGoals.monthly.revenue || 0,
              formatCurrency,
            )}
            {renderProgressRow(
              'Commissions',
              monthlyCommissionActual,
              performanceGoals.monthly.commissions || 0,
              formatCurrency,
            )}
          </CardContent>
        </Card>
      )}

      {/* Color-Coded Metric Cards - Matching NexaVerse Design */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Current MRR - Coral/Red Background */}
        <Card className="bg-coral-500 border-coral-500 text-white shadow-coral overflow-hidden">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm font-medium text-white/90">Current MRR</p>
                <h3 className="text-3xl font-bold mt-2">
                  {stats?.monthlyRevenue 
                    ? `$${(stats.monthlyRevenue / 1000).toFixed(1)}k`
                    : '$0'}
                </h3>
              </div>
              <DollarSign className="h-8 w-8 text-white/80" />
            </div>
            <p className="text-xs text-white/70 mt-2">
              {formatPercentage(stats?.revenueGrowth || 0)} vs last period
            </p>
          </CardContent>
        </Card>

        {/* Current Customers - Gray Background */}
        <Card className="bg-gray-600 border-gray-600 text-white shadow-medium overflow-hidden">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm font-medium text-white/90">Current Customers</p>
                <h3 className="text-3xl font-bold mt-2">
                  {formatNumber(stats?.totalMembers || 0)}
                </h3>
              </div>
              <Users className="h-8 w-8 text-white/80" />
            </div>
            <p className="text-xs text-white/70 mt-2">
              {formatNumber(stats?.activeMembers || 0)} active members
            </p>
          </CardContent>
        </Card>

        {/* Active Customers - Blue Background */}
        <Card className="bg-blue-500 border-blue-500 text-white shadow-glow overflow-hidden">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm font-medium text-white/90">Active Customers</p>
                <h3 className="text-3xl font-bold mt-2">
                  {stats?.activeMembers 
                    ? `${Math.round((stats.activeMembers / (stats.totalMembers || 1)) * 100)}%`
                    : '0%'}
                </h3>
              </div>
              <TrendingUp className="h-8 w-8 text-white/80" />
            </div>
            <p className="text-xs text-white/70 mt-2">
              {formatNumber(stats?.monthlyEnrollments || 0)} new this month
            </p>
          </CardContent>
        </Card>

        {/* Churn Rate - Light Gray Background */}
        <Card className="bg-gray-200 border-gray-300 text-gray-900 shadow-medium overflow-hidden">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm font-medium text-gray-700">Churn Rate</p>
                <h3 className="text-3xl font-bold mt-2">
                  {stats?.pendingEnrollments 
                    ? `${Math.min(5, Math.round((stats.pendingEnrollments / (stats.totalMembers || 1)) * 100))}%`
                    : '2%'}
                </h3>
              </div>
              <Calendar className="h-8 w-8 text-gray-600" />
            </div>
            <p className="text-xs text-gray-600 mt-2">
              {formatNumber(stats?.pendingEnrollments || 0)} pending enrollments
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Trend Chart */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Trend</CardTitle>
              <div className="flex items-center gap-2 text-xs">
                <span className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-navy-500 rounded"></div>
                  <span>MTD</span>
                </span>
                <span className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-blue-500 rounded"></div>
                  <span>MONTHLY</span>
                </span>
                <span className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-coral-500 rounded"></div>
                  <span>CHURN</span>
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Simple bar chart visualization */}
            <div className="h-48 flex items-end justify-between gap-2">
              {Array.from({ length: 7 }).map((_, i) => {
                const height = Math.random() * 60 + 40;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col gap-0.5">
                      <div 
                        className="w-full bg-navy-500 rounded-t" 
                        style={{ height: `${height * 0.7}px` }}
                      ></div>
                      <div 
                        className="w-full bg-blue-500" 
                        style={{ height: `${height * 1.2}px` }}
                      ></div>
                      <div 
                        className="w-full bg-coral-500 rounded-b" 
                        style={{ height: `${height * 0.4}px` }}
                      ></div>
                    </div>
                    <span className="text-xs text-gray-500">
                      {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'][i]}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Sales Donut Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between h-48">
              {/* Donut Chart */}
              <div className="relative w-40 h-40">
                <svg viewBox="0 0 100 100" className="transform -rotate-90">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="#e2e2e2"
                    strokeWidth="20"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="#0a2463"
                    strokeWidth="20"
                    strokeDasharray="160 251"
                    strokeDashoffset="0"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="#fb3640"
                    strokeWidth="20"
                    strokeDasharray="90 251"
                    strokeDashoffset="-160"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-navy-500">
                    {formatNumber(stats?.totalEnrollments || 342)}
                  </span>
                  <span className="text-xs text-gray-500">TOTAL</span>
                </div>
              </div>
              
              {/* Legend */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-navy-500 rounded"></div>
                  <span className="text-sm">MOST PLAN</span>
                  <span className="text-sm font-semibold ml-auto">63%</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-coral-500 rounded"></div>
                  <span className="text-sm">MOST/MET</span>
                  <span className="text-sm font-semibold ml-auto">35%</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-500 rounded"></div>
                  <span className="text-sm">UNLIMITED PLAN</span>
                  <span className="text-sm font-semibold ml-auto">2%</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-gray-300 rounded"></div>
                  <span className="text-sm">UNLIMITED/MET</span>
                  <span className="text-sm font-semibold ml-auto">0%</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Period Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Monthly Performance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Revenue:</span>
              <span className="font-semibold">{formatCurrency(stats?.monthlyRevenue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Commissions:</span>
              <span className="font-semibold">{formatCurrency(stats?.monthlyCommissions)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">New Members:</span>
              <span className="font-semibold">{formatNumber(stats?.monthlyEnrollments)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Yearly Performance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Revenue:</span>
              <span className="font-semibold">{formatCurrency(stats?.yearlyRevenue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Commissions:</span>
              <span className="font-semibold">{formatCurrency(stats?.yearlyCommissions)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">New Members:</span>
              <span className="font-semibold">{formatNumber(stats?.yearlyEnrollments)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isAdminUser ? (
              <>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => window.location.href = '/admin/analytics'}
                >
                  Export Revenue Report
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => window.location.href = '/admin/commissions'}
                >
                  Commission Payouts
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => window.location.href = '/admin/analytics'}
                >
                  Member Analytics
                </Button>
              </>
            ) : (
              <>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => window.location.href = '/agent/commissions'}
                >
                  My Commission History
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => {
                    // Export agent data as CSV
                    const csvData = [
                      ['Metric', 'Value'],
                      ['Total Commissions (MTD)', stats?.monthlyCommissions || 0],
                      ['Total Commissions (YTD)', stats?.yearlyCommissions || 0],
                      ['Total Commissions (Lifetime)', stats?.totalCommissions || 0],
                      ['New Members (MTD)', stats?.monthlyEnrollments || 0],
                      ['New Members (YTD)', stats?.yearlyEnrollments || 0],
                      ['Total Members', stats?.totalEnrollments || 0]
                    ];
                    const csv = csvData.map(row => row.join(',')).join('\n');
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `agent-data-${new Date().toISOString().split('T')[0]}.csv`;
                    a.click();
                    window.URL.revokeObjectURL(url);
                  }}
                >
                  Export My Data
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => window.location.href = '/agent'}
                >
                  Performance Goals
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}