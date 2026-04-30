import { useEffect, useMemo, useState } from "react";
import { endOfWeek, format, startOfWeek } from "date-fns";

export function useAdminCommissionsFilters(locationPath: string) {
  const [dateFilter, setDateFilter] = useState({
    startDate: format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
  });
  const [selectedCommissions, setSelectedCommissions] = useState<Set<string>>(new Set());
  const [paymentDate, setPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [hasExpandedFocusRange, setHasExpandedFocusRange] = useState(false);

  const searchParams = useMemo(() => {
    const query = locationPath.includes("?")
      ? locationPath.slice(locationPath.indexOf("?"))
      : window.location.search;
    return new URLSearchParams(query);
  }, [locationPath]);

  const focusMemberId = searchParams.get("memberId");
  const focusCommissionId = searchParams.get("commissionId");

  useEffect(() => {
    if (hasExpandedFocusRange || (!focusMemberId && !focusCommissionId)) {
      return;
    }

    setDateFilter({
      startDate: format(new Date(new Date().getFullYear() - 1, 0, 1), "yyyy-MM-dd"),
      endDate: format(new Date(), "yyyy-MM-dd"),
    });
    setHasExpandedFocusRange(true);
  }, [focusMemberId, focusCommissionId, hasExpandedFocusRange]);

  const handleQuickSelectWeek = () => {
    const sunday = startOfWeek(new Date(), { weekStartsOn: 0 });
    const saturday = endOfWeek(new Date(), { weekStartsOn: 0 });
    setDateFilter({
      startDate: format(sunday, "yyyy-MM-dd"),
      endDate: format(saturday, "yyyy-MM-dd"),
    });
  };

  return {
    dateFilter,
    setDateFilter,
    selectedCommissions,
    setSelectedCommissions,
    paymentDate,
    setPaymentDate,
    focusMemberId,
    focusCommissionId,
    handleQuickSelectWeek,
  };
}
