import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock3, ExternalLink, Landmark, RefreshCw, ShieldCheck, WalletCards } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { apiRequest } from "@/lib/queryClient";
import { formatCalendarDate } from "@/lib/dateDisplay";
import { getCancellationDateLabel, getSafeCancellationReason } from "@/lib/cancellationDisplay";

const money = (value: number | undefined) => `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = formatCalendarDate;
const statusLabel: Record<string, string> = {
  earned: "Earned / Pending",
  queued: "Scheduled",
  carry_forward: "Carrying Forward",
  held: "On Hold",
  paid: "Paid",
  externally_settled: "Paid externally before cutover",
  reversed: "Adjustment / Reversal",
};

function BalanceCard({ title, values, nextPayDate, tone }: { title: string; values: any; nextPayDate: string; tone: "writing" | "override" }) {
  const accent = tone === "writing" ? "border-l-french-blue-500" : "border-l-sky-aqua-500";
  return (
    <Card className={`border-l-4 ${accent}`}>
      <CardHeader className="pb-3"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 text-sm">
        <div><p className="text-muted-foreground">Current balance</p><p className="text-2xl font-semibold">{money(values.pending + values.payable + values.carryForward + values.held)}</p></div>
        <div><p className="text-muted-foreground">Payable</p><p className="text-2xl font-semibold text-emerald-700">{money(values.payable)}</p></div>
        <div><p className="text-muted-foreground">Carry-forward</p><p className="font-medium">{money(values.carryForward)}</p></div>
        <div><p className="text-muted-foreground">On hold</p><p className="font-medium">{money(values.held)}</p></div>
        <div className="col-span-2 flex items-center gap-2 border-t pt-3 text-muted-foreground"><CalendarDays className="h-4 w-4" /> Next pay date <span className="font-medium text-foreground">{date(nextPayDate)}</span></div>
      </CardContent>
    </Card>
  );
}

export default function CommissionCenter() {
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const { data, error, isLoading, isError, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["/api/agent/commission-center"],
    queryFn: () => apiRequest("/api/agent/commission-center"),
    staleTime: 60_000,
  });

  const aggregate = data?.data?.agents?.[0];
  const transactions = useMemo(() => (aggregate?.transactions || []).filter((row: any) => {
    const typeMatch = typeFilter === "all" || (typeFilter === "writing" ? row.compensation_type !== "override" : row.compensation_type === "override");
    const statusMatch = statusFilter === "all" || row.status === statusFilter;
    const searchMatch = !search || `${row.member_name || ""} ${row.agent_name || ""}`.toLowerCase().includes(search.toLowerCase());
    return typeMatch && statusMatch && searchMatch;
  }), [aggregate?.transactions, typeFilter, statusFilter, search]);

  if (isLoading) return <div className="min-h-screen grid place-items-center"><LoadingSpinner /></div>;
  const routeError = String(error || '').includes('404') || String(error || '').toLowerCase().includes('agent not found');
  if (isError || !data) return <div className="min-h-screen grid place-items-center p-6"><Card className="max-w-md"><CardContent className="space-y-4 p-6"><h1 className="text-xl font-semibold">{routeError ? "Commission Center route is unavailable." : "Commission information is temporarily unavailable."}</h1><p className="text-sm text-muted-foreground">{routeError ? "Please refresh or contact support if this route remains unavailable." : "Financial schema validation or service availability is pending."}</p><Button onClick={() => refetch()}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button></CardContent></Card></div>;

  const writing = aggregate?.writing || { pending: 0, payable: 0, carryForward: 0, held: 0, paid: 0 };
  const overrides = aggregate?.overrides || { pending: 0, payable: 0, carryForward: 0, held: 0, paid: 0 };
  const policy = data.data.policy;

  return (
    <AppShell title="Commission Center" breadcrumb={["Agent", "Commissions"]}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="rounded-2xl bg-[var(--deep-twilight-900)] p-6 text-white shadow-lg sm:p-8">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--sky-aqua-300)]">Your financial workspace</p><h1 className="text-3xl font-semibold tracking-tight">Commission Center</h1><p className="mt-2 max-w-xl text-sm text-[var(--deep-twilight-100)]">A clear view of earned, scheduled, carried, held, and paid compensation from the authoritative ledger.</p></div><Button variant="secondary" onClick={() => refetch()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2"><BalanceCard title="Writing commissions" values={writing} nextPayDate={policy.nextWritingPayout} tone="writing" /><BalanceCard title="Overrides" values={overrides} nextPayDate={policy.nextOverridePayout} tone="override" /></div>

        {transactions.some((row: any) => row.historicalExternalSettlement) && <p className="text-sm text-muted-foreground">Commission activity prior to the platform cutover was paid outside the MPP commission system and has been reconciled as settled.</p>}

        <div className="grid gap-4 md:grid-cols-3"><Card><CardContent className="flex items-center gap-3 p-5"><Landmark className="h-5 w-5 text-french-blue-600" /><div><p className="text-xs text-muted-foreground">Most recent payment</p><p className="font-medium">{date(data.data.mostRecentPayment?.created_at)}</p><p className="text-xs text-muted-foreground">{data.data.mostRecentPayment?.payment_method || "Payment status unavailable"} · {data.data.mostRecentPayment?.status || "Unknown"}</p></div></CardContent></Card><Card><CardContent className="flex items-center gap-3 p-5"><ShieldCheck className="h-5 w-5 text-emerald-600" /><div><p className="text-xs text-muted-foreground">Policy version</p><p className="font-medium">{policy.version}</p><p className="text-xs text-muted-foreground">{policy.effectiveFrom} to {policy.effectiveThrough}</p></div></CardContent></Card><Card><CardContent className="flex items-center gap-3 p-5"><Clock3 className="h-5 w-5 text-sky-aqua-700" /><div><p className="text-xs text-muted-foreground">Data refreshed</p><p className="font-medium">{date(new Date(data.data.refreshedAt || dataUpdatedAt).toISOString())}</p></div></CardContent></Card></div>

        {transactions.some((row: any) => row.cancellation_date || row.cancellation_reason || row.commission_type === "reversal") && <Card className="border-red-100 bg-red-50/40"><CardContent className="p-4"><p className="text-sm font-semibold text-red-800">Cancellation context</p><div className="mt-2 space-y-2">{transactions.filter((row: any) => row.cancellation_date || row.cancellation_reason || row.commission_type === "reversal").map((row: any) => <div key={`cancellation-${row.id}`} className="text-xs text-red-700"><span className="font-medium">{row.member_name || "Member"}</span>: Cancelled — {getCancellationDateLabel(row.cancellation_date)} · Reason: {getSafeCancellationReason(row.cancellation_reason)}{row.metadata?.refundEligibility === "eligible" && row.metadata?.refundStatus === "pending_manual_refund" ? " · Commission hold: refund pending" : row.metadata?.refundEligibility === "review_required" ? " · Commission hold: refund review required" : row.metadata?.refundStatus === "refunded" && row.commission_type === "reversal" ? " · Commission reversal: refund processed" : ""}</div>)}</div></CardContent></Card>}
        <Card><CardHeader><div className="flex flex-col justify-between gap-3 md:flex-row md:items-center"><div><CardTitle>Transaction history</CardTitle><p className="mt-1 text-sm text-muted-foreground">Ledger transactions only. Member details are intentionally minimized.</p></div><div className="flex flex-col gap-2 sm:flex-row"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search member" className="sm:w-44" /><Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Type" /></SelectTrigger><SelectContent><SelectItem value="all">All compensation</SelectItem><SelectItem value="writing">Writing</SelectItem><SelectItem value="override">Overrides</SelectItem></SelectContent></Select><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="earned">Pending</SelectItem><SelectItem value="queued">Scheduled</SelectItem><SelectItem value="carry_forward">Carry-forward</SelectItem><SelectItem value="held">On hold</SelectItem><SelectItem value="paid">Paid</SelectItem><SelectItem value="externally_settled">Paid externally before cutover</SelectItem><SelectItem value="reversed">Adjustments</SelectItem></SelectContent></Select></div></div></CardHeader><CardContent>
          {transactions.length === 0 ? <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No ledger transactions match these filters.</div> : <div className="space-y-3">{transactions.map((row: any) => <article key={row.id} className="grid gap-3 rounded-xl border p-4 md:grid-cols-[1.4fr_0.8fr_0.8fr_1fr] md:items-center"><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{row.member_name || "Member"}</p><Badge variant="outline">{row.compensation_type === "override" ? "Override" : "Writing"}</Badge></div><p className="text-xs text-muted-foreground">Effective {date(row.effective_date)} · Earned {date(row.commission_period_end)}</p>{row.compensation_type === "override" && row.metadata?.overrideForAgentId && <p className="text-xs text-muted-foreground">Downline writing agent recorded</p>}</div><div><p className="text-xs text-muted-foreground">Amount</p><p className="font-semibold">{money(row.commission_amount)}</p></div><div><Badge className={row.status === "paid" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-800"}>{statusLabel[row.status] || row.status}</Badge><p className="mt-1 text-xs text-muted-foreground">{row.status}</p></div><div className="text-xs text-muted-foreground"><p>Pay date: <span className="text-foreground">{date(row.scheduledPayDate)}</span></p><p>Batch: <span className="text-foreground">{row.payoutBatch?.id || "Not batched"}</span></p>{row.status === "carry_forward" && <p className="mt-1 text-amber-700">{row.compensation_type === "override" ? "Override balance is below the $25 monthly minimum and will carry forward." : "Writing balance is below the $25 cycle minimum and will carry forward."}</p>}</div></article>)}</div>}
        </CardContent></Card>

        <div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5" />Commission schedule</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex items-center justify-between rounded-lg bg-muted/50 p-3"><span>Writing · next scheduled pay</span><strong>{date(policy.nextWritingPayout)}</strong></div><div className="flex items-center justify-between rounded-lg bg-muted/50 p-3"><span>Overrides · next scheduled pay</span><strong>{date(policy.nextOverridePayout)}</strong></div><p className="text-xs text-muted-foreground">Dates are returned by the same backend scheduling engine used for payout batches.</p></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2"><WalletCards className="h-5 w-5" />Policy snapshot</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><p>Writing: 1st/15th effective dates, first Friday strictly after, Federal Reserve holiday adjustment to the prior business day, $25 minimum.</p><p>Overrides: monthly in arrears, first Friday following the earning month, holiday adjustment to the next business day, $25 minimum.</p><p className="text-xs text-muted-foreground">Policy {policy.version} · effective {policy.effectiveFrom} through {policy.effectiveThrough}</p></CardContent></Card></div>
      </div>
    </AppShell>
  );
}
