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
import { apiRequest } from "@/lib/queryClient";
import { ProgressIndicator } from "@/components/progress-indicator";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { CancellationPolicyModal } from "@/components/CancellationPolicyModal";
import { Plus, ChevronLeft } from "lucide-react";
import { formatPhoneNumber, cleanPhoneNumber, formatSSN, cleanSSN, formatZipCode } from "@/lib/formatters";

const enrollmentSchema = z.object({
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
});

type EnrollmentForm = z.infer<typeof enrollmentSchema>;

// This page is for the enrollment.getmydpc.com subdomain
// It allows public enrollment without requiring authentication
export default function Enrollment() {
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [coverageType, setCoverageType] = useState<string>("Member Only");
  const [addRxValet, setAddRxValet] = useState(false);
  const [familyMembers, setFamilyMembers] = useState<any[]>([]);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const { toast } = useToast();

  // Fetch plans (public endpoint)
  const { data: plansData, isLoading: plansLoading } = useQuery<any[]>({
    queryKey: ["/api/public/plans"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/public/plans");
        if (!response.ok) {
          // Fallback to authenticated endpoint if public not available
          const authResponse = await fetch("/api/plans");
          if (!authResponse.ok) {
            // Use default plans if API fails
            return [
              { id: 1, name: "Base", price: "139.00", features: ["Essential DPC coverage", "24/7 member portal", "Same-day appointments"] },
              { id: 2, name: "Plus", price: "159.00", features: ["Everything in Base", "Specialist referrals", "Prescription discounts"] },
              { id: 3, name: "Elite", price: "199.00", features: ["Everything in Plus", "Concierge services", "Executive health program"] }
            ];
          }
          const authData = await authResponse.json();
          return Array.isArray(authData) ? authData : [];
        }
        const data = await response.json();
        return Array.isArray(data) ? data : [];
      } catch (error) {
        console.error('Error fetching plans:', error);
        // Return default plans on error
        return [
          { id: 1, name: "Base", price: "139.00", features: ["Essential DPC coverage", "24/7 member portal", "Same-day appointments"] },
          { id: 2, name: "Plus", price: "159.00", features: ["Everything in Base", "Specialist referrals", "Prescription discounts"] },
          { id: 3, name: "Elite", price: "199.00", features: ["Everything in Plus", "Concierge services", "Executive health program"] }
        ];
      }
    },
  });
  
  // Ensure plans is always an array
  const plans = Array.isArray(plansData) ? plansData : [];

  const form = useForm<EnrollmentForm>({
    resolver: zodResolver(enrollmentSchema),
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
      faqDownloaded: false,
    },
  });

  const enrollmentMutation = useMutation({
    mutationFn: async (data: EnrollmentForm) => {
      const selectedPlan = plans.find(p => p.id === data.planId);
      const subtotal = selectedPlan ? 
        parseFloat(selectedPlan.price) + (addRxValet ? (coverageType === "Family" ? 21 : 19) : 0) : 0;
      const totalWithFees = (subtotal * 1.04).toFixed(2); // Add 4% processing fee
      
      const submissionData = {
        ...data,
        coverageType,
        addRxValet,
        totalMonthlyPrice: parseFloat(totalWithFees),
        familyMembers: familyMembers
      };

      // Public enrollment endpoint
      const response = await fetch("/api/public/enroll", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(submissionData),
      });

      if (!response.ok) {
        throw new Error("Enrollment failed");
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Enrollment Successful!",
        description: "Redirecting to payment...",
      });
      
      // Store enrollment data for payment
      sessionStorage.setItem("enrollmentId", data.enrollmentId);
      sessionStorage.setItem("planId", selectedPlanId?.toString() || "");
      
      // Redirect to payment
      setTimeout(() => {
        setLocation(`/payment/${selectedPlanId}/${data.enrollmentId}`);
      }, 1500);
    },
    onError: (error) => {
      toast({
        title: "Enrollment Failed",
        description: "Please check your information and try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: EnrollmentForm) => {
    if (!showPolicyModal) {
      setShowPolicyModal(true);
      return;
    }
    enrollmentMutation.mutate(data);
  };

  const selectedPlan = Array.isArray(plans) ? plans.find(p => p.id === selectedPlanId) : null;

  if (plansLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-medical-50 to-white py-8">
      <div className="container max-w-4xl mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Healthcare Membership Enrollment</h1>
          <p className="text-gray-600">Complete your enrollment in just a few minutes</p>
        </div>

        <ProgressIndicator currentStep={currentStep} totalSteps={4} />

        <Card className="mt-8">
          <CardContent className="p-8">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                {/* Step 1: Personal Information */}
                {currentStep === 1 && (
                  <div className="space-y-4">
                    <h2 className="text-xl font-semibold mb-4">Personal Information</h2>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="firstName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>First Name *</FormLabel>
                            <FormControl>
                              <Input {...field} />
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
                              <Input {...field} />
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
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email *</FormLabel>
                            <FormControl>
                              <Input type="email" {...field} />
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
                            <FormLabel>Phone *</FormLabel>
                            <FormControl>
                              <Input 
                                {...field}
                                onChange={(e) => {
                                  const formatted = formatPhoneNumber(e.target.value);
                                  field.onChange(formatted);
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                      
                      <FormField
                        control={form.control}
                        name="gender"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Gender</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select gender" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="Male">Male</SelectItem>
                                <SelectItem value="Female">Female</SelectItem>
                                <SelectItem value="Other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="flex justify-end">
                      <Button 
                        type="button" 
                        onClick={() => setCurrentStep(2)}
                        disabled={!form.getValues("firstName") || !form.getValues("lastName") || !form.getValues("email")}
                      >
                        Next Step
                      </Button>
                    </div>
                  </div>
                )}

                {/* Step 2: Address Information */}
                {currentStep === 2 && (
                  <div className="space-y-4">
                    <h2 className="text-xl font-semibold mb-4">Address Information</h2>
                    
                    <FormField
                      control={form.control}
                      name="address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Street Address *</FormLabel>
                          <FormControl>
                            <Input {...field} />
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
                          <FormLabel>Apartment, Suite, etc.</FormLabel>
                          <FormControl>
                            <Input {...field} />
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
                              <Input {...field} />
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
                                  <SelectValue placeholder="Select state" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="TX">Texas</SelectItem>
                                <SelectItem value="CA">California</SelectItem>
                                <SelectItem value="NY">New York</SelectItem>
                                <SelectItem value="FL">Florida</SelectItem>
                                {/* Add more states as needed */}
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
                                {...field}
                                onChange={(e) => {
                                  const formatted = formatZipCode(e.target.value);
                                  field.onChange(formatted);
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="flex justify-between">
                      <Button 
                        type="button" 
                        variant="outline"
                        onClick={() => setCurrentStep(1)}
                      >
                        <ChevronLeft className="mr-2 h-4 w-4" />
                        Previous
                      </Button>
                      <Button 
                        type="button" 
                        onClick={() => setCurrentStep(3)}
                        disabled={!form.getValues("address") || !form.getValues("city") || !form.getValues("state")}
                      >
                        Next Step
                      </Button>
                    </div>
                  </div>
                )}

                {/* Step 3: Plan Selection */}
                {currentStep === 3 && (
                  <div className="space-y-4">
                    <h2 className="text-xl font-semibold mb-4">Select Your Plan</h2>
                    
                    <div className="space-y-4">
                      {plans && plans.map((plan) => (
                        <div
                          key={plan.id}
                          className={`border rounded-lg p-4 cursor-pointer transition-all ${
                            selectedPlanId === plan.id 
                              ? "border-medical-600 bg-medical-50" 
                              : "border-gray-200 hover:border-medical-300"
                          }`}
                          onClick={() => {
                            setSelectedPlanId(plan.id);
                            form.setValue("planId", plan.id);
                          }}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="font-semibold text-lg">{plan.name} Plan</h3>
                              <p className="text-2xl font-bold text-medical-600 mt-1">
                                ${plan.price}/month
                              </p>
                              {plan.features && (
                                <ul className="mt-2 space-y-1">
                                  {plan.features.map((feature: string, index: number) => (
                                    <li key={index} className="text-sm text-gray-600">
                                      • {feature}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <div className="mt-1">
                              {selectedPlanId === plan.id && (
                                <div className="w-6 h-6 bg-medical-600 rounded-full flex items-center justify-center">
                                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-6">
                      <label className="flex items-start space-x-3">
                        <Checkbox
                          checked={addRxValet}
                          onCheckedChange={(checked) => setAddRxValet(checked as boolean)}
                        />
                        <div>
                          <span className="font-medium">Add RxValet Service</span>
                          <p className="text-sm text-gray-600">
                            Prescription delivery service - ${coverageType === "Family" ? "21" : "19"}/month
                          </p>
                        </div>
                      </label>
                    </div>

                    <div className="flex justify-between">
                      <Button 
                        type="button" 
                        variant="outline"
                        onClick={() => setCurrentStep(2)}
                      >
                        <ChevronLeft className="mr-2 h-4 w-4" />
                        Previous
                      </Button>
                      <Button 
                        type="button" 
                        onClick={() => setCurrentStep(4)}
                        disabled={!selectedPlanId}
                      >
                        Next Step
                      </Button>
                    </div>
                  </div>
                )}

                {/* Step 4: Terms & Submit */}
                {currentStep === 4 && (
                  <div className="space-y-4">
                    <h2 className="text-xl font-semibold mb-4">Review & Accept Terms</h2>
                    
                    {selectedPlan && (
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <h3 className="font-semibold mb-2">Selected Plan Summary</h3>
                        <p>{selectedPlan.name} Plan - ${selectedPlan.price}/month</p>
                        {addRxValet && (
                          <p>RxValet Service - ${coverageType === "Family" ? "21" : "19"}/month</p>
                        )}
                        <p className="font-semibold mt-2">
                          Total: ${(parseFloat(selectedPlan.price) + (addRxValet ? (coverageType === "Family" ? 21 : 19) : 0)).toFixed(2)}/month
                        </p>
                        <p className="text-sm text-gray-600 mt-1">
                          * 4% processing fee will be added at payment
                        </p>
                      </div>
                    )}

                    <FormField
                      control={form.control}
                      name="planStartDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Desired Plan Start Date *</FormLabel>
                          <FormControl>
                            <Input 
                              type="date" 
                              {...field}
                              min={new Date().toISOString().split('T')[0]}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-3">
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
                              <FormLabel>
                                I acknowledge that I have received and reviewed the Notice of Privacy Practices *
                              </FormLabel>
                              <FormMessage />
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
                              <FormLabel>
                                I have downloaded and reviewed the FAQ document *
                              </FormLabel>
                              <FormMessage />
                            </div>
                          </FormItem>
                        )}
                      />

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
                              <FormLabel>
                                I accept the terms and conditions of the healthcare membership *
                              </FormLabel>
                              <FormMessage />
                            </div>
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
                              <FormLabel>
                                I consent to receive communications about my membership
                              </FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="flex justify-between">
                      <Button 
                        type="button" 
                        variant="outline"
                        onClick={() => setCurrentStep(3)}
                      >
                        <ChevronLeft className="mr-2 h-4 w-4" />
                        Previous
                      </Button>
                      <Button 
                        type="submit"
                        disabled={enrollmentMutation.isPending}
                      >
                        {enrollmentMutation.isPending ? (
                          <>
                            <LoadingSpinner className="mr-2" />
                            Processing...
                          </>
                        ) : (
                          "Complete Enrollment"
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </form>
            </Form>
          </CardContent>
        </Card>

        {showPolicyModal && (
          <CancellationPolicyModal
            onAccept={() => {
              setShowPolicyModal(false);
              form.handleSubmit(handleSubmit)();
            }}
            onDecline={() => setShowPolicyModal(false)}
          />
        )}
      </div>
    </div>
  );
}