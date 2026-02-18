import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { hasAtLeastRole } from "@/lib/roles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { 
  CreditCard, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle,
  Clock,
  RefreshCw,
  Download,
  ArrowLeft
} from "lucide-react";

interface Payment {
  id: number;
  created_at: string;
  amount: number | string;
  status: string;
  transaction_id?: string;
  payment_method?: string;
  member_id?: number;
  member_first_name?: string;
  member_last_name?: string;
  member_email?: string;
  member_customer_number?: string;
  epx_auth_guid?: string;
  metadata?: any;
}

interface PaymentStats {
  successful: number;
  failed: number;
  pending: number;
  total: number;
  totalRevenue: number;
  failedRevenue: number;
}

export default function AdminRecentPayments() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const isAdmin = hasAtLeastRole(user?.role, "admin");
  
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [limit, setLimit] = useState(50);

  // Redirect if not admin
  if (!authLoading && (!user || !isAdmin)) {
    setLocation("/no-access");
    return null;
  }

  // Fetch payment statistics
  const { data: stats, isLoading: statsLoading } = useQuery<PaymentStats>({
    queryKey: ["/api/admin/payments/stats"],
    enabled: !!user && isAdmin,
    select: (data: any) => data?.stats || {
      successful: 0,
      failed: 0,
      pending: 0,
      total: 0,
      totalRevenue: 0,
      failedRevenue: 0
    }
  });

  // Fetch recent payments
  const { data: paymentsData, isLoading: paymentsLoading, refetch } = useQuery({
    queryKey: ["/api/admin/payments/recent", statusFilter, limit],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: limit.toString(),
        ...(statusFilter !== "all" && { status: statusFilter })
      });
      return apiRequest(`/api/admin/payments/recent?${params}`);
    },
    enabled: !!user && isAdmin,
  });

  const payments: Payment[] = paymentsData?.payments || [];

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "succeeded":
      case "success":
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" /> Succeeded</Badge>;
      case "failed":
      case "declined":
        return <Badge className="bg-red-100 text-red-800"><AlertCircle className="w-3 h-3 mr-1" /> Failed</Badge>;
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
      case "refunded":
        return <Badge className="bg-purple-100 text-purple-800">Refunded</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-600">{status}</Badge>;
    }
  };

  const formatAmount = (amount: number | string) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return isNaN(num) ? '$0.00' : `$${num.toFixed(2)}`;
  };

  const exportPayments = () => {
    const csv = [
      ['Date', 'Member', 'Email', 'Amount', 'Status', 'Transaction ID', 'Payment Method'],
      ...payments.map(p => [
        format(new Date(p.created_at), 'yyyy-MM-dd HH:mm:ss'),
        `${p.member_first_name || ''} ${p.member_last_name || ''}`.trim() || 'N/A',
        p.member_email || 'N/A',
        formatAmount(p.amount),
        p.status,
        p.transaction_id || 'N/A',
        p.payment_method || 'N/A'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payments-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  if (authLoading || statsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50/10">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Button
                variant="ghost"
                className="mr-4"
                onClick={() => setLocation("/admin/enrollments")}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Payment Tracking</h1>
                <p className="text-gray-600 mt-1">Monitor all payment transactions</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button onClick={exportPayments}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Payments (30d)</p>
                  <p className="text-2xl font-bold text-gray-900">{stats?.total || 0}</p>
                </div>
                <CreditCard className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Successful</p>
                  <p className="text-2xl font-bold text-green-600">{stats?.successful || 0}</p>
                  <p className="text-xs text-gray-500 mt-1">${(stats?.totalRevenue || 0).toFixed(2)}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Failed</p>
                  <p className="text-2xl font-bold text-red-600">{stats?.failed || 0}</p>
                  <p className="text-xs text-gray-500 mt-1">${(stats?.failedRevenue || 0).toFixed(2)} lost</p>
                </div>
                <AlertCircle className="h-8 w-8 text-red-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Pending</p>
                  <p className="text-2xl font-bold text-yellow-600">{stats?.pending || 0}</p>
                </div>
                <Clock className="h-8 w-8 text-yellow-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Payments Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent Transactions</CardTitle>
              <div className="flex gap-4">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="succeeded">Succeeded</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={limit.toString()} onValueChange={(v) => setLimit(parseInt(v))}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25 rows</SelectItem>
                    <SelectItem value="50">50 rows</SelectItem>
                    <SelectItem value="100">100 rows</SelectItem>
                    <SelectItem value="200">200 rows</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {paymentsLoading ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : payments.length === 0 ? (
              <p className="text-center text-gray-500 py-12">No payment transactions found</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date/Time</TableHead>
                      <TableHead>Member</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Transaction ID</TableHead>
                      <TableHead>Method</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell className="text-sm">
                          {format(new Date(payment.created_at), 'MMM d, yyyy')}
                          <div className="text-xs text-gray-500">
                            {format(new Date(payment.created_at), 'h:mm a')}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">
                              {payment.member_first_name || ''} {payment.member_last_name || ''}
                            </div>
                            <div className="text-xs text-gray-500">{payment.member_email}</div>
                            {payment.member_customer_number && (
                              <div className="text-xs text-gray-400">#{payment.member_customer_number}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-semibold">
                          {formatAmount(payment.amount)}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(payment.status)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {payment.transaction_id ? (
                            <span title={payment.transaction_id}>
                              {payment.transaction_id.slice(0, 12)}...
                            </span>
                          ) : (
                            <span className="text-gray-400">N/A</span>
                          )}
                        </TableCell>
                        <TableCell className="capitalize text-sm">
                          {payment.payment_method || 'N/A'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
