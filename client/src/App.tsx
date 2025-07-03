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
import Payment from "@/pages/payment";
import FamilyEnrollment from "@/pages/family-enrollment";
import NotFound from "@/pages/not-found";

function Router() {
  const { isAuthenticated, isLoading, user } = useAuth();

  // Role-based routing
  const getDefaultRoute = () => {
    if (!isAuthenticated) return "/";
    if (user?.role === "admin") return "/admin";
    if (user?.role === "agent") return "/agent";
    return "/no-access"; // Regular users don't get dashboard access
  };

  return (
    <Switch>
      {isLoading ? (
        <Route path="*" component={() => <div className="min-h-screen flex items-center justify-center">Loading...</div>} />
      ) : !isAuthenticated ? (
        <>
          <Route path="/" component={Landing} />
          <Route path="*" component={() => <Redirect to="/" />} />
        </>
      ) : (
        <>
          {/* Redirect root to role-based dashboard */}
          <Route path="/" component={() => <Redirect to={getDefaultRoute()} />} />
          
          {/* Agent routes */}
          {user?.role === "agent" && (
            <>
              <Route path="/agent" component={AgentDashboard} />
              <Route path="/registration" component={Registration} />
              <Route path="/family-enrollment" component={FamilyEnrollment} />
              <Route path="/payment" component={Payment} />
            </>
          )}
          
          {/* Admin routes */}
          {user?.role === "admin" && (
            <>
              <Route path="/admin" component={Admin} />
              <Route path="/agent" component={AgentDashboard} />
              <Route path="/registration" component={Registration} />
              <Route path="/family-enrollment" component={FamilyEnrollment} />
              <Route path="/payment" component={Payment} />
            </>
          )}
          
          {/* Regular user (no dashboard access) */}
          {user?.role === "user" && (
            <Route path="/no-access" component={() => (
              <div className="min-h-screen flex items-center justify-center">
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
