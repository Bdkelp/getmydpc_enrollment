import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { ProgressIndicator } from "@/components/progress-indicator";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Shield, Check } from "lucide-react";

const stripePromise = import.meta.env.VITE_STRIPE_PUBLIC_KEY 
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY)
  : null;

const PaymentForm = ({ clientSecret, selectedPlan }: { clientSecret: string; selectedPlan: any }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/confirmation`,
      },
    });

    setIsProcessing(false);

    if (error) {
      toast({
        title: "Payment Failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      // Payment successful - Stripe will redirect to the return_url (confirmation page)
      toast({
        title: "Payment Successful",
        description: "Welcome to MyPremierPlans! Redirecting to confirmation...",
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      <Button 
        type="submit" 
        className="w-full medical-blue-600 hover:medical-blue-700 text-white py-3"
        disabled={!stripe || isProcessing}
      >
        {isProcessing ? <LoadingSpinner /> : `Complete Enrollment - $${selectedPlan?.price}/month`}
      </Button>
    </form>
  );
};

export default function Payment() {
  const [, setLocation] = useLocation();
  const [clientSecret, setClientSecret] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [isMockPayment, setIsMockPayment] = useState(false);
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to continue with payment.",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, authLoading, toast]);

  const { data: plans = [] } = useQuery<any[]>({
    queryKey: ["/api/plans"],
    enabled: isAuthenticated,
  });

  // Load stored plan ID from registration
  useEffect(() => {
    const storedPlanId = sessionStorage.getItem("selectedPlanId");
    console.log("Loading stored plan ID from session:", storedPlanId);
    if (storedPlanId) {
      const planId = parseInt(storedPlanId);
      console.log("Setting selected plan ID to:", planId);
      setSelectedPlanId(planId);
    } else {
      console.error("No plan ID found in session storage!");
      toast({
        title: "No Plan Selected",
        description: "Please go back to registration and select a plan.",
        variant: "destructive",
      });
    }
  }, []);

  const createPaymentIntentMutation = useMutation({
    mutationFn: async (planId: number) => {
      const hasRxValet = sessionStorage.getItem("addRxValet") === "true";
      const coverageType = sessionStorage.getItem("coverageType") || "";
      const totalAmount = sessionStorage.getItem("totalMonthlyPrice") || "0";
      
      const response = await apiRequest("POST", "/api/create-payment-intent", { 
        planId,
        hasRxValet,
        coverageType,
        totalAmount
      });
      return response.json();
    },
    onSuccess: (data) => {
      setClientSecret(data.clientSecret);
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
        title: "Payment Setup Failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Create payment intent when plan is loaded
  useEffect(() => {
    if (plans && plans.length > 0 && selectedPlanId && stripePromise && !clientSecret) {
      const planExists = plans.find((plan: any) => plan.id === selectedPlanId);
      if (planExists) {
        console.log("Creating payment intent for plan:", planExists.name, "ID:", planExists.id);
        createPaymentIntentMutation.mutate(selectedPlanId);
      } else {
        console.error("Selected plan ID not found:", selectedPlanId);
        toast({
          title: "Plan Not Found",
          description: "The selected plan is no longer available. Please go back and select a different plan.",
          variant: "destructive",
        });
      }
    }
  }, [plans, selectedPlanId, stripePromise, clientSecret]);

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

  const selectedPlan = plans?.find((plan: any) => plan.id === selectedPlanId);
  
  // Debug session storage
  console.log("Payment page debug:", {
    selectedPlanId,
    selectedPlan: selectedPlan?.name,
    allSessionStorage: {
      selectedPlanId: sessionStorage.getItem("selectedPlanId"),
      coverageType: sessionStorage.getItem("coverageType"),
      totalMonthlyPrice: sessionStorage.getItem("totalMonthlyPrice"),
      basePlanPrice: sessionStorage.getItem("basePlanPrice"),
    },
    availablePlans: plans?.map((p: any) => ({ id: p.id, name: p.name }))
  });

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <Card className="p-8">
          <CardContent className="p-0">
            {/* Progress Indicator */}
            <ProgressIndicator currentStep={3} totalSteps={4} />

            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Payment Details</h1>
              <p className="text-gray-600">Set up your monthly subscription payment</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Payment Form */}
              <div>
                {!clientSecret ? (
                  <div className="space-y-6">
                    {/* Selected Plan Display */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
                      <h3 className="font-semibold text-gray-900 mb-4">Your Selected Plan</h3>
                      {selectedPlan ? (
                        <div>
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <h4 className="text-xl font-bold text-gray-900">{selectedPlan.name}</h4>
                              {selectedPlan.description && (
                                <p className="text-gray-600 mt-1">{selectedPlan.description}</p>
                              )}
                            </div>
                            <div className="text-right">
                              <div className="text-2xl font-bold text-medical-blue-600">
                                ${sessionStorage.getItem("totalMonthlyPrice") || selectedPlan.price}
                              </div>
                              <div className="text-sm text-gray-600">per month</div>
                            </div>
                          </div>
                          
                          {/* Price Breakdown */}
                          <div className="border-t border-blue-200 pt-4 space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>Base Plan</span>
                              <span>${selectedPlan.price}</span>
                            </div>
                            {sessionStorage.getItem("coverageType") !== "Member only" && (
                              <div className="flex justify-between text-sm">
                                <span>Family Members</span>
                                <span>Included in plan</span>
                              </div>
                            )}
                            {sessionStorage.getItem("rxValet") === "yes" && (
                              <div className="flex justify-between text-sm">
                                <span>RxValet Add-on</span>
                                <span>${sessionStorage.getItem("coverageType") === "Member only" ? "19.00" : "21.00"}</span>
                              </div>
                            )}
                            <div className="flex justify-between text-sm">
                              <span>Processing Fee (4%)</span>
                              <span>${sessionStorage.getItem("processingFee") || "0"}</span>
                            </div>
                            <div className="flex justify-between font-bold pt-2 border-t">
                              <span>Total</span>
                              <span>${sessionStorage.getItem("totalMonthlyPrice") || selectedPlan.price}</span>
                            </div>
                          </div>
                          
                          <button
                            type="button"
                            className="mt-4 text-sm text-medical-blue-600 hover:text-medical-blue-700 underline"
                            onClick={() => setLocation("/registration")}
                          >
                            Change plan selection
                          </button>
                        </div>
                      ) : (
                        <p className="text-gray-600">No plan selected. Please go back to registration.</p>
                      )}
                    </div>

                    {createPaymentIntentMutation.isPending && (
                      <div className="flex justify-center">
                        <LoadingSpinner />
                        <span className="ml-2">Setting up payment...</span>
                      </div>
                    )}
                    
                    {/* Mock Payment Button - Show when no Stripe configured */}
                    {!stripePromise && selectedPlan && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                        <h3 className="text-lg font-semibold text-yellow-800 mb-2">Mock Payment (Testing Mode)</h3>
                        <p className="text-yellow-700 mb-4">
                          Stripe is not configured. Using mock payment for testing.
                        </p>
                        
                        <Button
                          type="button"
                          className="w-full medical-blue-600 hover:medical-blue-700 text-white py-3"
                          onClick={async () => {
                            if (!selectedPlanId) {
                              toast({
                                title: "No Plan Selected",
                                description: "Please select a plan first.",
                                variant: "destructive",
                              });
                              return;
                            }
                            
                            console.log("Starting mock payment with plan ID:", selectedPlanId);
                            setIsMockPayment(true);
                            try {
                              // Call mock payment endpoint
                              const response = await apiRequest("POST", "/api/mock-payment", {
                                planId: selectedPlanId
                              });
                              
                              if (!response.ok) {
                                const errorText = await response.text();
                                console.error("Mock payment error response:", errorText);
                                throw new Error(`Server error: ${response.status}`);
                              }
                              
                              const data = await response.json();
                              console.log("Mock payment response:", data);
                              
                              if (data.success) {
                                toast({
                                  title: "Mock Payment Successful",
                                  description: "Enrollment complete! Redirecting to confirmation...",
                                });
                                console.log("Redirecting to confirmation page...");
                                setTimeout(() => {
                                  setLocation("/confirmation");
                                }, 1500);
                              } else {
                                throw new Error(data.message || "Payment failed");
                              }
                            } catch (error: any) {
                              console.error("Mock payment error:", error);
                              toast({
                                title: "Payment Failed",
                                description: error.message || "There was an error processing your payment. Please try again.",
                                variant: "destructive",
                              });
                              setIsMockPayment(false);
                            }
                          }}
                          disabled={isMockPayment || !selectedPlanId}
                        >
                          {isMockPayment ? <LoadingSpinner /> : `Complete Mock Payment - $${sessionStorage.getItem("totalMonthlyPrice") || "0"}/month`}
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Selected Plan Summary */}
                    <div className="bg-gray-50 rounded-lg p-4 mb-6">
                      <h3 className="font-semibold text-gray-900 mb-2">Selected Plan</h3>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-700">{selectedPlan?.name}</span>
                        <span className="font-bold text-medical-blue-600">${selectedPlan?.price}/month</span>
                      </div>
                    </div>

                    {/* Payment Form */}
                    {stripePromise ? (
                      <Elements stripe={stripePromise} options={{ clientSecret }}>
                        <PaymentForm clientSecret={clientSecret} selectedPlan={selectedPlan} />
                      </Elements>
                    ) : (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                        <h3 className="text-lg font-semibold text-yellow-800 mb-2">Mock Payment (Testing Mode)</h3>
                        <p className="text-yellow-700 mb-4">
                          Stripe is not configured. Using mock payment for testing.
                        </p>
                        
                        <div className="space-y-4 mt-6">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Card Number</label>
                            <input
                              type="text"
                              placeholder="4242 4242 4242 4242"
                              className="w-full px-3 py-2 border border-gray-300 rounded-md"
                              disabled
                            />
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
                              <input
                                type="text"
                                placeholder="12/25"
                                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                disabled
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">CVC</label>
                              <input
                                type="text"
                                placeholder="123"
                                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                disabled
                              />
                            </div>
                          </div>
                          
                          <Button
                            type="button"
                            className="w-full medical-blue-600 hover:medical-blue-700 text-white py-3"
                            onClick={async () => {
                              if (!selectedPlanId) {
                                toast({
                                  title: "No Plan Selected",
                                  description: "Please select a plan first.",
                                  variant: "destructive",
                                });
                                return;
                              }
                              
                              setIsMockPayment(true);
                              try {
                                // Call mock payment endpoint
                                const response = await apiRequest("POST", "/api/mock-payment", {
                                  planId: selectedPlanId
                                });
                                const data = await response.json();
                                
                                if (data.success) {
                                  toast({
                                    title: "Mock Payment Successful",
                                    description: "Enrollment complete! Redirecting to confirmation...",
                                  });
                                  setTimeout(() => {
                                    setLocation("/confirmation");
                                  }, 1500);
                                } else {
                                  throw new Error("Payment failed");
                                }
                              } catch (error) {
                                console.error("Mock payment error:", error);
                                toast({
                                  title: "Payment Failed",
                                  description: "There was an error processing your payment. Please try again.",
                                  variant: "destructive",
                                });
                                setIsMockPayment(false);
                              }
                            }}
                            disabled={isMockPayment || !selectedPlanId}
                          >
                            {isMockPayment ? <LoadingSpinner /> : `Complete Mock Payment - $${sessionStorage.getItem("totalMonthlyPrice") || "0"}/month`}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Order Summary */}
              <div>
                <div className="bg-gray-50 rounded-lg p-6 sticky top-8">
                  <h3 className="text-lg font-semibold text-gray-900 mb-6">Order Summary</h3>
                  
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span className="text-gray-700">{selectedPlan?.name || "Plan"}</span>
                      <span className="text-gray-900">${selectedPlan?.price || "0.00"}</span>
                    </div>
                    
                    {sessionStorage.getItem("addRxValet") === "true" && (
                      <div className="flex justify-between">
                        <span className="text-gray-700">RxValet Add-on</span>
                        <span className="text-gray-900">${sessionStorage.getItem("coverageType") === "Member only" ? "19.00" : "21.00"}</span>
                      </div>
                    )}
                    
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Processing Fee (4%)</span>
                      <span className="text-gray-900">${((parseFloat(selectedPlan?.price || "0") + (sessionStorage.getItem("addRxValet") === "true" ? (sessionStorage.getItem("coverageType") === "Member only" ? 19 : 21) : 0)) * 0.04).toFixed(2)}</span>
                    </div>
                    
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Setup Fee</span>
                      <span className="text-green-600">Free</span>
                    </div>
                    
                    <div className="border-t border-gray-200 pt-4">
                      <div className="flex justify-between text-lg font-bold">
                        <span>Total Due Today</span>
                        <span className="text-medical-blue-600">${sessionStorage.getItem("totalMonthlyPrice") || "0"}</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-2">
                        Recurring monthly charge: ${sessionStorage.getItem("totalMonthlyPrice") || "0"}
                      </p>
                    </div>
                  </div>

                  {/* Security Notice */}
                  <div className="mt-6 p-4 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex items-start">
                      <Shield className="text-green-600 h-5 w-5 mr-3 mt-1" />
                      <div>
                        <p className="text-sm font-medium text-green-800">Secure Payment</p>
                        <p className="text-xs text-green-700 mt-1">
                          Your payment information is encrypted and secure. PCI-DSS compliant.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Billing Information */}
                  <div className="mt-6 text-sm text-gray-600">
                    <ul className="space-y-1">
                      <li className="flex items-center">
                        <Check className="h-4 w-4 text-green-500 mr-2" />
                        Cancel anytime with 45 days written notice
                      </li>
                      <li className="flex items-center">
                        <Check className="h-4 w-4 text-green-500 mr-2" />
                        No long-term contracts required
                      </li>
                      <li className="flex items-center">
                        <Check className="h-4 w-4 text-green-500 mr-2" />
                        Billing date: 1st of each month
                      </li>
                      <li className="flex items-center">
                        <Check className="h-4 w-4 text-green-500 mr-2" />
                        Automatic renewal unless cancelled
                      </li>
                    </ul>
                  </div>
                  
                  {/* Membership Enrollment Disclosure */}
                  <div className="mt-6 p-4 bg-amber-50 rounded-lg border border-amber-200">
                    <h4 className="text-sm font-semibold text-amber-900 mb-2">Important Membership Disclosures</h4>
                    <div className="space-y-2 text-xs text-amber-800">
                      <p>
                        <strong>Recurring Billing:</strong> This is a recurring monthly membership, not insurance, and benefits are active only when payments are current.
                      </p>
                      <p>
                        <strong>Payment Authorization:</strong> By enrolling, you authorize My Premier Plans to charge your payment method on file for your recurring monthly membership fee, beginning today and recurring monthly thereafter until you cancel in writing with 45 days' notice.
                      </p>
                      <p>
                        <strong>NSF Fee:</strong> If a payment is returned or declined, your membership will be suspended, and a $35 NSF fee may apply under Texas law.
                      </p>
                      <p>
                        <strong>Cancellation:</strong> You may cancel in writing with 45 days' notice and rejoin at any time without penalty. Coverage will not be active if you do not fund your plan for an upcoming month.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex flex-col sm:flex-row gap-4 pt-8 border-t border-gray-200 mt-8">
              <Button 
                type="button" 
                variant="outline"
                className="flex-1"
                onClick={() => setLocation("/registration")}
              >
                Back to Registration
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
