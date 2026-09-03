import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Landmark, Loader2, Plus, RefreshCw, Star, Trash2 } from "lucide-react";
import EPXHostedPayment from "@/components/EPXHostedPayment";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiClient } from "@/lib/apiClient";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type PaymentMethodAction = "add" | "replace" | "pay_now";

interface PaymentMethod {
  id: number;
  payment_method_type: string;
  bric_reference?: string | null;
  auth_guid?: string | null;
  card_type?: string | null;
  card_last_four?: string | null;
  expiry_month?: string | null;
  expiry_year?: string | null;
  bank_account_last_four?: string | null;
  bank_account_type?: string | null;
  is_active: boolean;
  is_primary: boolean;
  created_at: string;
  last_used_at?: string | null;
}

interface PaymentMethodsPanelProps {
  memberId: number;
  memberName?: string;
  memberEmail?: string;
  monthlyAmount?: number;
  billingAddress?: {
    streetAddress?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
  compact?: boolean;
}

export function PaymentMethodsPanel({
  memberId,
  memberName,
  memberEmail,
  monthlyAmount,
  billingAddress,
  compact = false,
}: PaymentMethodsPanelProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [checkoutAction, setCheckoutAction] = useState<PaymentMethodAction | null>(null);
  const [checkoutMethodType, setCheckoutMethodType] = useState<"CreditCard" | "ACH" | null>(null);
  const [replaceTokenId, setReplaceTokenId] = useState<number | null>(null);
  const [removeMethod, setRemoveMethod] = useState<PaymentMethod | null>(null);
  const queryKey = ["member-payment-methods", memberId];

  const { data, isLoading, error } = useQuery<{
    success: boolean;
    paymentMethods: PaymentMethod[];
    member?: {
      name: string;
      email: string;
      monthlyAmount: number;
      billingAddress?: PaymentMethodsPanelProps["billingAddress"];
    } | null;
  }>({
    queryKey,
    queryFn: () => apiClient.get(`/api/members/${memberId}/payment-methods`),
    enabled: Number.isInteger(memberId) && memberId > 0,
  });
  const methods = data?.paymentMethods || [];
  const effectiveMemberName = data?.member?.name || memberName || `Member ${memberId}`;
  const effectiveMemberEmail = data?.member?.email || memberEmail || "";
  const effectiveMonthlyAmount = Number(data?.member?.monthlyAmount ?? monthlyAmount ?? 0);
  const effectiveBillingAddress = data?.member?.billingAddress || billingAddress;

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey });
  };

  const makeDefault = useMutation({
    mutationFn: (paymentTokenId: number) =>
      apiRequest(`/api/members/${memberId}/payment-methods/${paymentTokenId}/default`, {
        method: "PATCH",
      }),
    onSuccess: async () => {
      await refresh();
      toast({ title: "Default payment method updated" });
    },
    onError: (mutationError: Error) =>
      toast({ title: "Unable to update payment method", description: mutationError.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (method: PaymentMethod) =>
      apiRequest(`/api/members/${memberId}/payment-methods/${method.id}`, {
        method: "DELETE",
        body: JSON.stringify({ switchToManualBilling: method.is_primary }),
      }),
    onSuccess: async () => {
      setRemoveMethod(null);
      await refresh();
      toast({ title: "Payment method removed" });
    },
    onError: (mutationError: Error) =>
      toast({ title: "Unable to remove payment method", description: mutationError.message, variant: "destructive" }),
  });

  const openCheckout = (action: PaymentMethodAction, tokenId?: number) => {
    setReplaceTokenId(tokenId || null);
    setCheckoutMethodType(null);
    setCheckoutAction(action);
  };

  const formatDate = (value?: string | null) =>
    value
      ? new Intl.DateTimeFormat("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        }).format(new Date(value))
      : "Never";

  const closeCheckout = async () => {
    setCheckoutAction(null);
    setCheckoutMethodType(null);
    setReplaceTokenId(null);
    await refresh();
  };

  const content = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-950">Saved payment methods</h3>
          <p className="text-sm text-gray-600">Only the default active method is used for recurring billing.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => openCheckout("add")}>
            <Plus className="mr-2 h-4 w-4" /> Add
          </Button>
          <Button type="button" size="sm" onClick={() => openCheckout("pay_now")} disabled={effectiveMonthlyAmount <= 0}>
            <CreditCard className="mr-2 h-4 w-4" /> Pay Now & Use for Recurring
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading payment methods...
        </div>
      ) : error ? (
        <Alert variant="destructive"><AlertDescription>{(error as Error).message}</AlertDescription></Alert>
      ) : methods.length === 0 ? (
        <div className="border-y py-6 text-sm text-gray-600">No payment method is saved.</div>
      ) : (
        <div className="divide-y border-y">
          {methods.map((method) => (
            <div key={method.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center border bg-gray-50">
                  {method.payment_method_type === "ACH" ? <Landmark className="h-4 w-4 text-gray-700" /> : <CreditCard className="h-4 w-4 text-gray-700" />}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-950">
                      {method.payment_method_type === "ACH"
                        ? `${method.bank_account_type || "Bank account"} ending ${method.bank_account_last_four || "unknown"}`
                        : `${method.card_type || method.payment_method_type} ending ${method.card_last_four || "unknown"}`}
                    </span>
                    {method.is_primary && <Badge variant="secondary">Default</Badge>}
                  </div>
                  {(method.expiry_month || method.expiry_year) && (
                    <p className="text-sm text-gray-600">Expires {method.expiry_month || "--"}/{method.expiry_year || "--"}</p>
                  )}
                  <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs text-gray-600 sm:grid-cols-2">
                    <div><dt className="inline font-medium text-gray-800">Status:</dt> <dd className="inline">{method.is_active ? "Active" : "Removed"}</dd></div>
                    <div><dt className="inline font-medium text-gray-800">Created:</dt> <dd className="inline">{formatDate(method.created_at)}</dd></div>
                    <div><dt className="inline font-medium text-gray-800">Last used:</dt> <dd className="inline">{formatDate(method.last_used_at)}</dd></div>
                    <div className="min-w-0"><dt className="inline font-medium text-gray-800">BRIC:</dt> <dd className="inline break-all font-mono">{method.bric_reference || "Unavailable"}</dd></div>
                    <div className="min-w-0 sm:col-span-2"><dt className="inline font-medium text-gray-800">Auth GUID:</dt> <dd className="inline break-all font-mono">{method.auth_guid || "Unavailable"}</dd></div>
                  </dl>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                {method.is_active && !method.is_primary && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => makeDefault.mutate(method.id)} disabled={makeDefault.isPending}>
                    <Star className="mr-2 h-4 w-4" /> Make Default
                  </Button>
                )}
                {method.is_active && (
                  <>
                    <Button type="button" variant="outline" size="sm" onClick={() => openCheckout("replace", method.id)}>
                      <RefreshCw className="mr-2 h-4 w-4" /> Replace
                    </Button>
                    <Button type="button" variant="ghost" size="icon" aria-label="Remove payment method" title="Remove payment method" onClick={() => setRemoveMethod(method)}>
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={checkoutAction !== null} onOpenChange={(open) => {
        if (!open) {
          setCheckoutAction(null);
          setCheckoutMethodType(null);
        }
      }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {checkoutAction === "pay_now" ? "Pay Now & Use for Recurring Billing" : checkoutAction === "replace" ? "Replace Payment Method" : "Add Payment Method"}
            </DialogTitle>
          </DialogHeader>
          {checkoutAction && !checkoutMethodType && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Choose the payment method to use.</p>
              <div className="grid grid-cols-2 gap-3">
                <Button type="button" variant="outline" className="h-20 flex-col gap-2" onClick={() => setCheckoutMethodType("CreditCard")}>
                  <CreditCard className="h-5 w-5" /> Card
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-20 flex-col gap-2"
                  onClick={() => setCheckoutMethodType("ACH")}
                  disabled={checkoutAction !== "pay_now"}
                >
                  <Landmark className="h-5 w-5" /> Bank Account
                </Button>
              </div>
              {checkoutAction !== "pay_now" && (
                <Alert>
                  <AlertDescription>
                    Zero-dollar ACH Add/Replace is not yet verified for this EPX profile. Use Pay Now &amp; Use for Recurring to authorize and save a bank account with a real payment. Your existing payment method and billing mode will remain unchanged.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
          {checkoutAction && checkoutMethodType && (
            <EPXHostedPayment
              key={`${checkoutAction}-${checkoutMethodType}-${replaceTokenId || "new"}`}
              amount={checkoutAction === "pay_now" ? effectiveMonthlyAmount : 0}
              customerId={String(memberId)}
              customerEmail={effectiveMemberEmail}
              customerName={effectiveMemberName}
              description={`Payment method ${checkoutAction}`}
              paymentMethodType={checkoutMethodType}
              billingAddress={effectiveBillingAddress}
              paymentMethodAction={checkoutAction}
              replaceTokenId={replaceTokenId}
              redirectOnSuccess={false}
              onSuccess={closeCheckout}
              onProcessing={closeCheckout}
              onError={(message) => toast({ title: "EPX checkout error", description: message, variant: "destructive" })}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={removeMethod !== null} onOpenChange={(open) => !open && setRemoveMethod(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this payment method?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeMethod?.is_primary
                ? "This is the recurring billing default. Removing it will switch the active subscription to manual external billing until another method is made default."
                : "This method will no longer be available for payments or recurring billing."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => removeMethod && remove.mutate(removeMethod)} disabled={remove.isPending}>
              {removeMethod?.is_primary ? "Switch to Manual & Remove" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (compact) return <div className="space-y-5">{content}</div>;

  return (
    <Card>
      <CardHeader><CardTitle>Payment Methods</CardTitle></CardHeader>
      <CardContent className="space-y-5">{content}</CardContent>
    </Card>
  );
}
