import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Check, CheckCircle2, FileText, Phone, Mail, Globe } from "lucide-react";
import { format } from "date-fns";

export default function Confirmation() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [membershipData, setMembershipData] = useState<any>(null);

  // Get stored enrollment data
  useEffect(() => {
    const planId = sessionStorage.getItem("selectedPlanId");
    const totalPrice = sessionStorage.getItem("totalMonthlyPrice");
    const addRxValet = sessionStorage.getItem("addRxValet") === "true";
    const coverageType = sessionStorage.getItem("coverageType");

    if (!planId || !user) {
      setLocation("/");
      return;
    }

    // Generate a mock transaction ID
    const transactionId = `MPP${Date.now()}`;
    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);

    setMembershipData({
      memberId: `MPP${user.id}`,
      transactionId,
      billingDate: today,
      nextBillingDate: nextMonth,
      totalPrice,
      addRxValet,
      coverageType,
      planId: parseInt(planId)
    });

    // Clear session storage
    sessionStorage.removeItem("selectedPlanId");
    sessionStorage.removeItem("totalMonthlyPrice");
    sessionStorage.removeItem("addRxValet");
    sessionStorage.removeItem("coverageType");
    sessionStorage.removeItem("primaryAddress");
  }, [user, setLocation]);

  const { data: plans } = useQuery({
    queryKey: ["/api/plans"],
    enabled: isAuthenticated && !!membershipData,
  });

  if (authLoading || !membershipData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  const selectedPlan = plans?.find((plan: any) => plan.id === membershipData.planId);
  const planFeatures = selectedPlan ? [
    "Unlimited virtual telehealth visits 24/7",
    "Primary care physician visits",
    "Preventive care and wellness exams",
    "Chronic disease management",
    "Generic medications (when applicable)",
    ...(selectedPlan.name.includes("Plus") ? ["Specialist referrals", "Mental health support"] : []),
    ...(selectedPlan.name.includes("Elite") ? ["Premium provider network", "Executive health services", "Concierge support"] : []),
    ...(membershipData.addRxValet ? ["BestChoice Rx Pro Premium-5 prescription savings"] : [])
  ] : [];

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <Card className="p-8">
          <CardContent className="p-0">
            {/* Success Header */}
            <div className="text-center mb-8">
              <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto mb-4" />
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Membership Enrollment Confirmed!</h1>
              <p className="text-gray-600">Your enrollment has been successfully processed.</p>
            </div>

            {/* Membership Summary */}
            <div className="bg-gray-50 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Membership Summary</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <p className="text-sm text-gray-600">Member Name</p>
                  <p className="font-medium">{user?.firstName} {user?.lastName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Member ID</p>
                  <p className="font-medium">{membershipData.memberId}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Plan Name</p>
                  <p className="font-medium">{selectedPlan?.name || "Plan"}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Coverage Type</p>
                  <p className="font-medium">{membershipData.coverageType || "Individual"}</p>
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
                  <p className="font-medium font-mono text-sm">{membershipData.transactionId}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Monthly Amount</p>
                  <p className="font-medium">${membershipData.totalPrice}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Billing Date</p>
                  <p className="font-medium">{format(membershipData.billingDate, "MMMM d, yyyy")}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Next Billing Date</p>
                  <p className="font-medium">{format(membershipData.nextBillingDate, "MMMM d, yyyy")}</p>
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
                  <a href="tel:210-512-4318" className="text-blue-600 hover:underline">
                    210-512-4318
                  </a>
                </p>
                <p className="flex items-center text-sm">
                  <Globe className="h-4 w-4 text-gray-600 mr-2" />
                  <a href="http://www.mypremierplans.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
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
                className="flex-1 medical-blue-600 hover:medical-blue-700"
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}