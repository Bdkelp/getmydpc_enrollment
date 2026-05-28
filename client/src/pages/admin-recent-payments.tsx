import { useState } from "react";
import AppShell from "@/components/AppShell";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { hasAtLeastRole } from "@/lib/roles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  CreditCard, 
  AlertCircle, 
  CheckCircle,
  Clock,
  RefreshCw,
  Download,
  FileEdit,
  CircleHelp
} from "lucide-react";

interface Payment {
  id: number;
  created_at: string;
  amount: number | string;
  status: string;
  failureReason?: string | null;
  declineCode?: string | null;
  rawStatusMessage?: string | null;
  transaction_id?: string;
  payment_method?: string;
  member_id?: number;
  member_first_name?: string;
  member_last_name?: string;
  member_email?: string;
  member_customer_number?: string;
  epx_auth_guid?: string;
  verification?: {
    processorConfirmed?: boolean;
    callbackApproved?: boolean;
    finalizationState?: string;
    commissionState?: string;
  };
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
  const { toast } = useToast();
  const isAdmin = hasAtLeastRole(user?.role, "admin");
  const isSuperAdmin = hasAtLeastRole(user?.role, "super_admin");
  
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [limit, setLimit] = useState(50);
  const [updatingPaymentId, setUpdatingPaymentId] = useState<number | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<'succeeded' | 'cancelled' | null>(null);
  const [refundingPaymentId, setRefundingPaymentId] = useState<number | null>(null);

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
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const filteredPayments = normalizedSearchTerm
    ? payments.filter((payment) => {
        const fullName = `${payment.member_first_name || ""} ${payment.member_last_name || ""}`.trim().toLowerCase();
        const email = (payment.member_email || "").toLowerCase();
        const customerNumber = String(payment.member_customer_number || "").toLowerCase();
        const transactionId = String(payment.transaction_id || "").toLowerCase();
        const memberId = payment.member_id ? String(payment.member_id) : "";

        return fullName.includes(normalizedSearchTerm)
          || email.includes(normalizedSearchTerm)
          || customerNumber.includes(normalizedSearchTerm)
          || transactionId.includes(normalizedSearchTerm)
          || memberId.includes(normalizedSearchTerm);
      })
    : payments;

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

