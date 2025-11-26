import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, DollarSign, TrendingUp, Users, Filter, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface DashboardStatsProps {
  userRole: 'agent' | 'admin';
  agentId?: string;
}

interface StatsData {
  // Revenue data
  totalRevenue: number;
  monthlyRevenue: number;
  yearlyRevenue: number;
  averageRevenuePerMember: number;
  
  // Commission data
  totalCommissions: number;
  monthlyCommissions: number;
  yearlyCommissions: number;
  paidCommissions: number;
  pendingCommissions: number;
  
  // Member/Enrollment data
  totalMembers: number;
  activeMembers: number;
  monthlyEnrollments: number;
  yearlyEnrollments: number;
  
  // Growth metrics
  revenueGrowth: number;
  memberGrowth: number;
  commissionGrowth: number;
}

export default function DashboardStats({ userRole, agentId }: DashboardStatsProps) {
  const [filterPeriod, setFilterPeriod] = useState('all-time');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);

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
    
    if (agentId && (userRole === 'agent' || userRole === 'admin' || userRole === 'super_admin')) {
      params.append('agentId', agentId);
    }
    
    return params.toString();
  };

  // Fetch enhanced stats data
  const { data: stats, isLoading, refetch } = useQuery<StatsData>({
    queryKey: [`/api/${userRole}/stats`, filterPeriod, customStartDate, customEndDate],
    queryFn: () => {
      const queryString = getQueryParams();
      const url = `/api/${userRole}/stats${queryString ? `?${queryString}` : ''}`;
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
              {userRole === 'admin' ? 'Platform Overview' : 'Your Performance'}
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
      </Card>

      {/* Revenue Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-600" />
              Total Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats?.totalRevenue)}</div>
            <div className={`text-sm ${getGrowthColor(stats?.revenueGrowth || 0)}`}>
              {formatPercentage(stats?.revenueGrowth || 0)} from last period
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              Total Commissions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats?.totalCommissions)}</div>
            <div className="text-sm text-gray-600">
              Paid: {formatCurrency(stats?.paidCommissions)} | 
              Pending: {formatCurrency(stats?.pendingCommissions)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-600" />
              Active Members
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(stats?.activeMembers)}</div>
            <div className={`text-sm ${getGrowthColor(stats?.memberGrowth || 0)}`}>
              {formatPercentage(stats?.memberGrowth || 0)} growth
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4 text-orange-600" />
              Avg Revenue/Member
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats?.averageRevenuePerMember)}</div>
            <div className="text-sm text-gray-600">
              Per active member
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
            {userRole === 'admin' ? (
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