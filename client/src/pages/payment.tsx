import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { ProgressIndicator } from "@/components/progress-indicator";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Shield, Check, CreditCard, MapPin, Phone } from "lucide-react";
import { CancellationPolicyModal } from "@/components/CancellationPolicyModal";
// import { EPXPayment } from "@/components/EPXPayment"; // Browser Post (commented out)
import EPXHostedPayment from "@/components/EPXHostedPayment"; // Hosted Checkout (active)
import BankAccountForm from "@/components/BankAccountForm"; // ACH payment option
import { isAdminOrAbove } from "@/lib/roles";
import { RX_ADDON_MONTHLY_PRICE } from "@shared/pricing";

export default function Payment() {
  const [, setLocation] = useLocation();
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [showEPXPayment, setShowEPXPayment] = useState(false);
  const [memberData, setMemberData] = useState<any>(null);
  const [memberId, setMemberId] = useState<number | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [epxRetryKey, setEpxRetryKey] = useState(0);
  const [isOverrideEnabled, setIsOverrideEnabled] = useState(false);
  const [overrideAmountInput, setOverrideAmountInput] = useState("");
  const [overrideReasonInput, setOverrideReasonInput] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'ach'>('card'); // Default to card
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
  const canOverrideAmount = isAdminOrAbove(user?.role);
  const canUseACH = true;
  const rxAddOnDisplay = RX_ADDON_MONTHLY_PRICE.toFixed(2);

  // Load stored plan ID and member data from registration
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
        description: "Please go back to registration and select a healthcare membership.",
        variant: "destructive",
      });
    }

    const storedMemberId = sessionStorage.getItem("memberId");
    if (storedMemberId) {
      const parsedMemberId = parseInt(storedMemberId, 10);
      if (!Number.isNaN(parsedMemberId)) {
        setMemberId(parsedMemberId);
      }
    } else {
      toast({
        title: "Member Not Found",
        description: "Please restart registration before submitting payment.",
        variant: "destructive"
      });
      setTimeout(() => {
        setLocation("/registration");
      }, 1500);
    }

    // Load member data for payment (use member's info, not agent's)
    const storedMemberData = sessionStorage.getItem("memberData");
    if (storedMemberData) {
      try {
        const parsedMemberData = JSON.parse(storedMemberData);
        console.log("Loaded member data for payment:", parsedMemberData);
        setMemberData(parsedMemberData);
      } catch (e) {
        console.error("Failed to parse member data:", e);
      }
    } else {
      console.warn("No member data found in session storage - will use logged-in user data");
    }
  }, []);

  useEffect(() => {
    if (!canOverrideAmount && isOverrideEnabled) {
      setIsOverrideEnabled(false);
      setOverrideAmountInput("");
      setOverrideReasonInput("");
    }
  }, [canOverrideAmount, isOverrideEnabled]);

  useEffect(() => {
    if (!canUseACH && paymentMethod === 'ach') {
      setPaymentMethod('card');
    }
  }, [canUseACH, paymentMethod]);



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
  const parsedOverrideAmount = isOverrideEnabled ? parseFloat(overrideAmountInput) : NaN;
  const hasValidOverrideAmount = isOverrideEnabled && Number.isFinite(parsedOverrideAmount) && parsedOverrideAmount > 0;
  const overrideAmountValue = hasValidOverrideAmount ? parsedOverrideAmount : undefined;
  const overrideReasonValue = overrideReasonInput.trim() ? overrideReasonInput.trim() : undefined;

  const parseAmount = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return undefined;
  };

  const storedAmountValue = sessionStorage.getItem('totalMonthlyPrice');
  const storedAmount = storedAmountValue ? parseFloat(storedAmountValue) : NaN;
  const fallbackAmount =
    parseAmount(memberData?.totalMonthlyPrice) ??
    parseAmount(memberData?.totalPrice) ??
    parseAmount(selectedPlan?.totalMonthlyPrice) ??
    parseAmount(selectedPlan?.price) ??
    0;
  const epxPaymentAmount = Number.isFinite(storedAmount) && storedAmount > 0 ? storedAmount : fallbackAmount;
  
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

  const handlePolicyAccept = () => {
    setShowPolicyModal(false);
    toast({
      title: "Policy acknowledged",
      description: "Thanks for reviewing the cancellation and refund terms.",
    });
  };
  
  const handlePolicyClose = () => {
    setShowPolicyModal(false);
  };
  
  const handleEPXPaymentSuccess = async (transactionId?: string | null, amountOverride?: number | null) => {
    toast({
      title: "Payment successful!",
      description: "Your subscription has been activated.",
    });

    if (transactionId) {
      sessionStorage.setItem("lastTransactionId", transactionId);
    }

    if (typeof amountOverride === "number" && Number.isFinite(amountOverride)) {
      sessionStorage.setItem("lastPaymentAmount", amountOverride.toFixed(2));
    }

    setShowEPXPayment(false);
    setPaymentError(null);
    setEpxRetryKey((prev) => prev + 1);

    const params = new URLSearchParams();
    if (transactionId) {
      params.set("transaction", transactionId);
    }

    const normalizedAmount = typeof amountOverride === "number" && Number.isFinite(amountOverride)
      ? amountOverride
      : Number.isFinite(epxPaymentAmount)
        ? epxPaymentAmount
        : undefined;

    if (typeof normalizedAmount === "number") {
      params.set("amount", normalizedAmount.toFixed(2));
    }

    if (selectedPlanId) {
      params.set("planId", selectedPlanId.toString());
    }

    setTimeout(() => {
      const query = params.toString();
      setLocation(`/confirmation${query ? `?${query}` : ""}`);
    }, 1200);
  };

  const handleEPXPaymentProcessing = (transactionId?: string | null, amountOverride?: number | null) => {
    toast({
      title: "Payment processing",
      description: "Your payment was received and is being finalized.",
    });

    if (transactionId) {
      sessionStorage.setItem("lastTransactionId", transactionId);
    }

    if (typeof amountOverride === "number" && Number.isFinite(amountOverride)) {
      sessionStorage.setItem("lastPaymentAmount", amountOverride.toFixed(2));
    }

    setShowEPXPayment(false);
    setPaymentError(null);
    setEpxRetryKey((prev) => prev + 1);

    const params = new URLSearchParams();
    if (transactionId) {
      params.set("transaction", transactionId);
    }

    const normalizedAmount = typeof amountOverride === "number" && Number.isFinite(amountOverride)
      ? amountOverride
      : Number.isFinite(epxPaymentAmount)
        ? epxPaymentAmount
        : undefined;

    if (typeof normalizedAmount === "number") {
      params.set("amount", normalizedAmount.toFixed(2));
    }

    if (selectedPlanId) {
      params.set("planId", selectedPlanId.toString());
    }

    params.set("reconciliation", "pending");

    setTimeout(() => {
      const query = params.toString();
      setLocation(`/confirmation${query ? `?${query}` : ""}`);
    }, 1000);
  };

  const handleEPXPaymentError = (error: string) => {
    console.error("EPX Payment error:", error);
    setPaymentError(error || "There was an error processing your payment.");
    toast({
      title: "Payment failed",
      description: error || "There was an error processing your payment.",
      variant: "destructive",
    });
  };

  const handleEPXPaymentCancel = () => {
    setPaymentError(null);
    setShowEPXPayment(false);
    toast({
      title: "Payment cancelled",
      description: "You can complete your payment anytime.",
    });
  };

  const handleRetryPayment = () => {
    setPaymentError(null);
    setEpxRetryKey((prev) => prev + 1);
  };

  const handleOverrideToggle = (checked: boolean) => {
    setIsOverrideEnabled(checked);
    if (!checked) {
      setOverrideAmountInput('');
      setOverrideReasonInput('');
      return;
    }
    if (!overrideAmountInput) {
      setOverrideAmountInput('1.00');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-aqua-50 via-white to-french-blue-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <Card className="border-french-blue-100 bg-white/95 p-8 shadow-xl backdrop-blur-sm">
          <CardContent className="p-0">
            <div className="mb-8">
              <h1 className="mb-2 text-3xl font-bold text-deep-twilight-900">Payment Details</h1>
              <p className="text-french-blue-800">Complete your enrollment</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Payment Form */}
              <div>
                <div className="space-y-6">
                  {/* Selected Plan Display */}
                  <div className="mb-6 rounded-lg border border-french-blue-200 bg-french-blue-50 p-6">
                    <h3 className="mb-4 font-semibold text-deep-twilight-900">Your Selected Healthcare Membership</h3>
                    {selectedPlan ? (
                      <div>
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h4 className="text-xl font-bold text-deep-twilight-900">{selectedPlan.name}</h4>
                            {selectedPlan.description && (
                              <p className="mt-1 text-french-blue-800">{selectedPlan.description}</p>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold text-deep-twilight-700">
                              ${sessionStorage.getItem("totalMonthlyPrice") || selectedPlan.price}
                            </div>
                            <div className="text-sm text-french-blue-700">per month</div>
                          </div>
                        </div>
                        
                        {/* Price Breakdown */}
                        <div className="space-y-2 border-t border-french-blue-200 pt-4">
                          <div className="flex justify-between text-sm">
                            <span>Base Membership</span>
                            <span>${selectedPlan.price}</span>
                          </div>
                          {sessionStorage.getItem("coverageType") !== "Member only" && (
                            <div className="flex justify-between text-sm">
                              <span>Family Members</span>
                              <span>Included in membership</span>
                            </div>
                          )}
                          {sessionStorage.getItem("rxValet") === "yes" && (
                            <div className="flex justify-between text-sm">
                              <span>RxValet Add-on</span>
                              <span>${rxAddOnDisplay}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm">
                          <span>Administration Fee (4%)</span>
                          <span>${sessionStorage.getItem("processingFee") || "0"}</span>
                        </div>
                        <div className="flex justify-between font-bold pt-2 border-t">
                          <span>Total</span>
                          <span>${sessionStorage.getItem("totalMonthlyPrice") || selectedPlan.price}</span>
                        </div>
                        </div>
                        
                        <button
                          type="button"
                          className="mt-4 text-sm text-french-blue-700 underline hover:text-deep-twilight-700"
                          onClick={() => setLocation("/registration")}
                        >
                          Change plan selection
                        </button>
                      </div>
                    ) : (
                      <p className="text-gray-600">No plan selected. Please go back to registration.</p>
                    )}
                  </div>
                  
                  {/* Hosted Checkout Prompt */}
                  {selectedPlan && (
                    <div className="space-y-5 rounded-lg border border-french-blue-100 bg-white p-6 shadow-sm">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5 text-french-blue-600" />
                        <h3 className="text-lg font-semibold text-deep-twilight-900">Complete Payment</h3>
                      </div>
                      <p className="text-sm text-french-blue-800">
                        We use EPX Hosted Checkout for all payments. Click the button below to launch the secure window and
                        finish enrollment. MyPremierPlans never collects or stores your card number on this page.
                      </p>
                      <div className="rounded-lg border border-bright-teal-blue-200 bg-sky-aqua-50 p-4 text-sm text-french-blue-900">
                        <p className="mb-2 font-semibold text-deep-twilight-900">What to expect:</p>
                        <ul className="list-disc space-y-1 pl-5">
                          <li>A secure EPX modal opens after you click <span className="font-semibold">Pay with Card</span>.</li>
                          <li>Enter your card details there and submit; we’ll redirect you to confirmation automatically.</li>
                        </ul>
                      </div>
                      {canOverrideAmount && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold">Admin test payment override</p>
                              <p className="text-xs text-amber-800">Charge a manual amount for sandbox validations. Members never see this control.</p>
                            </div>
                            <Switch checked={isOverrideEnabled} onCheckedChange={handleOverrideToggle} aria-label="Toggle amount override" />
                          </div>
                          {isOverrideEnabled && (
                            <div className="mt-4 space-y-3">
                              <div>
                                <Label htmlFor="override-amount" className="text-xs font-semibold uppercase tracking-wide text-amber-900">Override Amount (USD)</Label>
                                <Input
                                  id="override-amount"
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  value={overrideAmountInput}
                                  onChange={(e) => setOverrideAmountInput(e.target.value)}
                                  placeholder="1.00"
                                />
                              </div>
                              <div>
                                <Label htmlFor="override-reason" className="text-xs font-semibold uppercase tracking-wide text-amber-900">Internal note</Label>
                                <Input
                                  id="override-reason"
                                  type="text"
                                  value={overrideReasonInput}
                                  onChange={(e) => setOverrideReasonInput(e.target.value)}
                                  placeholder="Ex: $1.00 sandbox verification"
                                />
                              </div>
                              {!hasValidOverrideAmount && (
                                <p className="text-xs text-red-700">Enter a positive amount before launching hosted checkout.</p>
                              )}
                              <p className="text-xs text-amber-800">
                                Every override attempt is logged with your user ID. Use only for EPX sandbox or penny-test transactions.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                      <Button
                        type="button"
                        className="w-full border-0 bg-gradient-to-r from-deep-twilight-600 via-french-blue-500 to-bright-teal-blue-500 py-3 text-sky-aqua-50 shadow-colored transition-all duration-300 hover:from-deep-twilight-500 hover:to-turquoise-surf-500"
                        onClick={() => {
                          if (!user?.id || !user?.email) {
                            toast({
                              title: "User data not loaded",
                              description: "Please wait for your user information to load before proceeding.",
                              variant: "destructive"
                            });
                            return;
                          }
                          if (!memberId) {
                            toast({
                              title: "Member record missing",
                              description: "Please restart registration before completing payment.",
                              variant: "destructive"
                            });
                            setLocation("/registration");
                            return;
                          }
                          if (isOverrideEnabled) {
                            if (!canOverrideAmount) {
                              toast({
                                title: "Insufficient permissions",
                                description: "Only admins can override the payment amount.",
                                variant: "destructive"
                              });
                              setIsOverrideEnabled(false);
                              return;
                            }
                            if (!hasValidOverrideAmount) {
                              toast({
                                title: "Enter a valid override",
                                description: "Provide a positive dollar amount before launching the test payment.",
                                variant: "destructive"
                              });
                              return;
                            }
                          }
                          setPaymentError(null);
                          setShowEPXPayment(true);
                        }}
                        disabled={isProcessingPayment || !selectedPlanId || !user?.id || !user?.email || !memberId}
                      >
                        {!user?.id || !user?.email ? "Loading User..." : (isProcessingPayment ? <LoadingSpinner /> : `Pay with ${paymentMethod === 'card' ? 'Card' : 'Bank Account'} - $${sessionStorage.getItem("totalMonthlyPrice") || "0"}/month`)}
                      </Button>
                      
                      {/* Quiet ACH option - not prominently displayed */}
                      <div className="mt-2 text-center text-xs text-french-blue-800">
                        {paymentMethod === 'card' && canUseACH ? (
                          <button
                            type="button"
                            onClick={() => setPaymentMethod('ach')}
                            className="underline hover:text-deep-twilight-700"
                          >
                            Don't have a card? Pay with bank account
                          </button>
                        ) : paymentMethod === 'ach' ? (
                          <button
                            type="button"
                            onClick={() => setPaymentMethod('card')}
                            className="underline hover:text-deep-twilight-700"
                          >
                            Use credit/debit card instead
                          </button>
                        ) : null}
                      </div>
                      
                      <p className="text-center text-xs text-french-blue-800">
                        <Shield className="inline-block mr-1 h-3 w-3" />
                        Payments are processed securely via EPX hosted checkout. Card details never touch MyPremierPlans servers.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Order Summary */}
              <div>
                <div className="sticky top-8 rounded-lg border border-french-blue-100 bg-white/90 p-6 shadow-sm backdrop-blur-sm">
                  <h3 className="mb-6 text-lg font-semibold text-deep-twilight-900">Order Summary</h3>
                  
                  <div className="space-y-4">
                    <div className="flex justify-between">
                        <span className="text-french-blue-900">{selectedPlan?.name || "Plan"}</span>
                      <span className="text-deep-twilight-900">${selectedPlan?.price || "0.00"}</span>
                    </div>
                    
                  {sessionStorage.getItem("rxValet") === "yes" && (
                    <div className="flex justify-between">
                      <span className="text-french-blue-900">RxValet Add-on</span>
                        <span className="text-deep-twilight-900">${rxAddOnDisplay}</span>
                    </div>
                  )}
                  
                  <div className="flex justify-between text-sm text-french-blue-800">
                    <span>Administration Fee (4%)</span>
                    <span className="text-deep-twilight-900">${sessionStorage.getItem("processingFee") || "0.00"}</span>
                  </div>
                  
                  <div className="flex justify-between text-sm text-french-blue-800">
                    <span>Setup Fee</span>
                    <span className="text-sky-aqua-700">Free</span>
                  </div>                    <div className="border-t border-french-blue-100 pt-4">
                      <div className="flex justify-between text-lg font-bold">
                        <span>Total Due Today</span>
                        <span className="text-deep-twilight-700">${sessionStorage.getItem("totalMonthlyPrice") || "0"}</span>
                      </div>
                      <p className="mt-2 text-sm text-french-blue-800">
                        Recurring monthly charge: ${sessionStorage.getItem("totalMonthlyPrice") || "0"}
                      </p>
                    </div>
                  </div>

                  {/* Security Notice */}
                  <div className="mt-6 rounded-lg border border-sky-aqua-200 bg-sky-aqua-50 p-4">
                    <div className="flex items-start">
                      <Shield className="mr-3 mt-1 h-5 w-5 text-sky-aqua-700" />
                      <div>
                        <p className="text-sm font-medium text-deep-twilight-900">Secure Payment</p>
                        <p className="mt-1 text-xs text-french-blue-800">
                          Your payment information is encrypted and secure. PCI-DSS compliant.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Billing Information */}
                  <div className="mt-6 text-sm text-french-blue-800">
                    <ul className="space-y-1">
                      <li className="flex items-center">
                        <Check className="mr-2 h-4 w-4 text-french-blue-600" />
                        Cancel anytime with 14 days written notice
                      </li>
                      <li className="flex items-center">
                        <Check className="mr-2 h-4 w-4 text-french-blue-600" />
                        No long-term contracts required
                      </li>
                      <li className="flex items-center">
                        <Check className="mr-2 h-4 w-4 text-french-blue-600" />
                        Billing date: 1st of each month
                      </li>
                      <li className="flex items-center">
                        <Check className="mr-2 h-4 w-4 text-french-blue-600" />
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
                        <strong>Payment Authorization:</strong> By enrolling, you authorize My Premier Plans to charge your payment method on file for your recurring monthly membership fee, beginning today and recurring monthly thereafter until you cancel in writing with 14 days' notice.
                      </p>
                      <p>
                        <strong>NSF Fee:</strong> If a payment is returned or declined, your membership will be suspended, and a $35 NSF fee may apply under Texas law.
                      </p>
                      <p>
                        <strong>Cancellation:</strong> You may cancel in writing with 14 days' notice and rejoin at any time without penalty. Coverage will not be active if you do not fund your plan for an upcoming month.
                      </p>
                      <div className="mt-3 pt-3 border-t border-amber-300">
                        <button
                          type="button"
                          onClick={() => setShowPolicyModal(true)}
                          className="text-amber-900 underline hover:text-amber-700 font-medium"
                        >
                          View Complete Cancellation & Refund Policy →
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Company Contact Information */}
                  <div className="mt-6 rounded-lg border border-french-blue-200 bg-french-blue-50 p-4">
                    <h4 className="mb-3 text-sm font-semibold text-deep-twilight-900">Contact Us</h4>
                    <div className="space-y-2 text-xs text-french-blue-900">
                      <div className="flex items-start">
                        <MapPin className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium">Company Address</p>
                          <p>22211 W. I-10, Bldg 1 Suite 1206</p>
                          <p>San Antonio, TX 78253</p>
                        </div>
                      </div>
                      <div className="flex items-start">
                        <Phone className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium">Customer Service</p>
                          <p>Toll-Free: <a href="tel:+18883469372" className="text-deep-twilight-700 hover:underline">+1 (888) 346-9372</a></p>
                          <p>Local: <a href="tel:+12106249149" className="text-deep-twilight-700 hover:underline">+1 (210) 624-9149</a></p>
                          <p className="text-xs mt-1">Monday - Friday: 8:00 AM - 6:00 PM CST</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Form Actions */}
            <div className="mt-8 flex flex-col gap-4 border-t border-french-blue-100 pt-8 sm:flex-row">
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
      
      {/* Cancellation Policy Modal */}
      <CancellationPolicyModal
        isOpen={showPolicyModal}
        onClose={handlePolicyClose}
        onAccept={handlePolicyAccept}
      />
      
      {/* EPX Payment Modal */}
      {showEPXPayment && selectedPlan && user?.id && user?.email && memberId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-deep-twilight-950/70 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-french-blue-100 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-deep-twilight-900">Complete Payment</h2>
                <p className="text-sm text-french-blue-700">Secure EPX hosted checkout</p>
              </div>
              <button
                type="button"
                onClick={handleEPXPaymentCancel}
                className="rounded-md p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              >
                Close
              </button>
            </div>

            {paymentError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <p className="font-semibold text-red-900">Payment attempt failed</p>
                <p className="mt-1">{paymentError}</p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Button className="flex-1" onClick={handleRetryPayment}>
                    Retry Payment
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={handleEPXPaymentCancel}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {(() => {
              const finalCustomerName = memberData ? `${memberData.firstName || ''} ${memberData.lastName || ''}`.trim() : `${user.firstName || ''} ${user.lastName || ''}`.trim();
              const finalCustomerEmail = memberData?.email || user.email;
              console.log('[Payment] EPX Modal Data:', {
                memberData,
                finalCustomerName,
                finalCustomerEmail,
                userId: user.id,
                memberId,
                paymentMethod
              });
              
              // Render payment form based on selected method
              if (paymentMethod === 'ach' && canUseACH) {
                return (
                  <BankAccountForm
                    key={epxRetryKey}
                    amount={epxPaymentAmount}
                    customerId={memberId.toString()}
                    customerEmail={finalCustomerEmail}
                    customerName={finalCustomerName}
                    description={`${selectedPlan.name} - DPC Subscription`}
                    redirectOnSuccess={false}
                    onSuccess={handleEPXPaymentSuccess}
                    onError={handleEPXPaymentError}
                  />
                );
              }
              
              return (
                <EPXHostedPayment
                  key={epxRetryKey}
                  amount={epxPaymentAmount}
                  amountOverride={overrideAmountValue}
                  amountOverrideReason={overrideReasonValue}
                  customerId={memberId.toString()}
                  customerEmail={finalCustomerEmail}
                  customerName={finalCustomerName}
                  planId={selectedPlanId?.toString()}
                  description={`${selectedPlan.name} - DPC Subscription`}
                  billingAddress={{
                    streetAddress: memberData?.address || user.address || '',
                    city: memberData?.city || user.city || '',
                    state: memberData?.state || user.state || '',
                    postalCode: memberData?.zipCode || user.zipCode || ''
                  }}
                  redirectOnSuccess={false}
                  onSuccess={handleEPXPaymentSuccess}
                  onProcessing={handleEPXPaymentProcessing}
                  onError={handleEPXPaymentError}
                />
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
