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
import NoAccess from "@/pages/no-access";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Register from "@/pages/register";
import AuthCallback from "@/pages/auth-callback";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";

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
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/auth/callback" component={AuthCallback} />
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
            <Route path="/no-access" component={NoAccess} />
          )}
          
          {/* Fallback no-access route for all authenticated users */}
          <Route path="/no-access" component={NoAccess} />
          
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