  const getVerificationBadge = (payment: Payment) => {
    const finalizationState = payment.verification?.finalizationState || 'unknown';
    switch (finalizationState) {
      case 'finalized':
        return <Badge className="bg-emerald-100 text-emerald-800">Finalized</Badge>;
      case 'requires_review':
        return <Badge className="bg-amber-100 text-amber-800">Needs Review</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800">Failed</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-700">Unknown</Badge>;
    }
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

  const canResolveManually = (payment: Payment) => {
    const status = String(payment.status || '').toLowerCase();
    return ['pending', 'processing', 'failed', 'declined'].includes(status);
  };

  const canIssueRefund = (payment: Payment) => {
    const status = String(payment.status || '').toLowerCase();
    const hasReference = Boolean(payment.transaction_id || payment.epx_auth_guid);
    const amount = typeof payment.amount === 'string' ? parseFloat(payment.amount) : payment.amount;
    const hasAmount = Number.isFinite(amount) && amount > 0;
    return isSuperAdmin
      && hasReference
      && hasAmount
      && ['succeeded', 'success', 'completed'].includes(status);
  };

  const issueRefund = async (payment: Payment) => {
    if (!canIssueRefund(payment)) {
      toast({
        title: 'Refund unavailable',
        description: 'Refunds require a successful payment with transaction reference and amount.',
        variant: 'destructive',
      });
      return;
    }

    const amount = typeof payment.amount === 'string' ? parseFloat(payment.amount) : payment.amount;
    const reason = window.prompt(
      'Enter refund reason (required):',
      `Manual refund for payment ${payment.id}`
    );

    if (!reason || !reason.trim()) {
      toast({
        title: 'Refund reason required',
        description: 'Please provide an audit note before issuing a refund.',
        variant: 'destructive',
      });
      return;
    }

    const confirmed = window.confirm(
      `Issue a $${amount.toFixed(2)} refund for ${payment.member_first_name || ''} ${payment.member_last_name || ''}? This sends a live/sandbox CCE9 request based on active environment.`
    );
    if (!confirmed) return;

    try {
      setRefundingPaymentId(payment.id);
      await apiRequest('/api/admin/payments/manual-transaction', {
        method: 'POST',
        body: JSON.stringify({
          tranType: 'CCE9',
          amount,
          memberId: payment.member_id,
          transactionId: payment.transaction_id,
          authGuid: payment.epx_auth_guid,
          description: `Admin refund via payments page: ${reason.trim()}`,
        }),
      });

      toast({
        title: 'Refund request submitted',
        description: 'EPX refund request was sent successfully. Refresh to review status changes.',
      });
      await refetch();
    } catch (error: any) {
      toast({
        title: 'Refund failed',
        description: error?.message || 'Unable to issue refund.',
        variant: 'destructive',
      });
    } finally {
      setRefundingPaymentId(null);
    }
  };

  const updatePaymentStatus = async (payment: Payment, status: 'succeeded' | 'cancelled') => {
    const notePrompt = status === 'succeeded'
      ? 'Enter note for manual completion (required):'
      : 'Enter note for voided/cancelled update (required):';
    const note = window.prompt(notePrompt, status === 'succeeded'
      ? 'Processor confirmed successful capture. Manual completion by admin.'
      : 'Voided at processor. Marking cancelled by admin.');

    if (!note || !note.trim()) {
      toast({
        title: 'Note required',
        description: 'Please provide an audit note before changing payment status.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setUpdatingPaymentId(payment.id);
      setUpdatingStatus(status);

      await apiRequest(`/api/admin/payments/${payment.id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status, note: note.trim() }),
      });

      toast({
        title: 'Payment updated',
        description: `Payment ${payment.id} marked ${status}.`,
      });
      await refetch();
    } catch (error: any) {
      toast({
        title: 'Status update failed',
        description: error?.message || 'Failed to update payment status.',
        variant: 'destructive',
      });
    } finally {
      setUpdatingPaymentId(null);
      setUpdatingStatus(null);
    }
  };

  if (authLoading || statsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <AppShell
      title="Payment Tracking"
      breadcrumb={["Admin", "Payments"]}
      actions={
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Verification legend">
                <CircleHelp className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-sm" side="bottom" align="end">
              <div className="space-y-1">
                <p className="font-medium">Verification legend</p>
                <p>Finalized: processor confirmed and finalized.</p>
                <p>Needs Review: payment approved but requires manual review.</p>
                <p>Pending: processing still in progress.</p>
                <p>Failed: declined/canceled/failed outcome.</p>
                <p>Commission row shows current commission state.</p>
              </div>
            </TooltipContent>
          </Tooltip>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={exportPayments}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </>
      }
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-1 sm:px-2 md:px-0">

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
            ) : filteredPayments.length === 0 ? (
              <p className="text-center text-gray-500 py-12">No payment transactions found</p>
            ) : (
              <div className="overflow-x-auto">
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search member, email, transaction, or member ID (try Bell)"
                    className="md:max-w-md"
                  />
                  <p className="text-xs text-gray-500">
                    Showing {filteredPayments.length} of {payments.length} loaded payments
                  </p>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date/Time</TableHead>
                      <TableHead>Member</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Verification</TableHead>
                      <TableHead>Transaction ID</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPayments.map((payment) => (
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
                          <div className="space-y-1">
                            {getStatusBadge(payment.status)}
                            {(payment.failureReason || payment.declineCode) && (
                              <div className="text-[11px] text-gray-600">
                                {payment.failureReason || payment.rawStatusMessage || 'Payment declined'}
                                {payment.declineCode ? ` (code ${payment.declineCode})` : ''}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {getVerificationBadge(payment)}
                            <div className="text-[11px] text-gray-500">
                              Commission: {payment.verification?.commissionState || 'unknown'}
                            </div>
                          </div>
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
                        <TableCell>
                          <div className="flex flex-col gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="min-w-[118px] border-bright-teal-blue-200 text-deep-twilight-900 hover:bg-sky-aqua-50"
                              onClick={() => setLocation(`/admin/enrollment/${payment.member_id}`)}
                              disabled={!payment.member_id}
                            >
                              <FileEdit className="h-4 w-4 mr-1" />
                              View Member
                            </Button>
                            {canResolveManually(payment) && (
                              <div className="flex gap-2">
                                <Button
                                  variant="default"
                                  size="sm"
                                  className="h-8"
                                  onClick={() => updatePaymentStatus(payment, 'succeeded')}
                                  disabled={updatingPaymentId === payment.id}
                                >
                                  {updatingPaymentId === payment.id && updatingStatus === 'succeeded' ? 'Saving...' : 'Mark Completed'}
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="h-8"
                                  onClick={() => updatePaymentStatus(payment, 'cancelled')}
                                  disabled={updatingPaymentId === payment.id}
                                >
                                  {updatingPaymentId === payment.id && updatingStatus === 'cancelled' ? 'Saving...' : 'Mark Voided'}
                                </Button>
                              </div>
                            )}
                            <Button
                              variant="secondary"
                              size="sm"
                              className="min-w-[118px]"
                              onClick={() => issueRefund(payment)}
                              disabled={!canIssueRefund(payment) || refundingPaymentId === payment.id}
                              title={isSuperAdmin ? 'Issue CCE9 refund using this payment context' : 'Super admin access required for refunds'}
                            >
                              {refundingPaymentId === payment.id ? 'Refunding...' : 'Issue Refund'}
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
    </AppShell>
  );
}
