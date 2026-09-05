import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  CreditCard,
  RefreshCw,
  Search,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

const exceptionLabel: Record<string, string> = {
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

type BillingSnapshot = {
  generatedAt: string;
  configuration: {
    enabled: boolean;
    mode: string;
    kill_switch: boolean;
    business_timezone: string;
    updated_at: string;
    updated_by: string;
  } | null;
  summary: {
    dueActiveAutomatic: number;
    missingCredential: number;
    terminalDeclines: number;
    unknownOrSubmitting: number;
    internalSyncPending: number;
    openBillingNotifications: number;
  };
  cycleCounts: Record<string, number>;
  recentRuns: any[];
  attentionCycles: any[];
  dueSubscriptions: any[];
  openNotifications: any[];
  notes: Record<string, string>;
};

const fmtDateTime = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
};

const fmtDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
};

const money = (value: unknown) => `$${Number(value || 0).toFixed(2)}`;

const memberName = (row: any) =>
  `${row.first_name || ""} ${row.last_name || ""}`.trim() || `Member ${row.member_id || "—"}`;

function StateBadge({ state }: { state?: string | null }) {
  const value = state || "none";
  const attention = ["declined", "unknown", "submitting", "internal_sync_pending"].includes(value);
  return <Badge variant={attention ? "destructive" : "outline"}>{value}</Badge>;
}

