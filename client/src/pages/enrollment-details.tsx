Warning: truncated output (original token count: 27916)
Total output lines: 2528

import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  ArrowLeft,
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  CreditCard,
  UserPlus,
  Edit,
  Save,
  X,
  Download,
  Shield,
  DollarSign,
  FileText,
  Users,
  Eye,
  EyeOff,
  Trash2
} from "lucide-react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPhoneNumber, cleanPhoneNumber, formatZipCode } from "@/lib/formatters";
import { displaySSN } from "@shared/display-ssn";
import { PaymentMethodsPanel } from "@/components/PaymentMethodsPanel";

interface SensitiveMemberResponse {
  success: boolean;
  sensitiveData?: {
    ssn?: {
      decrypted?: string | null;
      masked?: string | null;
      status?: 'decrypted' | 'masked_only' | 'not_available';
      reason?: string | null;
    };
    bankInfo?: {
      routingNumber?: string | null;
      routingNumberReadable?: string | null;
      accountNumber?: string | null;
      accountLastFour?: string | null;
      accountType?: string | null;
      accountHolderName?: string | null;
    };
    paymentReferences?: {
      paymentMethodType?: string | null;
      bric?: string | null;
      bricMasked?: string | null;
      originalAuthGuid?: string | null;
      originalAuthGuidMasked?: string | null;
      paymentAuthGuid?: string | null;
      paymentAuthGuidMasked?: string | null;
    };
  };
}

interface EnrollmentDetails {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  customerNumber?: string | null;
  memberPublicId?: string | null;
  // Personal Info
  firstName: string;
  lastName: string;
  middleName?: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender?: string;
  ssn?: string;
  // Address
  address: string;
  address2?: string;
  city: string;
  state: string;
  zipCode: string;
  // Employment
  employerName?: string;
  divisionName?: string;
  dateOfHire?: string;
  // Plan Info
  planId: number;
  planName: string;
  planPrice?: number | string;
  memberType: string;
  planStartDate: string;
  totalMonthlyPrice: number;
  status: string;
  // Emergency Contact
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  // Agent Info
  enrolledBy?: string;
  enrolledByAgentId?: string;
  // Subscription
  subscriptionId?: number;
  subscriptionStatus?: string | null;
  nextBillingDate?: string | null;
  subscriptionEndDate?: string | null;
  subscriptionPendingReason?: string | null;
  subscriptionPendingDetails?: any;
  lifecycleSummary?: {
    subscriptionStatus?: string | null;
    pendingAction?: string | null;
    nextBillingDate?: string | null;
    accessThroughDate?: string | null;
    paidThroughDate?: string | null;
    paymentRiskStatus?: string;
    commissionStatus?: string | null;
  };
  enrollmentDate?: string | null;
  firstPaymentDate?: string | null;
  membershipStartDate?: string | null;
  memberSinceDate?: string | null;
  effectiveDate?: string | null;
  monthsAsMember?: number | null;
  lastPaymentAttemptDate?: string | null;
  lastPaymentRunDate?: string | null;
  lastSuccessfulPaymentDate?: string | null;
  nextPaymentRunDate?: string | null;
  paymentHistorySummary?: {
    totalPayments?: number;
    successfulPayments?: number;
    failedPayments?: number;
    pendingPayments?: number;
    last90DaysAttempts?: number;
    last90DaysSuccesses?: number;
  };
  lifecycleFlags?: {
    gapDetected?: boolean;
    hasMembershipGap?: boolean;
    hasBillingGap?: boolean;
    billingAtRisk?: boolean;
    statusMismatch?: boolean;
    anchorVsEffectiveMismatch?: boolean;
  };
  lifecycleTimeline?: {
    memberSinceDate?: string | null;
    memberSinceSource?: string;
    membershipStartDate?: string | null;
    effectiveDate?: string | null;
    monthsAsMember?: number | null;
    lastPaymentAttemptDate?: string | null;
    lastPaymentRunDate?: string | null;
    lastSuccessfulPaymentDate?: string | null;
    nextPaymentRunDate?: string | null;
    paymentHistorySummary?: {
      totalPayments?: number;
      successfulPayments?: number;
      failedPayments?: number;
      pendingPayments?: number;
      last90DaysAttempts?: number;
      last90DaysSuccesses?: number;
    };
    lifecycleFlags?: {
      gapDetected?: boolean;
      hasMembershipGap?: boolean;
      hasBillingGap?: boolean;
      billingAtRisk?: boolean;
      statusMismatch?: boolean;
      anchorVsEffectiveMismatch?: boolean;
    };
  };
  paymentHistory?: Array<{
    id?: number;
    amount?: number | string;
    status?: string;
    paymentMethod?: string | null;
    payment_method?: string | null;
    transactionId?: string | null;
    transaction_id?: string | null;
    createdAt?: string | null;
    created_at?: string | null;
    verification?: {
      finalizationState?: string;
      processorConfirmed?: boolean;
    };
  }>;
  // Family Members
  familyMembers?: FamilyMember[];
}

