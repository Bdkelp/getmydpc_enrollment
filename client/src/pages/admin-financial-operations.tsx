import { useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, Search, ShieldAlert } from "lucide-react";
import AppShell from "@/components/AppShell";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

const label: Record<string, string> = {
  PAYMENT_PENDING_REVIEW_REQUIRED: "PAYMENT VERIFICATION REQUIRED",
  PAYMENT_CONFIRMED_COMMISSION_FAILED: "Commission processing failed",
  PAYMENT_CONFIRMED_COMMISSION_MISSING: "Commission missing",
  COMMISSION_LEDGER_SYNC_FAILED: "Ledger sync failed",
  COMMISSION_LEDGER_MISSING: "Ledger entry missing",
  GROUP_EFFECTIVE_DATE_UNRESOLVED: "Group effective date unresolved",
  SOURCE_PAYMENT_MISSING: "Source payment missing",
  DUPLICATE_COMMISSION_EVENT: "Duplicate commission entitlement",
  DUPLICATE_LEDGER_ENTRY: "Duplicate ledger entry",
  RETRY_LIMIT_EXCEEDED: "Retry limit exceeded",
};

export default function AdminFinancialOperations() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, isLoading, isError } = useQuery({ queryKey: ["/api/admin/financial-exceptions", status], queryFn: () => apiRequest(`/api/admin/financial-exceptions${status === "all" ? "" : `?status=${status}`}`) });
  const exceptions = (data?.exceptions || []).filter((item: any) => !search || `${item.exception_type} ${item.payment_id || ""} ${item.member_id || ""}`.toLowerCase().includes(search.toLowerCase()));
  const counts = exceptions.reduce((result: any, item: any) => { result[item.status] = (result[item.status] || 0) + 1; return result; }, {});
  const selected = exceptions.find((item: any) => String(item.id) === selectedId);

  const retry = async (id: string) => { await apiRequest(`/api/admin/financial-exceptions/${id}/retry`, { method: "POST" }); queryClient.invalidateQueries({ queryKey: ["/api/admin/financial-exceptions"] }); };
  const resolve = async (id: string) => { const reason = window.prompt("Resolution reason is required"); if (!reason?.trim()) return; await apiRequest(`/api/admin/financial-exceptions/${id}/resolve`, { method: "POST", body: JSON.stringify({ reason }) }); queryClient.invalidateQueries({ queryKey: ["/api/admin/financial-exceptions"] }); };

  if (isLoading) return <div className="min-h-screen grid place-items-center"><LoadingSpinner /></div>;
  if (isError) return <div className="min-h-screen grid place-items-center p-6"><Card><CardContent className="p-6"><p>Financial schema migration required or exception data is temporarily unavailable.</p></CardContent></Card></div>;

  return <AppShell title="Financial Operations" breadcrumb={["Admin", "Financial Operations"]} actions={<Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/financial-exceptions"] })}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>}>
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <section className="rounded-2xl bg-[var(--deep-twilight-900)] p-6 text-white sm:p-8"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--sky-aqua-300)]">Admin review queue</p><h1 className="mt-2 text-3xl font-semibold">Financial Operations</h1><p className="mt-2 max-w-2xl text-sm text-[var(--deep-twilight-100)]">Review durable financial exceptions and retry only specific, idempotent actions. Payment verification never declares success from this screen.</p></section>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">{["open", "retrying", "review_required", "resolved", "ignored"].map((key) => <Card key={key}><CardContent className="p-4"><p className="text-xs capitalize text-muted-foreground">{key.replace("_", " ")}</p><p className="mt-1 text-2xl font-semibold">{counts[key] || 0}</p></CardContent></Card>)}</div>
      <Card><CardHeader><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><CardTitle>Financial exceptions</CardTitle><div className="flex flex-col gap-2 sm:flex-row"><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9 sm:w-64" placeholder="Payment, member, category" value={search} onChange={(event) => setSearch(event.target.value)} /></div><Select value={status} onValueChange={setStatus}><SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="open">Open</SelectItem><SelectItem value="retrying">Retrying</SelectItem><SelectItem value="review_required">Review required</SelectItem><SelectItem value="resolved">Resolved</SelectItem></SelectContent></Select></div></div></CardHeader><CardContent className="space-y-3">{exceptions.length === 0 ? <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No exceptions match the current filters.</div> : exceptions.map((item: any) => <article key={item.id} className={`grid gap-4 rounded-xl border p-4 md:grid-cols-[1fr_0.7fr_0.8fr_auto] md:items-center ${selectedId === String(item.id) ? "border-french-blue-400 bg-french-blue-50/50" : ""}`}><button className="text-left" onClick={() => setSelectedId(String(item.id))}><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" /><p className="font-medium">{label[item.exception_type] || item.exception_type}</p></div><p className="mt-1 text-xs text-muted-foreground">Payment {item.payment_id || "—"} · Member {item.member_id || "—"}</p><p className="mt-1 text-xs text-muted-foreground">Detected {new Date(item.detected_at).toLocaleString()}</p></button><div><p className="text-xs text-muted-foreground">Last error</p><p className="line-clamp-2 text-sm">{item.error_reason || "None recorded"}</p></div><div className="flex flex-col gap-1"><Badge variant="outline">{item.status}</Badge><span className="text-xs text-muted-foreground">Retries: {item.retry_count}</span></div><div className="flex gap-2">{["open", "retrying"].includes(item.status) && <Button size="sm" variant="outline" onClick={() => retry(String(item.id))}>Retry</Button>}{!['resolved', 'ignored'].includes(item.status) && <Button size="sm" onClick={() => resolve(String(item.id))}><CheckCircle2 className="mr-1 h-4 w-4" />Resolve</Button>}</div></article>)}
      {selected && <div className="rounded-xl border bg-muted/30 p-5"><div className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-french-blue-700" /><h2 className="font-semibold">Exception detail</h2></div><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Category</dt><dd>{selected.exception_type}</dd></div><div><dt className="text-muted-foreground">Retry history</dt><dd>{selected.metadata?.retryHistory ? JSON.stringify(selected.metadata.retryHistory) : "No retries"}</dd></div><div><dt className="text-muted-foreground">Resolution</dt><dd>{selected.resolution_method || "Unresolved"}</dd></div><div><dt className="text-muted-foreground">Last retry</dt><dd>{selected.last_retry_at ? new Date(selected.last_retry_at).toLocaleString() : "Not retried"}</dd></div></dl></div>}
      </CardContent></Card>
    </div>
  </AppShell>;
}
