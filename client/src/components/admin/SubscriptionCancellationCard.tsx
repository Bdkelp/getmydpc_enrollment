import React from "react";
import { AlertTriangle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";

interface CancelSubscriptionForm {
  subscriptionId: string;
  transactionId: string;
  reason: string;
}

interface SubscriptionCancellationCardProps {
  cancelSubscriptionForm: CancelSubscriptionForm;
  cancelSubscriptionResult: any | null;
  cancelSubscriptionPending: boolean;
  superAdminRestricted: boolean;
  setCancelSubscriptionResult: (value: any) => void;
  resetCancelSubscriptionForm: () => void;
  handleCancelSubscriptionSubmit: (e: React.FormEvent) => void;
  handleCancelFieldChange: (
    field: keyof CancelSubscriptionForm
  ) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

export const SubscriptionCancellationCard: React.FC<SubscriptionCancellationCardProps> = ({
  cancelSubscriptionForm,
  cancelSubscriptionResult,
  cancelSubscriptionPending,
  superAdminRestricted,
  setCancelSubscriptionResult,
  resetCancelSubscriptionForm,
  handleCancelSubscriptionSubmit,
  handleCancelFieldChange,
}) => {
  return (
    <Card className="mb-8 border border-red-200 bg-white">
      <CardContent className="p-6 space-y-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Membership Cancellation</h2>
            <p className="text-sm text-gray-600">
              Cancel a recurring subscription directly from the admin dashboard. Hosted checkout remains available for new payments.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCancelSubscriptionResult(null)}
              disabled={!cancelSubscriptionResult}
            >
              Clear Result
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={resetCancelSubscriptionForm}
              disabled={cancelSubscriptionPending}
            >
              Reset Form
            </Button>
          </div>
        </div>

        <Alert variant="destructive" className="border-red-300 bg-red-50 text-red-900">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 mt-0.5" />
            <div>
              <AlertTitle>Heads up</AlertTitle>
              <AlertDescription>
                Canceling a subscription immediately halts future billing and notifies EPX. Confirm with the member before continuing.
                Pause functionality will be added next, but for now this action cannot be undone from the dashboard.
              </AlertDescription>
            </div>
          </div>
        </Alert>

        {superAdminRestricted && (
          <Alert variant="destructive" className="border-red-200 bg-red-50 text-red-900">
            <div className="flex gap-3">
              <Lock className="h-5 w-5 mt-0.5" />
              <div>
                <AlertTitle>Super admin access required</AlertTitle>
                <AlertDescription>Only super admins can cancel active subscriptions from this dashboard.</AlertDescription>
              </div>
            </div>
          </Alert>
        )}

        <form onSubmit={handleCancelSubscriptionSubmit}>
          <fieldset disabled={superAdminRestricted} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label htmlFor="cancel-subscription-id">Subscription ID</Label>
                <Input
                  id="cancel-subscription-id"
                  placeholder="Numeric subscription ID"
                  value={cancelSubscriptionForm.subscriptionId}
                  onChange={handleCancelFieldChange("subscriptionId")}
                />
              </div>
              <div>
                <Label htmlFor="cancel-transaction-id">Transaction ID</Label>
                <Input
                  id="cancel-transaction-id"
                  placeholder="Reference payment (optional)"
                  value={cancelSubscriptionForm.transactionId}
                  onChange={handleCancelFieldChange("transactionId")}
                />
              </div>
              <div>
                <Label htmlFor="cancel-reason">Reason</Label>
                <Textarea
                  id="cancel-reason"
                  placeholder="Visible in audit logs"
                  value={cancelSubscriptionForm.reason}
                  onChange={handleCancelFieldChange("reason")}
                  rows={3}
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-gray-600">
                Provide either a subscription ID or a transaction ID that contains subscription metadata. Cancellations are sent directly to EPX.
              </p>
              <Button type="submit" className="w-full md:w-auto" disabled={cancelSubscriptionPending}>
                {cancelSubscriptionPending ? "Submitting..." : "Submit Cancellation"}
              </Button>
            </div>
          </fieldset>
        </form>

        {cancelSubscriptionResult && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              Subscription ID:{" "}
              <span className="font-semibold">{cancelSubscriptionResult.subscriptionId || "N/A"}</span>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 mb-2">Request Snapshot</p>
              <pre className="bg-slate-900 text-slate-100 rounded-md p-3 text-xs overflow-x-auto">
                {JSON.stringify(cancelSubscriptionResult.request || {}, null, 2)}
              </pre>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 mb-2">Response Snapshot</p>
              <pre className="bg-slate-900 text-slate-100 rounded-md p-3 text-xs overflow-x-auto">
                {JSON.stringify(cancelSubscriptionResult.response || cancelSubscriptionResult || {}, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
