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
  Users
} from "lucide-react";
import { addMonths, format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPhoneNumber, cleanPhoneNumber, formatZipCode } from "@/lib/formatters";

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

const canManageFamilyMembers = (value?: string | null) => {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return (
    normalized.includes("spouse") ||
    normalized.includes("children") ||
    normalized.includes("family")
  );
};

export default function EnrollmentDetails() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/admin/enrollment/:id");
  const { toast } = useToast();
  
  const enrollmentId = params?.id;
  
  // Edit states
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [editedContact, setEditedContact] = useState<any>({});
  const [editedAddress, setEditedAddress] = useState<any>({});
  const [selectedPaymentId, setSelectedPaymentId] = useState<number | null>(null);
  const [newPaymentStatus, setNewPaymentStatus] = useState<string>('');
  const [paymentUpdateNote, setPaymentUpdateNote] = useState<string>('');
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
  
  // Fetch enrollment details
  const { data: enrollment, isLoading } = useQuery<EnrollmentDetails>({
    queryKey: [`/api/admin/enrollment/${enrollmentId}`],
    enabled: !!enrollmentId,
  });
  
  // Fetch payment history for this member
  const { data: paymentHistory, isLoading: paymentsLoading } = useQuery<any>({
    queryKey: [`/api/admin/payments/member/${enrollmentId}`],
    enabled: !!enrollmentId,
    select: (data) => data?.payments || []
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
    mutationFn: async () => {
      return apiRequest(`/api/admin/members/${enrollmentId}/create-commission`, {
        method: "POST",
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Commission Created",
        description: `Commission of $${data.commission?.amount?.toFixed(2) || '0.00'} has been created for agent ${data.commission?.agentNumber || 'N/A'}`,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/enrollment/${enrollmentId}`] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Create Commission",
        description: error.message || "Could not create commission for this member.",
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
  
  // Export enrollment summary
  const exportSummary = () => {
    if (!enrollment) return;

    const enrollmentDate = formatDateDisplay(enrollment.createdAt, "MMMM d, yyyy", "N/A");
    const dateOfBirth = formatDateDisplay(enrollment.dateOfBirth, "MM/dd/yyyy", "N/A");
    const planStartDate = formatDateDisplay(enrollment.planStartDate, "MM/dd/yyyy", "N/A");
    const phone = formatPhoneDisplay(enrollment.phone, "Not provided");
    const emergencyPhone = formatPhoneDisplay(enrollment.emergencyContactPhone, "Not provided");
    const coverageType = formatCoverageLabel(enrollment.memberType);

    const familySection = enrollment.familyMembers && enrollment.familyMembers.length > 0
      ? `
FAMILY MEMBERS
--------------
${enrollment.familyMembers.map((member, index) => `
${index + 1}. ${member.firstName} ${member.lastName}
   Relationship: ${member.relationship}
   DOB: ${formatDateDisplay(member.dateOfBirth, 'MM/dd/yyyy', 'N/A')}
   Status: ${member.isActive ? 'Active' : 'Inactive'}
`).join('')}
`
      : '';

    const emergencySection = enrollment.emergencyContactName
      ? `
EMERGENCY CONTACT
-----------------
Name: ${enrollment.emergencyContactName}
Phone: ${emergencyPhone}
`
      : '';

    const summary = `
ENROLLMENT SUMMARY
==================
Customer Number: ${enrollment.customerNumber || 'Pending'}
Member ID: ${enrollment.memberPublicId || 'Pending'}
Enrollment Date: ${enrollmentDate}

MEMBER INFORMATION
------------------
Name: ${enrollment.firstName} ${enrollment.middleName || ''} ${enrollment.lastName}
Date of Birth: ${dateOfBirth}
Email: ${enrollment.email}
Phone: ${phone}

ADDRESS
-------
${enrollment.address}
${enrollment.address2 || ''}
${enrollment.city}, ${enrollment.state} ${enrollment.zipCode}

PLAN DETAILS
------------
Plan: ${enrollment.planName}
Coverage Type: ${coverageType}
Monthly Premium: $${enrollment.totalMonthlyPrice}
Start Date: ${planStartDate}
Status: ${enrollment.status}
${emergencySection}
${familySection}

ENROLLMENT AGENT
----------------
${enrollment.enrolledBy || 'Self-enrolled'}
`;

    const blob = new Blob([summary], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `enrollment-${enrollment.id}-summary.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }
  
  if (!enrollment) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900">No Enrollment Details Available</h2>
          <p className="text-gray-600 mt-2">This user is not an enrolled member.</p>
          <p className="text-sm text-gray-500 mt-1">Enrollment details are only available for members who have completed registration.</p>
          <div className="mt-4 space-x-2">
            <Button onClick={() => setLocation("/admin/enrollments")}>
              Back to Enrollments
            </Button>
            <Button variant="outline" onClick={() => setLocation("/admin/users")}>
              Back to Users
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const enrollmentDateLabel = formatDateDisplay(enrollment.createdAt, "MMM d, yyyy", "N/A");
  const planStartLabel = formatDateDisplay(enrollment.planStartDate, "MMMM d, yyyy", "Not scheduled");
  const dateOfBirthLabel = formatDateDisplay(enrollment.dateOfBirth, "MM/dd/yyyy", "Not provided");
  const coverageTypeLabel = formatCoverageLabel(enrollment.memberType);
  const formattedPhone = formatPhoneDisplay(enrollment.phone, "Not provided");
  const formattedEmergencyPhone = formatPhoneDisplay(enrollment.emergencyContactPhone, "Not provided");
  const canAddFamilyMembersCta = canManageFamilyMembers(enrollment.memberType);
  const monthlyPremiumDisplay = typeof enrollment.totalMonthlyPrice === "number"
    ? enrollment.totalMonthlyPrice.toFixed(2)
    : "0.00";
  const nextBillingDateLabel = (() => {
    const startDate = parseFlexibleDate(enrollment.planStartDate);
    if (!startDate) {
      return "Not scheduled";
    }
    return format(addMonths(startDate, 1), "MMMM d, yyyy");
  })();
  
  const startEditingContact = () => {
    setEditedContact({
      email: enrollment.email,
      phone: enrollment.phone,
      emergencyContactName: enrollment.emergencyContactName || '',
      emergencyContactPhone: enrollment.emergencyContactPhone || '',
    });
    setIsEditingContact(true);
  };
  
  const startEditingAddress = () => {
    setEditedAddress({
      address: enrollment.address,
      address2: enrollment.address2 || '',
      city: enrollment.city,
      state: enrollment.state,
      zipCode: enrollment.zipCode,
    });
    setIsEditingAddress(true);
  };
  
  const saveContact = () => {
    updateContactMutation.mutate({
      ...editedContact,
      phone: cleanPhoneNumber(editedContact.phone),
      emergencyContactPhone: cleanPhoneNumber(editedContact.emergencyContactPhone),
    });
  };
  
  const saveAddress = () => {
    updateAddressMutation.mutate({
      ...editedAddress,
      zipCode: editedAddress.zipCode.replace(/-/g, ''),
    });
  };
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Button
                variant="ghost"
                className="mr-4"
                onClick={() => setLocation("/admin/enrollments")}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {enrollment.firstName} {enrollment.lastName}
                </h1>
                <p className="text-gray-600 mt-1">
                  Member ID {enrollment.memberPublicId || 'Pending'} • Customer #{enrollment.customerNumber || 'Pending'} • Enrolled {enrollmentDateLabel}
                </p>
              </div>
            </div>
            <Button onClick={exportSummary}>
              <Download className="h-4 w-4 mr-2" />
              Export Summary
            </Button>
          </div>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="contact">Contact Info</TabsTrigger>
            <TabsTrigger value="members">Family Members</TabsTrigger>
            <TabsTrigger value="payment">Payment Info</TabsTrigger>
          </TabsList>
          
          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Plan Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Shield className="h-5 w-5 mr-2 text-blue-600" />
                    Plan Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-gray-600">Plan Name</Label>
                    <p className="font-semibold">{enrollment.planName}</p>
                  </div>
                  <div>
                    <Label className="text-gray-600">Coverage Type</Label>
                    <p className="font-semibold capitalize">{coverageTypeLabel}</p>
                  </div>
                  <div>
                    <Label className="text-gray-600">Monthly Premium</Label>
                    <p className="font-semibold text-2xl text-green-600">${monthlyPremiumDisplay}</p>
                  </div>
                  <div>
                    <Label className="text-gray-600">Start Date</Label>
                    <p className="font-semibold">{planStartLabel}</p>
                  </div>
                  <div>
                    <Label className="text-gray-600">Status</Label>
                    <Badge className={enrollment.status === 'active' ? 'bg-green-100 text-green-800' : ''}>
                      {enrollment.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
              
              {/* Personal Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <User className="h-5 w-5 mr-2 text-blue-600" />
                    Personal Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-gray-600">Full Name</Label>
                    <p className="font-semibold">
                      {enrollment.firstName} {enrollment.middleName} {enrollment.lastName}
                    </p>
                  </div>
                  <div>
                    <Label className="text-gray-600">Date of Birth</Label>
                    <p className="font-semibold">{dateOfBirthLabel}</p>
                  </div>
                  <div>
                    <Label className="text-gray-600">Gender</Label>
                    <p className="font-semibold capitalize">{enrollment.gender || 'Not specified'}</p>
                  </div>
                  {enrollment.employerName && (
                    <div>
                      <Label className="text-gray-600">Employer</Label>
                      <p className="font-semibold">{enrollment.employerName}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
            
            {/* Agent Information */}
            {enrollment.enrolledBy && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Users className="h-5 w-5 mr-2 text-blue-600" />
                    Enrollment Agent
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-semibold">{enrollment.enrolledBy}</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
          
          {/* Contact Info Tab */}
          <TabsContent value="contact" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center">
                    <Mail className="h-5 w-5 mr-2 text-blue-600" />
                    Contact Information
                  </span>
                  {!isEditingContact ? (
                    <Button size="sm" variant="outline" onClick={startEditingContact}>
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                  ) : (
                    <div className="flex space-x-2">
                      <Button size="sm" onClick={saveContact} disabled={updateContactMutation.isPending}>
                        <Save className="h-4 w-4 mr-2" />
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setIsEditingContact(false)}>
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                    </div>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!isEditingContact ? (
                  <>
                    <div>
                      <Label className="text-gray-600">Email Address</Label>
                      <p className="font-semibold">{enrollment.email}</p>
                    </div>
                    <div>
                      <Label className="text-gray-600">Phone Number</Label>
                      <p className="font-semibold">{formattedPhone}</p>
                    </div>
                    {enrollment.emergencyContactName && (
                      <>
                        <div className="border-t pt-4">
                          <h4 className="font-semibold mb-2">Emergency Contact</h4>
                          <div>
                            <Label className="text-gray-600">Name</Label>
                            <p className="font-semibold">{enrollment.emergencyContactName}</p>
                          </div>
                          {enrollment.emergencyContactPhone && (
                            <div className="mt-2">
                              <Label className="text-gray-600">Phone</Label>
                              <p className="font-semibold">{formattedEmergencyPhone}</p>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <div>
                      <Label>Email Address</Label>
                      <Input
                        type="email"
                        value={editedContact.email}
                        onChange={(e) => setEditedContact({ ...editedContact, email: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Phone Number</Label>
                      <Input
                        type="tel"
                        value={formatPhoneNumber(editedContact.phone || "")}
                        onChange={(e) => {
                          const formatted = formatPhoneNumber(e.target.value || "");
                          setEditedContact({ ...editedContact, phone: formatted });
                        }}
                      />
                    </div>
                    <div className="border-t pt-4">
                      <h4 className="font-semibold mb-2">Emergency Contact</h4>
                      <div>
                        <Label>Name</Label>
                        <Input
                          value={editedContact.emergencyContactName}
                          onChange={(e) => setEditedContact({ ...editedContact, emergencyContactName: e.target.value })}
                        />
                      </div>
                      <div className="mt-2">
                        <Label>Phone</Label>
                        <Input
                          type="tel"
                          value={formatPhoneNumber(editedContact.emergencyContactPhone || "")}
                          onChange={(e) => {
                            const formatted = formatPhoneNumber(e.target.value || "");
                            setEditedContact({ ...editedContact, emergencyContactPhone: formatted });
                          }}
                        />
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center">
                    <MapPin className="h-5 w-5 mr-2 text-blue-600" />
                    Address
                  </span>
                  {!isEditingAddress ? (
                    <Button size="sm" variant="outline" onClick={startEditingAddress}>
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                  ) : (
                    <div className="flex space-x-2">
                      <Button size="sm" onClick={saveAddress} disabled={updateAddressMutation.isPending}>
                        <Save className="h-4 w-4 mr-2" />
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setIsEditingAddress(false)}>
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                    </div>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!isEditingAddress ? (
                  <div className="space-y-1">
                    <p className="font-semibold">{enrollment.address}</p>
                    {enrollment.address2 && <p className="font-semibold">{enrollment.address2}</p>}
                    <p className="font-semibold">
                      {enrollment.city}, {enrollment.state} {formatZipCode(enrollment.zipCode)}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <Label>Street Address</Label>
                      <Input
                        value={editedAddress.address}
                        onChange={(e) => setEditedAddress({ ...editedAddress, address: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Address Line 2</Label>
                      <Input
                        value={editedAddress.address2}
                        onChange={(e) => setEditedAddress({ ...editedAddress, address2: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label>City</Label>
                        <Input
                          value={editedAddress.city}
                          onChange={(e) => setEditedAddress({ ...editedAddress, city: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>State</Label>
                        <Input
                          value={editedAddress.state}
                          onChange={(e) => setEditedAddress({ ...editedAddress, state: e.target.value })}
                          maxLength={2}
                        />
                      </div>
                      <div>
                        <Label>ZIP Code</Label>
                        <Input
                          value={formatZipCode(editedAddress.zipCode || "")}
                          onChange={(e) => {
                            const formatted = formatZipCode(e.target.value || "");
                            setEditedAddress({ ...editedAddress, zipCode: formatted });
                          }}
                          maxLength={10}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Family Members Tab */}
          <TabsContent value="members" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center">
                    <Users className="h-5 w-5 mr-2 text-blue-600" />
                    Family Members
                  </span>
                  {canAddFamilyMembersCta && (
                    <Dialog open={showAddFamilyDialog} onOpenChange={setShowAddFamilyDialog}>
                      <DialogTrigger asChild>
                        <Button size="sm">
                          <UserPlus className="h-4 w-4 mr-2" />
                          Add Member
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Add Family Member</DialogTitle>
                          <DialogDescription>
                            Add a spouse, child, or dependent to this enrollment.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 mt-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium mb-1">
                                First Name <span className="text-red-500">*</span>
                              </label>
                              <Input
                                value={newFamilyMember.firstName}
                                onChange={(e) => setNewFamilyMember({...newFamilyMember, firstName: e.target.value})}
                                placeholder="First name"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium mb-1">
                                Last Name <span className="text-red-500">*</span>
                              </label>
                              <Input
                                value={newFamilyMember.lastName}
                                onChange={(e) => setNewFamilyMember({...newFamilyMember, lastName: e.target.value})}
                                placeholder="Last name"
                              />
                            </div>
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium mb-1">Middle Name</label>
                            <Input
                              value={newFamilyMember.middleName}
                              onChange={(e) => setNewFamilyMember({...newFamilyMember, middleName: e.target.value})}
                              placeholder="Middle name (optional)"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium mb-1">
                              Relationship <span className="text-red-500">*</span>
                            </label>
                            <Select
                              value={newFamilyMember.relationship}
                              onValueChange={(value) => setNewFamilyMember({...newFamilyMember, relationship: value})}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="spouse">Spouse</SelectItem>
                                <SelectItem value="child">Child</SelectItem>
                                <SelectItem value="dependent">Dependent</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium mb-1">Date of Birth</label>
                              <Input
                                type="date"
                                value={newFamilyMember.dateOfBirth}
                                onChange={(e) => setNewFamilyMember({...newFamilyMember, dateOfBirth: e.target.value})}
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium mb-1">Gender</label>
                              <Select
                                value={newFamilyMember.gender}
                                onValueChange={(value) => setNewFamilyMember({...newFamilyMember, gender: value})}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select gender" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="male">Male</SelectItem>
                                  <SelectItem value="female">Female</SelectItem>
                                  <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium mb-1">Email</label>
                            <Input
                              type="email"
                              value={newFamilyMember.email}
                              onChange={(e) => setNewFamilyMember({...newFamilyMember, email: e.target.value})}
                              placeholder="email@example.com (optional)"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium mb-1">Phone</label>
                            <Input
                              type="tel"
                              value={newFamilyMember.phone}
                              onChange={(e) => setNewFamilyMember({...newFamilyMember, phone: e.target.value})}
                              placeholder="(555) 555-5555 (optional)"
                            />
                          </div>

                          <div className="flex justify-end gap-2 mt-6">
                            <Button
                              variant="outline"
                              onClick={() => {
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
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              onClick={() => addFamilyMemberMutation.mutate(newFamilyMember)}
                              disabled={!newFamilyMember.firstName || !newFamilyMember.lastName || !newFamilyMember.relationship || addFamilyMemberMutation.isPending}
                            >
                              {addFamilyMemberMutation.isPending ? 'Adding...' : 'Add Family Member'}
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {enrollment.familyMembers && enrollment.familyMembers.length > 0 ? (
                  <div className="space-y-4">
                    {enrollment.familyMembers.map((member) => (
                      <div key={member.id} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold">
                            {member.firstName} {member.lastName}
                          </h4>
                          <Badge variant={member.isActive ? "default" : "secondary"}>
                            {member.isActive ? "Active" : "Inactive"}
                          </Badge>
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
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <CreditCard className="h-5 w-5 mr-2 text-blue-600" />
                  Payment Information
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
                ) : paymentHistory && paymentHistory.length > 0 ? (
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
                        {paymentHistory.map((payment: any, idx: number) => (
                          <TableRow key={payment.id || idx}>
                            <TableCell>
                              {payment.created_at ? format(new Date(payment.created_at), 'MMM d, yyyy h:mm a') : 'N/A'}
                            </TableCell>
                            <TableCell className="font-semibold">
                              ${typeof payment.amount === 'number' ? payment.amount.toFixed(2) : payment.amount || '0.00'}
                            </TableCell>
                            <TableCell>
                              <Badge className={
                                payment.status === 'succeeded' ? 'bg-green-100 text-green-800' :
                                payment.status === 'failed' ? 'bg-red-100 text-red-800' :
                                payment.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-gray-100 text-gray-600'
                              }>
                                {payment.status || 'unknown'}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {payment.transaction_id || 'N/A'}
                            </TableCell>
                            <TableCell className="capitalize">
                              {payment.payment_method || 'N/A'}
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
                      If this enrollment is missing a commission, you can manually create it here.
                    </p>
                    <Button
                      onClick={() => createCommissionMutation.mutate()}
                      disabled={createCommissionMutation.isPending}
                      variant="outline"
                      size="sm"
                    >
                      <DollarSign className="h-4 w-4 mr-2" />
                      {createCommissionMutation.isPending ? 'Creating...' : 'Create Commission'}
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
    </div>
  );
}