import React, { useEffect, useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { API_URL } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";
import { formatLocalDate } from "@shared/localDate";
import { DollarSign, Calendar, CheckCircle, ChevronLeft, Clock, AlertTriangle, FileText, Download, Printer } from "lucide-react";
import { hasAtLeastRole } from "@/lib/roles";
import { endOfWeek, format, isFuture, isToday, startOfWeek } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LIFECYCLE_ALERT_LEGEND, getLifecycleAlertBadgeClasses, getLifecycleAlertLabel } from "@/lib/lifecycleAlertUi";

interface Commission {
  id: string;
  agentId: string;
  memberId: string;
  membershipId?: string;
  commissionAmount: number;
  coverageType: string;
  status: string;
  paymentStatus: string;
  paymentDate?: string;
  createdAt: string;
  userName: string;
  planType: string;
  paymentCaptured?: boolean;
  paymentIntentId?: string;
  paymentCapturedAt?: string;
  eligibleForPayoutAt?: string;
  businessCategory?: 'individual' | 'family' | 'group';
  groupName?: string;
  membershipFee?: number;
  commissionType?: 'direct' | 'override';
  isClawedBack?: boolean;
  clawbackReason?: string;
  agentName?: string;
  agentNumber?: string;
  agentEmail?: string;
  planName?: string;
  planTier?: string;
  effectiveDate?: string;
}

interface StatementLineItem {
  commissionId: string;
  memberName: string;
  memberId?: string | null;
  effectiveDate?: string | null;
  membershipTier?: string | null;
  coverageType?: string | null;
  commissionAmount: number;
  description: string;
  statementStatus: 'paid' | 'scheduled' | 'unpaid';
  isAdjustment?: boolean;
  adjustmentReason?: string | null;
}

interface CommissionStatement {
  statementDate: string;
  payoutPeriod: { startDate: string; endDate: string };
  fromCompany: { name: string; address: string };
  agent: {
    id: string;
    fullName: string;
    writingNumber?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
  } | null;
  lineItems: StatementLineItem[];
  subtotal: number;
  adjustments: number;
  totalPayout: number;
  statementNumber: string | null;
  payoutBatchId: string | null;
  status: 'all' | 'paid' | 'scheduled' | 'unpaid';
}

interface PayoutBatchSummary {
  id: string;
  batch_name: string;
  batch_type: '1st-cycle' | '15th-cycle';
  cutoff_date: string;
  scheduled_pay_date: string;
  total_amount: number;
  total_agents: number;
  total_records: number;
  status: 'draft' | 'ready' | 'exported' | 'paid';
  created_at: string;
  paid_at?: string | null;
}

interface PayoutDashboardSummary {
  nextPayoutDate: string;
  draftBatches: PayoutBatchSummary[];
  totalPayableAmount: number;
  totalAgents: number;
  counts: {
    new: number;
    renewal: number;
    adjustmentOrReversal: number;
    cancellations: number;
  };
}

interface PayoutBatchDetail {
  batch: PayoutBatchSummary;
  rows: Array<{
    id: string;
    member_name: string;
    member_id: string;
    membership_tier?: string | null;
    coverage_type?: string | null;
    commission_amount: number;
    commission_type: string;
    status: string;
    cancellation_date?: string | null;
    cancellation_reason?: string | null;
  }>;
  carryForwardCandidates?: Array<{
    agentId: string;
    agentName: string;
    writingNumber?: string | null;
    currentCarryForwardTotal: number;
    existingPayableTotal: number;
    resultingPayoutAmount: number;
    rowCount: number;
    rowIds: string[];
    rows: Array<{
      id: string;
      member_name: string;
      member_id?: string | null;
      commission_amount: number;
      commission_type: string;
      status: string;
    }>;
  }>;
}

interface LifecycleAlertSummary {
  generatedAt: string;
  horizonDays: number;
  billing: {
    dueSoon: number;
    overdue: number;
    failed: number;
    stalePending: number;
    totalAttention: number;
    nextCycleDate: string | null;
  };
  commissions: {
    dueSoon: number;
    overdue: number;
    unscheduled: number;
    pending: number;
    totalAttention: number;
    nextEligibleDate: string | null;
  };
  totals: {
    totalAttention: number;
  };
  billingItems: Array<{
    kind: 'due_soon' | 'overdue' | 'failed' | 'stale_pending';
    subscriptionId?: number | null;
    memberId: number;
    memberLabel: string;
    referenceDate: string | null;
    details?: string | null;
  }>;
  commissionItems: Array<{
    kind: 'due_soon' | 'overdue' | 'unscheduled';
    commissionId: string;
    memberId: number;
    memberLabel: string;
    referenceDate: string | null;
    amount: number;
  }>;
}

