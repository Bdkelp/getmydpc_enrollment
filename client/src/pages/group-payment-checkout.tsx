import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { hasAtLeastRole } from "@/lib/roles";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import EPXHostedPayment from "@/components/EPXHostedPayment";
import { CreditCard, AlertTriangle, ArrowLeft } from "lucide-react";

type GroupMember = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  address1?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  employerAmount?: string | null;
  memberAmount?: string | null;
  discountAmount?: string | null;
  totalAmount?: string | null;
  status?: string | null;
};

type GroupDetailResponse = {
  data?: {
    id: string;
    name?: string;
  };
  members?: GroupMember[];
};

const parseCurrency = (value: unknown): number => {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

export default function GroupPaymentCheckoutPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const isAgentOrAbove = hasAtLeastRole(user?.role, "agent");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [hasLaunchedPayment, setHasLaunchedPayment] = useState(false);

  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);

  const groupId = (searchParams.get("groupId") || "").trim();
  const mode = (searchParams.get("mode") || "member").trim().toLowerCase();
  const isGroupInvoiceMode = mode === "group_invoice";
  const groupMemberIdRaw = searchParams.get("groupMemberId") || "";
  const amountParam = searchParams.get("amount") || "";
  const groupMemberId = Number(groupMemberIdRaw);
  const requestedAmount = Number(amountParam);

  const validationError = (() => {
    if (!groupId) {
      return "Group ID is required.";
    }
    if (!isGroupInvoiceMode && (!Number.isFinite(groupMemberId) || groupMemberId <= 0)) {
      return "Group member ID must be a positive number.";
    }
    return null;
  })();

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        setLocation("/login");
      } else if (!isAgentOrAbove) {
        setLocation("/no-access");
      }
    }
  }, [isAuthenticated, isLoading, isAgentOrAbove, setLocation]);

  const groupQuery = useQuery<GroupDetailResponse, Error>({
    queryKey: ["/api/groups", groupId, "payment-checkout"],
    enabled: isAuthenticated && isAgentOrAbove && !validationError,
    queryFn: async () => {
      return apiRequest(`/api/groups/${groupId}`) as Promise<GroupDetailResponse>;
    },
    retry: false,
  });

  const groupData = groupQuery.data?.data;
  const groupProfile = (groupData as any)?.groupProfileContext?.profile;
  const invoiceContactEmail = String(
    groupProfile?.responsiblePerson?.email
    || groupProfile?.contactPerson?.email
    || user?.email
    || "",
  ).trim();
  const invoiceContactName = String(
    groupProfile?.responsiblePerson?.name
    || groupProfile?.contactPerson?.name
    || groupData?.name
    || user?.email
    || "Group Billing Contact",
  ).trim();

  const activeMembers = useMemo(
    () => (groupQuery.data?.members || []).filter((item) => item.status !== "terminated"),
    [groupQuery.data?.members],
  );

  const member = useMemo(
    () => (groupQuery.data?.members || []).find((item) => item.id === groupMemberId) || null,
    [groupMemberId, groupQuery.data?.members],
  );

  const resolvedAmount = useMemo(() => {
    if (Number.isFinite(requestedAmount) && requestedAmount > 0) {
      return requestedAmount;
    }

    if (isGroupInvoiceMode) {
      const aggregate = activeMembers.reduce((sum, item) => {
        const explicit = parseCurrency(item.totalAmount);
        if (explicit > 0) {
          return sum + explicit;
        }
        const derived = parseCurrency(item.employerAmount) + parseCurrency(item.memberAmount) - parseCurrency(item.discountAmount);
        return sum + (derived > 0 ? derived : 0);
      }, 0);
      return aggregate > 0 ? aggregate : 0;
    }

    if (!member) {
      return 0;
    }

    const explicit = parseCurrency(member.totalAmount);
    if (explicit > 0) {
      return explicit;
    }

    const derived = parseCurrency(member.employerAmount) + parseCurrency(member.memberAmount) - parseCurrency(member.discountAmount);
    return derived > 0 ? derived : 0;
  }, [activeMembers, isGroupInvoiceMode, member, requestedAmount]);

  const handleLaunch = () => {
    if (!isGroupInvoiceMode && !member) {
      toast({
        title: "Member not loaded",
        description: "Wait for member details before launching hosted checkout.",
        variant: "destructive",
      });
      return;
    }

    if (isGroupInvoiceMode && !invoiceContactEmail) {
      toast({
        title: "Group contact missing",
        description: "Set a responsible or contact email in Group Profile before collecting group payment.",
        variant: "destructive",
      });
      return;
    }

    if (resolvedAmount <= 0) {
      toast({
        title: "Amount missing",
        description: "Set a valid member total before running hosted payment.",
        variant: "destructive",
      });
      return;
    }

    setHasLaunchedPayment(true);
  };

  const handleBack = () => {
    if (hasAtLeastRole(user?.role, "admin")) {
      setLocation("/admin/groups");
      return;
    }
    setLocation("/agent/groups");
  };

  if (isLoading || (isAuthenticated && isAgentOrAbove && groupQuery.isLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isAuthenticated || !isAgentOrAbove) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-medical-blue-600 uppercase tracking-wide">Group Hosted Checkout</p>
            <h1 className="text-3xl font-bold text-gray-900 mt-1">Collect Payment For Group Member</h1>
          </div>
          <Button variant="outline" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Group Enrollment
          </Button>
        </div>

        {validationError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Invalid checkout request</AlertTitle>
            <AlertDescription>{validationError}</AlertDescription>
          </Alert>
        )}

        {!validationError && groupQuery.isError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Unable to load group details</AlertTitle>
            <AlertDescription>{groupQuery.error?.message || "Failed to load group for payment checkout."}</AlertDescription>
          </Alert>
        )}

        {!validationError && !groupQuery.isError && !isGroupInvoiceMode && !member && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Group member not found</AlertTitle>
            <AlertDescription>Verify the checkout request and reopen from Group Enrollment.</AlertDescription>
          </Alert>
        )}

        {!validationError && !groupQuery.isError && (isGroupInvoiceMode || member) && (
          <Card>
            <CardContent className="pt-6 space-y-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 uppercase tracking-wide">
                <CreditCard className="h-4 w-4 text-medical-blue-600" /> Payment Session
              </div>

              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-gray-500">Group</p>
                  <p className="font-medium">{groupData?.name || groupId}</p>
                </div>
                {isGroupInvoiceMode ? (
                  <>
                    <div>
                      <p className="text-gray-500">Scope</p>
                      <p className="font-medium">Group Invoice ({activeMembers.length} active members)</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Billing Contact</p>
                      <p className="font-medium">{invoiceContactEmail || "Not configured"}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="text-gray-500">Member</p>
                      <p className="font-medium">{member?.firstName} {member?.lastName}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Email</p>
                      <p className="font-medium">{member?.email}</p>
                    </div>
                  </>
                )}
                <div>
                  <p className="text-gray-500">Amount</p>
                  <p className="font-medium">${resolvedAmount.toFixed(2)}</p>
                </div>
              </div>

              {!hasLaunchedPayment ? (
                <div className="flex flex-wrap gap-3">
                  <Button onClick={handleLaunch} disabled={resolvedAmount <= 0}>
                    Launch Hosted Checkout
                  </Button>
                  <Button variant="ghost" onClick={handleBack}>Cancel</Button>
                </div>
              ) : (
                <EPXHostedPayment
                  amount={resolvedAmount}
                  customerId={user?.id || ""}
                  customerEmail={isGroupInvoiceMode ? invoiceContactEmail : (member?.email || user?.email || "")}
                  customerName={isGroupInvoiceMode
                    ? invoiceContactName
                    : (`${member?.firstName || ""} ${member?.lastName || ""}`.trim() || member?.email || invoiceContactName)}
                  description={isGroupInvoiceMode
                    ? `Group invoice payment for ${groupData?.name || groupId}`
                    : `Group payment for ${groupData?.name || groupId} member #${member?.id}`}
                  groupId={isGroupInvoiceMode ? undefined : groupId}
                  groupMemberId={isGroupInvoiceMode ? undefined : member?.id}
                  billingAddress={{
                    streetAddress: isGroupInvoiceMode ? undefined : (member?.address1 || undefined),
                    city: isGroupInvoiceMode ? undefined : (member?.city || undefined),
                    state: isGroupInvoiceMode ? undefined : (member?.state || undefined),
                    postalCode: isGroupInvoiceMode ? undefined : (member?.zipCode || undefined),
                  }}
                  redirectOnSuccess={false}
                  onSuccess={(transactionId) => {
                    toast({
                      title: "Payment submitted",
                      description: transactionId
                        ? `Hosted checkout accepted transaction ${transactionId}.`
                        : "Hosted checkout accepted payment.",
                    });
                    setHasLaunchedPayment(false);
                  }}
                  onError={(message) => {
                    toast({
                      title: "Hosted checkout error",
                      description: message || "See logs for additional details.",
                      variant: "destructive",
                    });
                  }}
                />
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
