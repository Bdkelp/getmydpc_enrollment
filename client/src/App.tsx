import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { SessionManager } from "@/components/SessionManager";
import Landing from "@/pages/landing";
import Registration from "@/pages/registration";
import Dashboard from "@/pages/dashboard";
import Admin from "@/pages/admin";
import AgentDashboard from "@/pages/agent-dashboard";
import AgentLeads from "@/pages/agent-leads";
import AgentCommissions from "@/pages/agent-commissions";
import AdminLeads from "@/pages/admin-leads";
import AdminEnrollments from "@/pages/admin-enrollments";
import AdminUsers from "@/pages/admin-users";
import AdminDataViewer from "@/pages/admin-data-viewer";
import AdminAnalytics from "@/pages/admin-analytics";
import EnrollmentDetails from "@/pages/enrollment-details";
import Payment from "@/pages/payment";
import PaymentSuccess from "@/pages/payment-success";
import PaymentFailed from "@/pages/payment-failed";
import PaymentCancel from "@/pages/payment-cancel";
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
import PendingApproval from "@/pages/pending-approval";
import TestAuth from "@/pages/test-auth";
import Profile from "@/pages/profile"; // Assuming Profile component exists
import { lazy } from "react";
import ErrorBoundary from "@/components/ErrorBoundary"; // Assuming ErrorBoundary component exists

function Router() {
  const { isAuthenticated, isLoading, user } = useAuth();

  console.log('Router state:', { isAuthenticated, isLoading, user });

  // Show loading only if actually loading
  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <Switch>
      {/* Public routes - always accessible */}
      <Route path="/" component={Landing} />
      <Route path="/quiz" component={Quiz} />
      <Route path="/payment/success" component={PaymentSuccess} />
      <Route path="/payment/failed" component={PaymentFailed} />
      <Route path="/payment/cancel" component={PaymentCancel} />
      <Route path="/payment/error" component={PaymentFailed} />
      <Route path="/login" component={isAuthenticated ? () => <Redirect to={user?.role === "admin" ? "/admin" : user?.role === "agent" ? "/agent" : "/no-access"} /> : Login} />
      <Route path="/register" component={isAuthenticated ? () => <Redirect to={user?.role === "admin" ? "/admin" : user?.role === "agent" ? "/agent" : "/no-access"} /> : Register} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/pending-approval" component={PendingApproval} />
      <Route path="/auth/callback" component={AuthCallback} />
      <Route path="/test-auth" component={TestAuth} />

      {/* Protected routes - require authentication */}
      {isAuthenticated && (
        <>
          {/* Admin routes */}
          {user?.role === "admin" && (
            <>
              <Route path="/admin" component={Admin} />
              <Route path="/admin/leads" component={AdminLeads} />
              <Route path="/admin/enrollments" component={AdminEnrollments} />
              <Route path="/admin/users" component={AdminUsers} />
              <Route path="/admin/data" component={AdminDataViewer} />
              <Route path="/admin/analytics" component={AdminAnalytics} />
              <Route path="/admin/enrollment/:id" component={EnrollmentDetails} />
              <Route path="/agent" component={AgentDashboard} />
              <Route path="/agent/leads" component={AgentLeads} />
              <Route path="/agent/commissions" component={AgentCommissions} />
              <Route path="/registration" component={Registration} />
              <Route path="/payment" component={Payment} />
              <Route path="/payment/:planId/:userId" component={Payment} />
              <Route path="/family-enrollment/:userId" component={FamilyEnrollment} />
              <Route path="/confirmation" component={Confirmation} />
              <Route path="/confirmation/:userId" component={Confirmation} />
            </>
          )}

          {/* Agent routes */}
          {user?.role === "agent" && (
            <>
              <Route path="/agent" component={AgentDashboard} />
              <Route path="/agent/leads" component={AgentLeads} />
              <Route path="/agent/commissions" component={AgentCommissions} />
              <Route path="/registration" component={Registration} />
              <Route path="/payment" component={Payment} />
              <Route path="/payment/:planId/:userId" component={Payment} />
              <Route path="/family-enrollment/:userId" component={FamilyEnrollment} />
              <Route path="/confirmation" component={Confirmation} />
              <Route path="/confirmation/:userId" component={Confirmation} />
            </>
          )}

          {/* No access route - available to all authenticated users */}
          <Route path="/no-access" component={NoAccess} />
        </>
      )}

      {/* Registration requires authentication for agents/admins */}
      <Route path="/registration" component={isAuthenticated && (user?.role === "agent" || user?.role === "admin") ? Registration : () => <Redirect to="/login" />} />

      {/* 404 for all unmatched routes */}
      <Route path="*" component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SessionManager>
          <Router />
        </SessionManager>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}