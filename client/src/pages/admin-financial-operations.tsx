import {
  Activity,
  Bell,
  Clock3,
  CreditCard,
  Info,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

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
  `${row.first_name || ""} ${row.last_name || ""}`.trim() ||
  `Member ${row.member_id || "—"}`;

const humanize = (value?: string | null) =>
  value
    ? value
        .replace(/_/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "Unspecified";

function StateBadge({ state }: { state?: string | null }) {
  const value = state || "none";
  const attention = [
    "declined",
    "unknown",
    "submitting",
    "internal_sync_pending",
  ].includes(value);
  return <Badge variant={attention ? "destructive" : "outline"}>{value}</Badge>;
}

export default function AdminFinancialOperations() {
  const queryClient = useQueryClient();

  const billingQuery = useQuery<BillingSnapshot>({
    queryKey: ["/api/admin/billing-operations"],
    queryFn: () => apiRequest("/api/admin/billing-operations"),
    refetchInterval: 60_000,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/admin/billing-operations"] });
  };

  if (billingQuery.isLoading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (billingQuery.isError || !billingQuery.data) {
    return (
      <AppShell title="Financial Operations" breadcrumb={["Admin", "Financial Operations"]}>
        <div className="mx-auto w-full max-w-7xl">
          <Card>
            <CardContent className="p-6">
              <p>Billing operations data is temporarily unavailable.</p>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    );
  }

  const billing = billingQuery.data;
  const latestRun = billing.recentRuns?.[0];
  const configuration = billing.configuration;
  const liveHealthy = Boolean(
    configuration?.enabled &&
      configuration.mode === "live" &&
      !configuration.kill_switch,
  );
  const durableAttentionCount = billing.attentionCycles.length;

  return (
    <AppShell
      title="Financial Operations"
      breadcrumb={["Admin", "Financial Operations"]}
      actions={
        <Button variant="outline" onClick={refresh}>
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
            See what the recurring biller is doing, which members need attention,
            and whether a problem is processor-facing or internal. This dashboard
            does not submit or retry processor charges.
          </p>
        </section>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Scheduler</p>
                <Activity className="h-4 w-4" />
              </div>
              <p className="mt-2 text-2xl font-semibold">
                {liveHealthy ? "LIVE" : "BLOCKED"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {configuration
                  ? `enabled=${String(configuration.enabled)} · kill switch=${String(
                      configuration.kill_switch,
                    )}`
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
              <p className="mt-2 text-2xl font-semibold">
                {billing.summary.dueActiveAutomatic}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Broad snapshot of active automatic subscriptions whose billing date is due
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Missing credential</p>
                <CreditCard className="h-4 w-4" />
              </div>
              <p className="mt-2 text-2xl font-semibold">
                {billing.summary.missingCredential}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Due records without a usable platform reference
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Durable cycle attention</p>
                <ShieldAlert className="h-4 w-4" />
              </div>
              <p className="mt-2 text-2xl font-semibold">{durableAttentionCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Declined / possible capture / internal-sync cycles requiring review
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
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div>
                <p className="text-xs text-muted-foreground">Business timezone</p>
                <p className="font-medium">
                  {configuration?.business_timezone || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Latest run</p>
                <p className="font-medium">
                  #{latestRun?.id || "—"} · {latestRun?.status || "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {fmtDateTime(latestRun?.completed_at)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Selected</p>
                <p className="font-medium">{latestRun?.selected_count ?? "—"}</p>
                <p className="text-xs text-muted-foreground">Latest durable candidate selection</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Claimed</p>
                <p className="font-medium">{latestRun?.claimed_count ?? "—"}</p>
                <p className="text-xs text-muted-foreground">Cycles actually leased for processing</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Skipped</p>
                <p className="font-medium">{latestRun?.skipped_count ?? "—"}</p>
                <p className="text-xs text-muted-foreground">Selected records blocked before charge</p>
              </div>
            </div>

            <div className="flex gap-3 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                <strong className="text-foreground">Due automatic</strong> is a broad date-due snapshot.
                <strong className="text-foreground"> Selected</strong> is the latest scheduler run after the durable candidate rules are applied, and
                <strong className="text-foreground"> Claimed</strong> is the subset actually leased for processing. These counts are not expected to match.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Due subscription snapshot</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-xs text-muted-foreground">
              {billing.notes?.dueSubscriptions}
            </p>
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
                      <td
                        colSpan={6}
                        className="px-3 py-8 text-center text-muted-foreground"
                      >
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
                        <td className="px-3 py-3">
                          {fmtDate(row.next_billing_date)}
                        </td>
                        <td className="px-3 py-3">{money(row.amount)}</td>
                        <td className="px-3 py-3">
                          <Badge
                            variant={
                              row.credential_status === "ready"
                                ? "outline"
                                : "destructive"
                            }
                          >
                            {row.credential_status}
                          </Badge>
                          <p className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground">
                            {row.credential_source || "No usable source"}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <StateBadge state={row.latest_cycle_state} />
                        </td>
                        <td className="px-3 py-3">
                          {row.latest_cycle_attempt_count ?? 0}
                        </td>
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
                  <div
                    key={cycle.id}
                    className="grid gap-3 rounded-xl border p-4 lg:grid-cols-[1.2fr_0.7fr_0.8fr_1.4fr] lg:items-center"
                  >
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
                      <p>
                        {fmtDate(cycle.cycle_date)} · {money(cycle.amount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Attempts</p>
                      <p>
                        {cycle.attempt_count ?? 0} · next {fmtDateTime(cycle.next_attempt_at)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Processor / classification</p>
                      <p className="text-sm">
                        {cycle.processor_response_code || "—"}{" "}
                        {cycle.processor_response_message || ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {cycle.failure_classification || "No classification"}
                      </p>
                      {cycle.skip_reason ? (
                        <p className="mt-1 text-xs font-medium text-amber-700">
                          Operator hold: {humanize(cycle.skip_reason)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Open billing notifications</CardTitle>
              <Badge variant={billing.openNotifications.length > 0 ? "destructive" : "outline"}>
                {billing.openNotifications.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {billing.openNotifications.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                No unresolved recurring-billing notifications.
              </div>
            ) : (
              <div className="space-y-3">
                {billing.openNotifications.map((notification: any) => (
                  <div
                    key={notification.id}
                    className="grid gap-3 rounded-xl border p-4 md:grid-cols-[auto_1fr_auto] md:items-center"
                  >
                    <Bell className="h-4 w-4 text-amber-600" />
                    <div>
                      <p className="font-medium">
                        {humanize(notification.error_message)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Member #{notification.member_id || "—"} · subscription #{notification.subscription_id || "—"}
                        {notification.metadata?.cycleDate
                          ? ` · cycle ${notification.metadata.cycleDate}`
                          : ""}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {fmtDateTime(notification.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            )}
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
                      <td className="px-3 py-3">
                        #{run.id} · {run.mode}
                      </td>
                      <td className="px-3 py-3">
                        {fmtDateTime(run.completed_at)}
                      </td>
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
      </div>
    </AppShell>
  );
}
