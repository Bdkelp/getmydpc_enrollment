import React from "react";
import { format } from "date-fns";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";

interface RecurringDuePreviewRow {
  subscriptionId: number;
  memberId: number;
  memberOrAccountName: string;
  payerType: string;
  amount: number | string;
  nextBillingDate: string | null;
  readinessState: string;
}

interface RecurringWorkflowResponse {
  success: boolean;
  mode: "preview" | "live";
  duePreview?: {
    dueCount: number;
    rows: RecurringDuePreviewRow[];
    estimatedCommissionImpact: {
      potentialSuccessfulPayments: number;
      estimatedCommissionEntries: number;
      note: string;
    };
    note: string;
  };
  billingSummary?: {
    totalDue: number;
    processed: number;
    succeeded: number;
    failed: number;
    skipped: number;
  };
  commissionSummary?: {
    successfulPaymentsThatCreatedCommissionEntries: number;
    totalCommissionEntriesCreated: number;
    payoutBatchesAffectedGenerated: Array<{
      id: string;
      batchName: string;
      totalRecords: number;
      totalAmount: number;
    }>;
    membersOrAccountsWithNoCommissionBecausePaymentFailedSkipped: Array<{
      memberId: number;
      memberOrAccountName: string;
      payerType: "member" | "group";
      reason: string;
    }>;
  };
}

interface RecurringBillingControlPanelProps {
  recurringWorkflowResult: RecurringWorkflowResponse | null;
  recurringWorkflowPending: boolean;
  superAdminRestricted: boolean;
  handlePreviewRecurringBilling: () => void;
  handleOpenLiveRecurringConfirmation: () => void;
}

