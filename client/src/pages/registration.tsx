import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import apiClient from "@/lib/apiClient";
import { ProgressIndicator } from "@/components/progress-indicator";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { CancellationPolicyModal } from "@/components/CancellationPolicyModal";
import { Plus, ChevronLeft } from "lucide-react";
import { formatPhoneNumber, cleanPhoneNumber, formatSSN, cleanSSN, formatZipCode } from "@/lib/formatters";
import { hasAtLeastRole } from "@/lib/roles";

const registrationSchema = z.object({
  // Personal information
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  middleName: z.string().optional(),
  ssn: z.string().optional().transform(val => val === "" ? undefined : val),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(10, "Valid phone number is required"),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  gender: z.string().optional(),
  // Address information
  address: z.string().min(1, "Address is required"),
  address2: z.string().optional(),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  zipCode: z.string().min(5, "Valid ZIP code is required"),
  // Employment information (optional for non-individual plans)
  employerName: z.string().optional(),
  divisionName: z.string().optional(),
  dateOfHire: z.string().optional(),
  memberType: z.string().min(1, "Member type is required"),
  planStartDate: z.string().min(1, "Plan start date is required"),
  // Emergency contact
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  // Plan selection
  planId: z.number().min(1, "Plan selection is required"),
  termsAccepted: z.boolean().refine(val => val === true, "Terms must be accepted"),
  communicationsConsent: z.boolean().default(false),
  // Privacy notice acknowledgment
  privacyNoticeAcknowledged: z.boolean().refine(val => val === true, "You must acknowledge the privacy notice"),
  faqDownloaded: z.boolean().refine(val => val === true, "You must download and review the FAQ document"),
  // Discount code (optional)
  discountCode: z.string().optional(),
}).superRefine((data, ctx) => {
  // Make employer fields required only for group/employer plans (not individual)
  // For now, all employer fields are optional since we don't have a clear indicator for group plans
  // This can be enhanced later when group plan functionality is added
});

type RegistrationForm = z.infer<typeof registrationSchema>;

