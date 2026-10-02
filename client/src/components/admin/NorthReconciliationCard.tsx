import { useState } from "react";
import { CheckCircle2, Landmark, Loader2, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Decision = "settled_external" | "waive_platform_gap";

type ReconciliationResponse = {
  success: boolean;
  error?: string;
  code?: string;
  details?: {
    nextBillingDate?: string;
    unresolvedCycles?: Array<{ cycleDate: string; recommendedAction: string }>;
    [key: string]: unknown;
  };
  outcome?: "reconciled" | "already_reconciled" | "preview";
  cycleDate?: string;
  previousNextBillingDate?: string | null;
  nextBillingDate?: string | null;
  amount?: string | null;
  amountMatchesSubscription?: boolean | null;
  holdReleased?: boolean;
  nextCycleEligibleForAutomaticBilling?: boolean | null;
  paymentId?: number | null;
  cycleId?: number | null;
  paymentConfirmation?: string;
  paymentConfirmationError?: string;
};

const RECOMMENDED_ACTION_LABELS: Record<string, string> = {
  waive_platform_gap: "Before August 2026: waive as a platform gap (collection needs explicit approval)",
  reconcile_or_waive_or_collect_one_cycle: "Reconcile if paid in North, waive, or collect this one cycle through Pay Now",
};

// Dedicated request so the server's JSON error (including the open earlier
// cycles) reaches the operator; apiRequest drops the body when a status text is present.
async function postReconciliation(body: Record<string, unknown>): Promise<ReconciliationResponse> {
  const { API_URL } = await import("@/lib/apiClient");
  const { supabase } = await import("@/lib/supabase");
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const response = await fetch(`${API_URL}/api/admin/billing-operations/reconcile-north-payment`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as ReconciliationResponse;
  return response.ok ? data : { ...data, success: false, error: data.error || `Request failed (${response.status})` };
}

const emptyForm = {
  memberId: "",
  subscriptionId: "",
  cycleMonth: "",
  decision: "settled_external" as Decision,
  paymentMethodType: "CreditCard" as "CreditCard" | "ACH",
  northPaymentDate: "",
  amount: "",
  externalReference: "",
  authorizationCode: "",
  northTranId: "",
  note: "",
};

export function NorthReconciliationCard({ onReconciled }: { onReconciled: () => void | Promise<void> }) {
  const [form, setForm] = useState(emptyForm);
  const [previewedKey, setPreviewedKey] = useState<string | null>(null);
  const [response, setResponse] = useState<ReconciliationResponse | null>(null);
  const [pending, setPending] = useState<"preview" | "apply" | null>(null);

  const settled = form.decision === "settled_external";
  const payload = {
    memberId: form.memberId.trim(),
    subscriptionId: form.subscriptionId.trim(),
    cycleMonth: form.cycleMonth,
    decision: form.decision,
    note: form.note,
    ...(settled
      ? {
          paymentMethodType: form.paymentMethodType,
          northPaymentDate: form.northPaymentDate,
          amount: form.amount.trim(),
          externalReference: form.externalReference,
          authorizationCode: form.authorizationCode,
          northTranId: form.northTranId,
        }
      : {}),
  };
  const payloadKey = JSON.stringify(payload);

  const update = (field: keyof typeof emptyForm) => (value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setPreviewedKey(null);
  };

  const submit = async (mode: "preview" | "apply") => {
    setPending(mode);
    try {
      const result = await postReconciliation({ ...payload, mode });
      setResponse(result);
      setPreviewedKey(mode === "preview" && result.success ? payloadKey : null);
      if (mode === "apply" && result.success) await onReconciled();
    } catch (error: any) {
      setResponse({ success: false, error: error?.message || "Request failed" });
    } finally {
      setPending(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Landmark className="h-5 w-5" /> Reconcile North payment
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600">
          Records one billing month as paid through North, or waives a platform-caused gap. No charge is submitted and member status,
          billing mode, and payment credentials are not changed. Months are reconciled in order from the subscription's next billing date,
          so an open earlier month is never skipped.
        </p>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="recon-member">Member ID</Label>
            <Input id="recon-member" inputMode="numeric" value={form.memberId} onChange={(e) => update("memberId")(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recon-subscription">Subscription ID</Label>
            <Input id="recon-subscription" inputMode="numeric" value={form.subscriptionId} onChange={(e) => update("subscriptionId")(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recon-month">Billing month</Label>
            <Input id="recon-month" type="month" value={form.cycleMonth} onChange={(e) => update("cycleMonth")(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Decision</Label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button type="button" variant={settled ? "default" : "outline"} aria-pressed={settled} onClick={() => update("decision")("settled_external")}>
              Paid through North
            </Button>
            <Button type="button" variant={!settled ? "default" : "outline"} aria-pressed={!settled} onClick={() => update("decision")("waive_platform_gap")}>
              Waive platform gap
            </Button>
          </div>
        </div>

        {settled && (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Payment method</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" size="sm" variant={form.paymentMethodType === "CreditCard" ? "default" : "outline"} onClick={() => update("paymentMethodType")("CreditCard")}>
                  Card
                </Button>
                <Button type="button" size="sm" variant={form.paymentMethodType === "ACH" ? "default" : "outline"} onClick={() => update("paymentMethodType")("ACH")}>
                  ACH
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="recon-date">North payment date</Label>
              <Input id="recon-date" type="date" value={form.northPaymentDate} onChange={(e) => update("northPaymentDate")(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recon-amount">Amount</Label>
              <Input id="recon-amount" inputMode="decimal" placeholder="0.00" value={form.amount} onChange={(e) => update("amount")(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recon-reference">External reference (invoice / order)</Label>
              <Input id="recon-reference" autoComplete="off" value={form.externalReference} onChange={(e) => update("externalReference")(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recon-auth">Authorization code (optional)</Label>
              <Input id="recon-auth" autoComplete="off" value={form.authorizationCode} onChange={(e) => update("authorizationCode")(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recon-tran">North Tran ID / BRIC (optional)</Label>
              <Input id="recon-tran" autoComplete="off" spellCheck={false} className="font-mono" value={form.northTranId} onChange={(e) => update("northTranId")(e.target.value)} />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="recon-note">{settled ? "Note (optional)" : "Reason for waiving (required)"}</Label>
          <Input id="recon-note" value={form.note} onChange={(e) => update("note")(e.target.value)} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => submit("preview")} disabled={pending !== null}>
            {pending === "preview" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Preview
          </Button>
          <Button type="button" onClick={() => submit("apply")} disabled={pending !== null || previewedKey !== payloadKey}>
            {pending === "apply" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Record reconciliation
          </Button>
        </div>
        {previewedKey !== payloadKey && <p className="text-xs text-gray-500">Preview the exact inputs before recording.</p>}

        {response && !response.success && (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription className="space-y-2">
              <p>{response.error}</p>
              {response.details?.unresolvedCycles && response.details.unresolvedCycles.length > 0 && (
                <ul className="list-disc pl-5 text-sm">
                  {response.details.unresolvedCycles.map((cycle) => (
                    <li key={cycle.cycleDate}>
                      <span className="font-medium">{cycle.cycleDate}</span>: {RECOMMENDED_ACTION_LABELS[cycle.recommendedAction] || cycle.recommendedAction}
                    </li>
                  ))}
                </ul>
              )}
            </AlertDescription>
          </Alert>
        )}

        {response?.success && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription className="space-y-1 text-sm">
              <p className="font-medium">
                {response.outcome === "preview"
                  ? "Preview: nothing has been recorded yet."
                  : response.outcome === "already_reconciled"
                    ? "This month was already reconciled. Nothing new was recorded."
                    : "Reconciliation recorded. No charge was submitted."}
              </p>
              <p>Cycle: {response.cycleDate}</p>
              <p>
                Next billing date: {response.previousNextBillingDate || "—"} → {response.nextBillingDate || "—"}
              </p>
              {response.amount && <p>Amount: ${response.amount}</p>}
              {response.amountMatchesSubscription === false && (
                <p className="text-amber-700">Amount differs from the subscription's monthly amount.</p>
              )}
              {response.holdReleased && <p>The historical-cycle hold is released; the next cycle is eligible for normal billing.</p>}
              {response.nextCycleEligibleForAutomaticBilling === false && (
                <p>The subscription is still held: earlier months remain to be reconciled.</p>
              )}
              {response.paymentConfirmation === "deferred_member_not_active" && (
                <p>Commission processing is deferred because the member is not active; member status was not changed.</p>
              )}
              {response.paymentConfirmation === "failed" && (
                <p className="text-red-700">Commission processing failed ({response.paymentConfirmationError}). Recording the same month again retries it safely.</p>
              )}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
