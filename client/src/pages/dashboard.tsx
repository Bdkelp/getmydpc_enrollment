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
  Phone,
  User // Added User icon
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

  const { data: loginSessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ["/api/user/login-sessions"],
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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-medical-blue-50/10">
      {/* Navigation Header */}
      <div className="bg-white/95 backdrop-blur-md shadow-sm border-b border-gray-200/50 sticky top-0 z-40 animate-[fade-in-up_0.3s_ease-out]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Heart className="text-medical-blue-600 h-8 w-8 mr-3 animate-pulse" />
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
      <div className="bg-white/80 backdrop-blur-sm shadow-sm border-b border-gray-200/30">
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
              <span className="inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold bg-gradient-to-r from-green-100 to-green-50 text-green-800 shadow-sm">
                <CheckCircle className="h-4 w-4 mr-2" />
                {user.subscription?.status === "active" ? "Active Member" : "Pending Activation"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Personalized Welcome Message */}
        <Card className="mb-8 bg-gradient-to-r from-medical-blue-500 to-medical-blue-600 text-white border-0 shadow-xl animate-[scale-in_0.5s_ease-out]">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold mb-2 animate-[fade-in-up_0.6s_ease-out]">
                  {getTimeOfDayGreeting()}, {getUserName()}!
                </h2>
                <p className="text-blue-100">
                  Welcome to your healthcare membership dashboard. Your membership gives you unlimited access to quality care.
                </p>
                <div className="mt-4 flex items-center space-x-6">
                  <div>
                    <p className="text-sm text-blue-100 font-medium">Membership Status</p>
                    <p className="text-lg font-semibold flex items-center">
                      <CheckCircle className="h-5 w-5 mr-1" />
                      {user.subscription?.status === "active" ? "Active" : "Pending"}
                    </p>
                  </div>
                  <div className="border-l border-blue-300 pl-6">
                    <p className="text-sm text-blue-100 font-medium">Your Membership</p>
                    <p className="text-lg font-semibold">
                      {user.plan?.name || "MyPremierPlan"}
                    </p>
                  </div>
                  <div className="border-l border-blue-300 pl-6">
                    <p className="text-sm text-blue-100 font-medium">24/7 Support</p>
                    <p className="text-lg font-semibold flex items-center">
                      <Phone className="h-5 w-5 mr-1" />
                      1-800-PREMIER
                    </p>
                  </div>
                </div>
              </div>
              <div className="hidden md:block">
                <Heart className="h-32 w-32 text-white/20 animate-pulse" />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Main Content Area */}
          <div className="lg:col-span-2 space-y-8">

            {/* Quick Actions */}
            <Card className="hover:shadow-xl transition-all duration-300 animate-[fade-in-up_0.7s_ease-out]">
              <CardContent className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {quickActions.map((action, index) => (
                    <button 
                      key={index}
                      className={`flex flex-col items-center p-6 rounded-xl transition-all duration-300 hover:scale-105 ${action.bgColor} group`}
                      style={{ animationDelay: `${index * 100}ms` }}
                    >
                      <action.icon className={`${action.iconColor} h-10 w-10 mb-3 group-hover:scale-110 transition-transform`} />
                      <span className="text-sm font-semibold text-gray-900">{action.label}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card className="hover:shadow-xl transition-all duration-300 animate-[fade-in-up_0.8s_ease-out]">
              <CardContent className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-6">Recent Activity</h2>
                <div className="space-y-4">
                  {recentActivity.map((activity, index) => (
                    <div 
                      key={index} 
                      className="flex items-start space-x-4 p-4 bg-gradient-to-r from-gray-50 to-white rounded-xl hover:shadow-md transition-all duration-300 group"
                      style={{ animationDelay: `${index * 100}ms` }}
                    >
                      <div className="flex-shrink-0">
                        <div className={`w-12 h-12 ${activity.iconBg} rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform`}>
                          <activity.icon className={`${activity.iconColor} h-6 w-6`} />
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-900">{activity.title}</p>
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
            <Card className="hover:shadow-xl transition-all duration-300 animate-[fade-in-up_0.9s_ease-out]">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Current Plan</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">
                        {user.plan?.name || "Individual Plan"}
                      </span>
                      <span className="text-2xl font-bold bg-gradient-to-r from-medical-blue-600 to-medical-blue-500 bg-clip-text text-transparent">
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
                      <div className="flex items-center group/item hover:translate-x-1 transition-transform">
                        <CheckCircle className="text-green-500 h-4 w-4 mr-2 group-hover/item:scale-110 transition-transform" />
                        Unlimited office visits
                      </div>
                      <div className="flex items-center group/item hover:translate-x-1 transition-transform">
                        <CheckCircle className="text-green-500 h-4 w-4 mr-2 group-hover/item:scale-110 transition-transform" />
                        24/7 text & phone access
                      </div>
                      <div className="flex items-center group/item hover:translate-x-1 transition-transform">
                        <CheckCircle className="text-green-500 h-4 w-4 mr-2 group-hover/item:scale-110 transition-transform" />
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
            <Card className="hover:shadow-xl transition-all duration-300 animate-[fade-in-up_1s_ease-out]">
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
                    <Button className="w-full bg-gradient-to-r from-medical-blue-600 to-medical-blue-500 hover:from-medical-blue-700 hover:to-medical-blue-600 text-white shadow-md hover:shadow-lg">
                      <MessageCircle className="h-4 w-4 mr-2" />
                      Send Message
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Login Sessions */}
            <Card className="hover:shadow-xl transition-all duration-300 animate-[fade-in-up_1.1s_ease-out]">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <User className="h-5 w-5 mr-2 text-medical-blue-600" />
                  Recent Logins
                </h3>
                <div className="space-y-3">
                  {sessionsLoading ? (
                    <div className="text-center py-4 text-gray-500">Loading sessions...</div>
                  ) : loginSessions && loginSessions.length > 0 ? (
                    loginSessions.slice(0, 5).map((session: any, index: number) => (
                      <div key={session.id} className="flex justify-between items-center text-sm">
                        <div>
                          <div className="font-medium text-gray-900">
                            {session.device_type} • {session.browser}
                          </div>
                          <div className="text-gray-500">
                            {new Date(session.login_time).toLocaleDateString()} at{' '}
                            {new Date(session.login_time).toLocaleTimeString()}
                          </div>
                        </div>
                        <div className={`w-2 h-2 rounded-full ${
                          session.is_active ? 'bg-green-500' : 'bg-gray-300'
                        }`} />
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-gray-500">No recent logins</div>
                  )}

                  <div className="border-t border-gray-200 pt-4">
                    <Button variant="ghost" className="w-full text-medical-blue-600 hover:text-medical-blue-700">
                      View All Sessions
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Health Metrics */}
            <Card className="hover:shadow-xl transition-all duration-300 animate-[fade-in-up_1.2s_ease-out]">
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