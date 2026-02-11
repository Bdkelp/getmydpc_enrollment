import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  ChevronLeft, 
  AlertCircle, 
  CreditCard, 
  RefreshCw, 
  User, 
  Mail, 
  Phone,
  DollarSign,
  Calendar
} from "lucide-react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

interface FailedPayment {
  id: number;
  transactionId: string;
  amount: number;
  status: string;
  paymentMethod: string;
  failureReason: string;
  createdAt: string;
  updatedAt: string;
  member: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    customerNumber: string;
    monthlyPrice: number;
  };
  plan: {
    name: string;
    monthlyPrice: number;
  };
  commission: {
    amount: number | null;
    status: string;
  };
  canRetry: boolean;
  metadata: any;
}

export default function AgentFailedPayments() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedPayment, setSelectedPayment] = useState<FailedPayment | null>(null);
  const [showRetryDialog, setShowRetryDialog] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  // Fetch failed payments
  const { data: response, isLoading, refetch } = useQuery<{
    success: boolean;
    payments: FailedPayment[];
    total: number;
  }>({
    queryKey: ["/api/agent/failed-payments"],
    queryFn: async () => {
      return await apiRequest("/api/agent/failed-payments");
    }
  });

  const payments = response?.payments || [];

  const handleRetryPayment = (payment: FailedPayment) => {
    setSelectedPayment(payment);
    setShowRetryDialog(true);
  };

  const executeRetry = async () => {
    if (!selectedPayment) return;

    setIsRetrying(true);
    try {
      // Navigate to admin payment checkout with retry parameters
      const params = new URLSearchParams({
        memberId: selectedPayment.member.id.toString(),
        amount: selectedPayment.amount.toString(),
        description: `Retry payment for ${selectedPayment.member.firstName} ${selectedPayment.member.lastName}`,
        retryPaymentId: selectedPayment.id.toString(),
        retryMemberId: selectedPayment.member.id.toString(),
        retryReason: "Agent-initiated retry after payment failure",
        autoLaunch: "true"
      });

      setLocation(`/admin/payment-checkout?${params.toString()}`);
    } catch (error: any) {
      toast({
        title: "Retry Failed",
        description: error.message || "Failed to initiate payment retry",
        variant: "destructive",
      });
      setIsRetrying(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      failed: { color: "bg-red-100 text-red-800", label: "Failed" },
      declined: { color: "bg-orange-100 text-orange-800", label: "Declined" },
      canceled: { color: "bg-gray-100 text-gray-800", label: "Canceled" },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.failed;
    return (
      <Badge className={`${config.color} border-0`}>
        {config.label}
      </Badge>
    );
  };

  const getMemberDisplayName = (member: FailedPayment['member']) => {
    return `${member.firstName} ${member.lastName}`.trim() || member.email;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/agent")}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Dashboard
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Failed Payments</h1>
            <p className="text-gray-600 mt-1">
              Manage and retry failed payment transactions for your members
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Card */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-red-100 rounded-lg">
                <AlertCircle className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Failed</p>
                <p className="text-2xl font-bold text-gray-900">{payments.length}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-orange-100 rounded-lg">
                <DollarSign className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Failed Amount</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${payments.reduce((sum, p) => sum + p.amount, 0).toFixed(2)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 rounded-lg">
                <CreditCard className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Can Retry</p>
                <p className="text-2xl font-bold text-gray-900">
                  {payments.filter(p => p.canRetry).length}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Empty State */}
      {payments.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-green-100 rounded-full">
                <CreditCard className="h-8 w-8 text-green-600" />
              </div>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              No Failed Payments
            </h3>
            <p className="text-gray-600">
              All payment transactions for your members have been successful
            </p>
          </CardContent>
        </Card>
      )}

      {/* Failed Payments List */}
      {payments.length > 0 && (
        <div className="space-y-4">
          {payments.map((payment) => (
            <Card key={payment.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-4">
                    {/* Member Info */}
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-gray-100 rounded-lg">
                        <User className="h-5 w-5 text-gray-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg text-gray-900">
                          {getMemberDisplayName(payment.member)}
                        </h3>
                        <p className="text-sm text-gray-600">
                          Customer #{payment.member.customerNumber}
                        </p>
                      </div>
                      {getStatusBadge(payment.status)}
                    </div>

                    {/* Payment Details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pl-14">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Amount</p>
                        <p className="font-semibold text-gray-900">
                          ${payment.amount.toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Plan</p>
                        <p className="font-semibold text-gray-900">
                          {payment.plan.name || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Failed On</p>
                        <p className="font-semibold text-gray-900">
                          {format(new Date(payment.createdAt), "MMM d, yyyy")}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Transaction ID</p>
                        <p className="font-mono text-xs text-gray-700">
                          {payment.transactionId}
                        </p>
                      </div>
                    </div>

                    {/* Failure Reason */}
                    <div className="pl-14">
                      <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-red-800 mb-1">
                            Failure Reason
                          </p>
                          <p className="text-sm text-red-700">
                            {payment.failureReason}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Contact Info */}
                    <div className="flex gap-6 pl-14 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        <span>{payment.member.email}</span>
                      </div>
                      {payment.member.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4" />
                          <span>{payment.member.phone}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="ml-4">
                    <Button
                      onClick={() => handleRetryPayment(payment)}
                      disabled={!payment.canRetry}
                      className="whitespace-nowrap"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Retry Payment
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Retry Confirmation Dialog */}
      <Dialog open={showRetryDialog} onOpenChange={setShowRetryDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retry Payment</DialogTitle>
            <DialogDescription>
              You're about to retry a failed payment for{" "}
              {selectedPayment && getMemberDisplayName(selectedPayment.member)}
            </DialogDescription>
          </DialogHeader>

          {selectedPayment && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-gray-50 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Member:</span>
                  <span className="font-semibold">
                    {getMemberDisplayName(selectedPayment.member)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Amount:</span>
                  <span className="font-semibold">
                    ${selectedPayment.amount.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Original Failure:</span>
                  <span className="text-sm text-red-600">
                    {selectedPayment.failureReason}
                  </span>
                </div>
              </div>

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> The member should have a valid payment method ready.
                  You'll be redirected to the payment checkout page to complete the transaction.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowRetryDialog(false);
                setSelectedPayment(null);
              }}
              disabled={isRetrying}
            >
              Cancel
            </Button>
            <Button
              onClick={executeRetry}
              disabled={isRetrying}
            >
              {isRetrying ? (
                <>
                  <LoadingSpinner className="mr-2" />
                  Processing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Proceed to Retry
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
