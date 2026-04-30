import { useMemo } from "react";
import { isFuture, isToday } from "date-fns";

interface CommissionLike {
  id: string;
  agentId: string;
  memberId: string;
  commissionAmount: number;
  paymentStatus: string;
  paymentDate?: string;
  paymentCaptured?: boolean;
  eligibleForPayoutAt?: string;
  businessCategory?: "individual" | "family" | "group";
  agentName?: string;
  agentNumber?: string;
  agentEmail?: string;
}

interface Params {
  commissions: CommissionLike[] | undefined;
  focusMemberId: string | null;
  focusCommissionId: string | null;
  selectedCommissions: Set<string>;
  setSelectedCommissions: (value: Set<string>) => void;
  toast: (args: { title: string; description: string; variant?: "default" | "destructive" }) => void;
}

export function useAdminCommissionsDerived({
  commissions,
  focusMemberId,
  focusCommissionId,
  selectedCommissions,
  setSelectedCommissions,
  toast,
}: Params) {
  const safeCommissions = useMemo(() => {
    const all = Array.isArray(commissions) ? commissions : [];

    if (!focusMemberId && !focusCommissionId) {
      return all;
    }

    return all.filter((commission) => {
      const memberMatch = focusMemberId ? String(commission.memberId || "") === focusMemberId : true;
      const commissionMatch = focusCommissionId ? String(commission.id || "") === focusCommissionId : true;
      return memberMatch && commissionMatch;
    });
  }, [commissions, focusMemberId, focusCommissionId]);

  const unpaidCommissions = useMemo(() => {
    const now = new Date();
    return safeCommissions.filter((c) => {
      if (c.paymentStatus !== "unpaid") return false;
      if (!c.paymentCaptured) return false;
      if (c.eligibleForPayoutAt && new Date(c.eligibleForPayoutAt) > now) return false;
      return true;
    });
  }, [safeCommissions]);

  const paidCommissions = useMemo(() => {
    return safeCommissions.filter((c) => c.paymentStatus === "paid");
  }, [safeCommissions]);

  const scheduledCommissions = useMemo(() => {
    return safeCommissions.filter((c) => {
      if (c.paymentStatus !== "paid" || !c.paymentDate) return false;
      const paymentDate = new Date(c.paymentDate);
      return isFuture(paymentDate) || isToday(paymentDate);
    });
  }, [safeCommissions]);

  const totalUnpaid = useMemo(() => {
    return unpaidCommissions.reduce((sum, c) => sum + (c.commissionAmount || 0), 0);
  }, [unpaidCommissions]);

  const totalPaid = useMemo(() => {
    return paidCommissions.reduce((sum, c) => sum + (c.commissionAmount || 0), 0);
  }, [paidCommissions]);

  const totalScheduled = useMemo(() => {
    return scheduledCommissions.reduce((sum, c) => sum + (c.commissionAmount || 0), 0);
  }, [scheduledCommissions]);

  const selectedTotal = useMemo(() => {
    return safeCommissions
      .filter((c) => selectedCommissions.has(c.id))
      .reduce((sum, c) => sum + (c.commissionAmount || 0), 0);
  }, [safeCommissions, selectedCommissions]);

  const businessMix = useMemo(() => {
    return safeCommissions.reduce(
      (acc, commission) => {
        const category = commission.businessCategory || "individual";
        const amount = Number(commission.commissionAmount || 0);

        if (category === "group") {
          acc.group.count += 1;
          acc.group.amount += amount;
        } else {
          acc.individualFamily.count += 1;
          acc.individualFamily.amount += amount;
        }

        return acc;
      },
      {
        individualFamily: { count: 0, amount: 0 },
        group: { count: 0, amount: 0 },
      },
    );
  }, [safeCommissions]);

  const availableAgents = useMemo(() => {
    const all = Array.isArray(safeCommissions) ? safeCommissions : [];
    const map = new Map<string, { id: string; name: string; writingNumber: string }>();
    for (const item of all) {
      if (!item.agentId) continue;
      if (!map.has(item.agentId)) {
        map.set(item.agentId, {
          id: item.agentId,
          name: item.agentName || item.agentEmail || item.agentId,
          writingNumber: item.agentNumber || "N/A",
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [safeCommissions]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const unpaidIds = unpaidCommissions.map((c) => c.id);
      setSelectedCommissions(new Set(unpaidIds));
    } else {
      setSelectedCommissions(new Set());
    }
  };

  const handleSelectCommission = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedCommissions);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedCommissions(newSelected);
  };

  const showLegacyStatementExportDisabled = () => {
    toast({
      title: "Legacy Statement/Export Disabled",
      description: "Use payout batches: open a batch, then use batch statement/export actions.",
      variant: "destructive",
    });
  };

  const handleMarkAsPaid = () => {
    toast({
      title: "Legacy Direct Pay Disabled",
      description: "Use recurring payout batches: sync ledger, generate batch, export, then mark batch as paid.",
      variant: "destructive",
    });
  };

  const handleExportQuickBooksCsv = async () => {
    showLegacyStatementExportDisabled();
  };

  const handleExportHexonaCsv = async () => {
    showLegacyStatementExportDisabled();
  };

  return {
    safeCommissions,
    unpaidCommissions,
    paidCommissions,
    scheduledCommissions,
    totalUnpaid,
    totalPaid,
    totalScheduled,
    selectedTotal,
    businessMix,
    availableAgents,
    handleSelectAll,
    handleSelectCommission,
    handleMarkAsPaid,
    handleExportQuickBooksCsv,
    handleExportHexonaCsv,
  };
}
