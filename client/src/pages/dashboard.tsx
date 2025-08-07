import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { isUnauthorizedError } from "@/lib/authUtils";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { 
  Calendar, 
  MessageCircle, 
  Pill, 
  Heart, 
  CreditCard, 
  FileText,
  CheckCircle,
  Phone
} from "lucide-react";

export default function Dashboard() {
  const { toast } = useToast();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  
  // Get current time of day for personalized greeting
  const getTimeOfDayGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };
  
  // Get user's first name for personalized greeting
  const getUserName = () => {
    if (user?.firstName) return user.firstName;
    if (user?.name) return user.name.split(' ')[0];
    if (user?.email) return user.email.split('@')[0];
    return "Member";
  };

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
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
  }, [isAuthenticated, authLoading, toast]);

  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ["/api/user/payments"],
    enabled: isAuthenticated,
    retry: false,
  });

  const { data: familyMembers, isLoading: familyLoading } = useQuery({
    queryKey: ["/api/user/family-members"],
    enabled: isAuthenticated,
    retry: false,
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null; // Will redirect to login
  }

  const quickActions = [
    {
      icon: Calendar,
      label: "Book Appointment",
      bgColor: "bg-blue-50 hover:bg-blue-100",
      iconColor: "text-blue-600",
    },
    {
      icon: MessageCircle,
      label: "Message Doctor",
      bgColor: "bg-green-50 hover:bg-green-100",
      iconColor: "text-green-600",
    },
    {
      icon: Pill,
      label: "View Prescriptions",
      bgColor: "bg-orange-50 hover:bg-orange-100",
      iconColor: "text-orange-600",
    },
  ];

  const recentActivity = [
    {
      icon: Calendar,
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
      title: "Appointment scheduled",
      description: "Annual wellness check - March 15, 2024 at 10:00 AM",
      time: "2 days ago",
    },
    {
      icon: FileText,
      iconBg: "bg-green-100",
      iconColor: "text-green-600",
      title: "Lab results available",
      description: "Complete blood panel results are ready for review",
      time: "1 week ago",
    },
    {
      icon: CreditCard,
      iconBg: "bg-orange-100",
      iconColor: "text-orange-600",
      title: "Payment processed",
      description: `Monthly membership fee - $${user.plan?.price || "79.00"}`,
      time: "2 weeks ago",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Heart className="text-medical-blue-600 h-8 w-8 mr-3" />
              <span className="text-xl font-bold text-gray-900">MyPremierPlans</span>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="ghost" onClick={async () => {
                const { signOut } = await import("@/lib/supabase");
                await signOut();
                window.location.href = "/";
              }}>
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Dashboard Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Welcome back, {user.firstName || "Member"}
              </h1>
              <p className="text-gray-600 mt-1">
                Manage your healthcare membership and stay connected with your care team
              </p>
            </div>
            <div className="mt-4 sm:mt-0">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                <CheckCircle className="h-4 w-4 mr-2" />
                {user.subscription?.status === "active" ? "Active Member" : "Pending Activation"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Personalized Welcome Message */}
        <Card className="mb-8 bg-gradient-to-r from-medical-blue-500 to-medical-blue-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold mb-1">
                  {getTimeOfDayGreeting()}, {getUserName()}! 🏥
                </h2>
                <p className="text-blue-100">
                  Welcome to your healthcare membership dashboard. Your membership gives you unlimited access to quality care.
                </p>
                <div className="mt-4 flex items-center space-x-6">
                  <div>
                    <p className="text-sm text-blue-200">Membership Status</p>
                    <p className="text-lg font-semibold flex items-center">
                      <CheckCircle className="h-5 w-5 mr-1" />
                      {user.subscription?.status === "active" ? "Active" : "Pending"}
                    </p>
                  </div>
                  <div className="border-l border-blue-300 pl-6">
                    <p className="text-sm text-blue-200">Your Membership</p>
                    <p className="text-lg font-semibold">
                      {user.plan?.name || "MyPremierPlan"}
                    </p>
                  </div>
                  <div className="border-l border-blue-300 pl-6">
                    <p className="text-sm text-blue-200">24/7 Support</p>
                    <p className="text-lg font-semibold flex items-center">
                      <Phone className="h-5 w-5 mr-1" />
                      1-800-PREMIER
                    </p>
                  </div>
                </div>
              </div>
              <div className="hidden md:block">
                <Heart className="h-24 w-24 text-blue-200 opacity-50" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Content Area */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Quick Actions */}
            <Card>
              <CardContent className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {quickActions.map((action, index) => (
                    <button 
                      key={index}
                      className={`flex flex-col items-center p-4 rounded-lg transition-colors ${action.bgColor}`}
                    >
                      <action.icon className={`${action.iconColor} h-8 w-8 mb-2`} />
                      <span className="text-sm font-medium text-gray-900">{action.label}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardContent className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-6">Recent Activity</h2>
                <div className="space-y-4">
                  {recentActivity.map((activity, index) => (
                    <div key={index} className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg">
                      <div className="flex-shrink-0">
                        <div className={`w-10 h-10 ${activity.iconBg} rounded-full flex items-center justify-center`}>
                          <activity.icon className={`${activity.iconColor} h-5 w-5`} />
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{activity.title}</p>
                        <p className="text-sm text-gray-600">{activity.description}</p>
                        <p className="text-xs text-gray-500 mt-1">{activity.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            
            {/* Current Plan */}
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Current Plan</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">
                        {user.plan?.name || "Individual Plan"}
                      </span>
                      <span className="text-lg font-bold text-medical-blue-600">
                        ${user.plan?.price || "79"}/mo
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      Next billing: {user.subscription?.nextBillingDate 
                        ? new Date(user.subscription.nextBillingDate).toLocaleDateString()
                        : "March 1, 2024"
                      }
                    </div>
                  </div>
                  
                  <div className="border-t border-gray-200 pt-4">
                    <div className="space-y-2 text-sm text-gray-600">
                      <div className="flex items-center">
                        <CheckCircle className="text-green-500 h-4 w-4 mr-2" />
                        Unlimited office visits
                      </div>
                      <div className="flex items-center">
                        <CheckCircle className="text-green-500 h-4 w-4 mr-2" />
                        24/7 text & phone access
                      </div>
                      <div className="flex items-center">
                        <CheckCircle className="text-green-500 h-4 w-4 mr-2" />
                        Basic lab work included
                      </div>
                    </div>
                  </div>
                  
                  <div className="border-t border-gray-200 pt-4 space-y-2">
                    <Button variant="ghost" className="w-full text-medical-blue-600 hover:text-medical-blue-700">
                      Upgrade Plan
                    </Button>
                    <Button variant="ghost" className="w-full text-gray-500 hover:text-gray-700">
                      Manage Billing
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Care Team */}
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Care Team</h3>
                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <img 
                      src="https://images.unsplash.com/photo-1582750433449-648ed127bb54?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&h=100" 
                      alt="Dr. Sarah Johnson - Primary Care Physician" 
                      className="w-12 h-12 rounded-full object-cover"
                    />
                    <div>
                      <div className="font-medium text-gray-900">Dr. Sarah Johnson</div>
                      <div className="text-sm text-gray-600">Primary Care Physician</div>
                    </div>
                  </div>
                  
                  <div className="border-t border-gray-200 pt-4">
                    <Button className="w-full medical-blue-600 hover:medical-blue-700 text-white">
                      <MessageCircle className="h-4 w-4 mr-2" />
                      Send Message
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Health Metrics */}
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Health Snapshot</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Blood Pressure</span>
                    <span className="text-sm font-medium text-green-600">120/80</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Cholesterol</span>
                    <span className="text-sm font-medium text-green-600">Normal</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Last Visit</span>
                    <span className="text-sm font-medium text-gray-900">Feb 1, 2024</span>
                  </div>
                  
                  <div className="border-t border-gray-200 pt-4">
                    <Button variant="ghost" className="w-full text-medical-blue-600 hover:text-medical-blue-700">
                      View Full Health Record
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
