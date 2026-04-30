import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";

export function useAgentCommissionsFilters() {
  const [locationPath] = useLocation();

  const [dateFilter, setDateFilter] = useState({
    startDate: format(new Date(new Date().setMonth(new Date().getMonth() - 1)), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
  });
  const [hasExpandedFocusRange, setHasExpandedFocusRange] = useState(false);
  const [ledgerStatusFilter, setLedgerStatusFilter] = useState<
    'all' | 'pending' | 'scheduled' | 'carry_forward' | 'paid' | 'held' | 'reversed'
  >('all');
  const [ledgerPayoutPeriodFilter, setLedgerPayoutPeriodFilter] = useState<
    'all' | '1st-cycle' | '15th-cycle'
  >('all');
  const [ledgerMemberNameFilter, setLedgerMemberNameFilter] = useState('');

  const searchParams = useMemo(() => {
    const query = locationPath.includes('?')
      ? locationPath.slice(locationPath.indexOf('?'))
      : window.location.search;
    return new URLSearchParams(query);
  }, [locationPath]);

  const focusMemberId = searchParams.get('memberId');
  const focusCommissionId = searchParams.get('commissionId');

  useEffect(() => {
    if (hasExpandedFocusRange || (!focusMemberId && !focusCommissionId)) return;
    setDateFilter({
      startDate: format(new Date(new Date().getFullYear() - 1, 0, 1), "yyyy-MM-dd"),
      endDate: format(new Date(), "yyyy-MM-dd"),
    });
    setHasExpandedFocusRange(true);
  }, [focusMemberId, focusCommissionId, hasExpandedFocusRange]);

  const resetLedgerFilters = () => {
    setLedgerStatusFilter('all');
    setLedgerPayoutPeriodFilter('all');
    setLedgerMemberNameFilter('');
  };

  return {
    dateFilter,
    setDateFilter,
    ledgerStatusFilter,
    setLedgerStatusFilter,
    ledgerPayoutPeriodFilter,
    setLedgerPayoutPeriodFilter,
    ledgerMemberNameFilter,
    setLedgerMemberNameFilter,
    resetLedgerFilters,
    focusMemberId,
    focusCommissionId,
  };
}
