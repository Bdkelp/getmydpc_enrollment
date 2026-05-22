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

interface AdminConfirmationDialogsProps {
  manualConfirmPayload: { amount: number; tranType: string; memberId?: number } | null;
  setManualConfirmPayload: (value: any) => void;
  manualTransactionPending: boolean;
  getManualTranLabel: (tranType: string) => string;
  executeManualTransaction: () => void;
  cancelConfirmPayload: { subscriptionId?: number } | null;
  setCancelConfirmPayload: (value: any) => void;
  cancelSubscriptionPending: boolean;
  executeCancelSubscription: () => void;
  hostedConfirmPayload: {
    mode: "member" | "adhoc";
    amount: number;
    memberId?: number;
    customerEmail?: string;
    customerName?: string;
  } | null;
  setHostedConfirmPayload: (value: any) => void;
  finalizeHostedCheckoutLaunch: () => void;
}

export const AdminConfirmationDialogs: React.FC<AdminConfirmationDialogsProps> = ({
  manualConfirmPayload,
  setManualConfirmPayload,
  manualTransactionPending,
  getManualTranLabel,
  executeManualTransaction,
  cancelConfirmPayload,
  setCancelConfirmPayload,
  cancelSubscriptionPending,
  executeCancelSubscription,
  hostedConfirmPayload,
  setHostedConfirmPayload,
  finalizeHostedCheckoutLaunch,
}) => {
  return (
    <>
      <AlertDialog
        open={!!manualConfirmPayload}
        onOpenChange={(open) => {
          if (!open && !manualTransactionPending) {
            setManualConfirmPayload(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm manual EPX transaction</AlertDialogTitle>
            <AlertDialogDescription>
              You&apos;re about to send a {getManualTranLabel(manualConfirmPayload?.tranType || "")} request for{" "}
              <span className="font-semibold">$
                {manualConfirmPayload ? manualConfirmPayload.amount.toFixed(2) : "0.00"}
              </span>. {manualConfirmPayload?.memberId ? `on member #${manualConfirmPayload.memberId} ` : ""}
              This will post directly to EPX.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={manualTransactionPending}>Never mind</AlertDialogCancel>
            <AlertDialogAction onClick={executeManualTransaction} disabled={manualTransactionPending}>
              {manualTransactionPending ? "Sending..." : "Send to EPX"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!cancelConfirmPayload}
        onOpenChange={(open) => {
          if (!open && !cancelSubscriptionPending) {
            setCancelConfirmPayload(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm membership cancellation</AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately halt the member&apos;s EPX subscription
              {cancelConfirmPayload?.subscriptionId ? ` #${cancelConfirmPayload.subscriptionId}` : ""} and prevent
              future billing. Make sure the member understands this change.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelSubscriptionPending}>Keep Active</AlertDialogCancel>
            <AlertDialogAction onClick={executeCancelSubscription} disabled={cancelSubscriptionPending}>
              {cancelSubscriptionPending ? "Submitting..." : "Confirm Cancellation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!hostedConfirmPayload}
        onOpenChange={(open) => {
          if (!open) {
            setHostedConfirmPayload(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Launch hosted checkout?</AlertDialogTitle>
            <AlertDialogDescription>
              We&apos;ll open a secure EPX window to collect{" "}
              <span className="font-semibold">${hostedConfirmPayload?.amount?.toFixed(2) ?? "0.00"}</span>{" "}
              {hostedConfirmPayload?.mode === "adhoc"
                ? `from ad-hoc customer ${hostedConfirmPayload?.customerName || hostedConfirmPayload?.customerEmail || "(email required)"}.`
                : `from member #${hostedConfirmPayload?.memberId}.`}{" "}
              Continue only when you are ready to run this live hosted checkout.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction onClick={finalizeHostedCheckoutLaunch}>Open Hosted Checkout</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
