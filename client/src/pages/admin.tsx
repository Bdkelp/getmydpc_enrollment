import { useEffect, useState, ChangeEvent, FormEvent } from "react";
import AppShell from "@/components/AppShell";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { isUnauthorizedError } from "@/lib/authUtils";
import { hasAtLeastRole, isSuperAdmin as isSuperAdminRole } from "@/lib/roles";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { AdminCreateUserDialog } from "@/components/admin-create-user-dialog";
import DashboardStats from "@/components/DashboardStats";
import EPXHostedPayment from "@/components/EPXHostedPayment";
import { 
  Users, 
  DollarSign, 
  UserPlus, 
  UserX, 
  Search, 
  Download,
  Plus,
  TrendingUp,
  Heart,
  CheckCircle,
  XCircle,
  Clock,
  Shield,
  Lock,
  BarChart,
  User,
  FileText,
  AlertTriangle,
  Target,
  Bell
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { format, formatDistanceToNow } from "date-fns";
import { supabase } from "@/lib/supabase";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getDefaultAvatar, getUserInitials } from "@/lib/avatarUtils";
import { LIFECYCLE_ALERT_LEGEND, getLifecycleAlertBadgeClasses, getLifecycleAlertLabel } from "@/lib/lifecycleAlertUi";
import { Switch } from "@/components/ui/switch";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { WelcomeCard } from "@/components/admin/WelcomeCard";
import { LifecycleAlertsCard } from "@/components/admin/LifecycleAlertsCard";
import { PendingApprovalsCard } from "@/components/admin/PendingApprovalsCard";
import { SystemActivityCard } from "@/components/admin/SystemActivityCard";
import { AdminQuickActions } from "@/components/admin/AdminQuickActions";
import { AdminUsersTableCard } from "@/components/admin/AdminUsersTableCard";
import { AdminUserDialogs } from "@/components/admin/AdminUserDialogs";
import { PartnerLeadDialog } from "@/components/admin/PartnerLeadDialog";
import { RecurringBillingDialogs } from "@/components/admin/RecurringBillingDialogs";
import { AdminConfirmationDialogs } from "@/components/admin/AdminConfirmationDialogs";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";

// Type definitions for API responses
interface AdminStats {
  totalUsers: number;
  monthlyRevenue: number;
  individualMonthlyRevenue?: number;
  familyMonthlyRevenue?: number;
  groupMonthlyRevenue?: number;
  newEnrollments: number;
  churnRate: number;
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

interface UserData {
  users: any[];
  totalCount: number;
}

interface PendingUser {
  id: string;
  email: string;
  created_at: string;
  [key: string]: any;
}

type PaymentEnvironmentValue = 'sandbox' | 'production';

interface PaymentEnvironmentResponse {
  success: boolean;
  environment: PaymentEnvironmentValue;
  updatedAt: string | null;
  updatedBy: string | null;
  allowed?: PaymentEnvironmentValue[];
  previousEnvironment?: PaymentEnvironmentValue;
}

interface RecurringDuePreviewRow {
  subscriptionId: number;
  memberId: number;
  memberOrAccountName: string;
  payerType: 'member' | 'group';
  amount: number;
  nextBillingDate: string | null;
  readinessState: string;
  skipReason: string | null;
  chargeAttemptResult: string | null;
}

interface RecurringWorkflowResponse {
  success: boolean;
  mode: 'preview' | 'live';
  run?: {
    startedAt: string;
    completedAt: string;
    mode: string;
    metrics?: {
      processed: number;
      skipped: number;
      errors: number;
    };
  };
  duePreview?: {
    dueCount: number;
    rows: RecurringDuePreviewRow[];
    estimatedCommissionImpact: {
      potentialSuccessfulPayments: number;
      estimatedCommissionEntries: number;
      note: string;
    };
    note: string;
  };
  dueRows?: RecurringDuePreviewRow[];
  billingSummary?: {
    totalDue: number;
    processed: number;
    succeeded: number;
    failed: number;
    skipped: number;
  };
  commissionSummary?: {
    successfulPaymentsThatCreatedCommissionEntries: number;
    totalCommissionEntriesCreated: number;
    payoutBatchesAffectedGenerated: Array<{
      id: string;
      batchName: string;
      totalRecords: number;
      totalAmount: number;
    }>;
    membersOrAccountsWithNoCommissionBecausePaymentFailedSkipped: Array<{
      memberId: number;
      memberOrAccountName: string;
      payerType: 'member' | 'group';
      reason: string;
    }>;
  };
}

type PartnerLeadStatus = 'new' | 'contacted' | 'qualified' | 'enrolled' | 'closed_lost';
type PartnerLeadStatusFilter = PartnerLeadStatus | 'all';

interface PartnerLeadAdminNote {
  id: string;
  message: string;
  createdAt: string;
  createdBy?: string | null;
}

interface PartnerLeadRecord {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message?: string | null;
  status: string;
  agencyName: string;
  agencyWebsite?: string | null;
  statesServed?: string | null;
  experienceLevel?: string | null;
  volumeEstimate?: string | null;
  createdAt?: string;
  updatedAt?: string;
  adminNotes?: PartnerLeadAdminNote[];
}

interface PartnerLeadResponse {
  leads: PartnerLeadRecord[];
  total: number;
  filter: string;
  timestamp: string;
}

const PARTNER_LEAD_STATUS_VALUES: PartnerLeadStatus[] = ['new', 'contacted', 'qualified', 'enrolled', 'closed_lost'];

const PARTNER_LEAD_STATUS_OPTIONS: { value: PartnerLeadStatusFilter; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'enrolled', label: 'Enrolled' },
  { value: 'closed_lost', label: 'Closed - Lost' },
];

const PARTNER_LEAD_STATUS_LABELS: Record<PartnerLeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  enrolled: 'Enrolled',
  closed_lost: 'Closed - Lost',
};

const PARTNER_LEAD_STATUS_BADGE_CLASSES: Record<PartnerLeadStatus, string> = {
  new: 'bg-blue-100 text-blue-700',
  contacted: 'bg-amber-100 text-amber-700',
  qualified: 'bg-sky-100 text-sky-700',
  enrolled: 'bg-emerald-100 text-emerald-700',
  closed_lost: 'bg-gray-200 text-gray-700',
};
const ENROLLMENT_RECORD_VIEW_KEY = "adminEnrollmentRecordsView";

const isPartnerLeadStatus = (value: string): value is PartnerLeadStatus =>
  PARTNER_LEAD_STATUS_VALUES.includes(value as PartnerLeadStatus);

const MANUAL_TRANSACTION_TYPES = [
  { value: "CCE1", label: "Initial Capture (CCE1)", description: "Purchase auth & capture" },
  { value: "CCE9", label: "Refund (CCE9)", description: "Return capture" },
] as const;

const getManualTranLabel = (value: string) => {
  const match = MANUAL_TRANSACTION_TYPES.find((option) => option.value === value);
  return match ? match.label : value;
};

