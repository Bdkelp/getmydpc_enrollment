import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { hasAtLeastRole } from "@/lib/roles";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import EPXHostedPayment from "@/components/EPXHostedPayment";
import BankAccountForm from "@/components/BankAccountForm";
import { CreditCard, AlertTriangle, Shield, ExternalLink } from "lucide-react";

interface MemberLookupResponse {
  success: boolean;
  member?: {
    id: number;
    firstName?: string;
    lastName?: string;
    email: string;
    phone?: string;
    address?: string;
    address2?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    planId?: number;
    totalMonthlyPrice?: string | number | null;
  };
  subscription?: {
    id: number;
    planName?: string;
  } | null;
  error?: string;
}

const parseBooleanParam = (value: string | null): boolean => {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const formatCurrency = (amount: number): string => amount.toLocaleString(undefined, {
  style: "currency",
  currency: "USD",
});

export default function AdminPaymentCheckoutPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const isSuperAdmin = hasAtLeastRole(user?.role, "super_admin");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [hasLaunchedPayment, setHasLaunchedPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'ach'>('card'); // Default to card
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);

  const memberIdParam = searchParams.get("memberId");
  const amountParam = searchParams.get("amount");
  const descriptionParam = searchParams.get("description") || undefined;
  const transactionIdParam = searchParams.get("transactionId") || searchParams.get("orderId") || undefined;
  const autoLaunch = parseBooleanParam(searchParams.get("autoLaunch"));

  const memberId = memberIdParam ? Number(memberIdParam) : NaN;
  const amount = amountParam ? Number(amountParam) : NaN;

  const validationError = (() => {
    if (!memberIdParam) {
      return "Member ID missing from checkout link.";
    }
    if (!Number.isFinite(memberId)) {
      return "Member ID must be numeric.";
    }
    if (!amountParam) {
      return "Amount missing from checkout link.";
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return "Amount must be a positive number.";
    }
    return null;
  })();

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        setLocation("/login");
      } else if (!isSuperAdmin) {
        setLocation("/no-access");
      }
    }
  }, [isAuthenticated, isLoading, isSuperAdmin, setLocation]);

  const memberQuery = useQuery<MemberLookupResponse, Error>({
    queryKey: ["/api/admin/members", memberId],
    enabled: isAuthenticated && isSuperAdmin && Number.isFinite(memberId) && !validationError,
    queryFn: async () => {
      const response = await apiRequest(`/api/admin/members/${memberId}`);
      if (!response?.success || !response?.member) {
        throw new Error(response?.error || "Member lookup failed");
      }
      return response;
    },
    retry: false,
  });

  useEffect(() => {
    if (!hasLaunchedPayment && autoLaunch && memberQuery.data?.member) {
      setHasLaunchedPayment(true);
    }
  }, [autoLaunch, hasLaunchedPayment, memberQuery.data]);

  const handleLaunch = () => {
    if (!memberQuery.data?.member) {
      toast({
        title: "Member not loaded",
        description: "Wait for the member record before launching hosted checkout.",
        variant: "destructive",
      });
      return;
    }
    setHasLaunchedPayment(true);
  };

  const resetAndExit = () => {
    setHasLaunchedPayment(false);
    setLocation("/admin");
  };

  const member = memberQuery.data?.member;
  const subscription = memberQuery.data?.subscription;
  const memberDisplayName = member
    ? (member.firstName || member.lastName)
      ? `${member.firstName || ""} ${member.lastName || ""}`.trim()
      : `Member #${member.id}`
    : null;
  const customerName = member && memberDisplayName
    ? (memberDisplayName === `Member #${member.id}` ? member.email : memberDisplayName)
    : member?.email || "Member";

  if (isLoading || (isAuthenticated && isSuperAdmin && memberQuery.isLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isAuthenticated || !isSuperAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-medical-blue-600 uppercase tracking-wide">Admin Hosted Checkout</p>
            <h1 className="text-3xl font-bold text-gray-900 mt-1">Collect Payment for Member #{memberIdParam}</h1>
            <p className="text-gray-600 mt-1">
              This flow is isolated from registration and intended for one-off captures or troubleshooting existing memberships.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => setLocation("/admin")}>Back to Admin</Button>
          </div>
        </div>

        {validationError && (
          <Alert variant="destructive">
            <AlertTitle>Unable to load checkout</AlertTitle>
            <AlertDescription>{validationError}</AlertDescription>
          </Alert>
        )}

        {memberQuery.error && !validationError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Member lookup failed</AlertTitle>
            <AlertDescription>{memberQuery.error.message}</AlertDescription>
          </Alert>
        )}

        {!validationError && member && (
          <Card className="border border-cyan-100 shadow-sm">
            <CardContent className="p-6 space-y-6">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-cyan-600" />
                  <h2 className="text-xl font-semibold text-gray-900">Payment Summary</h2>
                </div>
                <p className="text-sm text-gray-600">
                  Confirm the details below before launching EPX Hosted Checkout. The payment component opens inline on this page.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-gray-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase text-gray-500">Member</p>
                  <p className="text-lg font-bold text-gray-900">
                    {memberDisplayName}
                  </p>
                  <p className="text-sm text-gray-600">{member?.email}</p>
                  {member?.phone && (
                    <p className="text-sm text-gray-600">{member.phone}</p>
                  )}
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase text-gray-500">Amount</p>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(amount)}</p>
                  <p className="text-sm text-gray-600">Will charge immediately via EPX Hosted Checkout.</p>
                  {transactionIdParam && (
                    <p className="text-xs text-gray-500 mt-2">Reference: {transactionIdParam}</p>
                  )}
                </div>
              </div>

              {descriptionParam && (
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
                  <p className="font-semibold">Reference Note</p>
                  <p>{descriptionParam}</p>
                </div>
              )}

              {subscription?.planName && (
                <div className="text-sm text-gray-600">
                  Active Plan: <span className="font-semibold text-gray-900">{subscription.planName}</span>
                </div>
              )}

              <Alert className="bg-slate-50 border-slate-200 text-slate-700">
                <Shield className="h-4 w-4" />
                <AlertTitle>Secure hosted checkout</AlertTitle>
                <AlertDescription>
                  EPX renders the card form; no card data touches MyPremierPlans. Use a private tab if you encounter pop-up blockers.
                </AlertDescription>
              </Alert>

              {/* Quiet ACH option - not prominently displayed */}
              {!hasLaunchedPayment && (
                <div className="text-center text-xs text-gray-500">
                  {paymentMethod === 'card' ? (
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('ach')}
                      className="underline hover:text-gray-700"
                    >
                      Member doesn't have a card? Use bank account
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('card')}
                      className="underline hover:text-gray-700"
                    >
                      Use credit/debit card instead
                    </button>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={handleLaunch} disabled={hasLaunchedPayment}>
                  {hasLaunchedPayment ? "Checkout Window Ready" : `Launch ${paymentMethod === 'card' ? 'Card' : 'ACH'} Checkout`}
                </Button>
                <Button variant="ghost" onClick={resetAndExit}>
                  Cancel
                </Button>
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" />
                  Keep this tab open until EPX confirms the payment.
                </p>
              </div>

              {hasLaunchedPayment && (
                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  {paymentMethod === 'ach' ? (
                    <BankAccountForm
                      amount={amount}
                      customerId={String(member.id)}
                      customerEmail={member.email}
                      customerName={customerName}
                      description={descriptionParam || `Manual admin checkout for member #${member.id}`}
                      redirectOnSuccess={false}
                      onSuccess={(transactionId, paidAmount) => {
                        toast({
                          title: "Payment complete",
                          description: transactionId
                            ? `Transaction ${transactionId} was accepted.`
                            : "ACH payment processed successfully.",
                        });
                        if (paidAmount) {
                          console.info("ACH payment amount", paidAmount);
                        }
                        setHasLaunchedPayment(false);
                      }}
                      onError={(message) => {
                        toast({
                          title: "ACH payment error",
                          description: message || "See console for additional details.",
                          variant: "destructive",
                        });
                      }}
                    />
                  ) : (
                    <EPXHostedPayment
                      amount={amount}
                      customerId={String(member.id)}
                      customerEmail={member.email}
                      customerName={customerName}
                      planId={member.planId ? String(member.planId) : undefined}
                      description={descriptionParam || `Manual admin checkout for member #${member.id}`}
                      billingAddress={{
                        streetAddress: member.address || undefined,
                        city: member.city || undefined,
                        state: member.state || undefined,
                        postalCode: member.zipCode || undefined,
                      }}
                      redirectOnSuccess={false}
                      onSuccess={(transactionId, paidAmount) => {
                        toast({
                          title: "Payment complete",
                          description: transactionId
                            ? `Transaction ${transactionId} was accepted.`
                            : "Hosted checkout finished successfully.",
                        });
                        if (paidAmount) {
                          console.info("Hosted checkout amount", paidAmount);
                        }
                        setHasLaunchedPayment(false);
                      }}
                      onError={(message) => {
                        toast({
                          title: "Hosted checkout error",
                          description: message || "See console for additional details.",
                          variant: "destructive",
                        });
                      
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