interface FamilyMember {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  dateOfBirth: string;
  gender?: string;
  ssn?: string;
  email?: string;
  phone?: string;
  relationship: string;
  memberType: string;
  isActive: boolean;
}

interface PlanOption {
  id: number;
  name: string;
  price: number | string;
  isActive: boolean;
}

const parseFlexibleDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d{8}$/.test(trimmed)) {
    const month = Number(trimmed.slice(0, 2)) - 1;
    const day = Number(trimmed.slice(2, 4));
    const year = Number(trimmed.slice(4));
    const parsed = new Date(year, month, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDateDisplay = (
  value?: string | null,
  pattern = "MMM d, yyyy",
  fallback = "Not provided",
) => {
  const parsed = parseFlexibleDate(value);
  if (!parsed) {
    return fallback;
  }
  return format(parsed, pattern);
};

const formatPhoneDisplay = (value?: string | null, fallback = "Not provided") => {
  return value ? formatPhoneNumber(value) : fallback;
};

const formatCoverageLabel = (value?: string | null) => {
  if (!value) return "Not specified";
  return value.replace(/[-_]/g, " ");
};

const formatDateForInput = (value?: string | null) => {
  const parsed = parseFlexibleDate(value);
  if (!parsed) return "";
  return format(parsed, "yyyy-MM-dd");
};

export default function EnrollmentDetails() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/admin/enrollment/:id");
  const { toast } = useToast();
  
  const enrollmentId = params?.id;
  
  // Edit states
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [isEditingPersonal, setIsEditingPersonal] = useState(false);
  const [editedContact, setEditedContact] = useState<any>({});
  const [editedAddress, setEditedAddress] = useState<any>({});
  const [editedPersonal, setEditedPersonal] = useState<any>({});
  const [showScheduleCommissionDialog, setShowScheduleCommissionDialog] = useState(false);
  const [scheduledCommissionDate, setScheduledCommissionDate] = useState('');
  const [showAddFamilyDialog, setShowAddFamilyDialog] = useState(false);
  const [newFamilyMember, setNewFamilyMember] = useState({
    firstName: '',
    lastName: '',
    middleName: '',
    dateOfBirth: '',
    gender: '',
    relationship: 'spouse',
    email: '',
    phone: ''
  });
  const [editingFamilyMemberId, setEditingFamilyMemberId] = useState<string | null>(null);
  const [editedFamilyMember, setEditedFamilyMember] = useState({
    firstName: '',
    lastName: '',
    middleName: '',
    dateOfBirth: '',
    gender: '',
    relationship: 'spouse',
    email: '',
    phone: ''
  });
  const [deletingFamilyMemberId, setDeletingFamilyMemberId] = useState<string | null>(null);
  const [selectedPaymentId, setSelectedPaymentId] = useState<number | null>(null);
  const [newPaymentStatus, setNewPaymentStatus] = useState('');
  const [paymentUpdateNote, setPaymentUpdateNote] = useState('');
  const [isSSNVisible, setIsSSNVisible] = useState(false);
  const [revealedSSN, setRevealedSSN] = useState<string | null>(null);
  const [isEditingSSN, setIsEditingSSN] = useState(false);
  const [editedSSN, setEditedSSN] = useState('');
  const [ssnUpdateReason, setSsnUpdateReason] = useState('');
  const [isBankVisible, setIsBankVisible] = useState(false);
  const [revealedBankInfo, setRevealedBankInfo] = useState<SensitiveMemberResponse['sensitiveData']['bankInfo'] | null>(null);
  const [isEditingBank, setIsEditingBank] = useState(false);
  const [editedBank, setEditedBank] = useState({
    routingNumber: '',
    accountNumber: '',
    accountType: 'Checking',
    accountHolderName: '',
    reason: '',
  });
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [selectedMemberType, setSelectedMemberType] = useState<string>('');
  const [membershipReason, setMembershipReason] = useState('');

  const getMaskedSSN = (value?: string | null): string =>
    displaySSN(value || "", { reveal: false, role: "" });
  
  // Fetch enrollment details
  const { data: enrollment, isLoading } = useQuery<EnrollmentDetails>({
    queryKey: [`/api/admin/enrollment/${enrollmentId}`],
    enabled: !!enrollmentId,
  });

  const pbmStateQuery = useQuery<any>({
    queryKey: ["/api/members", enrollmentId, "pbm"],
    queryFn: () => apiRequest(`/api/members/${enrollmentId}/pbm`),
    enabled: Boolean(enrollmentId && enrollment?.subscriptionId),
  });
  const pbmChangeMutation = useMutation({
    mutationFn: (enabled: boolean) => apiRequest(`/api/members/${enrollmentId}/pbm`, {
      method: "POST",
      body: JSON.stringify({ enabled }),
    }),
    onSuccess: async () => {
      toast({ title: "PBM change scheduled", description: "It will take effect with the next recurring billing cycle." });
      await queryClient.invalidateQueries({ queryKey: ["/api/members", enrollmentId, "pbm"] });
      await queryClient.invalidateQueries({ queryKey: [`/api/admin/enrollment/${enrollmentId}`] });
    },
    onError: (error: any) => toast({ title: "PBM change failed", description: error?.message || "Unable to schedule PBM change.", variant: "destructive" }),
  });
  const withdrawPbmChangeMutation = useMutation({
    mutationFn: () => apiRequest(`/api/members/${enrollmentId}/pbm/pending`, { method: "DELETE" }),
    onSuccess: async () => {
      toast({ title: "Pending PBM change withdrawn" });
      await queryClient.invalidateQueries({ queryKey: ["/api/members", enrollmentId, "pbm"] });
    },
    onError: (error: any) => toast({ title: "Unable to withdraw PBM change", description: error?.message || "Try again.", variant: "destructive" }),
  });
  
  // Fetch payment history for this member
  const { data: paymentHistory, isLoading: paymentsLoading } = useQuery<any>({
    queryKey: [`/api/admin/payments/member/${enrollmentId}`],
    enabled: !!enrollmentId,
    select: (data) => data?.payments || []
  });

  const { data: availablePlans = [] } = useQuery<PlanOption[]>({
    queryKey: ['/api/plans'],
    queryFn: async () => {
      const data = await apiRequest('/api/plans');
      return Array.isArray(data) ? data : [];
    },
  });

  const latestPayment = Array.isArray(paymentHistory) && paymentHistory.length > 0
    ? paymentHistory[0]
    : null;
  const latestPaymentStatus = String(latestPayment?.status || '').toLowerCase();
  const hasCompletedPayment = ['succeeded', 'success', 'completed'].includes(latestPaymentStatus);

  const launchHostedCheckout = () => {
    if (!enrollment) return;

    const params = new URLSearchParams({
      memberId: enrollment.id.toString(),
      amount: String(enrollment.totalMonthlyPrice || 0),
      description: `Enrollment payment for member #${enrollment.id}`,
      autoLaunch: '1',
    });

    if (latestPayment?.id) {
      params.set('retryPaymentId', String(latestPayment.id));
      params.set('retryMemberId', enrollment.id.toString());
    }

    setLocation(`/admin/payments/checkout?${params.toString()}`);
  };
  
  // Update contact info mutation
  const updatePersonalMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest(`/api/admin/enrollment/${enrollmentId}/personal`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: "Personal Info Updated",
        description: "Member profile information has been successfully updated.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/enrollment/${enrollmentId}`] });
      setIsEditingPersonal(false);
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update personal information.",
        variant: "destructive",
      });
    },
  });

  // Update contact info mutation
  const updateContactMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest(`/api/admin/enrollment/${enrollmentId}/contact`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: "Contact Updated",
        description: "Contact information has been successfully updated.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/enrollment/${enrollmentId}`] });
      setIsEditingContact(false);
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update contact information.",
        variant: "destructive",
      });
    },
  });
  
  // Update address mutation
  const updateAddressMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest(`/api/admin/enrollment/${enrollmentId}/address`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: "Address Updated",
        description: "Address has been successfully updated.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/enrollment/${enrollmentId}`] });
      setIsEditingAddress(false);
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update address.",
        variant: "destructive",
      });
    },
  });
  
  // Update payment status mutation
  const updatePaymentStatusMutation = useMutation({
    mutationFn: async ({ paymentId, status, note }: { paymentId: number; status: string; note: string }) => {
      return apiRequest(`/api/admin/payments/${paymentId}/status`, {
        method: "PUT",
        body: JSON.stringify({ status, note }),
      });
    },
    onSuccess: () => {
      toast({
        title: "Payment Updated",
        description: "Payment status has been successfully updated.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/payments/member/${enrollmentId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/enrollment/${enrollmentId}`] });
      setSelectedPaymentId(null);
      setNewPaymentStatus('');
      setPaymentUpdateNote('');
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update payment status.",
        variant: "destructive",
      });
    },
  });

  // Create commission mutation
  const createCommissionMutation = useMutation({
    mutationFn: async (data?: { scheduledDate?: string }) => {
      return apiRequest(`/api/admin/members/${enrollmentId}/create-commission`, {
        method: "POST",
        body: JSON.stringify({ scheduledDate: data?.scheduledDate }),
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Commission Scheduled",
        description: `Commission of $${data.commission?.amount?.toFixed(2) || '0.00'} has been scheduled for agent ${data.commission?.agentNumber || 'N/A'}`,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/enrollment/${enrollmentId}`] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Schedule Commission",
        description: error.message || "Could not schedule commission for this member.",
        variant: "destructive",
      });
    },
  });

  // Sync price from payment mutation
  const syncPriceMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/admin/members/${enrollmentId}/sync-price`, {
        method: "POST",
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Price Synced",
        description: data.message || "Monthly price updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/enrollment/${enrollmentId}`] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Sync Price",
        description: error.message || "Could not sync price from payment.",
        variant: "destructive",
      });
    },
  });

  // Add family member mutation
  const addFamilyMemberMutation = useMutation({
    mutationFn: async (data: typeof newFamilyMember) => {
      return apiRequest(`/api/admin/members/${enrollmentId}/add-family-member`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: "Family Member Added",
        description: "Family member has been successfully added to this enrollment.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/enrollment/${enrollmentId}`] });
      setShowAddFamilyDialog(false);
      setNewFamilyMember({
        firstName: '',
        lastName: '',
        middleName: '',
        dateOfBirth: '',
        gender: '',
        relationship: 'spouse',
        email: '',
        phone: ''
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Add Family Member",
        description: error.message || "An error occurred while adding the family member.",
        variant: "destructive",
      });
    },
  });

  // Update family member mutation
  const updateFamilyMemberMutation = useMutation({
    mutationFn: async ({ familyMemberId, data }: { familyMemberId: string; data: typeof editedFamilyMember }) => {
      return apiRequest(`/api/admin/members/${enrollmentId}/family-member/${familyMemberId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: "Family Member Updated",
        description: "Family member information has been updated.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/enrollment/${enrollmentId}`] });
      setEditingFamilyMemberId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Update Family Member",
        description: error.message || "An error occurred while updating the family member.",
        variant: "destructive",
      });
    },
  });

  // Remove family member mutation
  const deleteFamilyMemberMutation = useMutation({
    mutationFn: async (familyMemberId: string) => {
      return apiRequest(`/api/admin/members/${enrollmentId}/family-member/${familyMemberId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      toast({
        title: "Family Member Removed",
        description: "Family member has been removed from this enrollment.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/enrollment/${enrollmentId}`] });
      setDeletingFamilyMemberId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Remove Family Member",
        description: error.message || "An error occurred while removing the family member.",
        variant: "destructive",
      });
    },
  });

  const revealSensitiveMutation = useMutation({
    mutationFn: async () => {
      const memberId = enrollment?.id;
      if (!memberId) throw new Error('Member ID is missing');
      return apiRequest(`/api/admin/member/${memberId}/sensitive?revealSsn=true&reason=${encodeURIComponent('Enrollment details SSN reveal')}`) as Promise<SensitiveMemberResponse>;
    },
    onSuccess: (response) => {
      const decrypted = response?.sensitiveData?.ssn?.decrypted || null;
      const masked = response?.sensitiveData?.ssn?.masked || null;
      const status = response?.sensitiveData?.ssn?.status;
      const reason = response?.sensitiveData?.ssn?.reason;
      setRevealedSSN(decrypted || masked);
      setIsSSNVisible(true);

      if (status === 'masked_only') {
        toast({
          title: 'Limited SSN view',
          description: reason || 'Full SSN is unavailable for this record. Showing masked value only.',
        });
      } else if (!decrypted && masked) {
        toast({
          title: 'Limited SSN view',
          description: 'Full SSN is unavailable for this record. Showing masked value only.',
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Unable to reveal SSN',
        description: error?.message || 'Failed to retrieve sensitive member data.',
        variant: 'destructive',
      });
    },
  });

  const revealBankMutation = useMutation({
    mutationFn: async () => {
      const memberId = enrollment?.id;
      if (!memberId) throw new Error('Member ID is missing');
      return apiRequest(`/api/admin/member/${memberId}/sensitive?revealBank=true&revealPayment=true&reason=${encodeURIComponent('Enrollment details payment info reveal')}`) as Promise<SensitiveMemberResponse>;
    },
    onSuccess: (response) => {
      const bankInfo = response?.sensitiveData?.bankInfo || null;
      setRevealedBankInfo(bankInfo);
      setIsBankVisible(true);
    },
    onError: (error: any) => {
      toast({
        title: 'Unable to reveal bank info',
        description: error?.message || 'Failed to retrieve bank information.',
        variant: 'destructive',
      });
    },
  });

  const updateSSNMutation = useMutation({
    mutationFn: async () => {
      if (!enrollment?.id) throw new Error('Member ID is missing');
      return apiRequest(`/api/admin/enrollment/${enrollment.id}/ssn`, {
        method: 'PATCH',
        body: JSON.stringify({
          ssn: editedSSN,
          reason: ssnUpdateReason,
        }),
      });
    },
    onSuccess: () => {
      toast({
        title: 'SSN Updated',
        description: 'Member SSN has been updated successfully.',
      });
      setIsEditingSSN(false);
      setSsnUpdateReason('');
      setRevealedSSN(null);
      setIsSSNVisible(false);
      queryClient.invalidateQueries({ queryKey: [`/api/admin/enrollment/${enrollmentId}`] });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed …15916 tokens truncated…                     >
                                            {deleteFamilyMemberMutation.isPending ? 'Removing...' : 'Remove'}
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                  </AlertDialog>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div>
                                <span className="text-gray-600">Relationship:</span> {member.relationship}
                              </div>
                              <div>
                                <span className="text-gray-600">DOB:</span> {formatDateDisplay(member.dateOfBirth, 'MM/dd/yyyy', 'Not provided')}
                              </div>
                              {member.email && (
                                <div>
                                  <span className="text-gray-600">Email:</span> {member.email}
                                </div>
                              )}
                              {member.phone && (
                                <div>
                                  <span className="text-gray-600">Phone:</span> {formatPhoneNumber(member.phone)}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">
                    No family members enrolled
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Payment Info Tab */}
          <TabsContent value="payment" className="space-y-6">
            <PaymentMethodsPanel
              memberId={Number(enrollment.id)}
              memberName={`${enrollment.firstName || ""} ${enrollment.lastName || ""}`.trim()}
              memberEmail={enrollment.email}
              monthlyAmount={Number(enrollment.totalMonthlyPrice || 0)}
              billingAddress={{
                streetAddress: enrollment.address,
                city: enrollment.city,
                state: enrollment.state,
                postalCode: enrollment.zipCode,
              }}
            />
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center">
                    <CreditCard className="h-5 w-5 mr-2 text-blue-600" />
                    Payment Information
                  </span>
                  {!hasCompletedPayment && (
                    <Button size="sm" onClick={launchHostedCheckout}>
                      {latestPaymentStatus === 'failed' ? 'Retry Payment' : 'Start Payment'}
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label className="text-gray-600">Monthly Premium</Label>
                    <p className="font-semibold text-2xl">${monthlyPremiumDisplay}</p>
                  </div>
                  <div>
                    <Label className="text-gray-600">Billing Status</Label>
                    <Badge className={enrollment.status === 'active' ? 'bg-green-100 text-green-800' : ''}>
                      {enrollment.status}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-gray-600">Next Billing Date</Label>
                    <p className="font-semibold">
                      {nextBillingDateLabel}
                    </p>
                  </div>
                  <div className="border-t pt-4 space-y-3">
                    <Label className="text-gray-600">Bank Account (ACH)</Label>

                    {!isEditingBank ? (
                      <>
                        <div className="text-sm space-y-1">
                          <p>
                            <span className="text-gray-600">Routing:</span>{' '}
                            {revealedBankInfo?.routingNumberReadable || revealedBankInfo?.routingNumber || 'Not available'}
                          </p>
                          <p>
                            <span className="text-gray-600">Account:</span>{' '}
                            {isBankVisible
                              ? (revealedBankInfo?.accountNumber || (revealedBankInfo?.accountLastFour ? `****${revealedBankInfo.accountLastFour}` : 'Not available'))
                              : (revealedBankInfo?.accountLastFour ? `****${revealedBankInfo.accountLastFour}` : '••••')}
                          </p>
                          <p>
                            <span className="text-gray-600">Type:</span>{' '}
                            {revealedBankInfo?.accountType || 'Not provided'}
                          </p>
                          <p>
                            <span className="text-gray-600">Holder:</span>{' '}
                            {revealedBankInfo?.accountHolderName || 'Not provided'}
                          </p>
                          <p>
                            <span className="text-gray-600">BRIC:</span>{' '}
                            {isBankVisible
                              ? (revealBankMutation.data?.sensitiveData?.paymentReferences?.bric || 'Not available')
                              : (revealBankMutation.data?.sensitiveData?.paymentReferences?.bricMasked || '••••')}
                          </p>
                          <p>
                            <span className="text-gray-600">ORIG_AUTH_GUID:</span>{' '}
                            {isBankVisible
                              ? (revealBankMutation.data?.sensitiveData?.paymentReferences?.originalAuthGuid || 'Not available')
                              : (revealBankMutation.data?.sensitiveData?.paymentReferences?.originalAuthGuidMasked || '••••')}
                          </p>
                          <p>
                            <span className="text-gray-600">AUTH_GUID:</span>{' '}
                            {isBankVisible
                              ? (revealBankMutation.data?.sensitiveData?.paymentReferences?.paymentAuthGuid || 'Not available')
                              : (revealBankMutation.data?.sensitiveData?.paymentReferences?.paymentAuthGuidMasked || '••••')}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (isBankVisible) {
                                setIsBankVisible(false);
                                return;
                              }
                              revealBankMutation.mutate();
                            }}
                            disabled={revealBankMutation.isPending}
                          >
                            {isBankVisible ? (
                              <><EyeOff className="h-3 w-3 mr-1" /> Hide</>
                            ) : (
                              <><Eye className="h-3 w-3 mr-1" /> Reveal</>
                            )}
                          </Button>

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setIsEditingBank(true);
                              setEditedBank({
                                routingNumber: '',
                                accountNumber: '',
                                accountType: revealedBankInfo?.accountType || 'Checking',
                                accountHolderName: revealedBankInfo?.accountHolderName || '',
                                reason: '',
                              });
                            }}
                          >
                            <Edit className="h-3 w-3 mr-1" />
                            Update
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-2">
                        <Input
                          value={editedBank.routingNumber}
                          onChange={(e) => setEditedBank((prev) => ({ ...prev, routingNumber: e.target.value }))}
                          placeholder="Routing number (9 digits)"
                        />
                        <Input
                          value={editedBank.accountNumber}
                          onChange={(e) => setEditedBank((prev) => ({ ...prev, accountNumber: e.target.value }))}
                          placeholder="Account number"
                        />
                        <Select
                          value={editedBank.accountType}
                          onValueChange={(value) => setEditedBank((prev) => ({ ...prev, accountType: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select account type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Checking">Checking</SelectItem>
                            <SelectItem value="Savings">Savings</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          value={editedBank.accountHolderName}
                          onChange={(e) => setEditedBank((prev) => ({ ...prev, accountHolderName: e.target.value }))}
                          placeholder="Account holder name"
                        />
                        <Input
                          value={editedBank.reason}
                          onChange={(e) => setEditedBank((prev) => ({ ...prev, reason: e.target.value }))}
                          placeholder="Reason for update (optional)"
                        />
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => updateBankMutation.mutate()}
                            disabled={updateBankMutation.isPending}
                          >
                            {updateBankMutation.isPending ? 'Saving...' : 'Save Bank Info'}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setIsEditingBank(false)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Payment Transaction History */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <FileText className="h-5 w-5 mr-2 text-blue-600" />
                  Transaction History
                </CardTitle>
              </CardHeader>
              <CardContent>
                {paymentsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <LoadingSpinner />
                  </div>
                ) : transactionHistoryRows.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Transaction ID</TableHead>
                          <TableHead>Payment Method</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {transactionHistoryRows.map((payment: any, idx: number) => (
                          <TableRow key={payment.id || idx}>
                            <TableCell>
                              {payment.created_at || payment.createdAt
                                ? format(new Date(payment.created_at || payment.createdAt), 'MMM d, yyyy h:mm a')
                                : 'N/A'}
                            </TableCell>
                            <TableCell className="font-semibold">
                              ${typeof payment.amount === 'number' ? payment.amount.toFixed(2) : payment.amount || '0.00'}
                            </TableCell>
                            <TableCell>
                              {(() => {
                                const paymentStatus = String(payment.status || payment.verification?.finalizationState || 'unknown').toLowerCase();
                                return (
                              <Badge className={
                                paymentStatus === 'succeeded' || paymentStatus === 'success' || paymentStatus === 'finalized'
                                  ? 'bg-green-100 text-green-800'
                                  : paymentStatus === 'failed'
                                    ? 'bg-red-100 text-red-800'
                                    : paymentStatus === 'pending' || paymentStatus === 'requires_review'
                                      ? 'bg-yellow-100 text-yellow-800'
                                      : 'bg-gray-100 text-gray-600'
                              }>
                                {payment.status || payment.verification?.finalizationState || 'unknown'}
                              </Badge>
                                );
                              })()}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {payment.transaction_id || payment.transactionId || 'N/A'}
                            </TableCell>
                            <TableCell className="capitalize">
                              {payment.payment_method || payment.paymentMethod || 'N/A'}
                            </TableCell>
                            <TableCell>
                              {payment.status === 'pending' && (
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button 
                                      size="sm" 
                                      variant="outline"
                                      onClick={() => {
                                        setSelectedPaymentId(payment.id);
                                        setNewPaymentStatus('succeeded');
                                      }}
                                    >
                                      <Edit className="h-3 w-3 mr-1" />
                                      Update
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>Update Payment Status</DialogTitle>
                                      <DialogDescription>
                                        Manually update the status of this payment transaction.
                                      </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 mt-4">
                                      <div>
                                        <Label htmlFor="status">New Status</Label>
                                        <Select 
                                          value={newPaymentStatus} 
                                          onValueChange={setNewPaymentStatus}
                                        >
                                          <SelectTrigger>
                                            <SelectValue placeholder="Select status" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="succeeded">Succeeded</SelectItem>
                                            <SelectItem value="failed">Failed</SelectItem>
                                            <SelectItem value="cancelled">Cancelled</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div>
                                        <Label htmlFor="note">Note (optional)</Label>
                                        <Input
                                          id="note"
                                          value={paymentUpdateNote}
                                          onChange={(e) => setPaymentUpdateNote(e.target.value)}
                                          placeholder="Reason for manual update..."
                                        />
                                      </div>
                                      <div className="flex justify-end space-x-2">
                                        <Button
                                          variant="outline"
                                          onClick={() => {
                                            setSelectedPaymentId(null);
                                            setNewPaymentStatus('');
                                            setPaymentUpdateNote('');
                                          }}
                                        >
                                          Cancel
                                        </Button>
                                        <Button
                                          onClick={() => {
                                            if (selectedPaymentId && newPaymentStatus) {
                                              updatePaymentStatusMutation.mutate({
                                                paymentId: selectedPaymentId,
                                                status: newPaymentStatus,
                                                note: paymentUpdateNote
                                              });
                                            }
                                          }}
                                          disabled={!newPaymentStatus || updatePaymentStatusMutation.isPending}
                                        >
                                          {updatePaymentStatusMutation.isPending ? 'Updating...' : 'Update Status'}
                                        </Button>
                                      </div>
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">
                    No payment transactions recorded
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Admin Tools */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Shield className="h-5 w-5 mr-2 text-blue-600" />
                  Admin Tools
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-semibold">Commission Management</Label>
                    <p className="text-sm text-gray-600 mb-2">
                      Schedule commission payouts for this enrollment.
                    </p>
                    <Button
                      onClick={() => setShowScheduleCommissionDialog(true)}
                      disabled={createCommissionMutation.isPending}
                      variant="outline"
                      size="sm"
                    >
                      <DollarSign className="h-4 w-4 mr-2" />
                      {createCommissionMutation.isPending ? 'Scheduling...' : 'Schedule Commission'}
                    </Button>
                  </div>
                  
                  <div className="border-t pt-4">
                    <Label className="text-sm font-semibold">Price Sync</Label>
                    <p className="text-sm text-gray-600 mb-2">
                      If monthly premium shows $0.00, sync it from the successful payment amount.
                    </p>
                    <Button
                      onClick={() => syncPriceMutation.mutate()}
                      disabled={syncPriceMutation.isPending}
                      variant="outline"
                      size="sm"
                    >
                      <DollarSign className="h-4 w-4 mr-2" />
                      {syncPriceMutation.isPending ? 'Syncing...' : 'Sync Price from Payment'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Schedule Commission Dialog */}
      <Dialog open={showScheduleCommissionDialog} onOpenChange={setShowScheduleCommissionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Commission Payout</DialogTitle>
            <DialogDescription>
              Set a scheduled date for when this commission should be paid out to the agent.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="scheduled-date">Scheduled Payout Date</Label>
              <Input
                id="scheduled-date"
                type="date"
                value={scheduledCommissionDate}
                onChange={(e) => setScheduledCommissionDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowScheduleCommissionDialog(false);
                setScheduledCommissionDate('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                createCommissionMutation.mutate({ scheduledDate: scheduledCommissionDate });
                setShowScheduleCommissionDialog(false);
                setScheduledCommissionDate('');
              }}
              disabled={createCommissionMutation.isPending || !scheduledCommissionDate}
            >
              {createCommissionMutation.isPending ? 'Scheduling...' : 'Schedule Commission'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