export default function Admin() {
  const { toast } = useToast();
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const isAdminUser = hasAtLeastRole(user?.role, "admin");
  const isSuperAdmin = isSuperAdminRole(user?.role);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [assignAgentNumberDialog, setAssignAgentNumberDialog] = useState<{ open: boolean; userId: string; currentNumber: string | null }>({ open: false, userId: '', currentNumber: null });
  const [agentNumberInput, setAgentNumberInput] = useState('');
  const [createUserDialogOpen, setCreateUserDialogOpen] = useState(false);
  const [editUserDialog, setEditUserDialog] = useState<{ open: boolean; user: any | null }>({ open: false, user: null });
  const [editFormData, setEditFormData] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [manualTransactionForm, setManualTransactionForm] = useState({
    memberId: '',
    transactionId: '',
    authGuid: '',
    amount: '',
    description: 'Manual EPX action from dashboard',
    tranType: MANUAL_TRANSACTION_TYPES[0].value,
  });
  const [manualTransactionResult, setManualTransactionResult] = useState<any | null>(null);
  const [cancelSubscriptionForm, setCancelSubscriptionForm] = useState({
    subscriptionId: '',
    transactionId: '',
    reason: 'Subscription cancellation via admin dashboard',
  });
  const [cancelSubscriptionResult, setCancelSubscriptionResult] = useState<any | null>(null);
  const [manualConfirmPayload, setManualConfirmPayload] = useState<{ payload: Record<string, any>; amount: number; tranType: string; memberId?: number } | null>(null);
  const [cancelConfirmPayload, setCancelConfirmPayload] = useState<{ payload: Record<string, any>; subscriptionId?: number; transactionId?: string } | null>(null);
  const [hostedConfirmPayload, setHostedConfirmPayload] = useState<{ memberId: number; amount: number; description?: string; transactionId?: string } | null>(null);
  const [confirmLiveRecurringOpen, setConfirmLiveRecurringOpen] = useState(false);
  const [previewRecurringDialogOpen, setPreviewRecurringDialogOpen] = useState(false);
  const [liveRecurringOutcomeOpen, setLiveRecurringOutcomeOpen] = useState(false);
  const [recurringWorkflowResult, setRecurringWorkflowResult] = useState<RecurringWorkflowResponse | null>(null);
  const [partnerLeadFilter, setPartnerLeadFilter] = useState<PartnerLeadStatusFilter>('all');
  const [selectedPartnerLead, setSelectedPartnerLead] = useState<PartnerLeadRecord | null>(null);
  const [partnerLeadStatusSelection, setPartnerLeadStatusSelection] = useState<PartnerLeadStatus>('new');
  const [partnerLeadNote, setPartnerLeadNote] = useState('');

  const getEnrollmentRecordsRoute = () => {
    const savedView = window.localStorage.getItem(ENROLLMENT_RECORD_VIEW_KEY);
    return savedView === "groups" ? "/admin/groups" : "/admin/enrollments";
  };

  const ensureSuperAdminAccess = (actionLabel: string): boolean => {
    if (isSuperAdmin) {
      return true;
    }

    toast({
      title: 'Super admin access required',
      description: `${actionLabel} is limited to super admins.`,
      variant: 'destructive'
    });
    return false;
  };

  const openHostedCheckoutTab = (url: string) => {
    const hostedWindow = window.open(url, '_blank', 'noopener,noreferrer');
    if (hostedWindow) {
      hostedWindow.focus();
      toast({
        title: 'Hosted checkout opened',
        description: 'Complete the payment in the new tab.'
      });
    } else {
      toast({
        title: 'Allow pop-ups to continue',
        description: `Open this link manually if no tab appeared: ${url}`,
        variant: 'destructive'
      });
    }
  };

  const buildAdminCheckoutUrl = (params: { memberId: number; amount: number; description?: string; transactionId?: string }) => {
    const search = new URLSearchParams({
      memberId: String(params.memberId),
      amount: params.amount.toFixed(2),
      autoLaunch: '1'
    });
    if (params.description) {
      search.set('description', params.description);
    }
    if (params.transactionId) {
      search.set('transactionId', params.transactionId);
    }
    return `/admin/payments/checkout?${search.toString()}`;
  };

  const launchAdminHostedCheckout = (params: { memberId: number; amount: number; description?: string; transactionId?: string }) => {
    const url = buildAdminCheckoutUrl(params);
    openHostedCheckoutTab(url);
  };

  // Test authentication
  useEffect(() => {
    const testAuth = async () => {
      const { getSession } = await import("@/lib/supabase");
      const session = await getSession();
      console.log('[Admin Page] Authentication Test:', {
        hasSession: !!session,
        hasToken: !!session?.access_token,
        tokenPreview: session?.access_token?.substring(0, 30) + '...',
        userEmail: session?.user?.email,
        currentUser: user,
        isAuthenticated
      });
    };
    testAuth();
  }, [user, isAuthenticated]);

  // Redirect if not authenticated or not admin
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/login";
      }, 500);
      return;
    }

    if (!authLoading && user && !isAdminUser) {
      toast({
        title: "Access Denied",
        description: "Admin access required.",
        variant: "destructive",
      });
      return;
    }
  }, [isAuthenticated, authLoading, user, toast]);

  // Set up real-time subscriptions for dashboard data
  useEffect(() => {
    console.log('[AdminDashboard] Setting up real-time subscriptions...');

    // Subscribe to key table changes that affect dashboard stats
    const dashboardSubscription = supabase
      .channel('dashboard-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'users' },
        (payload) => {
          console.log('[AdminDashboard] Users change detected:', payload);
          queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
          queryClient.invalidateQueries({ queryKey: ["/api/admin/revenue"] });
          queryClient.invalidateQueries({ queryKey: ["/api/admin/lifecycle-alerts"] });
          queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-users"] });
          queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }); // Invalidate users query for table updates
        }
      )
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'subscriptions' },
        (payload) => {
          console.log('[AdminDashboard] Subscriptions change detected:', payload);
          queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
          queryClient.invalidateQueries({ queryKey: ["/api/admin/revenue"] });
          queryClient.invalidateQueries({ queryKey: ["/api/admin/lifecycle-alerts"] });
        }
      )
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'payments' },
        (payload) => {
          console.log('[AdminDashboard] Payments change detected:', payload);
          queryClient.invalidateQueries({ queryKey: ["/api/admin/revenue"] });
          queryClient.invalidateQueries({ queryKey: ["/api/admin/lifecycle-alerts"] });
          toast({
            title: "Payment Activity",
            description: "New payment activity detected",
          });
        }
      )
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'commissions' },
        (payload) => {
          console.log('[AdminDashboard] Commissions change detected:', payload);
          queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
          queryClient.invalidateQueries({ queryKey: ["/api/admin/analytics"] });
          queryClient.invalidateQueries({ queryKey: ["/api/admin/data-viewer"] });
          toast({
            title: "Commission Update",
            description: "Commission data has been updated",
          });
        }
      )
      .subscribe();

    return () => {
      console.log('[AdminDashboard] Cleaning up real-time subscriptions...');
      dashboardSubscription.unsubscribe();
    };
  }, [queryClient, toast]);


  const { data: adminStats, isLoading: statsLoading, error: statsError } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
    enabled: isAuthenticated && isAdminUser,
  });

  const { data: lifecycleAlerts } = useQuery<LifecycleAlertSummary>({
    queryKey: ["/api/admin/lifecycle-alerts"],
    enabled: isAuthenticated && isAdminUser,
    queryFn: async () => {
      return apiRequest('/api/admin/lifecycle-alerts?days=7');
    },
    refetchInterval: 60_000,
  });

  // Handle stats error
  useEffect(() => {
    if (statsError && isUnauthorizedError(statsError as Error)) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/login";
      }, 500);
    }
  }, [statsError, toast]);

  const { data: usersData, isLoading: usersLoading, error: usersError, refetch } = useQuery<UserData>({
    queryKey: ["/api/admin/users"],
    enabled: isAuthenticated && isAdminUser,
  });

  // Handle users error
  useEffect(() => {
    if (usersError && isUnauthorizedError(usersError as Error)) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/login";
      }, 500);
    }
  }, [usersError, toast]);

  // Fetch pending users
  const { data: pendingUsers, isLoading: pendingLoading } = useQuery<PendingUser[]>({
    queryKey: ["/api/admin/pending-users"],
    enabled: isAuthenticated && isAdminUser,
  });

  // Fetch all login sessions for monitoring
  const { data: allLoginSessions = [], isLoading: sessionsLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/login-sessions"],
    enabled: isAuthenticated && isAdminUser,
  });

  const { data: paymentEnvironmentDetails, isLoading: paymentEnvironmentLoading } = useQuery<PaymentEnvironmentResponse>({
    queryKey: ["/api/admin/payments/environment"],
    enabled: isAuthenticated && isAdminUser,
  });

  const { data: partnerLeadResponse, isLoading: partnerLeadsLoading } = useQuery<PartnerLeadResponse>({
    queryKey: ["/api/admin/partner-leads", partnerLeadFilter],
    enabled: isAuthenticated && isAdminUser,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (partnerLeadFilter !== 'all') {
        params.set('status', partnerLeadFilter);
      }
      const path = params.size ? `/api/admin/partner-leads?${params.toString()}` : '/api/admin/partner-leads';
      return apiRequest(path);
    },
  });

  const paymentEnvironment = paymentEnvironmentDetails?.environment;
  const isPaymentEnvironmentProduction = paymentEnvironment === 'production';
  const paymentEnvironmentBadgeLabel = paymentEnvironmentLoading
    ? 'Checking...'
    : paymentEnvironmentDetails
      ? (isPaymentEnvironmentProduction ? 'Live Production' : 'Sandbox / Test')
      : 'Unavailable';
  const paymentEnvironmentBadgeClasses = isPaymentEnvironmentProduction
    ? 'bg-emerald-600 text-white hover:bg-emerald-600'
    : 'bg-amber-500 text-white hover:bg-amber-500';
  const paymentEnvironmentButtonTarget: PaymentEnvironmentValue = isPaymentEnvironmentProduction ? 'sandbox' : 'production';
  const paymentEnvironmentButtonLabel = paymentEnvironmentButtonTarget === 'production'
    ? 'Switch to Production'
    : 'Switch to Sandbox';
  let paymentEnvironmentUpdatedText: string | null = null;
  if (paymentEnvironmentDetails?.updatedAt) {
    try {
      paymentEnvironmentUpdatedText = `Updated ${formatDistanceToNow(new Date(paymentEnvironmentDetails.updatedAt), { addSuffix: true })}`;
    } catch {
      paymentEnvironmentUpdatedText = `Updated ${format(new Date(paymentEnvironmentDetails.updatedAt), 'MMM d, h:mm a')}`;
    }

    if (paymentEnvironmentDetails?.updatedBy) {
      paymentEnvironmentUpdatedText += ` by ${paymentEnvironmentDetails.updatedBy}`;
    }
  }
  const environmentAlertTitle = paymentEnvironmentLoading
    ? 'Confirming EPX environment'
    : isPaymentEnvironmentProduction
      ? 'Live EPX controls'
      : 'Sandbox mode active';
  const environmentAlertDescription = paymentEnvironmentLoading
    ? 'Retrieving your current EPX environment before enabling manual controls.'
    : isPaymentEnvironmentProduction
      ? 'Charges, refunds, and voids are transmitted to EPX immediately. Double-check every identifier before continuing.'
      : 'Transactions currently route to the EPX sandbox. Switch to production before running live dollars.';
  const environmentAlertClasses = isPaymentEnvironmentProduction
    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
    : 'border-amber-300 bg-amber-50 text-amber-900';
  const EnvironmentAlertIcon = paymentEnvironmentLoading
    ? Clock
    : (isPaymentEnvironmentProduction ? CheckCircle : AlertTriangle);

  // Approve user mutation
  const approveUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest(`/api/admin/approve-user/${userId}`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      toast({
        title: "User Approved",
        description: "The user has been approved and can now access the platform.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to approve user. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Reject user mutation
  const rejectUserMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason: string }) => {
      return apiRequest(`/api/admin/reject-user/${userId}`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: () => {
      toast({
        title: "User Rejected",
        description: "The user has been rejected.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-users"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reject user. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updatePartnerLeadMutation = useMutation({
    mutationFn: async ({ id, status, adminNote }: { id: number; status: string; adminNote?: string }) => {
      return apiRequest(`/api/admin/partner-leads/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status, adminNote }),
      });
    },
    onSuccess: () => {
      toast({
        title: 'Partner lead updated',
        description: 'Status and notes saved successfully.',
      });
      setSelectedPartnerLead(null);
      setPartnerLeadNote('');
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partner-leads"] });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to update lead',
        description: error?.message || 'Please try again or refresh the page.',
        variant: 'destructive',
      });
    }
  });

  const manualTransactionMutation = useMutation({
    mutationFn: async (payload: Record<string, any>) => {
      return apiRequest('/api/admin/payments/manual-transaction', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (data) => {
      setManualTransactionResult(data);
      toast({
        title: "EPX request submitted",
        description: "Review the response below for details.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Unable to submit",
        description: error?.message || 'Check console for additional details.',
        variant: "destructive",
      });
    },
  });

  const cancelSubscriptionMutation = useMutation({
    mutationFn: async (payload: Record<string, any>) => {
      return apiRequest('/api/admin/payments/cancel-subscription', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (data, variables) => {
      setCancelSubscriptionResult({ ...data, request: variables });
      toast({
        title: 'Cancellation request submitted',
        description: 'Review the response below for EPX confirmation.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Unable to cancel subscription',
        description: error?.message || 'Check console for additional details.',
        variant: 'destructive',
      });
    },
  });

  const updatePaymentEnvironmentMutation = useMutation({
    mutationFn: async (nextEnvironment: PaymentEnvironmentValue) => {
      return apiRequest('/api/admin/payments/environment', {
        method: 'POST',
        body: JSON.stringify({ environment: nextEnvironment }),
      });
    },
    onSuccess: (data: PaymentEnvironmentResponse) => {
      toast({
        title: 'Payment environment updated',
        description: `Environment now set to ${(data?.environment || 'production').toUpperCase()}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payments/environment"] });
    },
    onError: (error: any) => {
      toast({
        title: 'Unable to update environment',
        description: error?.message || 'Check console for additional details.',
        variant: 'destructive',
      });
    },
  });

  const recurringWorkflowMutation = useMutation({
    mutationFn: async (mode: 'preview' | 'live') => {
      return apiRequest('/api/admin/diagnostic/recurring-billing/operator-workflow', {
        method: 'POST',
        body: JSON.stringify({ mode }),
      });
    },
    onSuccess: (data: RecurringWorkflowResponse) => {
      setRecurringWorkflowResult(data);
      const isPreview = data.mode === 'preview';
      const summary = data.billingSummary || {};
      const totalDue = Number(summary.totalDue || 0);
      const succeeded = Number(summary.succeeded || 0);
      const failed = Number(summary.failed || 0);
      const skipped = Number(summary.skipped || 0);

      if (isPreview) {
        setPreviewRecurringDialogOpen(true);
        setLiveRecurringOutcomeOpen(false);
      } else {
        setLiveRecurringOutcomeOpen(true);
        setPreviewRecurringDialogOpen(false);
      }

      toast({
        title: isPreview ? 'Recurring billing preview complete' : 'Recurring billing + commission update complete',
        description: isPreview
          ? (totalDue > 0
            ? `Found ${totalDue} due memberships/accounts in preview. No payments or commissions were created.`
            : 'No due memberships/accounts were found in preview. No payments or commissions were created.')
          : `Live run summary: succeeded ${succeeded}, failed ${failed}, skipped ${skipped}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/lifecycle-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/commissions/payout-dashboard'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Recurring workflow failed',
        description: error?.message || 'Unable to run recurring billing workflow right now.',
        variant: 'destructive',
      });
    },
  });

  const handlePaymentEnvironmentChange = (nextEnvironment: PaymentEnvironmentValue) => {
    if (!ensureSuperAdminAccess('Update payment environment')) {
      return;
    }
    updatePaymentEnvironmentMutation.mutate(nextEnvironment);
  };

  const handlePreviewRecurringBilling = () => {
    setPreviewRecurringDialogOpen(false);
    setLiveRecurringOutcomeOpen(false);
    setRecurringWorkflowResult(null);
    recurringWorkflowMutation.mutate('preview');
  };

  const handleOpenLiveRecurringConfirmation = () => {
    if (!ensureSuperAdminAccess('Run recurring billing + commission update')) {
      return;
    }
    setConfirmLiveRecurringOpen(true);
  };

  const executeLiveRecurringWorkflow = () => {
    if (!ensureSuperAdminAccess('Run recurring billing + commission update')) {
      setConfirmLiveRecurringOpen(false);
      return;
    }
    setConfirmLiveRecurringOpen(false);
    setLiveRecurringOutcomeOpen(false);
    setRecurringWorkflowResult(null);
    recurringWorkflowMutation.mutate('live');
  };

  const previewRows = recurringWorkflowResult?.duePreview?.rows || [];
  const previewDueCount = Number(recurringWorkflowResult?.duePreview?.dueCount || 0);
  const liveBillingSummary = recurringWorkflowResult?.billingSummary;
  const liveCommissionSummary = recurringWorkflowResult?.commissionSummary;

  const handleCopyLiveRecurringSummary = async () => {
    const summaryText = [
      'Recurring Billing Run Summary',
      `Total due: ${Number(liveBillingSummary?.totalDue || 0)}`,
      `Processed: ${Number(liveBillingSummary?.processed || 0)}`,
      `Succeeded: ${Number(liveBillingSummary?.succeeded || 0)}`,
      `Failed: ${Number(liveBillingSummary?.failed || 0)}`,
      `Skipped: ${Number(liveBillingSummary?.skipped || 0)}`,
      `Commission entries created: ${Number(liveCommissionSummary?.totalCommissionEntriesCreated || 0)}`,
    ].join('\n');

    try {
      if (!navigator?.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.writeText(summaryText);
      toast({
        title: 'Run summary copied',
        description: 'Recurring run proof details copied to clipboard.',
      });
    } catch (error: any) {
      toast({
        title: 'Unable to copy summary',
        description: error?.message || 'Copy failed. Please copy values manually from this dialog.',
        variant: 'destructive',
      });
    }
  };

  const handleManualFieldChange = (field: keyof typeof manualTransactionForm) => (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const value = event.target.value;
    setManualTransactionForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleManualTranTypeChange = (value: string) => {
    setManualTransactionForm((prev) => ({ ...prev, tranType: value }));
  };

  const handleManualTransactionSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!ensureSuperAdminAccess('Manual EPX transactions')) {
      return;
    }

    if (
      !manualTransactionForm.memberId.trim() &&
      !manualTransactionForm.transactionId.trim() &&
      !manualTransactionForm.authGuid.trim()
    ) {
      toast({
        title: "Provide member info",
        description: "Enter a member ID, transaction ID, or AUTH GUID before submitting.",
        variant: "destructive",
      });
      return;
    }

    const amountInput = manualTransactionForm.amount.trim();
    if (!amountInput) {
      toast({
        title: "Amount required",
        description: "Sales and refunds must include a dollar amount.",
        variant: "destructive",
      });
      return;
    }

    const parsedAmount = parseFloat(amountInput);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Enter a positive dollar amount.",
        variant: "destructive",
      });
      return;
    }

    const payload: Record<string, any> = {
      tranType: manualTransactionForm.tranType,
      description: manualTransactionForm.description.trim() || undefined,
      amount: parsedAmount,
    };

    if (manualTransactionForm.memberId.trim()) {
      const memberIdNumber = Number(manualTransactionForm.memberId.trim());
      if (!Number.isFinite(memberIdNumber)) {
        toast({
          title: "Invalid member ID",
          description: "Member ID must be numeric.",
          variant: "destructive",
        });
        return;
      }
      payload.memberId = memberIdNumber;
    }

    if (manualTransactionForm.transactionId.trim()) {
      payload.transactionId = manualTransactionForm.transactionId.trim();
    }

    if (manualTransactionForm.authGuid.trim()) {
      payload.authGuid = manualTransactionForm.authGuid.trim();
    }

    setManualTransactionResult(null);

    // For regular transactions, show confirmation dialog
    setManualConfirmPayload({
      payload,
      amount: parsedAmount,
      tranType: manualTransactionForm.tranType,
      memberId: payload.memberId,
    });
  };

  const resetManualTransactionForm = () => {
    setManualTransactionForm({
      memberId: '',
      transactionId: '',
      authGuid: '',
      amount: '',
      description: 'Manual EPX action from dashboard',
      tranType: MANUAL_TRANSACTION_TYPES[0].value,
    });
    setManualTransactionResult(null);
  };

  const handleCancelFieldChange = (field: keyof typeof cancelSubscriptionForm) => (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const value = event.target.value;
    setCancelSubscriptionForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetCancelSubscriptionForm = () => {
    setCancelSubscriptionForm({
      subscriptionId: '',
      transactionId: '',
      reason: 'Subscription cancellation via admin dashboard',
    });
    setCancelSubscriptionResult(null);
  };

  const handleCancelSubscriptionSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!ensureSuperAdminAccess('Subscription cancellations')) {
      return;
    }

    if (
      !cancelSubscriptionForm.subscriptionId.trim() &&
      !cancelSubscriptionForm.transactionId.trim()
    ) {
      toast({
        title: 'Provide subscription context',
        description: 'Enter a subscription ID or reference transaction ID.',
        variant: 'destructive',
      });
      return;
    }

    const payload: Record<string, any> = {};

    if (cancelSubscriptionForm.subscriptionId.trim()) {
      const parsed = Number(cancelSubscriptionForm.subscriptionId.trim());
      if (!Number.isFinite(parsed)) {
        toast({
          title: 'Invalid subscription ID',
          description: 'Subscription ID must be numeric.',
          variant: 'destructive',
        });
        return;
      }
      payload.subscriptionId = parsed;
    }

    if (cancelSubscriptionForm.transactionId.trim()) {
      payload.transactionId = cancelSubscriptionForm.transactionId.trim();
    }

    if (cancelSubscriptionForm.reason.trim()) {
      payload.reason = cancelSubscriptionForm.reason.trim();
    }

    setCancelSubscriptionResult(null);
    setCancelConfirmPayload({
      payload,
      subscriptionId: payload.subscriptionId,
      transactionId: payload.transactionId,
    });
  };

  const executeManualTransaction = () => {
    if (!manualConfirmPayload) {
      return;
    }

    if (!ensureSuperAdminAccess('Manual EPX transactions')) {
      setManualConfirmPayload(null);
      return;
    }

    manualTransactionMutation.mutate(manualConfirmPayload.payload, {
      onSettled: () => setManualConfirmPayload(null),
    });
  };

  const executeCancelSubscription = () => {
    if (!cancelConfirmPayload) {
      return;
    }

    if (!ensureSuperAdminAccess('Subscription cancellations')) {
      setCancelConfirmPayload(null);
      return;
    }

    cancelSubscriptionMutation.mutate(cancelConfirmPayload.payload, {
      onSettled: () => setCancelConfirmPayload(null),
    });
  };

  const handleHostedCheckoutRequest = () => {
    if (!ensureSuperAdminAccess('Hosted checkout launcher')) {
      return;
    }

    const memberIdRaw = manualTransactionForm.memberId.trim();
    if (!memberIdRaw) {
      toast({
        title: 'Member required',
        description: 'Enter the member ID to launch hosted checkout.',
        variant: 'destructive',
      });
      return;
    }

    const memberIdNumber = Number(memberIdRaw);
    if (!Number.isFinite(memberIdNumber)) {
      toast({
        title: 'Invalid member ID',
        description: 'Member ID must be numeric before opening hosted checkout.',
        variant: 'destructive',
      });
      return;
    }

    const parsedAmount = parseFloat(manualTransactionForm.amount || '0');
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast({
        title: 'Invalid amount',
        description: 'Hosted checkout requires a positive USD amount.',
        variant: 'destructive',
      });
      return;
    }

    if (manualTransactionForm.tranType !== 'CCE1') {
      toast({
        title: 'Hosted checkout is for initial captures only',
        description: 'Switch the transaction type to CCE1 to collect a new payment.',
        variant: 'destructive',
      });
      return;
    }

    setHostedConfirmPayload({
      memberId: memberIdNumber,
      amount: parsedAmount,
      description: manualTransactionForm.description.trim() || undefined,
      transactionId: manualTransactionForm.transactionId.trim() || undefined,
    });
  };

  const finalizeHostedCheckoutLaunch = () => {
    if (!hostedConfirmPayload) {
      return;
    }

    if (!ensureSuperAdminAccess('Hosted checkout launcher')) {
      setHostedConfirmPayload(null);
      return;
    }

    launchAdminHostedCheckout({
      memberId: hostedConfirmPayload.memberId,
      amount: hostedConfirmPayload.amount,
      description: hostedConfirmPayload.description,
      transactionId: hostedConfirmPayload.transactionId,
    });
    setHostedConfirmPayload(null);
  };

  if (authLoading || statsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isAuthenticated || !user || !isAdminUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
              <p className="text-gray-600 mb-4">Admin access required to view this page.</p>
              <Button onClick={() => window.location.href = "/"}>
                Return to Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const superAdminRestricted = !isSuperAdmin;

  const stats = [
    {
      icon: Users,
      label: "Total System Users",
      value: adminStats?.totalUsers?.toLocaleString() || "0",
      change: "",
      changeType: "positive",
      bgColor: "bg-blue-100",
      iconColor: "text-blue-600",
    },
    {
      icon: DollarSign,
      label: "Monthly Revenue",
      value: `$${(adminStats?.monthlyRevenue || 0).toLocaleString()}`,
      change: "",
      changeType: "positive",
      bgColor: "bg-green-100",
      iconColor: "text-green-600",
    },
    {
      icon: UserPlus,
      label: "New Enrollments",
      value: (adminStats?.newEnrollments || 0).toLocaleString(),
      change: "",
      changeType: "positive",
      bgColor: "bg-orange-100",
      iconColor: "text-orange-600",
    },
    {
      icon: UserX,
      label: "Churn Rate",
      value: `${adminStats?.churnRate || 0}%`,
      change: "",
      changeType: "negative",
      bgColor: "bg-red-100",
      iconColor: "text-red-600",
    },
  ];

  const partnerLeads = partnerLeadResponse?.leads ?? [];
  const partnerLeadCount = partnerLeadResponse?.total ?? partnerLeads.length;
  const partnerLeadEmptyCopy = partnerLeadFilter !== 'all'
    ? `No partner leads with status ${isPartnerLeadStatus(partnerLeadFilter) ? PARTNER_LEAD_STATUS_LABELS[partnerLeadFilter] : partnerLeadFilter}.`
    : 'No partner leads have been submitted yet.';

  const getPartnerLeadStatusMeta = (status: string) => {
    if (isPartnerLeadStatus(status)) {
      return {
        label: PARTNER_LEAD_STATUS_LABELS[status],
        badgeClass: PARTNER_LEAD_STATUS_BADGE_CLASSES[status],
      };
    }
    return {
      label: status || 'Unknown',
      badgeClass: 'bg-gray-200 text-gray-700',
    };
  };

  const formatExperienceLabel = (value?: string | null) => {
    if (!value) return '—';
    return value
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const formatVolumeEstimate = (value?: string | null) => {
    if (!value) return '—';
    switch (value) {
      case 'under-50':
        return 'Under 50 members';
      case '50-150':
        return '50 – 150 members';
      case '150-400':
        return '150 – 400 members';
      case '400-plus':
        return '400+ members';
      default:
        return value.replace(/-/g, ' ');
    }
  };

  const openPartnerLeadDialog = (lead: PartnerLeadRecord) => {
    setSelectedPartnerLead(lead);
    setPartnerLeadStatusSelection(
      isPartnerLeadStatus(lead.status) ? lead.status : 'new'
    );
    setPartnerLeadNote('');
  };

  const handlePartnerLeadUpdate = async () => {
    if (!selectedPartnerLead) return;
    try {
      await updatePartnerLeadMutation.mutateAsync({
        id: selectedPartnerLead.id,
        status: partnerLeadStatusSelection,
        adminNote: partnerLeadNote.trim() || undefined,
      });
    } catch (error) {
      // Error handling managed inside mutation onError
    }
  };



  return (
    <AppShell title="Admin Dashboard" breadcrumb={["Admin"]}>
      <AdminQuickActions
        enrollmentRecordsRoute={getEnrollmentRecordsRoute()}
        onNavigate={setLocation}
        onCreateUser={() => setCreateUserDialogOpen(true)}
        onPreviewRecurringBilling={handlePreviewRecurringBilling}
        onOpenLiveRecurringConfirmation={handleOpenLiveRecurringConfirmation}
        recurringPending={recurringWorkflowMutation.isPending}
        superAdminRestricted={superAdminRestricted}
        lastRecurringMode={recurringWorkflowResult?.mode}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Personalized Welcome Message */}
        <WelcomeCard user={user} />

        {/* Recurring Lifecycle Alerts */}
        <LifecycleAlertsCard lifecycleAlerts={lifecycleAlerts} />

        {/* Enhanced Dashboard Stats */}
        <DashboardStats userRole="admin" />

        <Card className="mb-8 border border-indigo-200 bg-white shadow-soft">
          <CardContent className="p-6 space-y-6">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-gray-900">Recurring Billing Control Panel</h2>
              <p className="text-sm text-gray-600">
                Use this operator-safe flow to preview due recurring billing, run live billing, and then update commissions in the correct order.
              </p>
            </div>

            <Alert className="border-indigo-200 bg-indigo-50 text-indigo-900">
              <div className="flex gap-3">
                <Shield className="h-5 w-5 mt-0.5" />
                <div>
                  <AlertTitle>Safety note</AlertTitle>
                  <AlertDescription>
                    The system selects all currently due records automatically. Members/accounts cannot be manually chosen for billing from this screen.
                  </AlertDescription>
                </div>
              </div>
            </Alert>

            <div className="flex flex-col gap-3 md:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={handlePreviewRecurringBilling}
                disabled={recurringWorkflowMutation.isPending}
              >
                {recurringWorkflowMutation.isPending ? 'Running preview...' : 'Preview Recurring Billing'}
              </Button>

              <Button
                type="button"
                onClick={handleOpenLiveRecurringConfirmation}
                disabled={recurringWorkflowMutation.isPending || superAdminRestricted}
                className="bg-indigo-600 text-white hover:bg-indigo-700"
              >
                {recurringWorkflowMutation.isPending ? 'Running live workflow...' : 'Run Recurring Billing + Commission Update'}
              </Button>
            </div>

            {recurringWorkflowResult?.mode === 'preview' && (
              <div className="space-y-4 rounded-lg border border-slate-200 p-4">
                <h3 className="text-base font-semibold text-gray-900">Preview Results</h3>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded border bg-slate-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Due member/account count</p>
                    <p className="text-xl font-semibold text-gray-900">{recurringWorkflowResult.duePreview?.dueCount || 0}</p>
                  </div>
                  <div className="rounded border bg-slate-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Potential successful payments</p>
                    <p className="text-xl font-semibold text-gray-900">
                      {recurringWorkflowResult.duePreview?.estimatedCommissionImpact?.potentialSuccessfulPayments || 0}
                    </p>
                  </div>
                  <div className="rounded border bg-slate-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Estimated commission entries</p>
                    <p className="text-xl font-semibold text-gray-900">
                      {recurringWorkflowResult.duePreview?.estimatedCommissionImpact?.estimatedCommissionEntries || 0}
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Member/Account</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">payerType</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Amount</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">next_billing_date</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Readiness State</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {(recurringWorkflowResult.duePreview?.rows || []).map((row) => (
                        <tr key={`preview-${row.subscriptionId}-${row.memberId}`}>
                          <td className="px-3 py-2 text-gray-900">{row.memberOrAccountName}</td>
                          <td className="px-3 py-2 text-gray-700">{row.payerType}</td>
                          <td className="px-3 py-2 text-gray-700">${Number(row.amount || 0).toFixed(2)}</td>
                          <td className="px-3 py-2 text-gray-700">
                            {row.nextBillingDate ? format(new Date(row.nextBillingDate), 'yyyy-MM-dd HH:mm') : 'N/A'}
                          </td>
                          <td className="px-3 py-2 text-gray-700">{row.readinessState}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <Alert className="border-sky-200 bg-sky-50 text-sky-900">
                  <AlertDescription>
                    Preview only. No payments or commissions have been created.
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {recurringWorkflowResult?.mode === 'live' && (
              <div className="space-y-4 rounded-lg border border-emerald-200 p-4">
                <h3 className="text-base font-semibold text-gray-900">Live Run Results</h3>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-600">Billing summary</h4>
                  <div className="grid gap-3 md:grid-cols-5">
                    <div className="rounded border bg-slate-50 p-3">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Total due</p>
                      <p className="text-xl font-semibold text-gray-900">{recurringWorkflowResult.billingSummary?.totalDue || 0}</p>
                    </div>
                    <div className="rounded border bg-slate-50 p-3">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Processed</p>
                      <p className="text-xl font-semibold text-gray-900">{recurringWorkflowResult.billingSummary?.processed || 0}</p>
                    </div>
                    <div className="rounded border bg-slate-50 p-3">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Succeeded</p>
                      <p className="text-xl font-semibold text-emerald-700">{recurringWorkflowResult.billingSummary?.succeeded || 0}</p>
                    </div>
                    <div className="rounded border bg-slate-50 p-3">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Failed</p>
                      <p className="text-xl font-semibold text-red-700">{recurringWorkflowResult.billingSummary?.failed || 0}</p>
                    </div>
                    <div className="rounded border bg-slate-50 p-3">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Skipped</p>
                      <p className="text-xl font-semibold text-amber-700">{recurringWorkflowResult.billingSummary?.skipped || 0}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-600">Commission summary</h4>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded border bg-slate-50 p-3">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Successful payments that created commission entries</p>
                      <p className="text-xl font-semibold text-gray-900">
                        {recurringWorkflowResult.commissionSummary?.successfulPaymentsThatCreatedCommissionEntries || 0}
                      </p>
                    </div>
                    <div className="rounded border bg-slate-50 p-3">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Total commission entries created</p>
                      <p className="text-xl font-semibold text-gray-900">
                        {recurringWorkflowResult.commissionSummary?.totalCommissionEntriesCreated || 0}
                      </p>
                    </div>
                  </div>

                  <div className="rounded border bg-white p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Payout batches affected/generated</p>
                    {(recurringWorkflowResult.commissionSummary?.payoutBatchesAffectedGenerated || []).length > 0 ? (
                      <ul className="space-y-1 text-sm text-gray-700">
                        {(recurringWorkflowResult.commissionSummary?.payoutBatchesAffectedGenerated || []).map((batch) => (
                          <li key={batch.id}>
                            {batch.batchName} · records: {batch.totalRecords} · total: ${Number(batch.totalAmount || 0).toFixed(2)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-600">No payout batches generated in this run.</p>
                    )}
                  </div>

                  <div className="rounded border bg-white p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Members/accounts with no commission because payment failed/skipped</p>
                    {(recurringWorkflowResult.commissionSummary?.membersOrAccountsWithNoCommissionBecausePaymentFailedSkipped || []).length > 0 ? (
                      <ul className="space-y-1 text-sm text-gray-700">
                        {(recurringWorkflowResult.commissionSummary?.membersOrAccountsWithNoCommissionBecausePaymentFailedSkipped || []).map((item, idx) => (
                          <li key={`${item.memberId}-${idx}`}>
                            {item.memberOrAccountName} ({item.payerType}) · {item.reason}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-600">None.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {superAdminRestricted && (
          <Alert className="mb-8 border-amber-300 bg-amber-50 text-amber-900">
            <div className="flex gap-3">
              <Shield className="h-5 w-5" />
              <div>
                <AlertTitle>Limited control mode</AlertTitle>
                <AlertDescription>
                  You are signed in as an admin. Viewing analytics is allowed, but EPX live controls, cancellations, and certification tools
                  stay disabled unless a super admin is present.
                </AlertDescription>
              </div>
            </div>
          </Alert>
        )}

        {/* Manual EPX Transactions */}
        <Card className="mb-8 border border-navy-200 bg-white shadow-soft">
          <CardContent className="p-6 space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-navy-500">Manual EPX Transactions</h2>
                <p className="text-sm text-gray-600">
                  Run SALE, refund, or void events directly from the admin dashboard without opening the certification toolkit.
                </p>
              </div>
              <div className="flex w-full flex-col items-start gap-3 md:w-auto md:items-end">
                <div className="flex flex-col items-start gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Payment Environment</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={`${paymentEnvironmentBadgeClasses} text-xs font-semibold uppercase tracking-wide`}>
                      {paymentEnvironmentBadgeLabel}
                    </Badge>
                    {isSuperAdmin && (
                      <Button
                        type="button"
                        size="sm"
                        variant={paymentEnvironmentButtonTarget === 'production' ? 'default' : 'outline'}
                        onClick={() => handlePaymentEnvironmentChange(paymentEnvironmentButtonTarget)}
                        disabled={paymentEnvironmentLoading || updatePaymentEnvironmentMutation.isPending}
                      >
                        {updatePaymentEnvironmentMutation.isPending ? 'Updating...' : paymentEnvironmentButtonLabel}
                      </Button>
                    )}
                  </div>
                  {paymentEnvironmentUpdatedText && (
                    <span className="text-xs text-gray-500">{paymentEnvironmentUpdatedText}</span>
                  )}
                </div>
                <div className="flex w-full gap-2 md:w-auto">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setManualTransactionResult(null)}
                    disabled={!manualTransactionResult}
                  >
                    Clear Result
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetManualTransactionForm}
                    disabled={manualTransactionMutation.isPending}
                  >
                    Reset Form
                  </Button>
                </div>
              </div>
            </div>

            <Alert className={environmentAlertClasses}>
              <div className="flex gap-3">
                <EnvironmentAlertIcon className="h-5 w-5 mt-0.5" />
                <div>
                  <AlertTitle>{environmentAlertTitle}</AlertTitle>
                  <AlertDescription>
                    {environmentAlertDescription}
                  </AlertDescription>
                </div>
              </div>
            </Alert>

            {superAdminRestricted && (
              <Alert variant="destructive" className="border-red-200 bg-red-50 text-red-900">
                <div className="flex gap-3">
                  <Lock className="h-5 w-5 mt-0.5" />
                  <div>
                    <AlertTitle>Super admin access required</AlertTitle>
                    <AlertDescription>
                      Manual EPX commands stay read-only for admins. Ping a super admin when you need to run a charge, refund, or hosted checkout.
                    </AlertDescription>
                  </div>
                </div>
              </Alert>
            )}

            <form onSubmit={handleManualTransactionSubmit}>
              <fieldset disabled={superAdminRestricted} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label htmlFor="manual-member-id">Member ID</Label>
                  <Input
                    id="manual-member-id"
                    placeholder="1234"
                    value={manualTransactionForm.memberId}
                    onChange={handleManualFieldChange('memberId')}
                  />
                </div>
                <div>
                  <Label htmlFor="manual-transaction-id">Transaction ID</Label>
                  <Input
                    id="manual-transaction-id"
                    placeholder="Existing EPX transaction"
                    value={manualTransactionForm.transactionId}
                    onChange={handleManualFieldChange('transactionId')}
                  />
                </div>
                <div>
                  <Label htmlFor="manual-auth-guid">EPX AUTH GUID</Label>
                  <Input
                    id="manual-auth-guid"
                    placeholder="Paste AUTH GUID"
                    value={manualTransactionForm.authGuid}
                    onChange={handleManualFieldChange('authGuid')}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label htmlFor="manual-amount">Amount (USD)</Label>
                  <Input
                    id="manual-amount"
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={manualTransactionForm.amount}
                    onChange={handleManualFieldChange('amount')}
                    required
                    placeholder="100.00"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Required for sales and refunds. Enter the dollar amount you wish to charge or return.
                  </p>
                </div>
                <div>
                  <Label htmlFor="manual-tran-type">Transaction Type</Label>
                  <Select value={manualTransactionForm.tranType} onValueChange={handleManualTranTypeChange}>
                    <SelectTrigger id="manual-tran-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {MANUAL_TRANSACTION_TYPES.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex flex-col">
                            <span className="font-medium">{option.label}</span>
                            {option.description && (
                              <span className="text-xs text-muted-foreground">{option.description}</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="manual-description">Reference Note</Label>
                  <Input
                    id="manual-description"
                    placeholder="Shown in EPX memo"
                    value={manualTransactionForm.description}
                    onChange={handleManualFieldChange('description')}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p className="text-sm text-gray-600">
                  Provide at least one identifier (member ID, transaction ID, or AUTH GUID). Amount is required for every transaction type.
                </p>
                <div className="flex flex-col gap-2 w-full md:w-auto md:flex-row">
                  <Button
                    type="submit"
                    className="w-full md:w-auto"
                    disabled={manualTransactionMutation.isPending}
                  >
                    {manualTransactionMutation.isPending ? 'Submitting...' : 'Run Transaction'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full md:w-auto"
                    onClick={handleHostedCheckoutRequest}
                    disabled={manualTransactionMutation.isPending}
                  >
                    Launch Hosted Checkout
                  </Button>
                </div>
              </div>
              </fieldset>
            </form>

            {manualTransactionResult && (
              <div className="grid gap-4 md:grid-cols-2">
                {manualTransactionResult.transactionReference && (
                  <div className="md:col-span-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                    Transaction Reference: <span className="font-semibold">{manualTransactionResult.transactionReference}</span>
                  </div>
                )}
                {manualTransactionResult.request && (
                  <div>
                    <p className="text-sm font-medium text-gray-900 mb-2">Request Snapshot</p>
                    <pre className="bg-slate-900 text-slate-100 rounded-md p-3 text-xs overflow-x-auto">
                      {JSON.stringify(manualTransactionResult.request || {}, null, 2)}
                    </pre>
                  </div>
                )}
                {manualTransactionResult.response && (
                  <div>
                    <p className="text-sm font-medium text-gray-900 mb-2">Response Snapshot</p>
                    <pre className="bg-slate-900 text-slate-100 rounded-md p-3 text-xs overflow-x-auto">
                      {JSON.stringify(manualTransactionResult.response || {}, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Subscription Cancellation */}
        <Card className="mb-8 border border-red-200 bg-white">
          <CardContent className="p-6 space-y-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Membership Cancellation</h2>
                <p className="text-sm text-gray-600">
                  Cancel a recurring subscription directly from the admin dashboard. Hosted checkout remains available for new payments.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setCancelSubscriptionResult(null)}
                  disabled={!cancelSubscriptionResult}
                >
                  Clear Result
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetCancelSubscriptionForm}
                  disabled={cancelSubscriptionMutation.isPending}
                >
                  Reset Form
                </Button>
              </div>
            </div>

            <Alert variant="destructive" className="border-red-300 bg-red-50 text-red-900">
              <div className="flex gap-3">
                <AlertTriangle className="h-5 w-5 mt-0.5" />
                <div>
                  <AlertTitle>Heads up</AlertTitle>
                  <AlertDescription>
                    Canceling a subscription immediately halts future billing and notifies EPX. Confirm with the member before continuing.
                    Pause functionality will be added next, but for now this action cannot be undone from the dashboard.
                  </AlertDescription>
                </div>
              </div>
            </Alert>

            {superAdminRestricted && (
              <Alert variant="destructive" className="border-red-200 bg-red-50 text-red-900">
                <div className="flex gap-3">
                  <Lock className="h-5 w-5 mt-0.5" />
                  <div>
                    <AlertTitle>Super admin access required</AlertTitle>
                    <AlertDescription>
                      Only super admins can cancel active subscriptions from this dashboard.
                    </AlertDescription>
                  </div>
                </div>
              </Alert>
            )}

            <form onSubmit={handleCancelSubscriptionSubmit}>
              <fieldset disabled={superAdminRestricted} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label htmlFor="cancel-subscription-id">Subscription ID</Label>
                  <Input
                    id="cancel-subscription-id"
                    placeholder="Numeric subscription ID"
                    value={cancelSubscriptionForm.subscriptionId}
                    onChange={handleCancelFieldChange('subscriptionId')}
                  />
                </div>
                <div>
                  <Label htmlFor="cancel-transaction-id">Transaction ID</Label>
                  <Input
                    id="cancel-transaction-id"
                    placeholder="Reference payment (optional)"
                    value={cancelSubscriptionForm.transactionId}
                    onChange={handleCancelFieldChange('transactionId')}
                  />
                </div>
                <div>
                  <Label htmlFor="cancel-reason">Reason</Label>
                  <Textarea
                    id="cancel-reason"
                    placeholder="Visible in audit logs"
                    value={cancelSubscriptionForm.reason}
                    onChange={handleCancelFieldChange('reason')}
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p className="text-sm text-gray-600">
                  Provide either a subscription ID or a transaction ID that contains subscription metadata. Cancellations are sent directly to EPX.
                </p>
                <Button
                  type="submit"
                  className="w-full md:w-auto"
                  disabled={cancelSubscriptionMutation.isPending}
                >
                  {cancelSubscriptionMutation.isPending ? 'Submitting...' : 'Submit Cancellation'}
                </Button>
              </div>
              </fieldset>
            </form>

            {cancelSubscriptionResult && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                  Subscription ID: <span className="font-semibold">{cancelSubscriptionResult.subscriptionId || 'N/A'}</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 mb-2">Request Snapshot</p>
                  <pre className="bg-slate-900 text-slate-100 rounded-md p-3 text-xs overflow-x-auto">
                    {JSON.stringify(cancelSubscriptionResult.request || {}, null, 2)}
                  </pre>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 mb-2">Response Snapshot</p>
                  <pre className="bg-slate-900 text-slate-100 rounded-md p-3 text-xs overflow-x-auto">
                    {JSON.stringify(cancelSubscriptionResult.response || cancelSubscriptionResult || {}, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending Approvals Section */}
        <PendingApprovalsCard
          pendingLoading={pendingLoading}
          pendingUsers={pendingUsers}
          approveUserMutation={approveUserMutation}
          rejectUserMutation={rejectUserMutation}
        />

        {/* System Login Activity */}
        <SystemActivityCard
          sessionsLoading={sessionsLoading}
          allLoginSessions={allLoginSessions}
        />

        {/* Members Management Table */}
        <AdminUsersTableCard
          usersLoading={usersLoading}
          usersData={usersData}
          setAgentNumberInput={setAgentNumberInput}
          setAssignAgentNumberDialog={setAssignAgentNumberDialog}
          setEditFormData={setEditFormData}
          setEditUserDialog={setEditUserDialog}
          toast={toast}
          refetch={refetch}
        />
        
        <AdminUserDialogs
          assignAgentNumberDialog={assignAgentNumberDialog}
          setAssignAgentNumberDialog={setAssignAgentNumberDialog}
          agentNumberInput={agentNumberInput}
          setAgentNumberInput={setAgentNumberInput}
          editUserDialog={editUserDialog}
          setEditUserDialog={setEditUserDialog}
          editFormData={editFormData}
          setEditFormData={setEditFormData}
          refetch={refetch}
          toast={toast}
        />

        <PartnerLeadDialog
          selectedPartnerLead={selectedPartnerLead}
          setSelectedPartnerLead={setSelectedPartnerLead}
          partnerLeadStatusSelection={partnerLeadStatusSelection}
          setPartnerLeadStatusSelection={setPartnerLeadStatusSelection}
          partnerLeadNote={partnerLeadNote}
          setPartnerLeadNote={setPartnerLeadNote}
          updatePartnerLeadMutation={updatePartnerLeadMutation}
          handlePartnerLeadUpdate={handlePartnerLeadUpdate}
          statusOptions={PARTNER_LEAD_STATUS_OPTIONS as Array<{ value: string; label: string }>}
        />

        {/* Admin Create User Dialog */}
        <AdminCreateUserDialog 
          isOpen={createUserDialogOpen}
          onClose={() => setCreateUserDialogOpen(false)}
          onUserCreated={(user) => {
            toast({
              title: "Success",
              description: `User account created: ${user.email}`,
            });
            queryClient.invalidateQueries({ queryKey: ['users'] });
          }}
        />

        <AdminConfirmationDialogs
          manualConfirmPayload={manualConfirmPayload}
          setManualConfirmPayload={setManualConfirmPayload}
          manualTransactionPending={manualTransactionMutation.isPending}
          getManualTranLabel={getManualTranLabel}
          executeManualTransaction={executeManualTransaction}
          cancelConfirmPayload={cancelConfirmPayload}
          setCancelConfirmPayload={setCancelConfirmPayload}
          cancelSubscriptionPending={cancelSubscriptionMutation.isPending}
          executeCancelSubscription={executeCancelSubscription}
          hostedConfirmPayload={hostedConfirmPayload}
          setHostedConfirmPayload={setHostedConfirmPayload}
          finalizeHostedCheckoutLaunch={finalizeHostedCheckoutLaunch}
        />

        <RecurringBillingDialogs
          recurringWorkflowMutation={recurringWorkflowMutation}
          confirmLiveRecurringOpen={confirmLiveRecurringOpen}
          setConfirmLiveRecurringOpen={setConfirmLiveRecurringOpen}
          executeLiveRecurringWorkflow={executeLiveRecurringWorkflow}
          previewRecurringDialogOpen={previewRecurringDialogOpen}
          setPreviewRecurringDialogOpen={setPreviewRecurringDialogOpen}
          previewDueCount={previewDueCount}
          previewRows={previewRows}
          handleOpenLiveRecurringConfirmation={handleOpenLiveRecurringConfirmation}
          superAdminRestricted={superAdminRestricted}
          liveRecurringOutcomeOpen={liveRecurringOutcomeOpen}
          setLiveRecurringOutcomeOpen={setLiveRecurringOutcomeOpen}
          liveBillingSummary={liveBillingSummary}
          liveCommissionSummary={liveCommissionSummary}
          handleCopyLiveRecurringSummary={handleCopyLiveRecurringSummary}
        />



      </div>
    </AppShell>
  );

        {/* Partner Leads - dead code below return */}
        <Card className="mb-8 border border-cyan-200 bg-white">
          <CardContent className="p-6 space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Partner Leads</h2>
                <p className="text-sm text-gray-600">
                  Review inbound agency partners from the public "Partner with us" form and leave follow-up notes.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Badge className="bg-cyan-100 text-cyan-800 border-none font-semibold">
                  {partnerLeadCount} lead{partnerLeadCount === 1 ? '' : 's'}
                </Badge>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Status filter</span>
                  <Select value={partnerLeadFilter} onValueChange={(value) => setPartnerLeadFilter(value as PartnerLeadStatusFilter)}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Filter status" />
                    </SelectTrigger>
                    <SelectContent>
                      {PARTNER_LEAD_STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {partnerLeadsLoading ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : partnerLeads.length === 0 ? (
              <div className="rounded-lg border border-dashed border-cyan-200 bg-cyan-50 p-8 text-center text-sm text-cyan-900">
                {partnerLeadEmptyCopy}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Agency</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Contact</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Markets & Experience</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Last touch</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {partnerLeads.map((lead) => {
                      const statusMeta = getPartnerLeadStatusMeta(lead.status);
                      const createdLabel = lead.createdAt
                        ? formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true })
                        : '—';
                      const latestNote = lead.adminNotes && lead.adminNotes.length > 0
                        ? lead.adminNotes[lead.adminNotes.length - 1]
                        : null;

                      return (
                        <tr key={lead.id} className="bg-white">
                          <td className="px-4 py-3 align-top">
                            <div className="font-semibold text-gray-900">{lead.agencyName}</div>
                            {lead.agencyWebsite ? (
                              <a
                                href={lead.agencyWebsite}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-cyan-700 hover:underline"
                              >
                                {lead.agencyWebsite}
                              </a>
                            ) : (
                              <p className="text-xs text-gray-500">Website not provided</p>
                            )}
                            {lead.message && (
                              <p className="mt-1 text-xs text-gray-600 max-w-xs truncate">{lead.message}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="font-medium text-gray-900">
                              {lead.firstName} {lead.lastName}
                            </div>
                            <p className="text-xs text-gray-600">{lead.email}</p>
                            <p className="text-xs text-gray-600">{lead.phone || '—'}</p>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="text-sm text-gray-900">
                              {lead.statesServed || '—'}
                            </div>
                            <p className="text-xs text-gray-600">
                              {formatExperienceLabel(lead.experienceLevel)} · {formatVolumeEstimate(lead.volumeEstimate)}
                            </p>
                            {latestNote && (
                              <p className="mt-1 text-xs text-gray-500 max-w-xs truncate">
                                Last note: {latestNote.message}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <Badge className={`${statusMeta.badgeClass} border-none text-xs font-semibold`}>{statusMeta.label}</Badge>
                          </td>
                          <td className="px-4 py-3 align-top text-sm text-gray-600">
                            {createdLabel}
                          </td>
                          <td className="px-4 py-3 align-top text-right">
                            <Button variant="outline" size="sm" onClick={() => openPartnerLeadDialog(lead)}>
                              Update
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
}