export default function AdminFinancialOperations() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const billingQuery = useQuery<BillingSnapshot>({
    queryKey: ["/api/admin/billing-operations"],
    queryFn: () => apiRequest("/api/admin/billing-operations"),
    refetchInterval: 60_000,
  });

  const exceptionsQuery = useQuery({
    queryKey: ["/api/admin/financial-exceptions", status],
    queryFn: () =>
      apiRequest(
        `/api/admin/financial-exceptions${status === "all" ? "" : `?status=${status}`}`,
      ),
  });

  const exceptions = useMemo(
    () =>
      (exceptionsQuery.data?.exceptions || []).filter(
        (item: any) =>
          !search ||
          `${item.exception_type} ${item.payment_id || ""} ${item.member_id || ""}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [exceptionsQuery.data, search],
  );

  const counts = exceptions.reduce((result: any, item: any) => {
    result[item.status] = (result[item.status] || 0) + 1;
    return result;
  }, {});
  const selected = exceptions.find((item: any) => String(item.id) === selectedId);

  const retry = async (id: string) => {
    await apiRequest(`/api/admin/financial-exceptions/${id}/retry`, { method: "POST" });
    await queryClient.invalidateQueries({ queryKey: ["/api/admin/financial-exceptions"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/admin/billing-operations"] });
  };

  const resolve = async (id: string) => {
    const reason = window.prompt("Resolution reason is required");
    if (!reason?.trim()) return;
    await apiRequest(`/api/admin/financial-exceptions/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    await queryClient.invalidateQueries({ queryKey: ["/api/admin/financial-exceptions"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/admin/billing-operations"] });
  };

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/admin/billing-operations"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/admin/financial-exceptions"] }),
    ]);
  };

  if (billingQuery.isLoading && exceptionsQuery.isLoading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <LoadingSpinner />
      </div>
    );
  }

  const billing = billingQuery.data;
  const latestRun = billing?.recentRuns?.[0];
  const configuration = billing?.configuration;
  const liveHealthy = Boolean(
    configuration?.enabled && configuration.mode === "live" && !configuration.kill_switch,
  );

  return (
    <AppShell
      title="Financial Operations"
      breadcrumb={["Admin", "Financial Operations"]}
      actions={
        <Button variant="outline" onClick={refreshAll}>
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      }
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="rounded-2xl bg-[var(--deep-twilight-900)] p-6 text-white sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--sky-aqua-300)]">
            Billing command center
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Financial Operations</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--deep-twilight-100)]">
            See what the recurring biller is doing, which members need attention, and whether a problem is processor-facing or internal. This dashboard does not submit or retry processor charges.
          </p>
        </section>

        {billingQuery.isError ? (
          <Card>
            <CardContent className="p-6">
              <p>Billing operations data is temporarily unavailable.</p>
            </CardContent>
          </Card>
        ) : billing ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Scheduler</p>
                    <Activity className="h-4 w-4" />
                  </div>
                  <p className="mt-2 text-2xl font-semibold">{liveHealthy ? "LIVE" : "BLOCKED"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {configuration
                      ? `enabled=${String(configuration.enabled)} · kill switch=${String(configuration.kill_switch)}`
                      : "Configuration unavailable"}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Due automatic</p>
                    <Clock3 className="h-4 w-4" />
                  </div>
                  <p className="mt-2 text-2xl font-semibold">{billing.summary.dueActiveAutomatic}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Active subscriptions due at snapshot time</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Missing credential</p>
                    <CreditCard className="h-4 w-4" />
                  </div>
                  <p className="mt-2 text-2xl font-semibold">{billing.summary.missingCredential}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Due records without a usable platform reference</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Needs attention</p>
                    <ShieldAlert className="h-4 w-4" />
                  </div>
                  <p className="mt-2 text-2xl font-semibold">
                    {billing.summary.terminalDeclines + billing.summary.unknownOrSubmitting + billing.summary.internalSyncPending}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    terminal decline / possible capture / internal sync
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle>Scheduler & latest run</CardTitle>
                  <Badge variant={liveHealthy ? "outline" : "destructive"}>
                    {configuration?.mode || "unknown"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Business timezone</p>
                  <p className="font-medium">{configuration?.business_timezone || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Latest run</p>
                  <p className="font-medium">#{latestRun?.id || "—"} · {latestRun?.status || "—"}</p>
                  <p className="text-xs text-muted-foreground">{fmtDateTime(latestRun?.completed_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Selected / claimed</p>
                  <p className="font-medium">{latestRun?.selected_count ?? "—"} / {latestRun?.claimed_count ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Latest outcomes</p>
                  <p className="font-medium">
                    {latestRun
                      ? `${latestRun.succeeded_count} success · ${latestRun.declined_count} decline · ${latestRun.unknown_count} unknown`
                      : "—"}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Due subscription snapshot</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-xs text-muted-foreground">{billing.notes?.dueSubscriptions}</p>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="border-b bg-muted/40 text-left">
                      <tr>
                        <th className="px-3 py-2">Member</th>
                        <th className="px-3 py-2">Due</th>
                        <th className="px-3 py-2">Amount</th>
                        <th className="px-3 py-2">Credential</th>
                        <th className="px-3 py-2">Latest cycle</th>
                        <th className="px-3 py-2">Attempts</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {billing.dueSubscriptions.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                            No active automatic subscriptions are currently due.
                          </td>
                        </tr>
                      ) : (
                        billing.dueSubscriptions.map((row: any) => (
                          <tr key={row.subscription_id}>
                            <td className="px-3 py-3">
                              <p className="font-medium">{memberName(row)}</p>
                              <p className="text-xs text-muted-foreground">
                                #{row.member_id} · {row.customer_number || "no customer #"}
                              </p>
                            </td>
                            <td className="px-3 py-3">{fmtDate(row.next_billing_date)}</td>
                            <td className="px-3 py-3">{money(row.amount)}</td>
                            <td className="px-3 py-3">
                              <Badge variant={row.credential_status === "ready" ? "outline" : "destructive"}>
                                {row.credential_status}
                              </Badge>
                              <p className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground">
                                {row.credential_source || "No usable source"}
                              </p>
                            </td>
                            <td className="px-3 py-3"><StateBadge state={row.latest_cycle_state} /></td>
                            <td className="px-3 py-3">{row.latest_cycle_attempt_count ?? 0}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Billing cycles requiring attention</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {billing.attentionCycles.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                      No durable billing cycles currently require operator attention.
                    </div>
                  ) : (
                    billing.attentionCycles.map((cycle: any) => (
                      <div key={cycle.id} className="grid gap-3 rounded-xl border p-4 lg:grid-cols-[1.2fr_0.7fr_0.8fr_1.4fr] lg:items-center">
                        <div>
                          <div className="flex items-center gap-2">
                            <StateBadge state={cycle.state} />
                            <span className="font-medium">{memberName(cycle)}</span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Cycle #{cycle.id} · subscription #{cycle.subscription_id} · member #{cycle.member_id}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Cycle / amount</p>
                          <p>{fmtDate(cycle.cycle_date)} · {money(cycle.amount)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Attempts</p>
                          <p>{cycle.attempt_count ?? 0} · next {fmtDateTime(cycle.next_attempt_at)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Processor / classification</p>
                          <p className="text-sm">
                            {cycle.processor_response_code || "—"} {cycle.processor_response_message || ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {cycle.failure_classification || cycle.skip_reason || "No classification"}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent scheduled runs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="border-b bg-muted/40 text-left">
                      <tr>
                        <th className="px-3 py-2">Run</th>
                        <th className="px-3 py-2">Completed</th>
                        <th className="px-3 py-2">Selected</th>
                        <th className="px-3 py-2">Claimed</th>
                        <th className="px-3 py-2">Success</th>
                        <th className="px-3 py-2">Declined</th>
                        <th className="px-3 py-2">Unknown</th>
                        <th className="px-3 py-2">Skipped</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {billing.recentRuns.map((run: any) => (
                        <tr key={run.id}>
                          <td className="px-3 py-3">#{run.id} · {run.mode}</td>
                          <td className="px-3 py-3">{fmtDateTime(run.completed_at)}</td>
                          <td className="px-3 py-3">{run.selected_count}</td>
                          <td className="px-3 py-3">{run.claimed_count}</td>
                          <td className="px-3 py-3">{run.succeeded_count}</td>
                          <td className="px-3 py-3">{run.declined_count}</td>
                          <td className="px-3 py-3">{run.unknown_count}</td>
                          <td className="px-3 py-3">{run.skipped_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle>Financial exceptions</CardTitle>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9 sm:w-64"
                    placeholder="Payment, member, category"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="retrying">Retrying</SelectItem>
                    <SelectItem value="review_required">Review required</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {["open", "retrying", "review_required", "resolved", "ignored"].map((key) => (
                <div key={key} className="rounded-lg border p-3">
                  <p className="text-xs capitalize text-muted-foreground">{key.replace("_", " ")}</p>
                  <p className="mt-1 text-xl font-semibold">{counts[key] || 0}</p>
                </div>
              ))}
            </div>

            {exceptionsQuery.isError ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                Financial exception data is temporarily unavailable.
              </div>
            ) : exceptions.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                No exceptions match the current filters.
              </div>
            ) : (
              exceptions.map((item: any) => (
                <article
                  key={item.id}
                  className={`grid gap-4 rounded-xl border p-4 md:grid-cols-[1fr_0.7fr_0.8fr_auto] md:items-center ${
                    selectedId === String(item.id) ? "border-french-blue-400 bg-french-blue-50/50" : ""
                  }`}
                >
                  <button className="text-left" onClick={() => setSelectedId(String(item.id))}>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <p className="font-medium">{exceptionLabel[item.exception_type] || item.exception_type}</p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Payment {item.payment_id || "—"} · Member {item.member_id || "—"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">Detected {fmtDateTime(item.detected_at)}</p>
                  </button>
                  <div>
                    <p className="text-xs text-muted-foreground">Last error</p>
                    <p className="line-clamp-2 text-sm">{item.error_reason || "None recorded"}</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Badge variant="outline">{item.status}</Badge>
                    <span className="text-xs text-muted-foreground">Retries: {item.retry_count}</span>
                  </div>
                  <div className="flex gap-2">
                    {["open", "retrying"].includes(item.status) && (
                      <Button size="sm" variant="outline" onClick={() => retry(String(item.id))}>
                        <Wrench className="mr-1 h-4 w-4" /> Retry internal step
                      </Button>
                    )}
                    {!['resolved', 'ignored'].includes(item.status) && (
                      <Button size="sm" onClick={() => resolve(String(item.id))}>
                        <CheckCircle2 className="mr-1 h-4 w-4" /> Resolve
                      </Button>
                    )}
                  </div>
                </article>
              ))
            )}

            {selected && (
              <div className="rounded-xl border bg-muted/30 p-5">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-french-blue-700" />
                  <h2 className="font-semibold">Exception detail</h2>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-muted-foreground">Category</dt><dd>{selected.exception_type}</dd></div>
                  <div><dt className="text-muted-foreground">Retry history</dt><dd>{selected.metadata?.retryHistory ? JSON.stringify(selected.metadata.retryHistory) : "No retries"}</dd></div>
                  <div><dt className="text-muted-foreground">Resolution</dt><dd>{selected.resolution_method || "Unresolved"}</dd></div>
                  <div><dt className="text-muted-foreground">Last retry</dt><dd>{fmtDateTime(selected.last_retry_at)}</dd></div>
                </dl>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
