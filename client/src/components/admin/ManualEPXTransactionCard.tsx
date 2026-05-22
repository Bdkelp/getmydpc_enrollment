import React from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MANUAL_TRANSACTION_TYPES = [
  { value: "CCE1", label: "Initial Capture (CCE1)", description: "Purchase auth & capture" },
  { value: "CCE9", label: "Refund (CCE9)", description: "Return capture" },
] as const;

interface ManualTransactionForm {
  memberId: string;
  transactionId: string;
  authGuid: string;
  testCustomerEmail: string;
  testCustomerName: string;
  amount: string;
  description: string;
  tranType: string;
}

interface ManualEPXTransactionCardProps {
  manualTransactionForm: ManualTransactionForm;
  manualTransactionResult: any | null;
  manualTransactionPending: boolean;
  superAdminRestricted: boolean;
  isSuperAdmin: boolean;
  paymentEnvironmentBadgeClasses: string;
  paymentEnvironmentBadgeLabel: string;
  paymentEnvironmentLoading: boolean;
  paymentEnvironmentButtonTarget: string;
  paymentEnvironmentButtonLabel: string;
  updatePaymentEnvironmentPending: boolean;
  paymentEnvironmentUpdatedText: string | null;
  environmentAlertClasses: string;
  environmentAlertTitle: string;
  environmentAlertDescription: string;
  EnvironmentAlertIcon: React.ElementType;
  handlePaymentEnvironmentChange: (target: string) => void;
  setManualTransactionResult: (value: any) => void;
  resetManualTransactionForm: () => void;
  handleManualTransactionSubmit: (e: React.FormEvent) => void;
  handleManualFieldChange: (field: keyof ManualTransactionForm) => (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleManualTranTypeChange: (value: string) => void;
  handleHostedCheckoutRequest: () => void;
  handleAdHocHostedCheckoutRequest: () => void;
}

export const ManualEPXTransactionCard: React.FC<ManualEPXTransactionCardProps> = ({
  manualTransactionForm,
  manualTransactionResult,
  manualTransactionPending,
  superAdminRestricted,
  isSuperAdmin,
  paymentEnvironmentBadgeClasses,
  paymentEnvironmentBadgeLabel,
  paymentEnvironmentLoading,
  paymentEnvironmentButtonTarget,
  paymentEnvironmentButtonLabel,
  updatePaymentEnvironmentPending,
  paymentEnvironmentUpdatedText,
  environmentAlertClasses,
  environmentAlertTitle,
  environmentAlertDescription,
  EnvironmentAlertIcon,
  handlePaymentEnvironmentChange,
  setManualTransactionResult,
  resetManualTransactionForm,
  handleManualTransactionSubmit,
  handleManualFieldChange,
  handleManualTranTypeChange,
  handleHostedCheckoutRequest,
  handleAdHocHostedCheckoutRequest,
}) => {
  return (
    <Card className="mb-8 border border-navy-200 bg-white shadow-soft">
      <CardContent className="p-6 space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-navy-500">Manual EPX Transactions</h2>
            <p className="text-sm text-gray-600">
              Run SALE, refund, or void events directly from the admin dashboard without opening the certification toolkit.
            </p>
          </div>
          <div className="flex w-full flex-col items-start gap-3 md:w-auto md:items-end">
            <div className="flex flex-col items-start gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Payment Environment</span>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={`${paymentEnvironmentBadgeClasses} text-xs font-semibold uppercase tracking-wide`}>
                  {paymentEnvironmentBadgeLabel}
                </Badge>
                {isSuperAdmin && (
                  <Button
                    type="button"
                    size="sm"
                    variant={paymentEnvironmentButtonTarget === "production" ? "default" : "outline"}
                    onClick={() => handlePaymentEnvironmentChange(paymentEnvironmentButtonTarget)}
                    disabled={paymentEnvironmentLoading || updatePaymentEnvironmentPending}
                  >
                    {updatePaymentEnvironmentPending ? "Updating..." : paymentEnvironmentButtonLabel}
                  </Button>
                )}
              </div>
              {paymentEnvironmentUpdatedText && (
                <span className="text-xs text-gray-500">{paymentEnvironmentUpdatedText}</span>
              )}
            </div>
            <div className="flex w-full gap-2 md:w-auto">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setManualTransactionResult(null)}
                disabled={!manualTransactionResult}
              >
                Clear Result
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={resetManualTransactionForm}
                disabled={manualTransactionPending}
              >
                Reset Form
              </Button>
            </div>
          </div>
        </div>

        <Alert className={environmentAlertClasses}>
          <div className="flex gap-3">
            <EnvironmentAlertIcon className="h-5 w-5 mt-0.5" />
            <div>
              <AlertTitle>{environmentAlertTitle}</AlertTitle>
              <AlertDescription>{environmentAlertDescription}</AlertDescription>
            </div>
          </div>
        </Alert>

        {superAdminRestricted && (
          <Alert variant="destructive" className="border-red-200 bg-red-50 text-red-900">
            <div className="flex gap-3">
              <Lock className="h-5 w-5 mt-0.5" />
              <div>
                <AlertTitle>Super admin access required</AlertTitle>
                <AlertDescription>
                  Manual EPX commands stay read-only for admins. Ping a super admin when you need to run a charge, refund, or hosted checkout.
                </AlertDescription>
              </div>
            </div>
          </Alert>
        )}

        <form onSubmit={handleManualTransactionSubmit}>
          <fieldset disabled={superAdminRestricted} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label htmlFor="manual-member-id">Member ID</Label>
                <Input
                  id="manual-member-id"
                  placeholder="1234"
                  value={manualTransactionForm.memberId}
                  onChange={handleManualFieldChange("memberId")}
                />
              </div>
              <div>
                <Label htmlFor="manual-transaction-id">Transaction ID</Label>
                <Input
                  id="manual-transaction-id"
                  placeholder="Existing EPX transaction"
                  value={manualTransactionForm.transactionId}
                  onChange={handleManualFieldChange("transactionId")}
                />
              </div>
              <div>
                <Label htmlFor="manual-auth-guid">EPX AUTH GUID</Label>
                <Input
                  id="manual-auth-guid"
                  placeholder="Paste AUTH GUID"
                  value={manualTransactionForm.authGuid}
                  onChange={handleManualFieldChange("authGuid")}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label htmlFor="manual-amount">Amount (USD)</Label>
                <Input
                  id="manual-amount"
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={manualTransactionForm.amount}
                  onChange={handleManualFieldChange("amount")}
                  required
                  placeholder="100.00"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Required for sales and refunds. Enter the dollar amount you wish to charge or return.
                </p>
              </div>
              <div>
                <Label htmlFor="manual-tran-type">Transaction Type</Label>
                <Select value={manualTransactionForm.tranType} onValueChange={handleManualTranTypeChange}>
                  <SelectTrigger id="manual-tran-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {MANUAL_TRANSACTION_TYPES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex flex-col">
                          <span className="font-medium">{option.label}</span>
                          {option.description && (
                            <span className="text-xs text-muted-foreground">{option.description}</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="manual-description">Reference Note</Label>
                <Input
                  id="manual-description"
                  placeholder="Shown in EPX memo"
                  value={manualTransactionForm.description}
                  onChange={handleManualFieldChange("description")}
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-gray-600">
                For Run Transaction: provide at least one identifier (member ID, transaction ID, or AUTH GUID). For Launch Hosted Checkout: member ID is required.
              </p>
              <div className="flex flex-col gap-2 w-full md:w-auto md:flex-row">
                <Button type="submit" className="w-full md:w-auto" disabled={manualTransactionPending}>
                  {manualTransactionPending ? "Submitting..." : "Run Transaction"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full md:w-auto"
                  onClick={handleHostedCheckoutRequest}
                  disabled={manualTransactionPending}
                >
                  Launch Hosted Checkout
                </Button>
              </div>
            </div>
          </fieldset>
        </form>

        {isSuperAdmin && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-emerald-900">Ad-hoc Live Test Charge (Super Admin)</h3>
              <p className="text-xs text-emerald-800 mt-1">
                Use this only for controlled production verification not tied to enrollment. Transaction type must stay on CCE1 and amount comes from the same amount field above.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="manual-test-customer-email">Test Customer Email</Label>
                <Input
                  id="manual-test-customer-email"
                  type="email"
                  placeholder="billing-test@example.com"
                  value={manualTransactionForm.testCustomerEmail}
                  onChange={handleManualFieldChange("testCustomerEmail")}
                />
              </div>
              <div>
                <Label htmlFor="manual-test-customer-name">Test Customer Name (Optional)</Label>
                <Input
                  id="manual-test-customer-name"
                  placeholder="Live Verification"
                  value={manualTransactionForm.testCustomerName}
                  onChange={handleManualFieldChange("testCustomerName")}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                variant="default"
                onClick={handleAdHocHostedCheckoutRequest}
                disabled={manualTransactionPending}
              >
                Launch Ad-hoc Hosted Checkout
              </Button>
            </div>
          </div>
        )}

        {manualTransactionResult && (
          <div className="grid gap-4 md:grid-cols-2">
            {manualTransactionResult.transactionReference && (
              <div className="md:col-span-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                Transaction Reference:{" "}
                <span className="font-semibold">{manualTransactionResult.transactionReference}</span>
              </div>
            )}
            {manualTransactionResult.request && (
              <div>
                <p className="text-sm font-medium text-gray-900 mb-2">Request Snapshot</p>
                <pre className="bg-slate-900 text-slate-100 rounded-md p-3 text-xs overflow-x-auto">
                  {JSON.stringify(manualTransactionResult.request || {}, null, 2)}
                </pre>
              </div>
            )}
            {manualTransactionResult.response && (
              <div>
                <p className="text-sm font-medium text-gray-900 mb-2">Response Snapshot</p>
                <pre className="bg-slate-900 text-slate-100 rounded-md p-3 text-xs overflow-x-auto">
                  {JSON.stringify(manualTransactionResult.response || {}, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