export default function Registration() {
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [coverageType, setCoverageType] = useState<string>("Member Only");
  const [addRxValet, setAddRxValet] = useState(false);
  const [familyMembers, setFamilyMembers] = useState<any[]>([]);
  const [currentFamilyMemberIndex, setCurrentFamilyMemberIndex] = useState(0);
  const [recommendedTier, setRecommendedTier] = useState<string | null>(null);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [discountValidation, setDiscountValidation] = useState<{
    isValid: boolean;
    discountAmount: number;
    message: string;
  } | null>(null);
  const [isValidatingDiscount, setIsValidatingDiscount] = useState(false);
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  // Query to get current user data
  const { data: currentUser } = useQuery<{ 
    id?: string;
    role?: string;
    agentNumber?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
  }>({
    queryKey: ['/api/user'],
    enabled: isAuthenticated,
  });
  const isAdminUser = hasAtLeastRole(currentUser?.role, 'admin');
  const isAgentOrAbove = hasAtLeastRole(currentUser?.role, 'agent');

  // Check for recommended tier from quiz
  useEffect(() => {
    const tierFromQuiz = sessionStorage.getItem('recommendedTier');
    if (tierFromQuiz) {
      setRecommendedTier(tierFromQuiz);
      sessionStorage.removeItem('recommendedTier'); // Clear after reading
    }
  }, []);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to continue with enrollment.",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, authLoading, toast]);

  const { data: plans = [], isLoading: plansLoading } = useQuery<any[]>({
    queryKey: ["/api/plans"],
    enabled: isAuthenticated,
  });

  const form = useForm<RegistrationForm>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      middleName: "",
      ssn: "",
      email: "",
      phone: "",
      dateOfBirth: "",
      gender: "",
      address: "",
      address2: "",
      city: "",
      state: "",
      zipCode: "",
      employerName: "",
      divisionName: "",
      dateOfHire: "",
      memberType: "",
      planStartDate: "",
      discountCode: "",
      emergencyContactName: "",
      emergencyContactPhone: "",
      planId: 0,
      termsAccepted: false,
      communicationsConsent: false,
      privacyNoticeAcknowledged: false,
      faqDownloaded: false,
    },
  });

  const registrationMutation = useMutation({
    mutationFn: async (data: RegistrationForm) => {
      const isFamilyCoverage = coverageType === "Family";
      const rxValetPrice = isFamilyCoverage ? 21 : 19;
      const planPrice = selectedPlan ? parseFloat(selectedPlan.price) : 0;
      const subtotal = planPrice + (addRxValet ? rxValetPrice : 0);
      const discountAmount = discountValidation?.isValid ? discountValidation.discountAmount : 0;
      const subtotalAfterDiscount = Math.max(0, subtotal - discountAmount);
      const processingFee = Number((subtotalAfterDiscount * 0.04).toFixed(2));
      const totalWithFees = Number((subtotalAfterDiscount * 1.04).toFixed(2));

      const registrationPayload = {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        middleName: data.middleName,
        phone: data.phone,
        dateOfBirth: data.dateOfBirth,
        gender: data.gender,
        ssn: data.ssn,
        address: data.address,
        address2: data.address2,
        city: data.city,
        state: data.state,
        zipCode: data.zipCode,
        emergencyContactName: data.emergencyContactName,
        emergencyContactPhone: data.emergencyContactPhone,
        employerName: data.employerName,
        divisionName: data.divisionName,
        dateOfHire: data.dateOfHire,
        memberType: data.memberType,
        planStartDate: data.planStartDate,
        planId: selectedPlanId,
        coverageType,
        addRxValet,
        totalMonthlyPrice: totalWithFees,
        familyMembers,
        termsAccepted: data.termsAccepted,
        privacyAccepted: data.privacyNoticeAcknowledged,
        privacyNoticeAcknowledged: data.privacyNoticeAcknowledged,
        smsConsent: data.communicationsConsent,
        communicationsConsent: data.communicationsConsent,
        faqDownloaded: data.faqDownloaded,
        discountCode: data.discountCode || null,
        agentNumber: currentUser?.agentNumber || null,
        enrolledByAgentId: currentUser?.id || null
      };

      const apiResponse = await apiClient.post("/api/registration", registrationPayload);

      return {
        apiResponse,
        pricing: {
          subtotal,
          discountAmount,
          subtotalAfterDiscount,
          processingFee,
          totalWithFees
        }
      };
    },
    onSuccess: ({ apiResponse, pricing }) => {
      console.log("[Registration] Member created, preparing payment session");

      if (!apiResponse?.member?.id) {
        toast({
          title: "Registration Error",
          description: "Member record missing from server response.",
          variant: "destructive"
        });
        return;
      }

      const member = apiResponse.member;
      const formValues = form.getValues();

      sessionStorage.setItem("paymentAttempts", "0");
      sessionStorage.setItem("memberId", member.id.toString());
      sessionStorage.setItem(
        "memberData",
        JSON.stringify({
          id: member.id,
          customerNumber: member.customerNumber,
          firstName: member.firstName || formValues.firstName,
          lastName: member.lastName || formValues.lastName,
          email: member.email || formValues.email,
          phone: formValues.phone,
          totalMonthlyPrice: pricing.totalWithFees.toFixed(2)
        })
      );
      sessionStorage.setItem(
        "primaryAddress",
        JSON.stringify({
          address: formValues.address || "",
          address2: formValues.address2 || "",
          city: formValues.city || "",
          state: formValues.state || "",
          zipCode: formValues.zipCode || "",
          phone: formValues.phone || ""
        })
      );

      sessionStorage.setItem("selectedPlanId", selectedPlanId?.toString() || "");
      sessionStorage.setItem("addRxValet", addRxValet.toString());
      sessionStorage.setItem("rxValet", addRxValet ? "yes" : "no");
      sessionStorage.setItem("basePlanPrice", selectedPlan?.price || "0");
      sessionStorage.setItem("discountCode", formValues.discountCode || "");
      sessionStorage.setItem("discountAmount", pricing.discountAmount.toFixed(2));
      sessionStorage.setItem("subtotal", pricing.subtotal.toFixed(2));
      sessionStorage.setItem("processingFee", pricing.processingFee.toFixed(2));
      sessionStorage.setItem("totalMonthlyPrice", pricing.totalWithFees.toFixed(2));
      sessionStorage.setItem("coverageType", coverageType);
      sessionStorage.setItem("familyMembers", JSON.stringify(familyMembers));

      toast({
        title: "✅ Registration Complete!",
        description: `Member ID: ${member.id} | Customer #: ${member.customerNumber || member.id}\nRedirecting to payment...`,
        duration: 4000
      });
      
      // Show member info before redirecting to payment
      setTimeout(() => {
        setLocation("/payment");
      }, 3000);
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
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
      toast({
        title: "Registration Failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Validate discount code
  const validateDiscountCode = async (code: string) => {
    if (!code || code.trim() === "") {
      setDiscountValidation(null);
      return;
    }

    setIsValidatingDiscount(true);
    try {
      const response = await apiRequest(`/api/discount-codes/validate?code=${encodeURIComponent(code.trim())}`);
      
      if (response.isValid) {
        setDiscountValidation({
          isValid: true,
          discountAmount: response.discountAmount,
          message: `✓ Discount applied: $${response.discountAmount} off`,
        });
        toast({
          title: "Discount Code Valid",
          description: `$${response.discountAmount} discount will be applied to your plan.`,
        });
      } else {
        setDiscountValidation({
          isValid: false,
          discountAmount: 0,
          message: response.message || "Invalid discount code",
        });
      }
    } catch (error: any) {
      setDiscountValidation({
        isValid: false,
        discountAmount: 0,
        message: error.message || "Unable to validate discount code",
      });
    } finally {
      setIsValidatingDiscount(false);
    }
  };

  const handleNextStep = () => {
    if (currentStep === 1) {
      // Validate personal information
      const personalFields = ['firstName', 'lastName', 'email', 'phone', 'dateOfBirth', 'memberType'] as const;
      form.trigger(personalFields).then((isValid) => {
        if (isValid) setCurrentStep(2);
      });
    } else if (currentStep === 2) {
      // Validate employment information when required
      const memberType = form.getValues('memberType');
      if (memberType === 'member-only') {
        const employmentFields = ['employerName', 'dateOfHire'] as const;
        form.trigger(employmentFields).then((isValid) => {
          if (isValid) setCurrentStep(3);
        });
      } else {
        setCurrentStep(3);
      }
    } else if (currentStep === 3) {
      // Validate plan timing fields
      const planTimingFields = ['planStartDate'] as const;
      form.trigger(planTimingFields).then((isValid) => {
        if (isValid) setCurrentStep(4);
      });
    } else if (currentStep === 4) {
      // Validate address information
      const addressFields = ['address', 'city', 'state', 'zipCode'] as const;
      form.trigger(addressFields).then((isValid) => {
        if (isValid) {
          if (coverageType === "Member/Spouse" || coverageType === "Family") {
            setCurrentStep(5);
          } else if (coverageType === "Member/Child") {
            setCurrentStep(6);
          } else {
            setCurrentStep(7);
          }
        }
      });
    } else if (currentStep === 5) {
      // Spouse step complete; decide if we need children info
      if (coverageType === "Family") {
        setCurrentStep(6);
      } else {
        setCurrentStep(7);
      }
    } else if (currentStep === 6) {
      // Children info complete
      setCurrentStep(7);
    } else if (currentStep === 7) {
      // Ensure plan is selected before review
      if (!selectedPlanId) {
        toast({
          title: "Please select a healthcare membership",
          description: "You must choose a healthcare membership before continuing.",
          variant: "destructive",
        });
        return;
      }
      form.setValue('planId', selectedPlanId);
      setCurrentStep(8);
    } else if (currentStep === 8) {
      // Validate acknowledgments
      const checkboxFields = ['termsAccepted', 'privacyNoticeAcknowledged', 'communicationsConsent', 'faqDownloaded'] as const;
      form.trigger(checkboxFields).then((isValid) => {
        if (!isValid) {
          toast({
            title: "Please complete all required acknowledgments",
            description: "You must accept the terms, acknowledge the privacy notice, and download the FAQ document before proceeding.",
            variant: "destructive",
          });
        }
      });
    }
  };

  const handlePrevStep = () => {
    if (currentStep === 8) {
      setCurrentStep(7);
    } else if (currentStep === 7) {
      if (coverageType === "Family" || coverageType === "Member/Child") {
        setCurrentStep(6);
      } else if (coverageType === "Member/Spouse") {
        setCurrentStep(5);
      } else {
        setCurrentStep(4);
      }
    } else if (currentStep === 6) {
      if (coverageType === "Family") {
        setCurrentStep(5);
      } else {
        setCurrentStep(4);
      }
    } else if (currentStep === 5) {
      setCurrentStep(4);
    } else if (currentStep === 4) {
      setCurrentStep(3);
    } else if (currentStep === 3) {
      setCurrentStep(2);
    } else if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const onSubmit = (data: RegistrationForm) => {
    // Add the selected plan ID and family members to the form data
    const submissionData = {
      ...data,
      planId: selectedPlanId!,
      familyMembers: familyMembers.filter(member => member && member.firstName), // Include only valid family members
    };
    registrationMutation.mutate(submissionData);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect to login
  }

  const selectedPlan = Array.isArray(plans) ? plans.find((plan: any) => plan.id === selectedPlanId) : null;
  const steps = [
    { number: 1, title: "Personal Info" },
    { number: 2, title: "Address" },
    { number: 3, title: "Plan Selection" },
    { number: 4, title: "Review & Terms" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Header for Admin and Agent */}
      {isAgentOrAbove && (
        <div className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center">
              <Link href={isAdminUser ? '/admin' : '/agent'}>
                <Button variant="ghost" className="mr-4">
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back to {isAdminUser ? 'Admin' : 'Agent'} Dashboard
                </Button>
              </Link>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Enroll Member</h2>
                <p className="text-sm text-gray-600">Complete the enrollment process for a new member</p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <div className="py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Card className="p-8">
            <CardContent className="p-0">
              {/* Progress Indicator */}
              <ProgressIndicator currentStep={currentStep} totalSteps={8} />

              <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  {currentStep === 1 && "Personal Information"}
                  {currentStep === 2 && "Employment Information"}
                  {currentStep === 3 && "Plan Start & Discounts"}
                  {currentStep === 4 && "Address Information"}
                  {currentStep === 5 && "Spouse Information"}
                  {currentStep === 6 && "Children Information"}
                  {currentStep === 7 && "Select Your Healthcare Membership"}
                  {currentStep === 8 && "Review & Terms"}
                </h1>
                <p className="text-gray-600">
                  {currentStep === 1 && "Tell us about yourself"}
                  {currentStep === 2 && "Tell us about your employer"}
                  {currentStep === 3 && "Choose when coverage begins and apply discounts"}
                  {currentStep === 4 && "Where can we reach you?"}
                  {currentStep === 5 && "Tell us about your spouse"}
                  {currentStep === 6 && "Tell us about your children"}
                  {currentStep === 7 && "Choose your healthcare membership level"}
                  {currentStep === 8 && "Review your information and accept terms"}
                </p>
              </div>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {currentStep === 1 && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <FormField
                        control={form.control}
                        name="firstName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>First Name *</FormLabel>
                            <FormControl>
                              <Input placeholder="John" autoComplete="given-name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="middleName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Middle Name</FormLabel>
                            <FormControl>
                              <Input placeholder="A" autoComplete="additional-name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="lastName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Last Name *</FormLabel>
                            <FormControl>
                              <Input placeholder="Smith" autoComplete="family-name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email Address *</FormLabel>
                            <FormControl>
                              <Input
                                type="email"
                                placeholder="john.smith@email.com"
                                autoComplete="email"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Phone Number * (USA Only)</FormLabel>
                            <FormControl>
                              <Input 
                                type="tel" 
                                placeholder="(555) 123-4567" 
                                {...field}
                                value={formatPhoneNumber(field.value || '')}
                                onChange={(e) => {
                                  const formatted = formatPhoneNumber(e.target.value);
                                  const cleaned = cleanPhoneNumber(formatted);
                                  field.onChange(cleaned);
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="ssn"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Last 4 Digits of SSN (Required for Agent Number)</FormLabel>
                            <FormControl>
                              <Input 
                                type="text" 
                                placeholder="1154" 
                                maxLength={4}
                                autoComplete="off"
                                {...field}
                                onChange={(e) => {
                                  const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                                  field.onChange(value);
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                            <p className="text-xs text-gray-500">
                              Used to generate your unique agent identifier (e.g., MPPSA231154)
                            </p>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="dateOfBirth"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Date of Birth *</FormLabel>
                            <FormControl>
                              <Input 
                                type="date" 
                                {...field}
                                max={new Date().toISOString().split('T')[0]} // Only allow past dates
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="gender"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Gender</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select Gender" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="male">Male</SelectItem>
                                <SelectItem value="female">Female</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                                <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="memberType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Member Type *</FormLabel>
                            <Select 
                              onValueChange={(value) => {
                                field.onChange(value);
                                // Automatically set coverage type based on member type
                                const coverageMap: { [key: string]: string } = {
                                  'member-only': 'Member Only',
                                  'member-spouse': 'Member/Spouse',
                                  'member-children': 'Member/Child',
                                  'family': 'Family'
                                };
                                setCoverageType(coverageMap[value] || '');
                              }} 
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select Member Type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="member-only">Member only</SelectItem>
                                <SelectItem value="member-spouse">Member/Spouse</SelectItem>
                                <SelectItem value="member-children">Member Children</SelectItem>
                                <SelectItem value="family">Family</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                )}

                {currentStep === 2 && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="employerName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Employer Name {form.watch("memberType") !== "member-only" && "*"}
                              {form.watch("memberType") === "member-only" && " (Optional for individual enrollments)"}
                            </FormLabel>
                            <FormControl>
                              <Input placeholder="ABC Corporation" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="divisionName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Division Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Sales Division" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="dateOfHire"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Date of Hire {form.watch("memberType") !== "member-only" && "*"}
                            {form.watch("memberType") === "member-only" && " (Optional for individual enrollments)"}
                          </FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {currentStep === 3 && (
                  <div className="space-y-6">
                    <FormField
                      control={form.control}
                      name="planStartDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Plan Start Date * (Today or up to 30 days from now)</FormLabel>
                          <FormControl>
                            <Input 
                              type="date" 
                              {...field}
                              min={new Date().toISOString().split('T')[0]} // No backdating
                              max={new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]} // Max 30 days
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="border-t pt-6">
                      <FormField
                        control={form.control}
                        name="discountCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Discount Code (Optional)</FormLabel>
                            <div className="flex gap-2">
                              <FormControl>
                                <Input 
                                  placeholder="Enter discount code" 
                                  {...field}
                                  onChange={(e) => {
                                    field.onChange(e);
                                    setDiscountValidation(null);
                                  }}
                                  className={
                                    discountValidation?.isValid 
                                      ? "border-green-500 bg-green-50" 
                                      : discountValidation?.isValid === false 
                                      ? "border-red-500 bg-red-50" 
                                      : ""
                                  }
                                />
                              </FormControl>
                              <Button
                                type="button"
                                onClick={() => validateDiscountCode(field.value || "")}
                                disabled={!field.value || isValidatingDiscount}
                              >
                                {isValidatingDiscount ? "Checking..." : "Apply"}
                              </Button>
                            </div>
                            {discountValidation && (
                              <p className={`text-sm mt-1 ${discountValidation.isValid ? 'text-green-600 font-medium' : 'text-red-600'}`}>
                                {discountValidation.message}
                              </p>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                )}

                {currentStep === 4 && (
                  <div className="space-y-6">
                    <FormField
                      control={form.control}
                      name="address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Street Address *</FormLabel>
                          <FormControl>
                            <Input placeholder="123 Main Street" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="address2"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address Line 2</FormLabel>
                          <FormControl>
                            <Input placeholder="Apt 4B" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="city"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>City *</FormLabel>
                            <FormControl>
                              <Input placeholder="Denver" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="state"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>State *</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select State" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="AL">Alabama</SelectItem>
                                <SelectItem value="AK">Alaska</SelectItem>
                                <SelectItem value="AZ">Arizona</SelectItem>
                                <SelectItem value="AR">Arkansas</SelectItem>
                                <SelectItem value="CA">California</SelectItem>
                                <SelectItem value="CO">Colorado</SelectItem>
                                <SelectItem value="CT">Connecticut</SelectItem>
                                <SelectItem value="DE">Delaware</SelectItem>
                                <SelectItem value="FL">Florida</SelectItem>
                                <SelectItem value="GA">Georgia</SelectItem>
                                <SelectItem value="HI">Hawaii</SelectItem>
                                <SelectItem value="ID">Idaho</SelectItem>
                                <SelectItem value="IL">Illinois</SelectItem>
                                <SelectItem value="IN">Indiana</SelectItem>
                                <SelectItem value="IA">Iowa</SelectItem>
                                <SelectItem value="KS">Kansas</SelectItem>
                                <SelectItem value="KY">Kentucky</SelectItem>
                                <SelectItem value="LA">Louisiana</SelectItem>
                                <SelectItem value="ME">Maine</SelectItem>
                                <SelectItem value="MD">Maryland</SelectItem>
                                <SelectItem value="MA">Massachusetts</SelectItem>
                                <SelectItem value="MI">Michigan</SelectItem>
                                <SelectItem value="MN">Minnesota</SelectItem>
                                <SelectItem value="MS">Mississippi</SelectItem>
                                <SelectItem value="MO">Missouri</SelectItem>
                                <SelectItem value="MT">Montana</SelectItem>
                                <SelectItem value="NE">Nebraska</SelectItem>
                                <SelectItem value="NV">Nevada</SelectItem>
                                <SelectItem value="NH">New Hampshire</SelectItem>
                                <SelectItem value="NJ">New Jersey</SelectItem>
                                <SelectItem value="NM">New Mexico</SelectItem>
                                <SelectItem value="NY">New York</SelectItem>
                                <SelectItem value="NC">North Carolina</SelectItem>
                                <SelectItem value="ND">North Dakota</SelectItem>
                                <SelectItem value="OH">Ohio</SelectItem>
                                <SelectItem value="OK">Oklahoma</SelectItem>
                                <SelectItem value="OR">Oregon</SelectItem>
                                <SelectItem value="PA">Pennsylvania</SelectItem>
                                <SelectItem value="RI">Rhode Island</SelectItem>
                                <SelectItem value="SC">South Carolina</SelectItem>
                                <SelectItem value="SD">South Dakota</SelectItem>
                                <SelectItem value="TN">Tennessee</SelectItem>
                                <SelectItem value="TX">Texas</SelectItem>
                                <SelectItem value="UT">Utah</SelectItem>
                                <SelectItem value="VT">Vermont</SelectItem>
                                <SelectItem value="VA">Virginia</SelectItem>
                                <SelectItem value="WA">Washington</SelectItem>
                                <SelectItem value="WV">West Virginia</SelectItem>
                                <SelectItem value="WI">Wisconsin</SelectItem>
                                <SelectItem value="WY">Wyoming</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="zipCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>ZIP Code *</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="80202" 
                                {...field}
                                value={formatZipCode(field.value || '')}
                                onChange={(e) => {
                                  const formatted = formatZipCode(e.target.value);
                                  field.onChange(formatted.replace(/-/g, '')); // Store without hyphen
                                }}
                                maxLength={10}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="border-t border-gray-200 pt-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Emergency Contact</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="emergencyContactName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Contact Name</FormLabel>
                              <FormControl>
                                <Input placeholder="Jane Smith" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="emergencyContactPhone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Contact Phone (USA Only)</FormLabel>
                              <FormControl>
                                <Input 
                                  type="tel" 
                                  placeholder="(555) 987-6543" 
                                  {...field}
                                  value={formatPhoneNumber(field.value || '')}
                                  onChange={(e) => {
                                    const formatted = formatPhoneNumber(e.target.value);
                                    const cleaned = cleanPhoneNumber(formatted);
                                    field.onChange(cleaned);
                                  }}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {currentStep === 5 && (
                  <div className="space-y-6">
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Spouse Information</h3>
                      <p className="text-sm text-gray-600">Please provide information about your spouse</p>
                    </div>
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">First Name *</label>
                          <Input 
                            placeholder="Jane" 
                            value={familyMembers[0]?.firstName || ""} 
                            onChange={(e) => {
                              const updated = [...familyMembers];
                              if (!updated[0]) updated[0] = {};
                              updated[0].firstName = e.target.value;
                              updated[0].relationship = "spouse";
                              setFamilyMembers(updated);
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Middle Name</label>
                          <Input 
                            placeholder="M" 
                            value={familyMembers[0]?.middleName || ""} 
                            onChange={(e) => {
                              const updated = [...familyMembers];
                              if (!updated[0]) updated[0] = {};
                              updated[0].middleName = e.target.value;
                              setFamilyMembers(updated);
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Last Name *</label>
                          <Input 
                            placeholder="Doe" 
                            value={familyMembers[0]?.lastName || ""} 
                            onChange={(e) => {
                              const updated = [...familyMembers];
                              if (!updated[0]) updated[0] = {};
                              updated[0].lastName = e.target.value;
                              setFamilyMembers(updated);
                            }}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Date of Birth *</label>
                          <Input 
                            type="date" 
                            value={familyMembers[0]?.dateOfBirth || ""} 
                            onChange={(e) => {
                              const updated = [...familyMembers];
                              if (!updated[0]) updated[0] = {};
                              updated[0].dateOfBirth = e.target.value;
                              setFamilyMembers(updated);
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
                          <Select 
                            value={familyMembers[0]?.gender || ""} 
                            onValueChange={(value) => {
                              const updated = [...familyMembers];
                              if (!updated[0]) updated[0] = {};
                              updated[0].gender = value;
                              setFamilyMembers(updated);
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select Gender" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="male">Male</SelectItem>
                              <SelectItem value="female">Female</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">SSN (Optional)</label>
                          <Input 
                            type="password" 
                            placeholder="123456789 (Optional)" 
                            maxLength={9}
                            value={familyMembers[0]?.ssn || ""} 
                            onChange={(e) => {
                              const updated = [...familyMembers];
                              if (!updated[0]) updated[0] = {};
                              updated[0].ssn = e.target.value;
                              setFamilyMembers(updated);
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Phone (Optional)</label>
                          <Input 
                            type="tel" 
                            placeholder="(555) 123-4567" 
                            value={familyMembers[0]?.phone || ""} 
                            onChange={(e) => {
                              const updated = [...familyMembers];
                              if (!updated[0]) updated[0] = {};
                              updated[0].phone = e.target.value;
                              setFamilyMembers(updated);
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {currentStep === 6 && (
                  <div className="space-y-6">
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Children Information</h3>
                      <p className="text-sm text-gray-600">Please provide information about your children</p>
                    </div>
                    
                    {/* Children list */}
                    {familyMembers.filter((m, i) => i > 0 || (i === 0 && m.relationship !== "spouse")).map((child, index) => {
                      const childIndex = familyMembers.indexOf(child);
                      return (
                        <div key={index} className="border border-gray-200 rounded-lg p-6 relative">
                          <h4 className="text-md font-semibold text-gray-900 mb-4">Child {index + 1}</h4>
                          <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">First Name *</label>
                                <Input 
                                  placeholder="John" 
                                  value={child.firstName || ""} 
                                  onChange={(e) => {
                                    const updated = [...familyMembers];
                                    updated[childIndex] = {
                                      ...updated[childIndex],
                                      firstName: e.target.value,
                                      relationship: "child"
                                    };
                                    setFamilyMembers(updated);
                                  }}
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Middle Name</label>
                                <Input 
                                  placeholder="M" 
                                  value={child.middleName || ""} 
                                  onChange={(e) => {
                                    const updated = [...familyMembers];
                                    updated[childIndex] = {
                                      ...updated[childIndex],
                                      middleName: e.target.value
                                    };
                                    setFamilyMembers(updated);
                                  }}
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Last Name *</label>
                                <Input 
                                  placeholder="Doe" 
                                  value={child.lastName || ""} 
                                  onChange={(e) => {
                                    const updated = [...familyMembers];
                                    updated[childIndex] = {
                                      ...updated[childIndex],
                                      lastName: e.target.value
                                    };
                                    setFamilyMembers(updated);
                                  }}
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Date of Birth *</label>
                                <Input 
                                  type="date" 
                                  value={child.dateOfBirth || ""} 
                                  onChange={(e) => {
                                    const updated = [...familyMembers];
                                    updated[childIndex] = {
                                      ...updated[childIndex],
                                      dateOfBirth: e.target.value
                                    };
                                    setFamilyMembers(updated);
                                  }}
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
                                <Select 
                                  value={child.gender || ""} 
                                  onValueChange={(value) => {
                                    const updated = [...familyMembers];
                                    updated[childIndex] = {
                                      ...updated[childIndex],
                                      gender: value
                                    };
                                    setFamilyMembers(updated);
                                  }}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select Gender" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="male">Male</SelectItem>
                                    <SelectItem value="female">Female</SelectItem>
                                    <SelectItem value="other">Other</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">SSN (Optional)</label>
                                <Input 
                                  type="password" 
                                  placeholder="123456789 (Optional)" 
                                  maxLength={9}
                                  value={child.ssn || ""} 
                                  onChange={(e) => {
                                    const updated = [...familyMembers];
                                    updated[childIndex] = {
                                      ...updated[childIndex],
                                      ssn: e.target.value
                                    };
                                    setFamilyMembers(updated);
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                          {/* Remove child button */}
                          {familyMembers.filter(m => m.relationship === "child").length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="absolute top-4 right-4 text-red-600 hover:text-red-700"
                              onClick={() => {
                                const updated = familyMembers.filter((_, i) => i !== childIndex);
                                setFamilyMembers(updated);
                              }}
                            >
                              Remove
                            </Button>
                          )}
                        </div>
                      );
                    })}
                    
                    {/* Add child button */}
                    {familyMembers.filter(m => m.relationship === "child").length < 5 ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          const newChild = { relationship: "child" };
                          setFamilyMembers([...familyMembers, newChild]);
                        }}
                        className="w-full"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add Child
                      </Button>
                    ) : null}
                    
                    <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-800">
                        <strong>Note:</strong> You can add up to 5 children to your healthcare membership.
                      </p>
                    </div>
                  </div>
                )}

                {currentStep === 7 && (
                  <div className="space-y-6">
                    {plansLoading ? (
                      <div className="flex justify-center">
                        <LoadingSpinner />
                      </div>
                    ) : (
                      <>
                        <div className="mb-4">
                          <h3 className="text-lg font-semibold text-gray-900 mb-2">Select Your Healthcare Membership</h3>
                          <p className="text-sm text-gray-600">Choose the membership level that best fits your healthcare membership needs</p>
                          {recommendedTier && (
                            <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                              <p className="text-sm text-blue-800">
                                <strong>Quiz Recommendation:</strong> Based on your quiz answers, we recommend the MyPremierPlan {recommendedTier.charAt(0).toUpperCase() + recommendedTier.slice(1)} plan.
                              </p>
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          {(() => {
                            if (!plans || plans.length === 0) {
                              console.log("No plans available");
                              return [];
                            }
                            
                            const filteredPlans = plans
                              .filter((plan: any) => {
                                // Map coverage types to plan name patterns
                                const coverageMapping: { [key: string]: string[] } = {
                                  "Member Only": ["Member Only", "Individual Plan"],
                                  "Member/Spouse": ["Member/Spouse"],
                                  "Member/Child": ["Member/Child", "Parent/Child"],
                                  "Family": ["Family"]
                                };
                                
                                const patterns = coverageMapping[coverageType] || [];
                                const matches = patterns.some(pattern => plan.name.includes(pattern));
                                console.log(`Plan "${plan.name}" matches "${coverageType}": ${matches}`);
                                return matches;
                              });
                            
                            console.log("Coverage Type:", coverageType);
                            console.log("Available plans:", plans.map((p: any) => p.name));
                            console.log("Filtered plans:", filteredPlans.map((p: any) => p.name));
                            
                            return filteredPlans || [];
                          })()
                            ?.filter((plan: any) => {
                              // Filter for tier-based plans (Base, Plus, Elite)
                              // Also allow "Individual Plan" and "Family Plan" for legacy compatibility
                              if (plan.name.includes("Base")) return true;
                              if (plan.name.includes("Plus") || plan.name.includes("+")) return true;
                              if (plan.name.includes("Elite")) return true;
                              if (plan.name.includes("Individual Plan")) return true;
                              if (plan.name === "Family Plan") return true;
                              return false;
                            })
                            .sort((a: any, b: any) => {
                              const order = ["Base", "Plus", "Elite"];
                              const aIndex = order.findIndex(tier => a.name.includes(tier));
                              const bIndex = order.findIndex(tier => b.name.includes(tier));
                              // Legacy plans go last
                              if (aIndex === -1) return 1;
                              if (bIndex === -1) return -1;
                              return aIndex - bIndex;
                            })
                            .map((plan: any) => {
                              const planTier = plan.name.includes("Base") ? "Base" : 
                                              plan.name.includes("Plus") || plan.name.includes("+") ? "Plus" : 
                                              plan.name.includes("Elite") ? "Elite" : "Standard";
                              const tierColor = planTier === "Base" ? "gray" : 
                                               planTier === "Plus" ? "blue" : 
                                               planTier === "Elite" ? "purple" : "green";
                              const isRecommended = recommendedTier && planTier.toLowerCase() === recommendedTier.toLowerCase();
                              
                              return (
                                <Card 
                                  key={plan.id} 
                                  className={`cursor-pointer transition-all duration-300 transform relative ${
                                    selectedPlanId === plan.id 
                                      ? "border-2 border-green-600 bg-green-50 scale-105 shadow-lg" 
                                      : isRecommended
                                      ? "border-2 border-blue-400 bg-blue-50 shadow-md"
                                      : "hover:shadow-md hover:scale-102"
                                  }`}
                                  onClick={() => {
                                    console.log("Selected plan:", plan.name, "ID:", plan.id);
                                    setSelectedPlanId(plan.id);
                                  }}
                                >
                                  <CardContent className="p-6">
                                    {isRecommended && (
                                      <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-3 py-1 rounded-full text-xs font-semibold">
                                        Recommended
                                      </div>
                                    )}
                                    <div className="text-center mb-4">
                                      <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-${tierColor}-100 text-${tierColor}-800 mb-3`}>
                                        MyPremierPlan {planTier}
                                      </div>
                                      <div className="text-3xl font-bold text-medical-blue-600 mb-1">
                                        ${plan.price}
                                      </div>
                                      <div className="text-gray-500 text-sm">per month</div>
                                    </div>
                                    <div className="space-y-2 mt-4">
                                      {plan.features?.slice(0, 6).map((feature: string, idx: number) => (
                                        <div key={idx} className="flex items-start text-sm text-gray-600">
                                          <span className="mr-2">•</span>
                                          <span>{feature}</span>
                                        </div>
                                      ))}
                                    </div>
                                    {selectedPlanId === plan.id && (
                                      <div className="mt-4 text-center">
                                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                                          Selected
                                        </span>
                                      </div>
                                    )}
                                  </CardContent>
                                </Card>
                              );
                            })}
                        </div>
                        
                        {/* RxValet Add-on */}
                        <div className="mt-8 border-t pt-6">
                          <h4 className="text-lg font-semibold text-gray-900 mb-4">Optional Add-on</h4>
                          <Card className={`cursor-pointer transition-all ${
                            addRxValet ? "border-2 border-green-600 bg-green-50" : "hover:shadow-md"
                          }`}
                          onClick={() => setAddRxValet(!addRxValet)}>
                            <CardContent className="p-6">
                              <div className="flex items-center justify-between">
                                <div>
                                  <h5 className="font-semibold text-gray-900">BestChoice Rx Pro Premium-5 Medication Program</h5>
                                  <p className="text-sm text-gray-600 mt-1">Acute and ACA medications no-cost, plus 200 chronic drugs for only $5/fill</p>
                                </div>
                                <div className="text-right">
                                  <div className="text-xl font-bold text-green-600">
                                    +${coverageType === "Family" ? "21" : "19"}/mo
                                  </div>
                                  {addRxValet && (
                                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 mt-2">
                                      Selected
                                    </span>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {currentStep === 8 && (
                  <div className="space-y-6">
                    {/* Important Disclaimer */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-sm text-blue-800 font-medium">
                        <strong>Important:</strong> MyPremierPlans DPC is not health insurance. It is a Direct Primary Care Hybrid pay model powered by Healthcare2U.
                      </p>
                    </div>

                    {/* Review Information */}
                    <div className="bg-gray-50 rounded-lg p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Review Your Information</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium">Name:</span> {form.watch("firstName")} {form.watch("middleName")} {form.watch("lastName")}
                        </div>
                        <div>
                          <span className="font-medium">SSN:</span> ***-**-{form.watch("ssn")?.slice(-4) || "****"}
                        </div>
                        <div>
                          <span className="font-medium">Date of Birth:</span> {form.watch("dateOfBirth")}
                        </div>
                        <div>
                          <span className="font-medium">Email:</span> {form.watch("email")}
                        </div>
                        <div>
                          <span className="font-medium">Phone:</span> {form.watch("phone")}
                        </div>
                        <div>
                          <span className="font-medium">Member Type:</span> {form.watch("memberType")}
                        </div>
                        <div>
                          <span className="font-medium">Employer:</span> {form.watch("employerName")}
                        </div>
                        <div>
                          <span className="font-medium">Division:</span> {form.watch("divisionName") || "N/A"}
                        </div>
                        <div>
                          <span className="font-medium">Date of Hire:</span> {form.watch("dateOfHire")}
                        </div>
                        <div>
                          <span className="font-medium">Plan Start Date:</span> {form.watch("planStartDate")}
                        </div>
                        <div>
                          <span className="font-medium">Coverage Type:</span> {coverageType}
                        </div>
                        <div>
                          <span className="font-medium">Selected Plan:</span> {selectedPlan?.name}
                        </div>
                        <div className="col-span-2">
                          <span className="font-medium">Address:</span> {form.watch("address")} {form.watch("address2") && `, ${form.watch("address2")}`}, {form.watch("city")}, {form.watch("state")} {form.watch("zipCode")}
                        </div>
                      </div>
                      
                      {/* Family Members */}
                      {familyMembers.length > 0 && (
                        <div className="mt-4 pt-4 border-t">
                          <h4 className="font-semibold text-gray-900 mb-2">Family Members</h4>
                          <div className="space-y-2">
                            {familyMembers.map((member, index) => (
                              <div key={index} className="text-sm">
                                <span className="font-medium">{member.relationship === "spouse" ? "Spouse" : `Child ${index + 1}`}:</span>{" "}
                                {member.firstName} {member.middleName} {member.lastName} - DOB: {member.dateOfBirth}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Monthly Cost */}
                      <div className="mt-4 pt-4 border-t">
                        <div className="col-span-2">
                          <span className="font-medium">Monthly Cost Breakdown:</span> 
                          <div className="mt-2 space-y-1">
                            <div className="text-sm">
                              Plan: ${selectedPlan?.price}
                              {addRxValet && <span> + RxValet: ${coverageType === "Family" ? "21" : "19"}</span>}
                            </div>
                            <div className="text-sm">
                              Subtotal: ${(parseFloat(selectedPlan?.price || "0") + (addRxValet ? (coverageType === "Family" ? 21 : 19) : 0)).toFixed(2)}
                            </div>
                            {discountValidation?.isValid && (
                              <div className="text-sm text-green-600 font-medium">
                                Discount ({form.watch("discountCode")}): -${discountValidation.discountAmount.toFixed(2)}
                              </div>
                            )}
                            <div className="text-sm">
                              Administration Fee (4%): ${(() => {
                                const subtotal = parseFloat(selectedPlan?.price || "0") + (addRxValet ? (coverageType === "Family" ? 21 : 19) : 0);
                                const discountAmount = discountValidation?.isValid ? discountValidation.discountAmount : 0;
                                const subtotalAfterDiscount = Math.max(0, subtotal - discountAmount);
                                return (subtotalAfterDiscount * 0.04).toFixed(2);
                              })()}
                            </div>
                            <div className="text-lg font-semibold border-t pt-1">
                              Total Monthly: <span className="text-green-600">
                                ${(() => {
                                  const subtotal = parseFloat(selectedPlan?.price || "0") + (addRxValet ? (coverageType === "Family" ? 21 : 19) : 0);
                                  const discountAmount = discountValidation?.isValid ? discountValidation.discountAmount : 0;
                                  const subtotalAfterDiscount = Math.max(0, subtotal - discountAmount);
                                  return (subtotalAfterDiscount * 1.04).toFixed(2);
                                })()}/month
                              </span>
                            </div>
                          </div>
                          {addRxValet && <span className="block text-sm text-gray-600 mt-1">Includes BestChoice Rx Pro Premium-5</span>}
                        </div>
                      </div>
                    </div>

                    {/* Terms and Conditions */}
                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="termsAccepted"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel className="text-sm">
                                I agree to the Terms of Service and Privacy Policy *
                              </FormLabel>
                              <div className="mt-1">
                                <button
                                  type="button"
                                  onClick={() => setShowPolicyModal(true)}
                                  className="text-sm text-blue-600 hover:text-blue-800 underline mr-3"
                                >
                                  View Cancellation & Refund Policy
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const privacyHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>My Premier Plans - Notice of Privacy Practices</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; }
    h1 { color: #1a365d; border-bottom: 2px solid #1a365d; padding-bottom: 10px; }
    h2 { color: #2c5282; margin-top: 30px; }
    strong { color: #2d3748; }
    hr { margin: 30px 0; border: 1px solid #e2e8f0; }
    .header-info { text-align: center; margin-bottom: 30px; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>
  <div class="header-info">
    <h1>My Premier Plans — Notice of Privacy Practices</h1>
    <p><strong>Your Information. Your Rights. Our Responsibilities.</strong></p>
    <p>This notice describes how medical information about you may be used and disclosed, and how you can get access to this information. Please review it carefully.</p>
    <p><strong>My Premier Plans</strong><br>
    4132 N 23rd Street<br>
    www.mypremierplans.com | info@mypremierplans.com | 210-512-4318</p>
  </div>
  <hr>
  <h2>Your Rights</h2>
  <p>When it comes to your health information, you have certain rights. This section explains those rights and our responsibilities to support them:</p>
  <ul>
    <li><strong>Get a copy of your health and claims records</strong><br>You may ask to see or get a copy of your records. We will provide a copy or summary within 30 days of your request and may charge a reasonable, cost-based fee.</li>
    <li><strong>Correct your health and claims records</strong><br>You may ask us to correct records if you believe they are incorrect or incomplete. We may decline your request, but will explain why in writing within 60 days.</li>
    <li><strong>Request confidential communications</strong><br>You can request we contact you in a specific way (e.g., home or office phone) or send mail to a different address. We will honor reasonable requests and must say yes if you indicate danger if we do not.</li>
    <li><strong>Ask us to limit what we use or share</strong><br>You can ask us not to use or share certain health information. We are not required to agree, and may say no if it affects your care.</li>
    <li><strong>Get a list of who we've shared your information with</strong><br>You can request an accounting of disclosures made within six years prior to your request, excluding certain routine disclosures. One accounting per year is free; additional requests may incur a reasonable, cost-based fee.</li>
    <li><strong>Get a copy of this privacy notice</strong><br>You may request a paper copy at any time, even if you agreed to receive it electronically.</li>
    <li><strong>Choose someone to act for you</strong><br>If you have a legal guardian or someone with medical power of attorney, they may exercise your rights on your behalf. We will confirm their authority before proceeding.</li>
    <li><strong>File a complaint if you feel your rights are violated</strong><br>Contact us or file a complaint with the U.S. Department of Health and Human Services Office for Civil Rights:<br>
    200 Independence Avenue, S.W., Washington, D.C. 20201<br>
    1-877-696-6775<br>
    www.hhs.gov/ocr/privacy/hipaa/complaints/<br>
    We will not retaliate against you for filing a complaint.</li>
  </ul>
  <h2>Your Choices</h2>
  <p>For certain health information, you have the right to tell us how to share it. If you have a clear preference, let us know and we will follow your instructions.</p>
  <p>You have the right and choice to tell us to:</p>
  <ul>
    <li>Share information with family, close friends, or others involved in payment for your care</li>
    <li>Share information in a disaster relief situation</li>
  </ul>
  <p>If you cannot tell us your preference (for example, if you are unconscious), we may share your information if we believe it is in your best interest.</p>
  <p><strong>We never share your information without written permission for:</strong></p>
  <ul>
    <li>Marketing purposes</li>
    <li>Sale of your information</li>
  </ul>
  <h2>Our Uses and Disclosures</h2>
  <p>We typically use or share your health information in these ways:</p>
  <ul>
    <li><strong>Help manage your health care treatment</strong><br>We share your information with professionals treating you.<br><em>Example:</em> A doctor shares your treatment plan with us for coordinating additional services.</li>
    <li><strong>Run our organization</strong><br>We use and disclose your information to operate our organization and contact you when necessary. We cannot use genetic information to determine coverage or cost of coverage (except for long-term care plans).<br><em>Example:</em> We use your information to develop better services.</li>
    <li><strong>Pay for your health services</strong><br>We can use and disclose your information to pay for services.<br><em>Example:</em> We coordinate payment with your health plan for a doctor visit.</li>
    <li><strong>Administer your plan</strong><br>We may disclose your information to your health plan sponsor for plan administration.<br><em>Example:</em> Your employer contracts with us, and we provide certain statistics to explain premiums.</li>
  </ul>
  <p><strong>How else can we share your information?</strong><br>
  We are allowed or required to share your information in other ways that contribute to the public good, after meeting certain legal conditions.</p>
  <ul>
    <li><strong>Help with public health and safety</strong><br>
    - Prevent disease<br>
    - Help with product recalls<br>
    - Report adverse reactions<br>
    - Report suspected abuse or neglect<br>
    - Prevent or reduce serious threats to health or safety</li>
    <li><strong>Do research</strong><br>We can use or share your information for health research.</li>
    <li><strong>Comply with the law</strong><br>We share information as required by state or federal laws, including compliance reviews by HHS.</li>
    <li><strong>Organ and tissue donation / medical examiners / funeral directors</strong><br>We can share information with organ procurement organizations or with coroners, medical examiners, or funeral directors upon death.</li>
    <li><strong>Workers' compensation, law enforcement, and other government requests</strong><br>We may share information:<br>
    - For workers' compensation claims<br>
    - With law enforcement<br>
    - With health oversight agencies<br>
    - For military, national security, or presidential protective services</li>
    <li><strong>Respond to lawsuits and legal actions</strong><br>We can share information in response to a court or administrative order, or a subpoena.</li>
  </ul>
  <p><strong>We never market or sell personal information.</strong><br>
  No mobile information will be shared with third parties/affiliates for marketing or promotional purposes.</p>
  <h2>Our Responsibilities</h2>
  <ul>
    <li>We are required by law to maintain the privacy and security of your protected health information.</li>
    <li>We will inform you promptly if a breach occurs that may have compromised your information.</li>
    <li>We must follow the privacy practices described in this notice and provide you a copy of it.</li>
    <li>We will not use or share your information other than as described here unless you authorize us in writing. You may revoke authorization at any time in writing.</li>
  </ul>
  <h2>Changes to This Notice</h2>
  <p>We may change the terms of this notice at any time. Changes will apply to all information we have about you. The new notice will be available upon request, on our website, and we will mail a copy to you.</p>
  <h2>Covered Organizations</h2>
  <p>This Notice of Privacy Practices applies to:</p>
  <ul>
    <li><strong>My Premier Plans</strong></li>
    <li><strong>Healthcare2U, LLC (Healthcare2U Physician Services, NPHO)</strong></li>
  </ul>
  <h2>Questions or Complaints?</h2>
  <p>Contact our Compliance Officer:<br>
  privacy@healthc2u.com | 512-900-8900</p>
  <p>or</p>
  <p><strong>My Premier Plans</strong><br>
  www.mypremierplans.com | info@mypremierplans.com | 210-512-4318</p>
</body>
</html>`;
                                  const blob = new Blob([privacyHtml], { type: 'text/html' });
                                  const url = window.URL.createObjectURL(blob);
                                  const link = document.createElement('a');
                                  link.href = url;
                                  link.download = 'MyPremierPlans-Privacy-Practices.html';
                                  document.body.appendChild(link);
                                  link.click();
                                  document.body.removeChild(link);
                                  window.URL.revokeObjectURL(url);
                                }}
                                className="text-xs text-medical-blue-600 hover:text-medical-blue-700 underline"
                              >
                                Download Privacy Notice
                              </button>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="privacyNoticeAcknowledged"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel className="text-sm">
                                I acknowledge that I have received and reviewed the Notice of Privacy Practices *
                              </FormLabel>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="communicationsConsent"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel className="text-base font-bold text-red-600">
                                SMS/Text Messaging Consent (Optional):
                              </FormLabel>
                              <div className="bg-red-50 border border-red-200 rounded-md p-3 mt-2">
                                <p className="text-sm font-semibold text-red-700 mb-2">
                                  By checking this box, you expressly consent to receive automated marketing and transactional text messages from MyPremierPlans, its affiliates, and agents at the phone number provided.
                                </p>
                                <ul className="text-sm text-red-600 space-y-1 list-disc list-inside">
                                  <li><strong>Message Types:</strong> Account alerts, payment reminders, appointment notifications, promotional offers, and healthcare updates</li>
                                  <li><strong>Frequency:</strong> Up to 10 messages per month (message frequency may vary)</li>
                                  <li><strong>STOP Instructions:</strong> Reply STOP to cancel at any time</li>
                                  <li><strong>HELP:</strong> Reply HELP for assistance or call 1-800-XXX-XXXX</li>
                                  <li><strong>Charges:</strong> Message and data rates may apply. Check with your carrier for details.</li>
                                  <li><strong>Carriers Supported:</strong> Compatible with major US carriers (AT&T, Verizon, T-Mobile, Sprint, etc.)</li>
                                </ul>
                                <p className="text-sm font-bold text-red-700 mt-2">
                                  Consent is not a condition of purchase. Your information will not be shared with third parties for marketing purposes.
                                </p>
                                <p className="text-xs text-red-600 mt-1">
                                  View our Privacy Policy at www.getmydpc.com/privacy and Terms at www.getmydpc.com/terms
                                </p>
                              </div>
                            </div>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="faqDownloaded"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel className="text-sm">
                                I have downloaded and reviewed the MyPremierPlans FAQ document *
                              </FormLabel>
                              <button
                                type="button"
                                onClick={() => {
                                  // Download FAQ from attached assets
                                  const link = document.createElement('a');
                                  link.href = '/attached_assets/Sterile MPP FAQ_1752600656517.docx';
                                  link.download = 'MyPremierPlans-FAQ.docx';
                                  document.body.appendChild(link);
                                  link.click();
                                  document.body.removeChild(link);
                                  toast({
                                    title: "FAQ Downloaded",
                                    description: "Please review the FAQ document before proceeding.",
                                  });
                                }}
                                className="text-xs text-medical-blue-600 hover:text-medical-blue-700 underline"
                              >
                                Download FAQ Document
                              </button>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                )}

                {/* Form Actions */}
                <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t border-gray-200">
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="flex-1"
                    onClick={handlePrevStep}
                    disabled={currentStep === 1}
                  >
                    Back
                  </Button>
                  
                  {currentStep < 8 ? (
                    <Button 
                      type="button" 
                      className="flex-1 medical-blue-600 hover:medical-blue-700"
                      onClick={handleNextStep}
                      disabled={currentStep === 7 && !selectedPlanId}
                    >
                      Continue
                    </Button>
                  ) : (
                    <Button 
                      type="submit" 
                      className="flex-1 medical-blue-600 hover:medical-blue-700"
                      disabled={registrationMutation.isPending}
                    >
                      {registrationMutation.isPending ? <LoadingSpinner /> : "Complete Registration"}
                    </Button>
                  )}
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
    
    {/* Cancellation Policy Modal */}
    <CancellationPolicyModal
      isOpen={showPolicyModal}
      onClose={() => setShowPolicyModal(false)}
      onAccept={() => {
        setShowPolicyModal(false);
        toast({
          title: "Policy Acknowledged",
          description: "Cancellation and refund policy has been downloaded for your records.",
        });
      }}
    />
  </div>
  );
}
