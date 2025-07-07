import { useState, useEffect } from "react";
import { useLocation } from "wouter";
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
import { apiRequest } from "@/lib/queryClient";
import { ProgressIndicator } from "@/components/progress-indicator";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

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
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to continue with enrollment.",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
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
      memberType: "Member Only",
      planStartDate: "",
      emergencyContactName: "",
      emergencyContactPhone: "",
      planId: 0,
      termsAccepted: false,
      communicationsConsent: false,
      privacyNoticeAcknowledged: false,
    },
  });

  const registrationMutation = useMutation({
    mutationFn: async (data: RegistrationForm) => {
      const subtotal = selectedPlan ? 
        parseFloat(selectedPlan.price) + (addRxValet ? (coverageType === "Family" ? 21 : 19) : 0) : 0;
      const totalWithFees = (subtotal * 1.04).toFixed(2); // Add 4% processing fee
      
      const submissionData = {
        ...data,
        coverageType,
        addRxValet,
        totalMonthlyPrice: parseFloat(totalWithFees)
      };
      await apiRequest("POST", "/api/registration", submissionData);
    },
    onSuccess: () => {
      // Store primary address for family member enrollment
      const addressData = {
        address: form.getValues("address"),
        address2: form.getValues("address2"),
        city: form.getValues("city"),
        state: form.getValues("state"),
        zipCode: form.getValues("zipCode"),
      };
      sessionStorage.setItem("primaryAddress", JSON.stringify(addressData));
      sessionStorage.setItem("coverageType", coverageType);
      
      // Always store registration info for payment
      const isFamily = coverageType === "Family";
      const rxValetPrice = isFamily ? 21 : 19;
      const subtotal = selectedPlan ? 
        parseFloat(selectedPlan.price) + (addRxValet ? rxValetPrice : 0) : 0;
      const processingFee = (subtotal * 0.04).toFixed(2);
      const totalWithFees = (subtotal * 1.04).toFixed(2);
      
      sessionStorage.setItem("selectedPlanId", selectedPlanId?.toString() || "");
      sessionStorage.setItem("addRxValet", addRxValet.toString());
      sessionStorage.setItem("rxValet", addRxValet ? "yes" : "no");
      sessionStorage.setItem("basePlanPrice", selectedPlan?.price || "0");
      sessionStorage.setItem("subtotal", subtotal.toFixed(2));
      sessionStorage.setItem("processingFee", processingFee);
      sessionStorage.setItem("totalMonthlyPrice", totalWithFees);
      
      console.log("Storing plan info:", {
        selectedPlanId,
        selectedPlanName: selectedPlan?.name,
        coverageType,
        totalMonthlyPrice: totalWithFees
      });
      
      // Redirect to family enrollment if needed
      if (coverageType !== "Member Only") {
        toast({
          title: "Primary Member Registered",
          description: "Now add your family members to complete enrollment.",
        });
        setLocation("/family-enrollment");
      } else {
        
        // Check if Stripe is configured
        if (!import.meta.env.VITE_STRIPE_PUBLIC_KEY) {
          toast({
            title: "Registration Complete",
            description: "Redirecting to mock payment for testing...",
          });
        } else {
          toast({
            title: "Registration Complete",
            description: "Your information has been saved. Proceeding to payment...",
          });
        }
        setLocation("/payment");
      }
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
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

  const handleNextStep = () => {
    if (currentStep === 1) {
      // Validate personal information
      const personalFields = ['firstName', 'lastName', 'email', 'phone', 'dateOfBirth', 'memberType'] as const;
      form.trigger(personalFields).then((isValid) => {
        if (isValid) setCurrentStep(2);
      });
    } else if (currentStep === 2) {
      // Validate employment information - only required for member-only
      const memberType = form.getValues('memberType');
      const planStartField = ['planStartDate'] as const;
      
      if (memberType === 'member-only') {
        // For individual plans, employer fields are required
        const employmentFields = ['employerName', 'dateOfHire', 'planStartDate'] as const;
        form.trigger(employmentFields).then((isValid) => {
          if (isValid) setCurrentStep(3);
        });
      } else {
        // For family plans, only plan start date is required
        form.trigger(planStartField).then((isValid) => {
          if (isValid) setCurrentStep(3);
        });
      }
    } else if (currentStep === 3) {
      // Validate address information
      const addressFields = ['address', 'city', 'state', 'zipCode'] as const;
      form.trigger(addressFields).then((isValid) => {
        // Skip coverage type selection (step 4) since it's auto-set from member type
        if (isValid) setCurrentStep(5);
      });
    } else if (currentStep === 5 && selectedPlanId) {
      // Plan selected, move to review
      form.setValue('planId', selectedPlanId);
      setCurrentStep(6);
    } else if (currentStep === 6) {
      // Validate all checkboxes before allowing submission
      const checkboxFields = ['termsAccepted', 'privacyNoticeAcknowledged', 'communicationsConsent'] as const;
      form.trigger(checkboxFields).then((isValid) => {
        if (!isValid) {
          toast({
            title: "Please complete all required acknowledgments",
            description: "You must accept the terms and acknowledge the privacy notice before proceeding.",
            variant: "destructive",
          });
        }
      });
    }
  };

  const handlePrevStep = () => {
    if (currentStep === 6) {
      setCurrentStep(5);
    } else if (currentStep === 5) {
      setCurrentStep(3); // Skip step 4 (coverage type)
    } else if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const onSubmit = (data: RegistrationForm) => {
    // Add the selected plan ID to the form data
    const submissionData = {
      ...data,
      planId: selectedPlanId!,
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
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <Card className="p-8">
          <CardContent className="p-0">
            {/* Progress Indicator */}
            <ProgressIndicator currentStep={currentStep} totalSteps={6} />

            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {currentStep === 1 && "Personal Information"}
                {currentStep === 2 && "Employment Information"}
                {currentStep === 3 && "Address Information"}
                {currentStep === 4 && "Coverage Type"}
                {currentStep === 5 && "Select Your Plan"}
                {currentStep === 6 && "Review & Terms"}
              </h1>
              <p className="text-gray-600">
                {currentStep === 1 && "Tell us about yourself"}
                {currentStep === 2 && "Tell us about your employer"}
                {currentStep === 3 && "Where can we reach you?"}
                {currentStep === 4 && "Who will be covered under your plan?"}
                {currentStep === 5 && "Choose your healthcare plan level"}
                {currentStep === 6 && "Review your information and accept terms"}
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
                              <Input placeholder="John" {...field} />
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
                              <Input placeholder="A" {...field} />
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
                              <Input placeholder="Smith" {...field} />
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
                              <Input type="email" placeholder="john.smith@email.com" {...field} />
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
                            <FormLabel>Phone Number *</FormLabel>
                            <FormControl>
                              <Input type="tel" placeholder="(555) 123-4567" {...field} />
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
                            <FormLabel>Social Security Number (Optional)</FormLabel>
                            <FormControl>
                              <Input 
                                type="password" 
                                placeholder="123456789 (Optional)" 
                                maxLength={9}
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
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
                              <Input type="date" {...field} />
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
                              defaultValue={field.value}
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                      <FormField
                        control={form.control}
                        name="planStartDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Plan Start Date *</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                )}

                {currentStep === 3 && (
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
                                <SelectItem value="CO">Colorado</SelectItem>
                                <SelectItem value="CA">California</SelectItem>
                                <SelectItem value="TX">Texas</SelectItem>
                                <SelectItem value="NY">New York</SelectItem>
                                <SelectItem value="FL">Florida</SelectItem>
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
                              <Input placeholder="80202" {...field} />
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
                              <FormLabel>Contact Phone</FormLabel>
                              <FormControl>
                                <Input type="tel" placeholder="(555) 987-6543" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {currentStep === 4 && (
                  <div className="space-y-6">
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Choose Your Coverage Type</h3>
                      <p className="text-sm text-gray-600">Select who will be covered under your plan</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        { value: "Member Only", label: "Individual", description: "Coverage for one person" },
                        { value: "Member/Spouse", label: "Couple", description: "Coverage for you and your spouse" },
                        { value: "Member/Child", label: "Parent & Child", description: "Coverage for you and one child" },
                        { value: "Family", label: "Family", description: "Coverage for your entire family (up to 6 members)" }
                      ].map((option) => (
                        <Card
                          key={option.value}
                          className={`cursor-pointer transition-all ${
                            coverageType === option.value
                              ? "border-2 border-medical-blue-600 bg-medical-blue-50"
                              : "hover:shadow-md"
                          }`}
                          onClick={() => setCoverageType(option.value)}
                        >
                          <CardContent className="p-6">
                            <h4 className="text-lg font-semibold text-gray-900 mb-2">{option.label}</h4>
                            <p className="text-sm text-gray-600">{option.description}</p>
                            {coverageType === option.value && (
                              <div className="mt-4">
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-medical-blue-100 text-medical-blue-800">
                                  Selected
                                </span>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                    <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <p className="text-sm text-amber-800">
                        <strong>Important:</strong> MyPremierPlans is a Direct Primary Care (DPC) membership. It is not health insurance and does not satisfy ACA minimum essential coverage requirements.
                      </p>
                    </div>
                  </div>
                )}

                {currentStep === 5 && (
                  <div className="space-y-6">
                    {plansLoading ? (
                      <div className="flex justify-center">
                        <LoadingSpinner />
                      </div>
                    ) : (
                      <>
                        <div className="mb-4">
                          <h3 className="text-lg font-semibold text-gray-900 mb-2">Select Your Plan</h3>
                          <p className="text-sm text-gray-600">Choose the plan level that best fits your healthcare needs</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          {(() => {
                            const filteredPlans = plans
                              ?.filter((plan: any) => {
                                // Map coverage types to plan name patterns
                                const coverageMapping: { [key: string]: string[] } = {
                                  "Member Only": ["Member Only", "Mem Only"],
                                  "Member/Spouse": ["Member/Spouse", "Mem/Spouse"],
                                  "Member/Child": ["Member/Child", "Mem/Child", "Parent/Child"],
                                  "Family": ["Family"]
                                };
                                
                                const patterns = coverageMapping[coverageType] || [];
                                return patterns.some(pattern => plan.name.includes(pattern));
                              });
                            
                            console.log("Coverage Type:", coverageType);
                            console.log("Available plans:", plans?.map((p: any) => p.name));
                            console.log("Filtered plans:", filteredPlans?.map((p: any) => p.name));
                            
                            return filteredPlans;
                          })()
                            .filter((plan: any) => {
                              if (plan.name.includes("Base")) return true;
                              if (plan.name.includes("Plus") || plan.name.includes("+")) return true;
                              if (plan.name.includes("Elite")) return true;
                              return false;
                            })
                            .sort((a: any, b: any) => {
                              const order = ["Base", "Plus", "Elite"];
                              const aIndex = order.findIndex(tier => a.name.includes(tier));
                              const bIndex = order.findIndex(tier => b.name.includes(tier));
                              return aIndex - bIndex;
                            })
                            .map((plan: any) => {
                              const planTier = plan.name.includes("Base") ? "Base" : 
                                              plan.name.includes("Plus") || plan.name.includes("+") ? "Plus" : "Elite";
                              const tierColor = planTier === "Base" ? "gray" : 
                                               planTier === "Plus" ? "blue" : "purple";
                              
                              return (
                                <Card 
                                  key={plan.id} 
                                  className={`cursor-pointer transition-all duration-300 transform ${
                                    selectedPlanId === plan.id 
                                      ? "border-2 border-green-600 bg-green-50 scale-105 shadow-lg" 
                                      : "hover:shadow-md hover:scale-102"
                                  }`}
                                  onClick={() => {
                                    console.log("Selected plan:", plan.name, "ID:", plan.id);
                                    setSelectedPlanId(plan.id);
                                  }}
                                >
                                  <CardContent className="p-6">
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

                {currentStep === 6 && (
                  <div className="space-y-6">
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
                            <div className="text-sm">
                              Processing Fee (4%): ${((parseFloat(selectedPlan?.price || "0") + (addRxValet ? (coverageType === "Family" ? 21 : 19) : 0)) * 0.04).toFixed(2)}
                            </div>
                            <div className="text-lg font-semibold border-t pt-1">
                              Total Monthly: <span className="text-green-600">
                                ${((parseFloat(selectedPlan?.price || "0") + (addRxValet ? (coverageType === "Family" ? 21 : 19) : 0)) * 1.04).toFixed(2)}/month
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
                              <FormLabel className="text-sm">
                                I consent to receive communications about my healthcare via email and SMS
                              </FormLabel>
                            </div>
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
                  
                  {currentStep < 6 ? (
                    <Button 
                      type="button" 
                      className="flex-1 medical-blue-600 hover:medical-blue-700"
                      onClick={handleNextStep}
                      disabled={(currentStep === 4 && !coverageType) || (currentStep === 5 && !selectedPlanId)}
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
  );
}
