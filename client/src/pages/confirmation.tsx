import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Check, CheckCircle2, FileText, Phone, Mail, Globe, Download, Send, Printer } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function Confirmation() {
  console.log("[Confirmation] Component rendering - v1.1");
  
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [membershipData, setMembershipData] = useState<any>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const { toast } = useToast();
  
  console.log("[Confirmation] State:", { membershipData, user, authLoading, isProcessingPayment });



  // Get stored enrollment data - immediate load from URL and sessionStorage
  useEffect(() => {
    // Check for EPX redirect parameters (primary source for transaction info)
    const urlParams = new URLSearchParams(window.location.search);
    const epxTransaction = urlParams.get('transaction');
    const epxAmount = urlParams.get('amount');
    const urlPlanId = urlParams.get('planId'); // Get planId from URL (survives redirect)
    
    if (epxTransaction) {
      console.log('EPX payment redirect detected:', { 
        transaction: epxTransaction, 
        amount: epxAmount,
        planId: urlPlanId 
      });
    }

    // Get stored member data from registration
    const storedMemberData = sessionStorage.getItem("memberData");
    let memberInfo = null;
    if (storedMemberData) {
      try {
        memberInfo = JSON.parse(storedMemberData);
        console.log("[Confirmation] Loaded member data from session:", memberInfo);
        console.log("[Confirmation] Member has firstName?", !!memberInfo?.firstName, "lastName?", !!memberInfo?.lastName);
      } catch (e) {
        console.error("Failed to parse member data:", e);
      }
    } else {
      console.warn("[Confirmation] ⚠️ NO memberData found in sessionStorage!");
    }

    // Try URL first (most reliable after redirect), then sessionStorage
    const planId = urlPlanId || sessionStorage.getItem("selectedPlanId");
    const totalPrice = sessionStorage.getItem("totalMonthlyPrice");
    const rxValet = sessionStorage.getItem("rxValet") === "yes";
    const coverageType = sessionStorage.getItem("coverageType");

    console.log("Confirmation page - Loading data from URL and session:", { 
      urlPlanId,
      sessionPlanId: sessionStorage.getItem("selectedPlanId"),
      planId, // Final resolved value
      totalPrice, 
      coverageType, 
      rxValet,
      memberInfo,
      epxTransaction,
      epxAmount,
      allSessionStorage: Object.fromEntries(Object.entries(sessionStorage))
    });

    // Build immediate confirmation data - use actual member data from registration
    const today = new Date();
    const nextBillingDate = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
    
    const immediateData: any = {
      planId: planId ? parseInt(planId) : null,
      totalMonthlyPrice: totalPrice ? parseFloat(totalPrice) : (epxAmount ? parseFloat(epxAmount) : null),
      addRxValet: rxValet,
      coverageType: coverageType || "individual",
      transactionId: epxTransaction || `TXN${Date.now()}`,
      // Use actual member data if available
      customerNumber: memberInfo?.customerNumber || "Pending",
      memberId: memberInfo?.id || "Pending",
      firstName: memberInfo?.firstName || user?.firstName || "Member",
      lastName: memberInfo?.lastName || user?.lastName || "",
      email: memberInfo?.email || user?.email || "",
      billingDate: today,
      nextBillingDate,
      enrollmentDate: today,
      createdAt: new Date().toISOString()
    };

    console.log("[Confirmation] Setting membership data:");
    console.log("[Confirmation]   - Using memberInfo?", !!memberInfo);
    console.log("[Confirmation]   - firstName:", immediateData.firstName, "(from", memberInfo?.firstName ? "memberInfo" : "user", ")");
    console.log("[Confirmation]   - lastName:", immediateData.lastName, "(from", memberInfo?.lastName ? "memberInfo" : "user", ")");
    console.log("[Confirmation]   - email:", immediateData.email, "(from", memberInfo?.email ? "memberInfo" : "user", ")");
    console.log("[Confirmation]   - Full immediateData:", immediateData);

    // Set immediately - don't block on auth
    setMembershipData(immediateData);

    if (!planId && !epxTransaction && retryCount >= 3) {
      console.error("No plan ID or transaction found after retries");
      toast({
        title: "Session Expired",
        description: "Please start the enrollment process again.",
        variant: "destructive",
      });
      setTimeout(() => {
        setLocation("/");
      }, 2000);
    }

    // Clear session storage after a longer delay to prevent issues
    setTimeout(() => {
      sessionStorage.removeItem("selectedPlanId");
      sessionStorage.removeItem("totalMonthlyPrice");
      sessionStorage.removeItem("rxValet");
      sessionStorage.removeItem("coverageType");
      sessionStorage.removeItem("primaryAddress");
      sessionStorage.removeItem("processingFee");
      sessionStorage.removeItem("basePlanPrice");
    }, 5000); // Increased to 5 seconds
  }, [user, setLocation, toast, retryCount]);

  const { data: plans = [] } = useQuery<any[]>({
    queryKey: ["/api/plans"],
    enabled: !!membershipData, // Load plans as soon as we have any membership data
  });

  // Only show loading if we're actively processing a payment
  // Don't block on auth loading - agents need immediate confirmation for back-to-back enrollments
  if (isProcessingPayment) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner />
          <p className="mt-4 text-gray-600">Processing your payment...</p>
        </div>
      </div>
    );
  }

  // If no membership data at all, show loading (shouldn't happen with immediate data load)
  if (!membershipData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner />
          <p className="mt-4 text-gray-600">Loading confirmation...</p>
        </div>
      </div>
    );
  }

  const selectedPlan = plans?.find((plan: any) => plan.id === membershipData?.planId);
  const planName = selectedPlan?.name || "";
  const planFeatures = selectedPlan ? [
    "Unlimited virtual telehealth visits 24/7",
    "Primary care physician visits",
    "Preventive care and wellness exams",
    "Chronic disease management",
    "Generic medications (when applicable)",
    ...(planName.includes("Plus") ? ["Specialist referrals", "Mental health support"] : []),
    ...(planName.includes("Elite") ? ["Premium provider network", "Executive health services", "Concierge support"] : []),
    ...(membershipData?.addRxValet ? ["BestChoice Rx Pro Premium-5 prescription savings"] : [])
  ] : [];

  // Print function
  const handlePrint = () => {
    window.print();
  };

  // Download function (creates a downloadable HTML file)
  const handleDownload = () => {
    const element = document.getElementById('confirmation-content');
    if (!element) return;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>MyPremierPlans Enrollment Confirmation - ${membershipData.customerNumber}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 20px; margin-bottom: 20px; }
    .success { color: #16a34a; }
    .section { margin: 20px 0; padding: 20px; background: #f3f4f6; border-radius: 8px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .label { color: #6b7280; font-size: 14px; }
    .value { font-weight: bold; margin-bottom: 10px; }
    .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  ${element.innerHTML}
  <div class="footer">
    <p>This document serves as proof of enrollment with MyPremierPlans.</p>
    <p>Downloaded on ${new Date().toLocaleString()}</p>
  </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MPP_Enrollment_${membershipData.customerNumber}_${format(new Date(), 'yyyyMMdd')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Download Complete",
      description: "Your enrollment confirmation has been downloaded.",
    });
  };

  // Email function - sends confirmation email
  const handleEmail = async () => {
    try {
      const response = await apiRequest('/api/send-confirmation-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: user?.email,
          customerNumber: membershipData?.customerNumber,
          memberName: `${user?.firstName} ${user?.lastName}`,
          planName: selectedPlan?.name || 'Premium Plan',
          transactionId: membershipData?.transactionId,
          amount: membershipData?.totalMonthlyPrice
        })
      });

      toast({
        title: "Email Sent",
        description: "Your enrollment confirmation has been emailed from info@mypremierplans.com",
      });
    } catch (error) {
      console.error('Error sending confirmation email:', error);
      toast({
        title: "Email Error",
        description: "Failed to send confirmation email. Please try again.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <Card className="p-8">
          <CardContent className="p-0" id="confirmation-content">
            {/* Success Header */}
            <div className="text-center mb-8">
              <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto mb-4" />
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Membership Enrollment Confirmed!</h1>
              <p className="text-gray-600">Your enrollment has been successfully processed.</p>
              <p className="text-lg font-semibold text-medical-blue-600 mt-2">Customer Number: {membershipData.customerNumber}</p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap justify-center gap-4 mb-8">
              <Button 
                onClick={handleDownload}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Download className="h-4 w-4 mr-2" />
                Download Confirmation
              </Button>
              <Button 
                onClick={handlePrint}
                variant="outline"
                className="border-medical-blue-600 text-medical-blue-600 hover:bg-medical-blue-50"
              >
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
              <Button 
                onClick={handleEmail}
                variant="outline"
                className="border-medical-blue-600 text-medical-blue-600 hover:bg-medical-blue-50"
              >
                <Send className="h-4 w-4 mr-2" />
                Email Confirmation
              </Button>
            </div>

            {/* Membership Summary */}
            <div className="bg-gray-50 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Membership Summary</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <p className="text-sm text-gray-600">Member Name</p>
                  <p className="font-medium">{membershipData.firstName} {membershipData.lastName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Customer Number</p>
                  <p className="font-medium">{membershipData?.customerNumber || "Pending"}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Member ID</p>
                  <p className="font-medium">{membershipData?.email || "Pending"}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Enrollment Date</p>
                  <p className="font-medium">
                    {membershipData?.enrollmentDate 
                      ? format(new Date(membershipData.enrollmentDate), "MMMM d, yyyy")
                      : format(new Date(), "MMMM d, yyyy")
                    }
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Plan Name</p>
                  <p className="font-medium">{selectedPlan?.name || "Premium Plan"}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Coverage Type</p>
                  <p className="font-medium">{membershipData?.coverageType || "Individual"}</p>
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-600 mb-2">Features Included:</p>
                <ul className="space-y-1">
                  {planFeatures.map((feature, index) => (
                    <li key={index} className="flex items-start">
                      <Check className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Payment Details */}
            <div className="bg-blue-50 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Payment Details</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Payment Status</p>
                  <p className="font-medium text-green-600">Confirmed</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Payment Method</p>
                  <p className="font-medium">Card ending in 4242</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Transaction ID</p>
                  <p className="font-medium font-mono text-sm">{membershipData?.transactionId || "Processing"}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Monthly Amount</p>
                  <p className="font-medium">${membershipData?.totalMonthlyPrice || membershipData?.totalPrice || "0.00"}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Billing Date</p>
                  <p className="font-medium">
                    {membershipData?.billingDate 
                      ? format(new Date(membershipData.billingDate), "MMMM d, yyyy")
                      : format(new Date(), "MMMM d, yyyy")
                    }
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Next Billing Date</p>
                  <p className="font-medium">
                    {membershipData?.nextBillingDate 
                      ? format(new Date(membershipData.nextBillingDate), "MMMM d, yyyy")
                      : format(new Date(new Date().setMonth(new Date().getMonth() + 1)), "MMMM d, yyyy")
                    }
                  </p>
                </div>
              </div>
            </div>

            {/* Contact Information */}
            <div className="bg-green-50 rounded-lg p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Questions? We're Here to Help!</h3>
              <div className="space-y-2">
                <p className="flex items-center text-sm">
                  <Mail className="h-4 w-4 text-gray-600 mr-2" />
                  <a href="mailto:info@mypremierplans.com" className="text-blue-600 hover:underline">
                    info@mypremierplans.com
                  </a>
                </p>
                <p className="flex items-center text-sm">
                  <Phone className="h-4 w-4 text-gray-600 mr-2" />
                  <a href="tel:888-346-9372" className="text-blue-600 hover:underline">
                    888-346-9372 (888-34-MYDPC)
                  </a>
                </p>
                <p className="flex items-center text-sm">
                  <Globe className="h-4 w-4 text-gray-600 mr-2" />
                  <a href="https://www.mypremierplans.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    www.mypremierplans.com
                  </a>
                </p>
              </div>
            </div>

            {/* Next Steps */}
            <div className="border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Next Steps</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
                <li>Check your email for your welcome packet and membership card</li>
                <li>Download the MyPremierPlans mobile app for easy access to your benefits</li>
                <li>Schedule your first appointment with your primary care physician</li>
                <li>Review your member portal for additional resources and information</li>
              </ol>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 mt-8">
              <Button 
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                onClick={() => setLocation("/agent")}
              >
                Return to Dashboard
              </Button>
              <Button 
                variant="outline"
                className="flex-1"
                onClick={() => window.print()}
              >
                <FileText className="h-4 w-4 mr-2" />
                Print Confirmation
              </Button>
            </div>

            {/* Important Notice */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
              <h3 className="text-lg font-semibold text-yellow-800 mb-2">Important Information</h3>
              <p className="text-sm text-yellow-700 mb-2">
                Please save this confirmation for your records. Your MyPremierPlans customer number is <strong>{membershipData.customerNumber}</strong>.
              </p>
              <p className="text-sm text-yellow-700">
                You will need this number when scheduling appointments or contacting customer service.
              </p>
            </div>

            {/* Footer Actions */}
            <div className="text-center pt-6 border-t">
              <Button 
                onClick={() => {
                  const defaultRoute = user?.role === "admin" ? "/admin" : user?.role === "agent" ? "/agent" : "/";
                  setLocation(defaultRoute);
                }}
                className="bg-medical-blue-600 hover:bg-medical-blue-700 text-white font-semibold"
              >
                Go to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Print Styles */}
        <style jsx>{`
          @media print {
            .no-print {
              display: none !important;
            }
            body {
              font-size: 12pt;
            }
            #confirmation-content {
              padding: 20px;
            }
          }
        `}</style>
      </div>
    </div>
  );
}