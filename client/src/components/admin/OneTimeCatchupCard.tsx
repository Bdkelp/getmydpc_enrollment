import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Preview = {
  success: boolean; error?: string; memberName?: string; subscriptionId?: number;
  amount?: string; cycleMonth?: string; nextBillingDate?: string;
  credentialAvailable?: boolean; alreadyCovered?: boolean; candidateEligible?: boolean;
  message?: string;
};
export function OneTimeCatchupCard() {
  const [memberId, setMemberId] = useState("");
  const [cycleMonth, setCycleMonth] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [charging, setCharging] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const runPreview = async () => {
    setBusy(true);
    setPreview(null);
    try {
      const { API_URL } = await import("@/lib/apiClient");
      const { supabase } = await import("@/lib/supabase");
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${API_URL}/api/admin/billing-operations/one-time-catchup/preview`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ memberId: Number(memberId), cycleMonth }),
      });
      const body = (await response.json()) as Preview;
      setPreview(response.ok ? body : { ...body, success: false });
    } catch (error: any) {
      setPreview({ success: false, error: error?.message || "Preview unavailable" });
    } finally { setBusy(false); }
  };

  const charge = async () => {
    if (!preview?.candidateEligible || !window.confirm(
      "Charge " + preview.memberName + " $" + preview.amount + " once for " + preview.cycleMonth + "? The recurring date will not change."
    )) return;
    setCharging(true); setResult(null);
    try {
      const { API_URL } = await import("@/lib/apiClient");
      const { supabase } = await import("@/lib/supabase");
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(API_URL + "/api/admin/billing-operations/one-time-catchup/charge", {
        method:"POST",credentials:"include",
        headers:{"Content-Type":"application/json",
          ...(session?.access_token ? { Authorization:"Bearer " + session.access_token } : {})},
        body:JSON.stringify({memberId:Number(memberId),cycleMonth,confirmation:"CHARGE ONE PAYMENT"})
      });
      const data = await response.json();
      setResult(data.success ? "Approved: payment #" + data.paymentId + ". The recurring billing date was not changed."
        : (data.message || data.error || "Payment not completed. Review North before retrying."));
      setPreview(null);
    } catch {
      setResult("Outcome not confirmed. Check North and Billing Ops before attempting again.");
      setPreview(null);
    } finally { setCharging(false); }
  };
  return <Card>
    <CardHeader><CardTitle>One-time catch-up (keep billing date)</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-gray-600">Super Admin recovery tool. Preview an unpaid billing month using a stored North/EPX credential. This preview never charges the member or changes recurring billing dates.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="catchup-member">Member ID</Label>
          <Input id="catchup-member" inputMode="numeric" value={memberId} onChange={e => { setMemberId(e.target.value); setPreview(null); }} /></div>
        <div className="space-y-2"><Label htmlFor="catchup-month">Billing month</Label>
          <Input id="catchup-month" type="month" value={cycleMonth} onChange={e => { setCycleMonth(e.target.value); setPreview(null); }} /></div>
      </div>
      <Button type="button" disabled={busy || !memberId || !cycleMonth} onClick={runPreview}>{busy ? "Checking…" : "Preview catch-up"}</Button>
      {preview && <div role="status" className="rounded border p-3 text-sm space-y-1">
        {preview.success ? <>
          <p><strong>Member:</strong> {preview.memberName} (subscription {preview.subscriptionId})</p>
          <p><strong>Target:</strong> {preview.cycleMonth}, ${preview.amount}</p>
          <p><strong>Current next billing date:</strong> {preview.nextBillingDate ? String(preview.nextBillingDate).slice(0, 10) : "Unknown"} (unchanged)</p>
          <p><strong>Stored credential:</strong> {preview.credentialAvailable ? "Available" : "Unavailable"}</p>
          <p><strong>Recorded month:</strong> {preview.alreadyCovered ? "Payment or protected cycle already exists" : "No matching settled cycle identified"}</p>
          <p className="font-medium">{preview.candidateEligible ? "Preflight passed; Operator may submit one charge if the server-side collection feature is enabled." : "Preflight needs review before charging."}</p>
          <p>{preview.message}</p>
        </> : <p className="text-red-700">{preview.error || "Unable to preview"}</p>}
      </div>}
      <Button type="button" disabled={charging || !preview?.candidateEligible} variant="outline" onClick={charge}>
        {charging ? "Submitting one payment…" : "Charge stored BRIC once"}
      </Button>
      {result && <p role="status" className="text-sm font-medium">{result}</p>}
      <p className="text-xs text-gray-500">Availability controlled server-side. Do not retry an unknown response without checking North.</p>
    </CardContent>
  </Card>;
}
