import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import Landing from "@/pages/landing";
import Registration from "@/pages/registration";
import Dashboard from "@/pages/dashboard";
import Admin from "@/pages/admin";
import Payment from "@/pages/payment";
import FamilyEnrollment from "@/pages/family-enrollment";
import NotFound from "@/pages/not-found";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <Switch>
      {isLoading || !isAuthenticated ? (
        <>
          <Route path="/" component={Landing} />
          <Route path="/registration" component={Registration} />
          <Route path="/family-enrollment" component={FamilyEnrollment} />
          <Route path="/payment" component={Payment} />
        </>
      ) : (
        <>
          <Route path="/" component={Dashboard} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/registration" component={Registration} />
          <Route path="/family-enrollment" component={FamilyEnrollment} />
          <Route path="/payment" component={Payment} />
          <Route path="/admin" component={Admin} />
        </>
      )}
      <Route component={NotFound} />
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