export const RecurringBillingControlPanel: React.FC<RecurringBillingControlPanelProps> = ({
  recurringWorkflowResult,
  recurringWorkflowPending,
  superAdminRestricted,
  handlePreviewRecurringBilling,
  handleOpenLiveRecurringConfirmation,
}) => {
  return (
    <Card className="mb-8 border border-indigo-200 bg-white shadow-soft">
      <CardContent className="p-6 space-y-6">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-900">Recurring Billing Control Panel</h2>
          <p className="text-sm text-gray-600">
            Use this operator-safe flow to preview due recurring billing, run live billing, and then update commissions in the correct order.
          </p>
        </div>

        <Alert className="border-indigo-200 bg-indigo-50 text-indigo-900">
          <div className="flex gap-3">
            <Shield className="h-5 w-5 mt-0.5" />
            <div>
              <AlertTitle>Safety note</AlertTitle>
              <AlertDescription>
                The system selects all currently due records automatically. Members/accounts cannot be manually chosen for billing from this screen.
              </AlertDescription>
            </div>
          </div>
        </Alert>

        <div className="flex flex-col gap-3 md:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={handlePreviewRecurringBilling}
            disabled={recurringWorkflowPending}
          >
            {recurringWorkflowPending ? "Running preview..." : "Preview Recurring Billing"}
          </Button>

          <Button
            type="button"
            onClick={handleOpenLiveRecurringConfirmation}
            disabled={recurringWorkflowPending || superAdminRestricted}
            className="bg-indigo-600 text-white hover:bg-indigo-700"
          >
            {recurringWorkflowPending ? "Running live workflow..." : "Run Recurring Billing + Commission Update"}
          </Button>
        </div>

        {recurringWorkflowResult?.mode === "preview" && (
          <div className="space-y-4 rounded-lg border border-slate-200 p-4">
            <h3 className="text-base font-semibold text-gray-900">Preview Results</h3>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded border bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-gray-500">Due member/account count</p>
                <p className="text-xl font-semibold text-gray-900">{recurringWorkflowResult.duePreview?.dueCount || 0}</p>
              </div>
              <div className="rounded border bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-gray-500">Potential successful payments</p>
                <p className="text-xl font-semibold text-gray-900">
                  {recurringWorkflowResult.duePreview?.estimatedCommissionImpact?.potentialSuccessfulPayments || 0}
                </p>
              </div>
              <div className="rounded border bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-gray-500">Estimated commission entries</p>
                <p className="text-xl font-semibold text-gray-900">
                  {recurringWorkflowResult.duePreview?.estimatedCommissionImpact?.estimatedCommissionEntries || 0}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Member/Account</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">payerType</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Amount</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">next_billing_date</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Readiness State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {(recurringWorkflowResult.duePreview?.rows || []).map((row) => (
                    <tr key={`preview-${row.subscriptionId}-${row.memberId}`}>
                      <td className="px-3 py-2 text-gray-900">{row.memberOrAccountName}</td>
                      <td className="px-3 py-2 text-gray-700">{row.payerType}</td>
                      <td className="px-3 py-2 text-gray-700">${Number(row.amount || 0).toFixed(2)}</td>
                      <td className="px-3 py-2 text-gray-700">
                        {row.nextBillingDate ? format(new Date(row.nextBillingDate), "yyyy-MM-dd HH:mm") : "N/A"}
                      </td>
                      <td className="px-3 py-2 text-gray-700">{row.readinessState}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Alert className="border-sky-200 bg-sky-50 text-sky-900">
              <AlertDescription>Preview only. No payments or commissions have been created.</AlertDescription>
            </Alert>
          </div>
        )}

        {recurringWorkflowResult?.mode === "live" && (
          <div className="space-y-4 rounded-lg border border-emerald-200 p-4">
            <h3 className="text-base font-semibold text-gray-900">Live Run Results</h3>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-600">Billing summary</h4>
              <div className="grid gap-3 md:grid-cols-5">
                <div className="rounded border bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Total due</p>
                  <p className="text-xl font-semibold text-gray-900">{recurringWorkflowResult.billingSummary?.totalDue || 0}</p>
                </div>
                <div className="rounded border bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Processed</p>
                  <p className="text-xl font-semibold text-gray-900">{recurringWorkflowResult.billingSummary?.processed || 0}</p>
                </div>
                <div className="rounded border bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Succeeded</p>
                  <p className="text-xl font-semibold text-emerald-700">{recurringWorkflowResult.billingSummary?.succeeded || 0}</p>
                </div>
                <div className="rounded border bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Failed</p>
                  <p className="text-xl font-semibold text-red-700">{recurringWorkflowResult.billingSummary?.failed || 0}</p>
                </div>
                <div className="rounded border bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Skipped</p>
                  <p className="text-xl font-semibold text-amber-700">{recurringWorkflowResult.billingSummary?.skipped || 0}</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-600">Commission summary</h4>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded border bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">
                    Successful payments that created commission entries
                  </p>
                  <p className="text-xl font-semibold text-gray-900">
                    {recurringWorkflowResult.commissionSummary?.successfulPaymentsThatCreatedCommissionEntries || 0}
                  </p>
                </div>
                <div className="rounded border bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Total commission entries created</p>
                  <p className="text-xl font-semibold text-gray-900">
                    {recurringWorkflowResult.commissionSummary?.totalCommissionEntriesCreated || 0}
                  </p>
                </div>
              </div>

              <div className="rounded border bg-white p-3">
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Payout batches affected/generated</p>
                {(recurringWorkflowResult.commissionSummary?.payoutBatchesAffectedGenerated || []).length > 0 ? (
                  <ul className="space-y-1 text-sm text-gray-700">
                    {(recurringWorkflowResult.commissionSummary?.payoutBatchesAffectedGenerated || []).map((batch) => (
                      <li key={batch.id}>
                        {batch.batchName} · records: {batch.totalRecords} · total: ${Number(batch.totalAmount || 0).toFixed(2)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-600">No payout batches generated in this run.</p>
                )}
              </div>

              <div className="rounded border bg-white p-3">
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">
                  Members/accounts with no commission because payment failed/skipped
                </p>
                {(
                  recurringWorkflowResult.commissionSummary?.membersOrAccountsWithNoCommissionBecausePaymentFailedSkipped || []
                ).length > 0 ? (
                  <ul className="space-y-1 text-sm text-gray-700">
                    {(
                      recurringWorkflowResult.commissionSummary?.membersOrAccountsWithNoCommissionBecausePaymentFailedSkipped || []
                    ).map((item, idx) => (
                      <li key={`${item.memberId}-${idx}`}>
                        {item.memberOrAccountName} ({item.payerType}) · {item.reason}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-600">None.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
