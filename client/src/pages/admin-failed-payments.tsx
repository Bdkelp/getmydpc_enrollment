import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { hasAtLeastRole } from "@/lib/roles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { 
  AlertTriangle, 
  XCircle, 
  Clock,
  Mail,
  Phone,
  ArrowLeft,
  RefreshCw,
  Download
} from "lucide-react";

interface FailedPayment {
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
  member_phone?: string;
  member_customer_number?: string;
  member_monthly_price?: number | string;
  member_status?: string;
  agent_number?: string;
  plan_name?: string;
  agent_first_name?: string;
  agent_last_name?: string;
  agent_email?: string;
  metadata?: any;
}

export default function AdminFailedPayments() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const isAdmin = hasAtLeastRole(user?.role, "admin");

  // Redirect if not admin
  if (!authLoading && (!user || !isAdmin)) {
    setLocation("/no-access");
    return null;
  }

  // Fetch failed payments
  const { data: paymentsData, isLoading: paymentsLoading, refetch } = useQuery({
    queryKey: ["/api/admin/payments/failed"],
    queryFn: async () => {
      return apiRequest("/api/admin/payments/failed");
    },
    enabled: !!user && isAdmin,
    refetchInterval: 60000, // Refresh every minute
  });

  const payments: FailedPayment[] = paymentsData?.payments || [];

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "failed":
      case "declined":
        return (
          <Badge className="bg-red-100 text-red-800">
            <XCircle className="w-3 h-3 mr-1" /> Failed
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-yellow-100 text-yellow-800">
            <Clock className="w-3 h-3 mr-1" /> Pending
          </Badge>
        );
      case "canceled":
        return (
          <Badge className="bg-gray-100 text-gray-600">
            Canceled
          </Badge>
        );
      default:
        return <Badge className="bg-gray-100 text-gray-600">{status}</Badge>;
    }
  };

  const formatAmount = (amount: number | string) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return isNaN(num) ? '$0.00' : `$${num.toFixed(2)}`;
  };

  const exportFailedPayments = () => {
    const csv = [
      ['Date', 'Member', 'Email', 'Phone', 'Amount', 'Status', 'Agent', 'Plan'],
      ...payments.map(p => [
        format(new Date(p.created_at), 'yyyy-MM-dd HH:mm:ss'),
        `${p.member_first_name || ''} ${p.member_last_name || ''}`.trim() || 'N/A',
        p.member_email || 'N/A',
        p.member_phone || 'N/A',
        formatAmount(p.amount),
        p.status,
        `${p.agent_first_name || ''} ${p.agent_last_name || ''}`.trim() || 'N/A',
        p.plan_name || 'N/A'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `failed-payments-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  const failedCount = payments.filter(p => p.status.toLowerCase() === 'failed' || p.status.toLowerCase() === 'declined').length;
  const pendingCount = payments.filter(p => p.status.toLowerCase() === 'pending').length;
  const totalAmount = payments.reduce((sum, p) => {
    const amount = typeof p.amount === 'string' ? parseFloat(p.amount) : p.amount;
    return sum + (isNaN(amount) ? 0 : amount);
  }, 0);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-red-50/10">
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
                <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                  <AlertTriangle className="h-6 w-6 mr-2 text-red-600" />
                  Failed & Pending Payments
                </h1>
                <p className="text-gray-600 mt-1">Payments requiring attention or follow-up</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              {payments.length > 0 && (
                <Button onClick={exportFailedPayments}>
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Alert Summary */}
        {payments.length > 0 && (
          <Alert className="mb-6 border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertTitle className="text-red-900">
              {payments.length} Payment Issue{payments.length !== 1 ? 's' : ''} Detected
            </AlertTitle>
            <AlertDescription className="text-red-800">
              {failedCount} failed, {pendingCount} pending • Total amount: {formatAmount(totalAmount)}
              <div className="mt-2 text-sm">
                Review these transactions and contact members or agents as needed to resolve payment issues.
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Failed Payments</p>
                  <p className="text-3xl font-bold text-red-600">{failedCount}</p>
                </div>
                <XCircle className="h-10 w-10 text-red-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Pending Payments</p>
                  <p className="text-3xl font-bold text-yellow-600">{pendingCount}</p>
                </div>
                <Clock className="h-10 w-10 text-yellow-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Amount</p>
                  <p className="text-3xl font-bold text-gray-900">{formatAmount(totalAmount)}</p>
                </div>
                <AlertTriangle className="h-10 w-10 text-orange-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Failed Payments Table */}
        <Card>
          <CardHeader>
            <CardTitle>Payment Issues</CardTitle>
          </CardHeader>
          <CardContent>
            {paymentsLoading ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : payments.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">All Clear!</h3>
                <p className="text-gray-500">No failed or pending payments at this time.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Member</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell className="text-sm whitespace-nowrap">
                          {format(new Date(payment.created_at), 'MMM d, yyyy')}
                          <div className="text-xs text-gray-500">
                            {format(new Date(payment.created_at), 'h:mm a')}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">
                              {payment.member_first_name} {payment.member_last_name}
                            </div>
                            {payment.member_customer_number && (
                              <div className="text-xs text-gray-400">#{payment.member_customer_number}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {payment.member_email && (
                              <div className="flex items-center text-xs text-gray-600">
                                <Mail className="w-3 h-3 mr-1" />
                                <a href={`mailto:${payment.member_email}`} className="hover:underline">
                                  {payment.member_email}
                                </a>
                              </div>
                            )}
                            {payment.member_phone && (
                              <div className="flex items-center text-xs text-gray-600">
                                <Phone className="w-3 h-3 mr-1" />
                                <a href={`tel:${payment.member_phone}`} className="hover:underline">
                                  {payment.member_phone}
                                </a>
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-semibold text-red-600">
                          {formatAmount(payment.amount)}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(payment.status)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {payment.plan_name || 'N/A'}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>
                            {payment.agent_first_name} {payment.agent_last_name}
                            {payment.agent_number && (
                              <div className="text-xs text-gray-400">{payment.agent_number}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setLocation(`/admin/enrollment/${payment.member_id}`)}
                              disabled={!payment.member_id}
                            >
                              View Member
                            </Button>
                          </div>
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
