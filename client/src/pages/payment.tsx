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
        return_url: `${window.location.origin}/dashboard`,
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
      toast({
        title: "Payment Successful",
        description: "Welcome to MyPremierPlans! Your subscription is now active.",
      });
      setLocation("/dashboard");
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
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, authLoading, toast]);

  const { data: plans } = useQuery({
    queryKey: ["/api/plans"],
    enabled: isAuthenticated,
  });

  const createSubscriptionMutation = useMutation({
    mutationFn: async (planId: number) => {
      const response = await apiRequest("POST", "/api/create-subscription", { planId });
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
          window.location.href = "/api/login";
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

  // Auto-select individual plan if none selected
  useEffect(() => {
    if (plans && plans.length > 0 && !selectedPlanId) {
      const individualPlan = plans.find((plan: any) => 
        plan.name.toLowerCase().includes("individual")
      ) || plans[0];
      
      setSelectedPlanId(individualPlan.id);
      createSubscriptionMutation.mutate(individualPlan.id);
    }
  }, [plans, selectedPlanId]);

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
                    {/* Plan Selection */}
                    <div className="bg-gray-50 rounded-lg p-4 mb-6">
                      <h3 className="font-semibold text-gray-900 mb-4">Select Your Plan</h3>
                      <div className="space-y-3">
                        {plans?.map((plan: any) => (
                          <label 
                            key={plan.id}
                            className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                              selectedPlanId === plan.id 
                                ? "border-blue-600 bg-blue-50" 
                                : "border-gray-300 hover:bg-gray-50"
                            }`}
                          >
                            <div className="flex items-center">
                              <input
                                type="radio"
                                name="plan"
                                value={plan.id}
                                checked={selectedPlanId === plan.id}
                                onChange={() => {
                                  setSelectedPlanId(plan.id);
                                  createSubscriptionMutation.mutate(plan.id);
                                }}
                                className="mr-3 text-blue-600"
                              />
                              <div>
                                <div className="font-medium text-gray-900">{plan.name}</div>
                                {plan.description && (
                                  <div className="text-sm text-gray-600">{plan.description}</div>
                                )}
                              </div>
                            </div>
                            <div className="font-bold text-blue-600">${plan.price}/mo</div>
                          </label>
                        ))}
                      </div>
                    </div>

                    {createSubscriptionMutation.isPending && (
                      <div className="flex justify-center">
                        <LoadingSpinner />
                        <span className="ml-2">Setting up payment...</span>
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
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                        <h3 className="text-lg font-semibold text-yellow-800 mb-2">Payment Configuration Required</h3>
                        <p className="text-yellow-700 mb-4">
                          Stripe payment processing is not yet configured. Please contact your administrator to set up payment processing.
                        </p>
                        <p className="text-sm text-yellow-600">
                          This is a demo of the platform. Once Stripe keys are configured, customers will be able to complete their subscription payments here.
                        </p>
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
                      <span className="text-gray-900">${selectedPlan?.price || "0"}.00</span>
                    </div>
                    
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Setup Fee</span>
                      <span className="text-green-600">Free</span>
                    </div>
                    
                    <div className="border-t border-gray-200 pt-4">
                      <div className="flex justify-between text-lg font-bold">
                        <span>Total Due Today</span>
                        <span className="text-medical-blue-600">${selectedPlan?.price || "0"}.00</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-2">
                        Recurring monthly charge: ${selectedPlan?.price || "0"}.00
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
                        Cancel anytime with 30 days notice
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
