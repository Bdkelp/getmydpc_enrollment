import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Users, UserPlus, Trash2 } from "lucide-react";

const familyMemberSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  middleName: z.string().optional(),
  ssn: z.string().optional(),  // Made SSN optional per user request
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  gender: z.string().optional(),
  relationship: z.string().min(1, "Relationship is required"),
  memberType: z.string().min(1, "Member type is required"),
  address: z.string().optional(),
  address2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  planStartDate: z.string().min(1, "Plan start date is required"),
});

type FamilyMemberForm = z.infer<typeof familyMemberSchema>;

export default function FamilyEnrollment() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [members, setMembers] = useState<FamilyMemberForm[]>([]);
  const [currentMember, setCurrentMember] = useState(0);
  const [sameAddress, setSameAddress] = useState<boolean[]>([]);

  const coverageType = sessionStorage.getItem("coverageType") || "Family";
  const primaryAddress = JSON.parse(sessionStorage.getItem("primaryAddress") || "{}");
  
  const maxMembers = coverageType === "Member/Spouse" ? 1 : 
                     coverageType === "Member/Child" ? 1 : 5;

  const form = useForm<FamilyMemberForm>({
    resolver: zodResolver(familyMemberSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      middleName: "",
      ssn: "",
      email: "",
      phone: "",
      dateOfBirth: "",
      gender: "",
      relationship: "",
      memberType: "",
      address: "",
      address2: "",
      city: "",
      state: "",
      zipCode: "",
      planStartDate: "",
    },
  });

  const enrollmentMutation = useMutation({
    mutationFn: async (familyMembers: FamilyMemberForm[]) => {
      await apiRequest("POST", "/api/family-enrollment", { members: familyMembers });
    },
    onSuccess: () => {
      // Update pricing information in session storage
      const basePlanPrice = parseFloat(sessionStorage.getItem("basePlanPrice") || "0");
      const hasRxValet = sessionStorage.getItem("rxValet") === "yes";
      const rxValetPrice = coverageType === "Family" ? 21 : 19;
      const subtotal = basePlanPrice + (hasRxValet ? rxValetPrice : 0);
      const processingFee = (subtotal * 0.04).toFixed(2);
      const totalWithFees = (subtotal * 1.04).toFixed(2);
      
      sessionStorage.setItem("subtotal", subtotal.toFixed(2));
      sessionStorage.setItem("processingFee", processingFee);
      sessionStorage.setItem("totalMonthlyPrice", totalWithFees);
      
      toast({
        title: "Family Members Enrolled",
        description: "Family members have been successfully added to your plan.",
      });
      setLocation("/payment");
    },
    onError: (error) => {
      toast({
        title: "Enrollment Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAddMember = (data: FamilyMemberForm) => {
    const updatedMembers = [...members];
    updatedMembers[currentMember] = data;
    setMembers(updatedMembers);
    
    // Show a toast to confirm member was saved
    toast({
      title: "Family Member Saved",
      description: `${data.firstName} ${data.lastName} has been added.`,
    });
    
    if (currentMember < maxMembers - 1) {
      setCurrentMember(currentMember + 1);
      form.reset();
    }
  };

  const handleRemoveMember = (index: number) => {
    const updatedMembers = members.filter((_, i) => i !== index);
    setMembers(updatedMembers);
    if (currentMember >= updatedMembers.length && currentMember > 0) {
      setCurrentMember(currentMember - 1);
    }
  };

  const handleSameAddressToggle = (useSame: boolean) => {
    const updatedSameAddress = [...sameAddress];
    updatedSameAddress[currentMember] = useSame;
    setSameAddress(updatedSameAddress);

    if (useSame) {
      form.setValue("address", primaryAddress.address || "");
      form.setValue("address2", primaryAddress.address2 || "");
      form.setValue("city", primaryAddress.city || "");
      form.setValue("state", primaryAddress.state || "");
      form.setValue("zipCode", primaryAddress.zipCode || "");
    }
  };

  const handleSubmit = () => {
    const currentData = form.getValues();
    const allMembers = [...members];
    allMembers[currentMember] = currentData;
    
    enrollmentMutation.mutate(allMembers.filter(m => m));
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <Card className="p-8">
          <CardContent className="p-0">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  Family Member Enrollment
                </h1>
                <p className="text-gray-600">
                  Add family members to your {coverageType} plan
                </p>
              </div>
              <div className="flex items-center space-x-2 text-gray-600">
                <Users className="h-5 w-5" />
                <span>{members.filter(m => m).length + 1} of {maxMembers + 1} members</span>
              </div>
            </div>

            {/* Member Tabs */}
            <div className="flex space-x-2 mb-6 overflow-x-auto">
              {[...Array(maxMembers)].map((_, index) => (
                <Button
                  key={index}
                  type="button"
                  variant={currentMember === index ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCurrentMember(index)}
                  className="flex items-center space-x-2"
                >
                  <span>
                    {members[index] ? 
                      `${members[index].firstName} ${members[index].lastName}` : 
                      `Add ${index === 0 && coverageType === "Member/Spouse" ? "Spouse" : 
                             index === 0 && coverageType === "Member/Child" ? "Child" : 
                             `Member ${index + 2}`}`
                    }
                  </span>
                  {members[index] && (
                    <Trash2 
                      className="h-4 w-4 ml-2" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveMember(index);
                      }}
                    />
                  )}
                </Button>
              ))}
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleAddMember)} className="space-y-6">
                {/* Personal Information */}
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold text-gray-900">Personal Information</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name *</FormLabel>
                          <FormControl>
                            <Input placeholder="Jane" {...field} />
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
                            <Input placeholder="M" {...field} />
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
                      name="ssn"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last 4 Digits of SSN *</FormLabel>
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

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="relationship"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Relationship *</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select Relationship" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="spouse">Spouse</SelectItem>
                              <SelectItem value="child">Child</SelectItem>
                              <SelectItem value="parent">Parent</SelectItem>
                              <SelectItem value="other">Other Dependent</SelectItem>
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
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select Type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="spouse">Spouse</SelectItem>
                              <SelectItem value="dependent">Dependent</SelectItem>
                            </SelectContent>
                          </Select>
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
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="jane@email.com" {...field} />
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
                          <FormLabel>Phone</FormLabel>
                          <FormControl>
                            <Input type="tel" placeholder="(555) 123-4567" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Address Information */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">Address Information</h3>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleSameAddressToggle(!sameAddress[currentMember])}
                    >
                      {sameAddress[currentMember] ? "Use Different Address" : "Use Primary Address"}
                    </Button>
                  </div>

                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Street Address</FormLabel>
                        <FormControl>
                          <Input placeholder="123 Main Street" {...field} disabled={sameAddress[currentMember]} />
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
                          <Input placeholder="Apt 4B" {...field} disabled={sameAddress[currentMember]} />
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
                          <FormLabel>City</FormLabel>
                          <FormControl>
                            <Input placeholder="Denver" {...field} disabled={sameAddress[currentMember]} />
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
                          <FormLabel>State</FormLabel>
                          <FormControl>
                            <Input placeholder="CO" {...field} disabled={sameAddress[currentMember]} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="zipCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>ZIP Code</FormLabel>
                          <FormControl>
                            <Input placeholder="80202" {...field} disabled={sameAddress[currentMember]} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

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

                {/* Form Actions */}
                <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t border-gray-200">
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => setLocation("/registration")}
                  >
                    Back to Registration
                  </Button>
                  
                  {/* Always show Save button if form has data */}
                  <Button 
                    type="submit"
                    className="flex-1 bg-medical-blue-600 hover:bg-medical-blue-700 text-white"
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    {currentMember < maxMembers - 1 ? "Save & Add Another" : "Save Member"}
                  </Button>
                  
                  {/* Show Continue button if we have at least one family member OR current form has data */}
                  {(members.filter(m => m).length > 0 || form.formState.isDirty) && (
                    <Button 
                      type="button" 
                      onClick={() => {
                        // If current form has data, save it first
                        if (form.formState.isDirty) {
                          const currentData = form.getValues();
                          const allMembers = [...members];
                          allMembers[currentMember] = currentData;
                          enrollmentMutation.mutate(allMembers.filter(m => m));
                        } else {
                          // Otherwise just submit saved members
                          handleSubmit();
                        }
                      }}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                      disabled={enrollmentMutation.isPending}
                    >
                      {enrollmentMutation.isPending ? <LoadingSpinner /> : 
                        form.formState.isDirty ? "Save Current & Continue to Payment" : "Continue to Payment"}
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