export default function AdminCommissions() {
  const [locationPath, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdminUser = hasAtLeastRole(user?.role, 'admin');
  const queryClient = useQueryClient();

  // Month to date by default (more useful than current week)
  const [dateFilter, setDateFilter] = useState({
    startDate: format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
  });

  const [selectedCommissions, setSelectedCommissions] = useState<Set<string>>(new Set());
  const [paymentDate, setPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [hasExpandedFocusRange, setHasExpandedFocusRange] = useState(false);
  const [statementAgentId, setStatementAgentId] = useState<string>("all");
  const [statementStatus, setStatementStatus] = useState<'all' | 'paid' | 'scheduled' | 'unpaid'>("all");
  const [isStatementOpen, setIsStatementOpen] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [isBatchDetailOpen, setIsBatchDetailOpen] = useState(false);
  const [isOverrideConfirmOpen, setIsOverrideConfirmOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [selectedCarryForwardCandidate, setSelectedCarryForwardCandidate] = useState<PayoutBatchDetail['carryForwardCandidates'][number] | null>(null);

  const searchParams = useMemo(() => {
    const query = locationPath.includes('?')
      ? locationPath.slice(locationPath.indexOf('?'))
      : window.location.search;
    return new URLSearchParams(query);
  }, [locationPath]);

  const focusMemberId = searchParams.get('memberId');
  const focusCommissionId = searchParams.get('commissionId');

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

  // Fetch all commissions (admin view)
  const { data: commissions, isLoading } = useQuery<Commission[]>({
    queryKey: ["/api/admin/commissions", dateFilter.startDate, dateFilter.endDate],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: dateFilter.startDate,
        endDate: dateFilter.endDate,
      });
      return await apiRequest(`/api/admin/commissions?${params}`, { method: "GET" });
    },
    enabled: !!user && isAdminUser,
  });

  const { data: lifecycleAlerts } = useQuery<LifecycleAlertSummary>({
    queryKey: ["/api/admin/lifecycle-alerts"],
    queryFn: async () => {
      return await apiRequest('/api/admin/lifecycle-alerts?days=7', { method: 'GET' });
    },
    enabled: !!user && isAdminUser,
    refetchInterval: 60_000,
  });

  const { data: statementData, isFetching: isStatementLoading } = useQuery<CommissionStatement>({
    queryKey: [
      "/api/admin/commissions/statement",
      dateFilter.startDate,
      dateFilter.endDate,
      statementAgentId,
      statementStatus,
      isStatementOpen,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: dateFilter.startDate,
        endDate: dateFilter.endDate,
        status: statementStatus,
      });
      if (statementAgentId !== 'all') {
        params.set('agentId', statementAgentId);
      }
      return await apiRequest(`/api/admin/commissions/statement?${params.toString()}`, { method: "GET" });
    },
    enabled: !!user && isAdminUser && isStatementOpen,
  });

  const { data: payoutDashboard, isFetching: isPayoutDashboardLoading } = useQuery<PayoutDashboardSummary>({
    queryKey: ["/api/admin/commissions/payout-dashboard"],
    queryFn: async () => {
      return await apiRequest('/api/admin/commissions/payout-dashboard', { method: 'GET' });
    },
    enabled: !!user && isAdminUser,
    refetchInterval: 60000,
  });

  const { data: selectedBatchDetail, isFetching: isBatchDetailLoading } = useQuery<PayoutBatchDetail>({
    queryKey: ["/api/admin/commissions/payout-batches", selectedBatchId],
    queryFn: async () => {
      return await apiRequest(`/api/admin/commissions/payout-batches/${selectedBatchId}`, { method: 'GET' });
    },
    enabled: !!user && isAdminUser && !!selectedBatchId && isBatchDetailOpen,
  });

  // Mark commissions as paid mutation
  const markAsPaidMutation = useMutation({
    mutationFn: async (data: { commissionIds: string[], paymentDate: string }) => {
      return await apiRequest("/api/admin/mark-commissions-paid", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: `${selectedCommissions.size} commission(s) marked as paid`,
      });
      setSelectedCommissions(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/admin/commissions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lifecycle-alerts"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to mark commissions as paid",
        variant: "destructive",
      });
    },
  });

  const syncLedgerMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/admin/commissions/ledger/sync', {
        method: 'POST',
        body: JSON.stringify({
          startDate: dateFilter.startDate,
          endDate: dateFilter.endDate,
        }),
      });
    },
    onSuccess: (result: any) => {
      toast({
        title: 'Ledger Synced',
        description: `Inserted ${result?.inserted || 0} row(s), newly eligible since last payout ${result?.newlyEligible || 0}, skipped ${result?.skipped || 0}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/commissions/payout-dashboard'] });
    },
    onError: (error: any) => {
      toast({ title: 'Sync Failed', description: error?.message || 'Unable to sync ledger.', variant: 'destructive' });
    },
  });

  const generateBatchesMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/admin/commissions/payout-batches/generate', {
        method: 'POST',
        body: JSON.stringify({ cutoffDate: formatLocalDate(new Date()) }),
      });
    },
    onSuccess: (result: any) => {
      toast({
        title: 'Draft Batches Generated',
        description: `${result?.count || 0} payout batch(es) were generated.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/commissions/payout-dashboard'] });
    },
    onError: (error: any) => {
      toast({ title: 'Batch Generation Failed', description: error?.message || 'Unable to generate payout batches.', variant: 'destructive' });
    },
  });

  const markBatchPaidMutation = useMutation({
    mutationFn: async (batchId: string) => {
      return await apiRequest(`/api/admin/commissions/payout-batches/${batchId}/mark-paid`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      toast({ title: 'Batch Marked Paid', description: 'All included ledger records were updated to paid.' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/commissions/payout-dashboard'] });
      if (selectedBatchId) {
        queryClient.invalidateQueries({ queryKey: ['/api/admin/commissions/payout-batches', selectedBatchId] });
      }
    },
    onError: (error: any) => {
      toast({ title: 'Mark Paid Failed', description: error?.message || 'Unable to mark batch paid.', variant: 'destructive' });
    },
  });

  const overrideCarryForwardMutation = useMutation({
    mutationFn: async (payload: { batchId: string; agentId: string; reason: string }) => {
      return await apiRequest(`/api/admin/commissions/payout-batches/${payload.batchId}/override-carry-forward`, {
        method: 'POST',
        body: JSON.stringify({ agentId: payload.agentId, reason: payload.reason }),
      });
    },
    onSuccess: (result: any) => {
      toast({
        title: 'Under-Minimum Release Applied',
        description: `Released ${result?.releasedRows || 0} row(s) for under-minimum payout override.`,
      });
      setIsOverrideConfirmOpen(false);
      setOverrideReason('');
      setSelectedCarryForwardCandidate(null);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/commissions/payout-dashboard'] });
      if (selectedBatchId) {
        queryClient.invalidateQueries({ queryKey: ['/api/admin/commissions/payout-batches', selectedBatchId] });
      }
    },
    onError: (error: any) => {
      toast({ title: 'Under-Minimum Release Failed', description: error?.message || 'Unable to override under-minimum payout rows.', variant: 'destructive' });
    },
  });

  const safeCommissions = useMemo(() => {
    const all = Array.isArray(commissions) ? commissions : [];

    if (!focusMemberId && !focusCommissionId) {
      return all;
    }

    return all.filter((commission) => {
      const memberMatch = focusMemberId
        ? String(commission.memberId || '') === focusMemberId
        : true;
      const commissionMatch = focusCommissionId
        ? String(commission.id || '') === focusCommissionId
        : true;
      return memberMatch && commissionMatch;
    });
  }, [commissions, focusMemberId, focusCommissionId]);

  const unpaidCommissions = useMemo(() => {
    const now = new Date();
    return safeCommissions.filter(c => {
      // Only show unpaid commissions where:
      // 1. Payment status is unpaid
      // 2. Payment was captured (payment_captured = true)
      // 3. Past the 14-day grace period (eligible_for_payout_at < now)
      if (c.paymentStatus !== 'unpaid') return false;
      if (!c.paymentCaptured) return false;
      if (c.eligibleForPayoutAt && new Date(c.eligibleForPayoutAt) > now) return false;
      return true;
    });
  }, [safeCommissions]);

  const paidCommissions = useMemo(() => {
    return safeCommissions.filter(c => c.paymentStatus === 'paid');
  }, [safeCommissions]);

  const scheduledCommissions = useMemo(() => {
    return safeCommissions.filter(c => {
      if (c.paymentStatus !== 'paid' || !c.paymentDate) return false;
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
      .filter(c => selectedCommissions.has(c.id))
      .reduce((sum, c) => sum + (c.commissionAmount || 0), 0);
  }, [safeCommissions, selectedCommissions]);

  const businessMix = useMemo(() => {
    return safeCommissions.reduce(
      (acc, commission) => {
        const category = commission.businessCategory || 'individual';
        const amount = Number(commission.commissionAmount || 0);

        if (category === 'group') {
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
      }
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
          writingNumber: item.agentNumber || 'N/A',
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [safeCommissions]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const unpaidIds = unpaidCommissions.map(c => c.id);
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

  const handleMarkAsPaid = () => {
    toast({
      title: 'Legacy Direct Pay Disabled',
      description: 'Use recurring payout batches: sync ledger, generate batch, export, then mark batch as paid.',
      variant: 'destructive',
    });
  };

  const handleQuickSelectWeek = () => {
    const sunday = startOfWeek(new Date(), { weekStartsOn: 0 });
    const saturday = endOfWeek(new Date(), { weekStartsOn: 0 });
    setDateFilter({
      startDate: format(sunday, "yyyy-MM-dd"),
      endDate: format(saturday, "yyyy-MM-dd"),
    });
  };

  const handleExportQuickBooksCsv = async () => {
    try {
      const params = new URLSearchParams({
        format: 'quickbooks-csv',
        startDate: dateFilter.startDate,
        endDate: dateFilter.endDate,
        status: statementStatus,
      });
      if (statementAgentId !== 'all') {
        params.set('agentId', statementAgentId);
      }

      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${API_URL}/api/admin/commissions/export?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Export failed with status ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `quickbooks-commissions-${dateFilter.startDate}-to-${dateFilter.endDate}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: 'QuickBooks CSV Exported',
        description: 'The CSV file is ready for QuickBooks bill import.',
      });
    } catch (error: any) {
      toast({
        title: 'Export Failed',
        description: error?.message || 'Unable to export QuickBooks CSV.',
        variant: 'destructive',
      });
    }
  };

  const handleExportHexonaCsv = async () => {
    try {
      const params = new URLSearchParams({
        format: 'hexona-csv',
        startDate: dateFilter.startDate,
        endDate: dateFilter.endDate,
        status: statementStatus,
      });
      if (statementAgentId !== 'all') {
        params.set('agentId', statementAgentId);
      }

      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${API_URL}/api/admin/commissions/export?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Export failed with status ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `hexona-commissions-${dateFilter.startDate}-to-${dateFilter.endDate}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: 'Hexona CSV Exported',
        description: 'The CSV file is ready for Hexona/HighLevel mapping.',
      });
    } catch (error: any) {
      toast({
        title: 'Export Failed',
        description: error?.message || 'Unable to export Hexona CSV.',
        variant: 'destructive',
      });
    }
  };

  const handleExportBatchCsv = async (batchId: string, formatType: 'quickbooks-csv' | 'hexona-csv') => {
    try {
      const params = new URLSearchParams({ format: formatType });
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${API_URL}/api/admin/commissions/payout-batches/${batchId}/export?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Export failed with status ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const prefix = formatType === 'quickbooks-csv' ? 'quickbooks' : 'hexona';
      link.download = `${prefix}-payout-batch-${batchId}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      queryClient.invalidateQueries({ queryKey: ['/api/admin/commissions/payout-dashboard'] });
      if (selectedBatchId) {
        queryClient.invalidateQueries({ queryKey: ['/api/admin/commissions/payout-batches', selectedBatchId] });
      }

      toast({
        title: 'Batch Export Complete',
        description: formatType === 'quickbooks-csv' ? 'QuickBooks CSV exported.' : 'Hexona CSV exported.',
      });
    } catch (error: any) {
      toast({ title: 'Batch Export Failed', description: error?.message || 'Unable to export batch CSV.', variant: 'destructive' });
    }
  };

  const renderStatementDocument = (statement: CommissionStatement): string => {
    const lineRows = (statement.lineItems || []).map((item) => `
      <tr>
        <td>${item.memberName || ''}</td>
        <td>${item.memberId || ''}</td>
        <td>${item.effectiveDate ? format(new Date(item.effectiveDate), 'MM/dd/yyyy') : ''}</td>
        <td>${item.membershipTier || ''}</td>
        <td>${item.coverageType || ''}</td>
        <td style="text-align:right;">$${Number(item.commissionAmount || 0).toFixed(2)}</td>
      </tr>
    `).join('');

    return `
      <html>
        <head>
          <title>Agent Commission Statement</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #1f2937; }
            h1 { margin: 0 0 12px 0; }
            .meta { display: flex; justify-content: space-between; margin-bottom: 16px; }
            .section { margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #d1d5db; padding: 8px; }
            th { background: #f3f4f6; text-align: left; }
            .totals { margin-top: 16px; width: 320px; margin-left: auto; }
            .totals-row { display: flex; justify-content: space-between; padding: 6px 0; }
            .total { font-weight: 700; border-top: 1px solid #111827; padding-top: 8px; }
          </style>
        </head>
        <body>
          <h1>Agent Commission Statement</h1>
          <div class="meta">
            <div>
              <div><strong>${statement.fromCompany.name}</strong></div>
              <div>${statement.fromCompany.address || ''}</div>
            </div>
            <div>
              <div><strong>Statement Date:</strong> ${format(new Date(statement.statementDate), 'MM/dd/yyyy')}</div>
              <div><strong>Payout Period:</strong> ${statement.payoutPeriod.startDate} to ${statement.payoutPeriod.endDate}</div>
              <div><strong>Statement #:</strong> ${statement.statementNumber || ''}</div>
              <div><strong>Batch ID:</strong> ${statement.payoutBatchId || ''}</div>
            </div>
          </div>
          <div class="section">
            <div><strong>Agent:</strong> ${statement.agent?.fullName || ''}</div>
            <div><strong>Writing Number:</strong> ${statement.agent?.writingNumber || ''}</div>
            <div><strong>Contact:</strong> ${statement.agent?.email || ''}${statement.agent?.phone ? ` | ${statement.agent.phone}` : ''}</div>
            <div><strong>Address:</strong> ${statement.agent?.address || ''}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Member Name</th>
                <th>Member ID</th>
                <th>Effective Date</th>
                <th>Membership Tier</th>
                <th>Coverage Type</th>
                <th style="text-align:right;">Commission Amount</th>
              </tr>
            </thead>
            <tbody>
              ${lineRows}
            </tbody>
          </table>
          <div class="totals">
            <div class="totals-row"><span>Subtotal</span><span>$${Number(statement.subtotal || 0).toFixed(2)}</span></div>
            <div class="totals-row"><span>Adjustments / Chargebacks</span><span>$${Number(statement.adjustments || 0).toFixed(2)}</span></div>
            <div class="totals-row total"><span>Total Payout</span><span>$${Number(statement.totalPayout || 0).toFixed(2)}</span></div>
          </div>
        </body>
      </html>
    `;
  };

  const openStatementPrintWindow = () => {
    if (!statementData) return;
    const popup = window.open('', '_blank', 'width=1100,height=900');
    if (!popup) {
      toast({ title: 'Pop-up Blocked', description: 'Please allow pop-ups to print statements.', variant: 'destructive' });
      return;
    }
    popup.document.write(renderStatementDocument(statementData));
    popup.document.close();
    popup.focus();
    popup.print();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Button
                variant="ghost"
                onClick={() => setLocation('/admin')}
                className="mr-4"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back to Admin
              </Button>
              <h1 className="text-2xl font-bold text-gray-900">Commission Management</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {(focusMemberId || focusCommissionId) && (
          <Card className="mb-6 border-blue-200 bg-blue-50/50">
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <p className="text-sm text-blue-900">
                Focused view{focusMemberId ? ` for member #${focusMemberId}` : ''}{focusCommissionId ? ` and commission ${focusCommissionId}` : ''}.
              </p>
              <Button size="sm" variant="outline" onClick={() => setLocation('/admin/commissions')}>
                Clear Focus
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Unpaid</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${totalUnpaid.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">{unpaidCommissions.length} commissions</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">${totalPaid.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">{paidCommissions.length} commissions</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Scheduled Payments</CardTitle>
              <Clock className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">${totalScheduled.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">{scheduledCommissions.length} upcoming</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Selected for Payment</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${selectedTotal.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">{selectedCommissions.size} selected</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Individual / Family Business</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">${businessMix.individualFamily.amount.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">{businessMix.individualFamily.count} commissions</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Group Business</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">${businessMix.group.amount.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">{businessMix.group.count} commissions</p>
            </CardContent>
          </Card>
        </div>

        {!!lifecycleAlerts && (
          <Card className="mb-8 border-orange-200 bg-orange-50/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                Recurring Lifecycle Alerts (Next {lifecycleAlerts.horizonDays} Days)
              </CardTitle>
              <div className="mt-2 flex flex-wrap gap-2">
                {LIFECYCLE_ALERT_LEGEND.map((kind) => (
                  <span key={kind} className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getLifecycleAlertBadgeClasses(kind)}`}>
                    {getLifecycleAlertLabel(kind)}
                  </span>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="space-y-1">
                  <div className="font-semibold text-gray-900">Member Billing</div>
                  <div>Due Soon: <span className="font-medium">{lifecycleAlerts.billing.dueSoon}</span></div>
                  <div>Overdue: <span className="font-medium text-red-700">{lifecycleAlerts.billing.overdue}</span></div>
                  <div>Failed: <span className="font-medium text-red-700">{lifecycleAlerts.billing.failed}</span></div>
                  <div>Stale Pending: <span className="font-medium">{lifecycleAlerts.billing.stalePending}</span></div>
                </div>
                <div className="space-y-1">
                  <div className="font-semibold text-gray-900">Commission Payouts</div>
                  <div>Due Soon: <span className="font-medium">{lifecycleAlerts.commissions.dueSoon}</span></div>
                  <div>Overdue: <span className="font-medium text-red-700">{lifecycleAlerts.commissions.overdue}</span></div>
                  <div>Unscheduled: <span className="font-medium text-red-700">{lifecycleAlerts.commissions.unscheduled}</span></div>
                  <div>Pending Total: <span className="font-medium">{lifecycleAlerts.commissions.pending}</span></div>
                </div>
                <div className="space-y-2">
                  <div className="font-semibold text-gray-900">Attention Required</div>
                  <Badge variant={lifecycleAlerts.totals.totalAttention > 0 ? 'destructive' : 'secondary'}>
                    {lifecycleAlerts.totals.totalAttention} Active Alerts
                  </Badge>
                  <div className="text-xs text-gray-600">
                    Next Billing Cycle: {lifecycleAlerts.billing.nextCycleDate ? format(new Date(lifecycleAlerts.billing.nextCycleDate), 'MMM dd, yyyy') : 'N/A'}
                  </div>
                  <div className="text-xs text-gray-600">
                    Next Payout Eligibility: {lifecycleAlerts.commissions.nextEligibleDate ? format(new Date(lifecycleAlerts.commissions.nextEligibleDate), 'MMM dd, yyyy') : 'N/A'}
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-lg border border-orange-100 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-2">Top Billing Alerts</p>
                  {(lifecycleAlerts.billingItems || []).slice(0, 4).length > 0 ? (
                    <div className="space-y-2">
                      {(lifecycleAlerts.billingItems || []).slice(0, 4).map((item, idx) => (
                        <button
                          key={`${item.kind}-${item.memberId}-${idx}`}
                          type="button"
                          onClick={() => setLocation(`/admin/enrollments?memberId=${item.memberId}&alertType=${item.kind}`)}
                          className="w-full text-sm flex items-center justify-between gap-3 rounded px-2 py-1 text-left hover:bg-orange-50"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 truncate">{item.memberLabel}</p>
                            <p className="text-xs">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${getLifecycleAlertBadgeClasses(item.kind)}`}>
                                {getLifecycleAlertLabel(item.kind)}
                              </span>
                            </p>
                          </div>
                          <span className="text-xs text-gray-500 whitespace-nowrap">
                            {item.referenceDate ? format(new Date(item.referenceDate), 'MMM d') : 'N/A'}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No billing alerts in the selected horizon.</p>
                  )}
                </div>
                <div className="rounded-lg border border-orange-100 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-2">Top Commission Alerts</p>
                  {(lifecycleAlerts.commissionItems || []).slice(0, 4).length > 0 ? (
                    <div className="space-y-2">
                      {(lifecycleAlerts.commissionItems || []).slice(0, 4).map((item, idx) => (
                        <button
                          key={`${item.kind}-${item.commissionId}-${idx}`}
                          type="button"
                          onClick={() => setLocation(`/admin/commissions?memberId=${item.memberId}&commissionId=${item.commissionId}&alertType=${item.kind}`)}
                          className="w-full text-sm flex items-center justify-between gap-3 rounded px-2 py-1 text-left hover:bg-orange-50"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 truncate">{item.memberLabel}</p>
                            <p className="text-xs text-gray-500 flex items-center gap-2">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${getLifecycleAlertBadgeClasses(item.kind)}`}>
                                {getLifecycleAlertLabel(item.kind)}
                              </span>
                              <span>${item.amount.toFixed(2)}</span>
                            </p>
                          </div>
                          <span className="text-xs text-gray-500 whitespace-nowrap">
                            {item.referenceDate ? format(new Date(item.referenceDate), 'MMM d') : 'N/A'}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No commission alerts in the selected horizon.</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Payment Action Card */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Process Payment (Legacy Disabled)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <Label htmlFor="paymentDate">Payment Date</Label>
                <Input
                  id="paymentDate"
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-2">
                  Direct pay is disabled. Use payout batches: Sync Ledger, Generate Draft Payout Batches, Export, then Mark Paid.
                </p>
              </div>
              <Button
                onClick={handleMarkAsPaid}
                disabled={true}
                className="mb-0"
              >
                Use Batch Workflow
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Date Filters */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Filter by Date Range</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <Label htmlFor="startDate">Start Date (Sunday)</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={dateFilter.startDate}
                  onChange={(e) => setDateFilter(prev => ({ ...prev, startDate: e.target.value }))}
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="endDate">End Date (Saturday)</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={dateFilter.endDate}
                  onChange={(e) => setDateFilter(prev => ({ ...prev, endDate: e.target.value }))}
                />
              </div>
              <Button onClick={handleQuickSelectWeek} variant="outline">
                Current Week
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Statements & Accounting Export</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Agent</Label>
                <Select value={statementAgentId} onValueChange={setStatementAgentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Agents" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Agents</SelectItem>
                    {availableAgents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name} ({agent.writingNumber})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Statement Status</Label>
                <Select
                  value={statementStatus}
                  onValueChange={(value: 'all' | 'paid' | 'scheduled' | 'unpaid') => setStatementStatus(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="unpaid">Unpaid</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button onClick={() => setIsStatementOpen(true)}>
                  <FileText className="h-4 w-4 mr-2" />
                  Generate Statement
                </Button>
                <Button variant="outline" onClick={handleExportQuickBooksCsv}>
                  <Download className="h-4 w-4 mr-2" />
                  Export QuickBooks CSV
                </Button>
                <Button variant="outline" onClick={handleExportHexonaCsv}>
                  <Download className="h-4 w-4 mr-2" />
                  Export Hexona CSV
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Recurring Commission Payout Ledger</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div className="rounded border p-3 bg-white">
                <p className="text-xs text-gray-500">Next Payout Date</p>
                <p className="text-lg font-semibold">{payoutDashboard?.nextPayoutDate ? format(new Date(payoutDashboard.nextPayoutDate), 'MM/dd/yyyy') : 'N/A'}</p>
              </div>
              <div className="rounded border p-3 bg-white">
                <p className="text-xs text-gray-500">Total Payable</p>
                <p className="text-lg font-semibold">${Number(payoutDashboard?.totalPayableAmount || 0).toFixed(2)}</p>
              </div>
              <div className="rounded border p-3 bg-white">
                <p className="text-xs text-gray-500">Agents To Pay</p>
                <p className="text-lg font-semibold">{payoutDashboard?.totalAgents || 0}</p>
              </div>
              <div className="rounded border p-3 bg-white">
                <p className="text-xs text-gray-500">New / Renewal / Adj-Reversal / Cancellation</p>
                <p className="text-sm font-semibold">
                  {(payoutDashboard?.counts?.new || 0)} / {(payoutDashboard?.counts?.renewal || 0)} / {(payoutDashboard?.counts?.adjustmentOrReversal || 0)} / {(payoutDashboard?.counts?.cancellations || 0)}
                </p>
              </div>
            </div>

            <div className="flex gap-2 mb-4">
              <Button variant="outline" onClick={() => syncLedgerMutation.mutate()} disabled={syncLedgerMutation.isPending || isPayoutDashboardLoading}>
                {syncLedgerMutation.isPending ? 'Syncing...' : 'Sync Ledger From Existing Commissions'}
              </Button>
              <Button onClick={() => generateBatchesMutation.mutate()} disabled={generateBatchesMutation.isPending || isPayoutDashboardLoading}>
                {generateBatchesMutation.isPending ? 'Generating...' : 'Generate Draft Payout Batches'}
              </Button>
            </div>

            {(payoutDashboard?.draftBatches || []).length === 0 ? (
              <p className="text-sm text-gray-500">No draft or export-ready payout batches yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Cutoff</TableHead>
                    <TableHead>Scheduled Pay Date</TableHead>
                    <TableHead>Records</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(payoutDashboard?.draftBatches || []).map((batch) => (
                    <TableRow key={batch.id}>
                      <TableCell className="font-medium">{batch.batch_name}</TableCell>
                      <TableCell>{batch.batch_type}</TableCell>
                      <TableCell>{batch.cutoff_date}</TableCell>
                      <TableCell>{batch.scheduled_pay_date}</TableCell>
                      <TableCell>{batch.total_records} ({batch.total_agents} agents)</TableCell>
                      <TableCell>${Number(batch.total_amount || 0).toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant={batch.status === 'paid' ? 'secondary' : 'outline'}>{batch.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedBatchId(batch.id);
                              setIsBatchDetailOpen(true);
                            }}
                          >
                            View
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleExportBatchCsv(batch.id, 'quickbooks-csv')}>
                            QB CSV
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleExportBatchCsv(batch.id, 'hexona-csv')}>
                            Hexona CSV
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => markBatchPaidMutation.mutate(batch.id)}
                            disabled={markBatchPaidMutation.isPending || batch.status === 'paid'}
                          >
                            Mark Paid
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Commission Table with Tabs */}
        <Card>
          <CardHeader>
            <CardTitle>Commission Details</CardTitle>
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              These legacy commission records are historical only. Legacy direct-pay routes are disabled. Use the ledger batch workflow above for scheduling, export, and payment actions.
            </p>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="all" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="all">All ({safeCommissions.length})</TabsTrigger>
                <TabsTrigger value="unpaid">Unpaid ({unpaidCommissions.length})</TabsTrigger>
                <TabsTrigger value="scheduled">Scheduled ({scheduledCommissions.length})</TabsTrigger>
                <TabsTrigger value="paid">Paid ({paidCommissions.length})</TabsTrigger>
              </TabsList>

              {/* All Commissions Tab */}
              <TabsContent value="all">
                {safeCommissions.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={unpaidCommissions.length > 0 && selectedCommissions.size === unpaidCommissions.length}
                            onCheckedChange={handleSelectAll}
                          />
                        </TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Agent</TableHead>
                        <TableHead>Member</TableHead>
                        <TableHead>Group</TableHead>
                        <TableHead>Member ID</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Membership Fee</TableHead>
                        <TableHead>Commission</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Payment Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {safeCommissions.map((commission) => (
                        <TableRow key={commission.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedCommissions.has(commission.id)}
                              onCheckedChange={(checked) => handleSelectCommission(commission.id, checked as boolean)}
                              disabled={commission.paymentStatus === 'paid'}
                            />
                          </TableCell>
                          <TableCell>
                            {format(new Date(commission.createdAt), "MM/dd/yyyy")}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{commission.agentNumber || commission.agentId.slice(0, 8)}</TableCell>
                          <TableCell>{commission.userName}</TableCell>
                          <TableCell>{commission.groupName || '-'}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {commission.memberId ? `#${commission.memberId}` : '-'}
                            {commission.membershipId && (
                              <div className="text-[11px] text-gray-500">Customer: {commission.membershipId}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{commission.planName || commission.coverageType}</Badge>
                          </TableCell>
                          <TableCell className="font-semibold">
                            ${Number(commission.membershipFee || commission.totalPlanCost || 0).toFixed(2)}
                          </TableCell>
                          <TableCell className="font-semibold">
                            ${commission.commissionAmount.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            {commission.paymentStatus === 'paid' ? (
                              <Badge className="bg-green-100 text-green-800">Paid</Badge>
                            ) : (
                              <Badge className="bg-yellow-100 text-yellow-800">Unpaid</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {commission.paymentDate
                              ? format(new Date(commission.paymentDate), "MM/dd/yyyy")
                              : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-gray-500">No commissions found for the selected date range.</p>
                  </div>
                )}
              </TabsContent>

              {/* Unpaid Commissions Tab */}
              <TabsContent value="unpaid">
                {unpaidCommissions.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={unpaidCommissions.length > 0 && selectedCommissions.size === unpaidCommissions.length}
                            onCheckedChange={handleSelectAll}
                          />
                        </TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Agent</TableHead>
                        <TableHead>Member</TableHead>
                        <TableHead>Group</TableHead>
                        <TableHead>Member ID</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Membership Fee</TableHead>
                        <TableHead>Commission</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unpaidCommissions.map((commission) => (
                        <TableRow key={commission.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedCommissions.has(commission.id)}
                              onCheckedChange={(checked) => handleSelectCommission(commission.id, checked as boolean)}
                            />
                          </TableCell>
                          <TableCell>
                            {format(new Date(commission.createdAt), "MM/dd/yyyy")}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{commission.agentNumber || commission.agentId.slice(0, 8)}</TableCell>
                          <TableCell>{commission.userName}</TableCell>
                          <TableCell>{commission.groupName || '-'}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {commission.memberId ? `#${commission.memberId}` : '-'}
                            {commission.membershipId && (
                              <div className="text-[11px] text-gray-500">Customer: {commission.membershipId}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{commission.planName || commission.coverageType}</Badge>
                          </TableCell>
                          <TableCell className="font-semibold">
                            ${Number(commission.membershipFee || commission.totalPlanCost || 0).toFixed(2)}
                          </TableCell>
                          <TableCell className="font-semibold">
                            ${commission.commissionAmount.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-gray-500">No unpaid commissions found.</p>
                  </div>
                )}
              </TabsContent>

              {/* Scheduled Payments Tab */}
              <TabsContent value="scheduled">
                {scheduledCommissions.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Scheduled Date</TableHead>
                        <TableHead>Agent</TableHead>
                        <TableHead>Member</TableHead>
                        <TableHead>Group</TableHead>
                        <TableHead>Member ID</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Membership Fee</TableHead>
                        <TableHead>Commission</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scheduledCommissions.map((commission) => (
                        <TableRow key={commission.id}>
                          <TableCell>
                            {commission.paymentDate && (
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4 text-blue-600" />
                                {format(new Date(commission.paymentDate), "MM/dd/yyyy")}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{commission.agentNumber || commission.agentId.slice(0, 8)}</TableCell>
                          <TableCell>{commission.userName}</TableCell>
                          <TableCell>{commission.groupName || '-'}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {commission.memberId ? `#${commission.memberId}` : '-'}
                            {commission.membershipId && (
                              <div className="text-[11px] text-gray-500">Customer: {commission.membershipId}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{commission.planName || commission.coverageType}</Badge>
                          </TableCell>
                          <TableCell className="font-semibold">
                            ${Number(commission.membershipFee || commission.totalPlanCost || 0).toFixed(2)}
                          </TableCell>
                          <TableCell className="font-semibold">
                            ${commission.commissionAmount.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-gray-500">No scheduled payments found.</p>
                  </div>
                )}
              </TabsContent>

              {/* Paid Commissions Tab */}
              <TabsContent value="paid">
                {paidCommissions.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Payment Date</TableHead>
                        <TableHead>Agent</TableHead>
                        <TableHead>Member</TableHead>
                        <TableHead>Group</TableHead>
                        <TableHead>Member ID</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Membership Fee</TableHead>
                        <TableHead>Commission</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paidCommissions.map((commission) => (
                        <TableRow key={commission.id}>
                          <TableCell>
                            {commission.paymentDate ? (
                              <div className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-green-600" />
                                {format(new Date(commission.paymentDate), "MM/dd/yyyy")}
                              </div>
                            ) : '-'}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{commission.agentNumber || commission.agentId.slice(0, 8)}</TableCell>
                          <TableCell>{commission.userName}</TableCell>
                          <TableCell>{commission.groupName || '-'}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {commission.memberId ? `#${commission.memberId}` : '-'}
                            {commission.membershipId && (
                              <div className="text-[11px] text-gray-500">Customer: {commission.membershipId}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{commission.planName || commission.coverageType}</Badge>
                          </TableCell>
                          <TableCell className="font-semibold text-green-600">
                            ${Number(commission.membershipFee || commission.totalPlanCost || 0).toFixed(2)}
                          </TableCell>
                          <TableCell className="font-semibold text-green-600">
                            ${commission.commissionAmount.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-gray-500">No paid commissions found.</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Dialog open={isStatementOpen} onOpenChange={setIsStatementOpen}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Agent Commission Statement</DialogTitle>
              <DialogDescription>
                Statement-ready view for payout period {dateFilter.startDate} to {dateFilter.endDate}
              </DialogDescription>
            </DialogHeader>

            {isStatementLoading ? (
              <div className="py-10 flex justify-center">
                <LoadingSpinner />
              </div>
            ) : !statementData ? (
              <p className="text-sm text-gray-500">No statement data available.</p>
            ) : (
              <div className="space-y-6">
                <div className="rounded-lg border p-4 bg-white">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <h3 className="text-xl font-semibold">Agent Commission Statement</h3>
                      <p className="text-sm text-gray-600">{statementData.fromCompany.name}</p>
                      <p className="text-sm text-gray-600">{statementData.fromCompany.address}</p>
                    </div>
                    <div className="text-sm text-right">
                      <p><span className="font-medium">Statement Date:</span> {format(new Date(statementData.statementDate), "MM/dd/yyyy")}</p>
                      <p><span className="font-medium">Payout Period:</span> {statementData.payoutPeriod.startDate} to {statementData.payoutPeriod.endDate}</p>
                      <p><span className="font-medium">Statement #:</span> {statementData.statementNumber || 'N/A'}</p>
                      <p><span className="font-medium">Batch ID:</span> {statementData.payoutBatchId || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border p-4 bg-white text-sm">
                  <p><span className="font-medium">Agent:</span> {statementData.agent?.fullName || 'N/A'}</p>
                  <p><span className="font-medium">Writing Number:</span> {statementData.agent?.writingNumber || 'N/A'}</p>
                  <p><span className="font-medium">Contact:</span> {statementData.agent?.email || 'N/A'}{statementData.agent?.phone ? ` | ${statementData.agent.phone}` : ''}</p>
                  <p><span className="font-medium">Address:</span> {statementData.agent?.address || 'N/A'}</p>
                </div>

                <div className="rounded-lg border bg-white">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Member Name</TableHead>
                        <TableHead>Member ID</TableHead>
                        <TableHead>Effective Date</TableHead>
                        <TableHead>Membership Tier</TableHead>
                        <TableHead>Coverage Type</TableHead>
                        <TableHead className="text-right">Commission Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(statementData.lineItems || []).map((item) => (
                        <TableRow key={item.commissionId}>
                          <TableCell>{item.memberName}</TableCell>
                          <TableCell>{item.memberId || '-'}</TableCell>
                          <TableCell>{item.effectiveDate ? format(new Date(item.effectiveDate), 'MM/dd/yyyy') : '-'}</TableCell>
                          <TableCell>{item.membershipTier || '-'}</TableCell>
                          <TableCell>{item.coverageType || '-'}</TableCell>
                          <TableCell className="text-right font-semibold">${Number(item.commissionAmount || 0).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="ml-auto w-full max-w-sm rounded-lg border bg-white p-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span>Subtotal</span><span>${Number(statementData.subtotal || 0).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Adjustments / Chargebacks</span><span>${Number(statementData.adjustments || 0).toFixed(2)}</span></div>
                  <div className="flex justify-between font-bold border-t pt-2"><span>Total Payout</span><span>${Number(statementData.totalPayout || 0).toFixed(2)}</span></div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={openStatementPrintWindow}>
                    <Printer className="h-4 w-4 mr-2" />
                    Print
                  </Button>
                  <Button onClick={openStatementPrintWindow}>
                    <Download className="h-4 w-4 mr-2" />
                    Download PDF
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={isBatchDetailOpen} onOpenChange={setIsBatchDetailOpen}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Payout Batch Detail</DialogTitle>
              <DialogDescription>
                Review line items before export and mark-paid actions.
              </DialogDescription>
            </DialogHeader>

            {isBatchDetailLoading ? (
              <div className="py-10 flex justify-center">
                <LoadingSpinner />
              </div>
            ) : !selectedBatchDetail ? (
              <p className="text-sm text-gray-500">No batch details found.</p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                  <div className="rounded border p-3"><span className="font-medium">Batch:</span> {selectedBatchDetail.batch.batch_name}</div>
                  <div className="rounded border p-3"><span className="font-medium">Type:</span> {selectedBatchDetail.batch.batch_type}</div>
                  <div className="rounded border p-3"><span className="font-medium">Cutoff:</span> {selectedBatchDetail.batch.cutoff_date}</div>
                  <div className="rounded border p-3"><span className="font-medium">Pay Date:</span> {selectedBatchDetail.batch.scheduled_pay_date}</div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Member ID</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead>Coverage</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Cancellation</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(selectedBatchDetail.rows || []).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.member_name}</TableCell>
                        <TableCell>{row.member_id || '-'}</TableCell>
                        <TableCell>{row.membership_tier || '-'}</TableCell>
                        <TableCell>{row.coverage_type || '-'}</TableCell>
                        <TableCell>{row.commission_type}</TableCell>
                        <TableCell>{row.status}</TableCell>
                        <TableCell>
                          {row.cancellation_date
                            ? `${row.cancellation_date}${row.cancellation_reason ? ` (${row.cancellation_reason})` : ''}`
                            : '-'}
                        </TableCell>
                        <TableCell className="text-right font-semibold">${Number(row.commission_amount || 0).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {isAdminUser && Array.isArray(selectedBatchDetail.carryForwardCandidates) && selectedBatchDetail.carryForwardCandidates.length > 0 && (
                  <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-4">
                    <div className="text-sm font-semibold text-amber-900">Carry-Forward / Under-Minimum Overrides</div>
                    <p className="text-xs text-amber-800">
                      Admin and super-admin can manually release under-minimum rows. Every action requires a reason and is audit logged.
                    </p>
                    <div className="space-y-3">
                      {selectedBatchDetail.carryForwardCandidates.map((candidate) => (
                        <div key={`${candidate.agentId}-${candidate.rowCount}`} className="rounded border bg-white p-3 text-sm">
                          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                            <div><span className="font-medium">Agent:</span> {candidate.agentName}</div>
                            <div><span className="font-medium">Carry Forward Total:</span> ${Number(candidate.currentCarryForwardTotal || 0).toFixed(2)}</div>
                            <div><span className="font-medium">Rows:</span> {candidate.rowCount}</div>
                            <div><span className="font-medium">Resulting Payout:</span> ${Number(candidate.resultingPayoutAmount || 0).toFixed(2)}</div>
                            <div className="flex justify-start md:justify-end">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedCarryForwardCandidate(candidate);
                                  setOverrideReason('');
                                  setIsOverrideConfirmOpen(true);
                                }}
                              >
                                Release Under-Minimum
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={isOverrideConfirmOpen} onOpenChange={setIsOverrideConfirmOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Confirm Under-Minimum Release</DialogTitle>
              <DialogDescription>
                This action will release carry-forward rows into payable status and create an audit event.
              </DialogDescription>
            </DialogHeader>

            {!selectedCarryForwardCandidate ? (
              <p className="text-sm text-gray-500">No carry-forward candidate selected.</p>
            ) : (
              <div className="space-y-4 text-sm">
                <div className="rounded border p-3 bg-white space-y-1">
                  <div><span className="font-medium">Agent:</span> {selectedCarryForwardCandidate.agentName}</div>
                  <div><span className="font-medium">Current Carry-Forward Total:</span> ${Number(selectedCarryForwardCandidate.currentCarryForwardTotal || 0).toFixed(2)}</div>
                  <div><span className="font-medium">Rows Being Released:</span> {selectedCarryForwardCandidate.rowCount}</div>
                  <div><span className="font-medium">Resulting Payout Amount:</span> ${Number(selectedCarryForwardCandidate.resultingPayoutAmount || 0).toFixed(2)}</div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="overrideReason">Reason (required)</Label>
                  <Input
                    id="overrideReason"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Enter reason for manual under-minimum release"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsOverrideConfirmOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      if (!selectedBatchId || !selectedCarryForwardCandidate) return;
                      overrideCarryForwardMutation.mutate({
                        batchId: selectedBatchId,
                        agentId: selectedCarryForwardCandidate.agentId,
                        reason: overrideReason.trim(),
                      });
                    }}
                    disabled={overrideCarryForwardMutation.isPending || !overrideReason.trim()}
                  >
                    {overrideCarryForwardMutation.isPending ? 'Releasing...' : 'Confirm Release'}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
