import { Button } from "@/components/ui/button";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";

interface RecurringBillingDialogsProps {
  recurringWorkflowMutation: { isPending: boolean };
  confirmLiveRecurringOpen: boolean;
  setConfirmLiveRecurringOpen: (open: boolean) => void;
  executeLiveRecurringWorkflow: () => void;
  previewRecurringDialogOpen: boolean;
  setPreviewRecurringDialogOpen: (open: boolean) => void;
  previewDueCount: number;
  previewRows: any[];
  handleOpenLiveRecurringConfirmation: () => void;
  superAdminRestricted: boolean;
  liveRecurringOutcomeOpen: boolean;
  setLiveRecurringOutcomeOpen: (open: boolean) => void;
  liveBillingSummary: any;
  liveCommissionSummary: any;
  handleCopyLiveRecurringSummary: () => void;
}

export const RecurringBillingDialogs: React.FC<RecurringBillingDialogsProps> = ({
  recurringWorkflowMutation,
  confirmLiveRecurringOpen,
  setConfirmLiveRecurringOpen,
  executeLiveRecurringWorkflow,
  previewRecurringDialogOpen,
  setPreviewRecurringDialogOpen,
  previewDueCount,
  previewRows,
  handleOpenLiveRecurringConfirmation,
  superAdminRestricted,
  liveRecurringOutcomeOpen,
  setLiveRecurringOutcomeOpen,
  liveBillingSummary,
  liveCommissionSummary,
  handleCopyLiveRecurringSummary,
}) => {
  return (
    <>
      <AlertDialog
        open={confirmLiveRecurringOpen}
        onOpenChange={(open) => {
          if (!recurringWorkflowMutation.isPending) {
            setConfirmLiveRecurringOpen(open);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run Recurring Billing + Commission Update</AlertDialogTitle>
            <AlertDialogDescription>
              This will process all currently due recurring payments and then update commissions for successful
              payments only. Failed or skipped payments will not create commission entries. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={recurringWorkflowMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeLiveRecurringWorkflow}
              disabled={recurringWorkflowMutation.isPending}
            >
              {recurringWorkflowMutation.isPending ? "Running..." : "Run Recurring Billing + Commission Update"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={previewRecurringDialogOpen}
        onOpenChange={(open) => {
          if (!recurringWorkflowMutation.isPending) {
            setPreviewRecurringDialogOpen(open);
          }
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Due Memberships Preview</DialogTitle>
            <DialogDescription>
              {previewDueCount > 0
                ? `${previewDueCount} due memberships/accounts were found. Review this list, then run live billing to charge them.`
                : "No due memberships/accounts were found in preview."}
            </DialogDescription>
          </DialogHeader>

          {previewRows.length > 0 ? (
            <div className="max-h-[50vh] overflow-auto rounded border">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Member/Account</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">payerType</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Amount</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">next_billing_date</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Readiness</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {previewRows.map((row) => (
                    <tr key={`preview-popup-${row.subscriptionId}-${row.memberId}`}>
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
          ) : (
            <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-gray-700">
              Nothing is due right now, so running live billing would not process any charges.
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPreviewRecurringDialogOpen(false)}
              disabled={recurringWorkflowMutation.isPending}
            >
              Close
            </Button>
            <Button
              type="button"
              onClick={() => {
                setPreviewRecurringDialogOpen(false);
                handleOpenLiveRecurringConfirmation();
              }}
              disabled={recurringWorkflowMutation.isPending || superAdminRestricted || previewDueCount === 0}
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Run Recurring Billing + Commission Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={liveRecurringOutcomeOpen}
        onOpenChange={(open) => {
          if (!recurringWorkflowMutation.isPending) {
            setLiveRecurringOutcomeOpen(open);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Recurring Billing Run Completed</DialogTitle>
            <DialogDescription>Use this proof summary, then confirm rows in your DB view.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <div className="rounded border bg-slate-50 p-3">
              <p className="text-[11px] uppercase tracking-wide text-gray-500">Total due</p>
              <p className="text-lg font-semibold text-gray-900">{Number(liveBillingSummary?.totalDue || 0)}</p>
            </div>
            <div className="rounded border bg-slate-50 p-3">
              <p className="text-[11px] uppercase tracking-wide text-gray-500">Processed</p>
              <p className="text-lg font-semibold text-gray-900">{Number(liveBillingSummary?.processed || 0)}</p>
            </div>
            <div className="rounded border bg-slate-50 p-3">
              <p className="text-[11px] uppercase tracking-wide text-gray-500">Succeeded</p>
              <p className="text-lg font-semibold text-emerald-700">{Number(liveBillingSummary?.succeeded || 0)}</p>
            </div>
            <div className="rounded border bg-slate-50 p-3">
              <p className="text-[11px] uppercase tracking-wide text-gray-500">Failed</p>
              <p className="text-lg font-semibold text-red-700">{Number(liveBillingSummary?.failed || 0)}</p>
            </div>
            <div className="rounded border bg-slate-50 p-3">
              <p className="text-[11px] uppercase tracking-wide text-gray-500">Skipped</p>
              <p className="text-lg font-semibold text-amber-700">{Number(liveBillingSummary?.skipped || 0)}</p>
            </div>
          </div>

          <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-gray-700">
            Commission entries created: <span className="font-semibold">{Number(liveCommissionSummary?.totalCommissionEntriesCreated || 0)}</span>
            <p className="mt-1 text-xs text-gray-600">
              DB verification: check payment rows for succeeded/failed status and recurring billing log rows created
              in this run window.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCopyLiveRecurringSummary}>
              Copy run summary
            </Button>
            <Button type="button" onClick={() => setLiveRecurringOutcomeOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
