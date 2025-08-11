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
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPhoneNumber, cleanPhoneNumber, formatZipCode } from "@/lib/formatters";

interface EnrollmentDetails {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
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
  monthlyPrice: number;
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
  
  // Fetch enrollment details
  const { data: enrollment, isLoading } = useQuery<EnrollmentDetails>({
    queryKey: [`/api/admin/enrollment/${enrollmentId}`],
    enabled: !!enrollmentId,
  });
  
  // Update contact info mutation
  const updateContactMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("PATCH", `/api/admin/enrollment/${enrollmentId}/contact`, data);
      if (!response.ok) throw new Error("Failed to update contact information");
      return response.json();
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
      const response = await apiRequest("PATCH", `/api/admin/enrollment/${enrollmentId}/address`, data);
      if (!response.ok) throw new Error("Failed to update address");
      return response.json();
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
  
  // Export enrollment summary
  const exportSummary = () => {
    if (!enrollment) return;
    
    const summary = `
ENROLLMENT SUMMARY
==================
Customer Number: MPP2025${enrollment.userId.padStart(6, '0')}
Enrollment Date: ${format(new Date(enrollment.createdAt), 'MMMM d, yyyy')}

MEMBER INFORMATION
------------------
Name: ${enrollment.firstName} ${enrollment.middleName || ''} ${enrollment.lastName}
Date of Birth: ${format(new Date(enrollment.dateOfBirth), 'MM/dd/yyyy')}
Email: ${enrollment.email}
Phone: ${formatPhoneNumber(enrollment.phone)}

ADDRESS
-------
${enrollment.address}
${enrollment.address2 || ''}
${enrollment.city}, ${enrollment.state} ${enrollment.zipCode}

PLAN DETAILS
------------
Plan: ${enrollment.planName}
Coverage Type: ${enrollment.memberType}
Monthly Premium: $${enrollment.monthlyPrice}
Start Date: ${format(new Date(enrollment.planStartDate), 'MM/dd/yyyy')}
Status: ${enrollment.status}

${enrollment.emergencyContactName ? `
EMERGENCY CONTACT
-----------------
Name: ${enrollment.emergencyContactName}
Phone: ${formatPhoneNumber(enrollment.emergencyContactPhone || '')}
` : ''}

${enrollment.familyMembers && enrollment.familyMembers.length > 0 ? `
FAMILY MEMBERS
--------------
${enrollment.familyMembers.map((member, index) => `
${index + 1}. ${member.firstName} ${member.lastName}
   Relationship: ${member.relationship}
   DOB: ${format(new Date(member.dateOfBirth), 'MM/dd/yyyy')}
   Status: ${member.isActive ? 'Active' : 'Inactive'}
`).join('')}
` : ''}

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
                  Customer #MPP2025{enrollment.userId.padStart(6, '0')} • Enrolled {format(new Date(enrollment.createdAt), 'MMM d, yyyy')}
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
                    <p className="font-semibold capitalize">{enrollment.memberType.replace(/-/g, ' ')}</p>
                  </div>
                  <div>
                    <Label className="text-gray-600">Monthly Premium</Label>
                    <p className="font-semibold text-2xl text-green-600">${enrollment.monthlyPrice}</p>
                  </div>
                  <div>
                    <Label className="text-gray-600">Start Date</Label>
                    <p className="font-semibold">{format(new Date(enrollment.planStartDate), 'MMMM d, yyyy')}</p>
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
                    <p className="font-semibold">{format(new Date(enrollment.dateOfBirth), 'MM/dd/yyyy')}</p>
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
                      <p className="font-semibold">{formatPhoneNumber(enrollment.phone)}</p>
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
                              <p className="font-semibold">{formatPhoneNumber(enrollment.emergencyContactPhone)}</p>
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
                        value={formatPhoneNumber(editedContact.phone)}
                        onChange={(e) => {
                          const formatted = formatPhoneNumber(e.target.value);
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
                          value={formatPhoneNumber(editedContact.emergencyContactPhone)}
                          onChange={(e) => {
                            const formatted = formatPhoneNumber(e.target.value);
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
                          value={formatZipCode(editedAddress.zipCode)}
                          onChange={(e) => {
                            const formatted = formatZipCode(e.target.value);
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
                  {(enrollment.memberType.includes('spouse') || enrollment.memberType.includes('children') || enrollment.memberType === 'family') && (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="sm">
                          <UserPlus className="h-4 w-4 mr-2" />
                          Add Member
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add Family Member</DialogTitle>
                          <DialogDescription>
                            Add a new family member to this enrollment.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 mt-4">
                          <p className="text-sm text-gray-600">This feature is coming soon.</p>
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
                            <span className="text-gray-600">DOB:</span> {format(new Date(member.dateOfBirth), 'MM/dd/yyyy')}
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
                    <p className="font-semibold text-2xl">${enrollment.monthlyPrice}</p>
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
                      {format(new Date(new Date(enrollment.planStartDate).setMonth(new Date().getMonth() + 1)), 'MMMM d, yyyy')}
                    </p>
                  </div>
                  <div className="pt-4 border-t">
                    <p className="text-sm text-gray-600 mb-4">
                      Payment information updates are currently handled through customer service.
                    </p>
                    <Button variant="outline" disabled>
                      <CreditCard className="h-4 w-4 mr-2" />
                      Update Payment Method (Coming Soon)
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