import { useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import type { Commission, CommissionStats, AgentLedgerResponse } from "./useAgentCommissionsQueries";

interface UseAgentCommissionsDerivedParams {
  commissions: Commission[] | undefined;
  stats: CommissionStats | undefined;
  agentLedger: AgentLedgerResponse | undefined;
  focusMemberId: string | null;
  focusCommissionId: string | null;
  dateFilter: { startDate: string; endDate: string };
}

export function useAgentCommissionsDerived({
  commissions,
  stats,
  agentLedger,
  focusMemberId,
  focusCommissionId,
  dateFilter,
}: UseAgentCommissionsDerivedParams) {
  const { toast } = useToast();

  const safeCommissions = useMemo(() => {
    const all = Array.isArray(commissions) ? commissions : [];
    if (!focusMemberId && !focusCommissionId) return all;
    return all.filter((c) => {
      const memberMatch = focusMemberId ? String(c.memberId || '') === focusMemberId : true;
      const commissionMatch = focusCommissionId ? String(c.id || '') === focusCommissionId : true;
      return memberMatch && commissionMatch;
    });
  }, [commissions, focusMemberId, focusCommissionId]);

  const safeStats = useMemo(() => ({
    mtd: (stats && typeof stats.mtd === 'number') ? stats.mtd : 0,
    ytd: (stats && typeof stats.ytd === 'number') ? stats.ytd : 0,
    lifetime: (stats && typeof stats.lifetime === 'number') ? stats.lifetime : 0,
    pending: (stats && typeof stats.pending === 'number') ? stats.pending : 0,
  }), [stats]);

  const businessMix = useMemo(() => {
    return safeCommissions.reduce(
      (acc, c) => {
        const category = c.businessCategory || 'individual';
        const amount = Number(c.commissionAmount || 0);
        if (category === 'family') { acc.family.count += 1; acc.family.amount += amount; }
        else if (category === 'group') { acc.group.count += 1; acc.group.amount += amount; }
        else { acc.individual.count += 1; acc.individual.amount += amount; }
        return acc;
      },
      {
        individual: { count: 0, amount: 0 },
        family: { count: 0, amount: 0 },
        group: { count: 0, amount: 0 },
      }
    );
  }, [safeCommissions]);

  const nextScheduledPayout = useMemo(() => {
    const rows = Array.isArray(agentLedger?.rows) ? agentLedger!.rows : [];
    const scheduledRows = rows.filter((r) => r.displayStatus === 'scheduled' && !!r.scheduledPayDate);
    if (scheduledRows.length === 0) return null;

    const totalsByDate = new Map<string, { amount: number; count: number }>();
    for (const row of scheduledRows) {
      const rawDate = String(row.scheduledPayDate || '').slice(0, 10);
      if (!rawDate) continue;
      const existing = totalsByDate.get(rawDate) || { amount: 0, count: 0 };
      totalsByDate.set(rawDate, { amount: existing.amount + Number(row.commissionAmount || 0), count: existing.count + 1 });
    }

    const sortedDates = Array.from(totalsByDate.keys()).sort();
    if (sortedDates.length === 0) return null;

    const nextDate = sortedDates[0];
    const totals = totalsByDate.get(nextDate) || { amount: 0, count: 0 };
    return { date: nextDate, amount: totals.amount, rowCount: totals.count };
  }, [agentLedger]);

  const handleExport = async () => {
    try {
      const params = new URLSearchParams({ startDate: dateFilter.startDate, endDate: dateFilter.endDate });
      const response = await fetch(`/api/agent/export-commissions?${params}`, {
        method: "GET",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `commissions-${dateFilter.startDate}-to-${dateFilter.endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({ title: "Export Successful", description: "Your commission report has been downloaded." });
    } catch {
      toast({ title: "Export Failed", description: "Unable to download commission report.", variant: "destructive" });
    }
  };

  return { safeCommissions, safeStats, businessMix, nextScheduledPayout, handleExport };
}
