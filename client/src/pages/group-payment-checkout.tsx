import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { hasAtLeastRole } from "@/lib/roles";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  groupProfileContext?: {
    profile?: {
      preferredPaymentMethod?: "card" | "ach" | null;
      responsiblePerson?: { email?: string | null; name?: string | null } | null;
      contactPerson?: { email?: string | null; name?: string | null } | null;
      businessAddress?: {
        line1?: string | null;
        line2?: string | null;
        city?: string | null;
        state?: string | null;
        zipCode?: string | null;
      } | null;
      achDetails?: {
        routingNumber?: string | null;
        accountNumber?: string | null;
        bankName?: string | null;
        accountType?: string | null;
      } | null;
      cardDetails?: {
        last4?: string | null;
        expiry?: string | null;
        billingZip?: string | null;
        billingName?: string | null;
      } | null;
    } | null;
  };
};

const parseCurrency = (value: unknown): number => {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const MAX_MONTHS_TO_COLLECT = 24;

const normalizeMonthCount = (value: unknown): number => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return 1;
  }

  const integerValue = Math.trunc(numeric);
  if (integerValue < 1) {
    return 1;
  }

  if (integerValue > MAX_MONTHS_TO_COLLECT) {
    return MAX_MONTHS_TO_COLLECT;
  }

  return integerValue;
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
  const monthsParam = searchParams.get("months") || "1";
  const preferredPaymentMethodParam = (searchParams.get("preferredPaymentMethod") || "").trim().toLowerCase();
  const groupMemberId = Number(groupMemberIdRaw);
  const requestedAmount = Number(amountParam);
  const [monthsToCollect, setMonthsToCollect] = useState<number>(() => normalizeMonthCount(monthsParam));
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);

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
  const groupProfile = groupQuery.data?.groupProfileContext?.profile;
  const preferredPaymentMethod = String(
    groupProfile?.preferredPaymentMethod || preferredPaymentMethodParam || "card",
  ).trim().toLowerCase();
  const resolvedPaymentMethodType = preferredPaymentMethod === "ach" ? "ACH" : "CreditCard";
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
  const groupBusinessAddress = groupProfile?.businessAddress || null;
  const groupAchDetails = groupProfile?.achDetails || null;
  const groupCardDetails = groupProfile?.cardDetails || null;

  const activeMembers = useMemo(
    () => (groupQuery.data?.members || []).filter((item) => item.status !== "terminated"),
    [groupQuery.data?.members],
  );

  useEffect(() => {
    if (!isGroupInvoiceMode) {
      return;
    }

    const activeIds = activeMembers
      .map((memberItem) => memberItem.id)
      .filter((id) => Number.isFinite(id));

    setSelectedMemberIds((previous) => {
      if (!previous.length) {
        return activeIds;
      }

      const next = previous.filter((id) => activeIds.includes(id));
      return next.length ? next : activeIds;
    });
  }, [activeMembers, isGroupInvoiceMode]);

  const selectedMembers = useMemo(() => {
    if (!isGroupInvoiceMode) {
      return [] as GroupMember[];
    }

    const selectedSet = new Set(selectedMemberIds);
    return activeMembers.filter((memberItem) => selectedSet.has(memberItem.id));
  }, [activeMembers, isGroupInvoiceMode, selectedMemberIds]);

  const calculateMemberMonthlyTotal = (memberItem: GroupMember): number => {
    const explicit = parseCurrency(memberItem.totalAmount);
    if (explicit > 0) {
      return explicit;
    }

    const derived = parseCurrency(memberItem.employerAmount) + parseCurrency(memberItem.memberAmount) - parseCurrency(memberItem.discountAmount);
    return derived > 0 ? derived : 0;
  };

  const member = useMemo(
    () => (groupQuery.data?.members || []).find((item) => item.id === groupMemberId) || null,
    [groupMemberId, groupQuery.data?.members],
  );

  const baseAmount = useMemo(() => {
    if (Number.isFinite(requestedAmount) && requestedAmount > 0) {
      return requestedAmount;
    }

    if (isGroupInvoiceMode) {
      const aggregate = selectedMembers.reduce((sum, item) => sum + calculateMemberMonthlyTotal(item), 0);
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
  }, [isGroupInvoiceMode, member, requestedAmount, selectedMembers]);

  const resolvedAmount = useMemo(() => {
    const normalizedMonths = normalizeMonthCount(monthsToCollect);
    const multipliedAmount = baseAmount * normalizedMonths;
    return Number.isFinite(multipliedAmount) && multipliedAmount > 0 ? multipliedAmount : 0;
  }, [baseAmount, monthsToCollect]);

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

    if (isGroupInvoiceMode && selectedMemberIds.length === 0) {
      toast({
        title: "No employees selected",
        description: "Select at least one employee before launching group checkout.",
        variant: "destructive",
      });
      return;
    }

    if (!Number.isInteger(monthsToCollect) || monthsToCollect < 1 || monthsToCollect > MAX_MONTHS_TO_COLLECT) {
      toast({
        title: "Invalid month count",
        description: `Months to collect must be between 1 and ${MAX_MONTHS_TO_COLLECT}.`,
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

  const toggleSelectedMember = (memberId: number) => {
    setSelectedMemberIds((previous) => {
      if (previous.includes(memberId)) {
        return previous.filter((id) => id !== memberId);
      }
      return [...previous, memberId];
    });
  };

  const selectAllMembers = () => {
    setSelectedMemberIds(activeMembers.map((memberItem) => memberItem.id));
  };

  const clearSelectedMembers = () => {
    setSelectedMemberIds([]);
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
                      <p className="font-medium">
                        Group Invoice ({selectedMembers.length}/{activeMembers.length} selected)
                      </p>
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
                <div>
                  <p className="text-gray-500">Billing Months</p>
                  <p className="font-medium">{monthsToCollect}</p>
                </div>
                {monthsToCollect > 1 && (
                  <div>
                    <p className="text-gray-500">Monthly Base</p>
                    <p className="font-medium">${baseAmount.toFixed(2)}</p>
                  </div>
                )}
              </div>

              <div className="max-w-xs space-y-2">
                <Label htmlFor="months-to-collect">Months to Collect</Label>
                <Input
                  id="months-to-collect"
                  type="number"
                  min={1}
                  max={MAX_MONTHS_TO_COLLECT}
                  step={1}
                  value={monthsToCollect}
                  onChange={(event) => {
                    const numeric = Number(event.target.value);
                    if (!Number.isFinite(numeric)) {
                      setMonthsToCollect(1);
                      return;
                    }
                    setMonthsToCollect(normalizeMonthCount(numeric));
                  }}
                />
                <p className="text-xs text-gray-500">
                  Collect up to {MAX_MONTHS_TO_COLLECT} months in a single hosted checkout.
                </p>
              </div>

              {isGroupInvoiceMode && (
                <div className="space-y-3 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-700">Employees Included In This Charge</p>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={selectAllMembers}>Select All</Button>
                      <Button type="button" variant="ghost" size="sm" onClick={clearSelectedMembers}>Clear</Button>
                    </div>
                  </div>
                  <div className="max-h-52 overflow-y-auto space-y-2">
                    {activeMembers.map((memberItem) => {
                      const included = selectedMemberIds.includes(memberItem.id);
                      return (
                        <label key={memberItem.id} className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={included}
                              onCheckedChange={() => toggleSelectedMember(memberItem.id)}
                            />
                            <span>{memberItem.firstName} {memberItem.lastName}</span>
                          </div>
                          <span className="font-medium">${calculateMemberMonthlyTotal(memberItem).toFixed(2)}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {!hasLaunchedPayment ? (
                <div className="flex flex-wrap gap-3">
                  <Button onClick={handleLaunch} disabled={resolvedAmount <= 0}>
                    {resolvedPaymentMethodType === "ACH" ? "Launch ACH Checkout" : "Launch Card Checkout"}
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
                    ? `Group invoice payment for ${groupData?.name || groupId} (${selectedMembers.length} employee${selectedMembers.length === 1 ? "" : "s"}, ${monthsToCollect} month${monthsToCollect === 1 ? "" : "s"})`
                    : `Group payment for ${groupData?.name || groupId} member #${member?.id} (${monthsToCollect} month${monthsToCollect === 1 ? "" : "s"})`}
                  groupId={groupId}
                  groupMemberId={isGroupInvoiceMode ? undefined : member?.id}
                  selectedGroupMemberIds={isGroupInvoiceMode ? selectedMemberIds : undefined}
                  paymentScope={isGroupInvoiceMode ? "group_invoice" : "member"}
                  paymentMethodType={resolvedPaymentMethodType}
                  billingAddress={{
                    streetAddress: isGroupInvoiceMode
                      ? (groupBusinessAddress?.line1 || undefined)
                      : (member?.address1 || undefined),
                    city: isGroupInvoiceMode
                      ? (groupBusinessAddress?.city || undefined)
                      : (member?.city || undefined),
                    state: isGroupInvoiceMode
                      ? (groupBusinessAddress?.state || undefined)
                      : (member?.state || undefined),
                    postalCode: isGroupInvoiceMode
                      ? (groupCardDetails?.billingZip || groupBusinessAddress?.zipCode || undefined)
                      : (member?.zipCode || undefined),
                  }}
                  initialAchDetails={isGroupInvoiceMode ? {
                    routingNumber: groupAchDetails?.routingNumber || undefined,
                    accountNumber: groupAchDetails?.accountNumber || undefined,
                    accountType: groupAchDetails?.accountType || undefined,
                    accountHolderName: invoiceContactName,
                  } : undefined}
                  storedCardProfile={isGroupInvoiceMode ? {
                    last4: groupCardDetails?.last4 || undefined,
                    expiry: groupCardDetails?.expiry || undefined,
                    billingZip: groupCardDetails?.billingZip || groupBusinessAddress?.zipCode || undefined,
                    billingName: groupCardDetails?.billingName || invoiceContactName,
                  } : undefined}
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
