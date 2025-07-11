import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import Landing from "@/pages/landing";
import Registration from "@/pages/registration";
import Dashboard from "@/pages/dashboard";
import Admin from "@/pages/admin";
import AgentDashboard from "@/pages/agent-dashboard";
import AgentLeads from "@/pages/agent-leads";
import Payment from "@/pages/payment";
import FamilyEnrollment from "@/pages/family-enrollment";
import Confirmation from "@/pages/confirmation";
import Quiz from "@/pages/quiz";
import NotFound from "@/pages/not-found";

function Router() {
  const { isAuthenticated, isLoading, user } = useAuth();

  console.log('Router state:', { isAuthenticated, isLoading, user });

  // Role-based routing
  const getDefaultRoute = () => {
    if (!isAuthenticated) return "/";
    if (user?.role === "admin") return "/admin";
    if (user?.role === "agent") return "/agent";
    return "/no-access"; // Regular users don't get dashboard access
  };

  // Show landing page if not loading and not authenticated
  if (!isLoading && !isAuthenticated) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/quiz" component={Quiz} />
        <Route path="/registration" component={Registration} />
        <Route path="*" component={() => <Redirect to="/" />} />
      </Switch>
    );
  }

  // Show loading only if actually loading
  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <Switch>
      {isAuthenticated && (
        <>
          {/* Redirect root to role-based dashboard */}
          <Route path="/" component={() => <Redirect to={getDefaultRoute()} />} />
          
          {/* Agent routes */}
          {user?.role === "agent" && (
            <>
              <Route path="/agent" component={AgentDashboard} />
              <Route path="/agent/leads" component={AgentLeads} />
              <Route path="/quiz" component={Quiz} />
              <Route path="/registration" component={Registration} />
              <Route path="/family-enrollment" component={FamilyEnrollment} />
              <Route path="/payment" component={Payment} />
              <Route path="/confirmation" component={Confirmation} />
            </>
          )}
          
          {/* Admin routes */}
          {user?.role === "admin" && (
            <>
              <Route path="/admin" component={Admin} />
              <Route path="/agent" component={AgentDashboard} />
              <Route path="/agent/leads" component={AgentLeads} />
              <Route path="/quiz" component={Quiz} />
              <Route path="/registration" component={Registration} />
              <Route path="/family-enrollment" component={FamilyEnrollment} />
              <Route path="/payment" component={Payment} />
              <Route path="/confirmation" component={Confirmation} />
            </>
          )}
          
          {/* Regular user (no dashboard access) */}
          {user?.role === "user" && (
            <Route path="/no-access" component={() => (
              <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                  <h1 className="text-2xl font-bold mb-4">No Dashboard Access</h1>
                  <p className="text-gray-600 mb-4">Please contact your agent or call customer service for assistance.</p>
                  <p className="text-lg font-semibold mb-6">210-512-4318</p>
                  <a 
                    href="/api/logout" 
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-medical-600 hover:bg-medical-700"
                  >
                    Log Out
                  </a>
                </div>
              </div>
            )} />
          )}
          
          {/* Fallback no-access route for all authenticated users */}
          <Route path="/no-access" component={() => (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
              <div className="text-center">
                <h1 className="text-2xl font-bold mb-4">No Dashboard Access</h1>
                <p className="text-gray-600 mb-4">Please contact your agent or call customer service for assistance.</p>
                <p className="text-lg font-semibold mb-6">210-512-4318</p>
                <a 
                  href="/api/logout" 
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-medical-600 hover:bg-medical-700"
                >
                  Log Out
                </a>
              </div>
            </div>
          )} />
          
          <Route component={NotFound} />
        </>
      )}
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
