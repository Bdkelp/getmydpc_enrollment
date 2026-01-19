import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { hasAtLeastRole } from "@/lib/roles";
import { apiRequest } from "@/lib/queryClient";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertTriangle,
  Plus,
  Users,
  Layers,
  CheckCircle2,
  ArrowLeft,
  UserPlus,
  Pencil,
  Trash2,
  ClipboardCheck,
} from "lucide-react";

const payorOptions = [
  { value: "full", label: "Employer Pays All" },
  { value: "member", label: "Member Pays All" },
];

const tierOptions = [
  { value: "member", label: "Member Only" },
  { value: "spouse", label: "Member + Spouse" },
  { value: "child", label: "Member + Child(ren)" },
  { value: "family", label: "Member + Family" },
];

const statusOptions = [
  { value: "draft", label: "Draft" },
  { value: "ready", label: "Ready" },
  { value: "registered", label: "Registered" },
];

const tierLabels: Record<string, string> = {
  member: "Member Only",
  spouse: "Member + Spouse",
  child: "Member + Child(ren)",
  family: "Member + Family",
};

type GroupRecord = {
  id: string;
  name: string;
  groupType?: string | null;
  payorType: string;
  discountCode?: string | null;
  status: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  hostedCheckoutLink?: string | null;
  hostedCheckoutStatus?: string | null;
  registrationCompletedAt?: string | null;
  metadata?: Record<string, any> | null;
};

type GroupDetailResponse = {
  data: GroupRecord;
  members?: GroupMemberRecord[];
};

type GroupMemberRecord = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  tier: string;
  status?: string | null;
  paymentStatus?: string | null;
  registeredAt?: string | null;
  payorType?: string | null;
  employerAmount?: string | null;
  memberAmount?: string | null;
  discountAmount?: string | null;
  totalAmount?: string | null;
};

type MemberFormState = {
  id?: number;
  firstName: string;
  lastName: string;
  email: string;
  tier: string;
  payorType: string;
  status: string;
};

type DiscountValidationState = {
  code: string;
  isValid: boolean;
  message?: string;
  discountType?: string;
  durationType?: string;
};

export default function GroupEnrollment() {
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const isAuthorized = hasAtLeastRole(user?.role, "agent");
  const canAccessAdminViews = hasAtLeastRole(user?.role, "admin");
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<GroupDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [newGroupForm, setNewGroupForm] = useState({
    name: "",
    groupType: "",
    payorType: "full",
    discountCode: "",
  });
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<GroupMemberRecord | null>(null);
  const defaultMemberForm: MemberFormState = {
    firstName: "",
    lastName: "",
    email: "",
    tier: "member",
    payorType: "full",
    status: "draft",
  };
  const [memberForm, setMemberForm] = useState<MemberFormState>(defaultMemberForm);
  const [discountValidation, setDiscountValidation] = useState<DiscountValidationState | null>(null);
  const [isValidatingDiscount, setIsValidatingDiscount] = useState(false);

  const resetMemberForm = (overrides?: Partial<MemberFormState>) => {
    setMemberForm({
      ...defaultMemberForm,
      payorType: selectedGroup?.data?.payorType ?? "full",
      ...overrides,
    });
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/groups"],
    queryFn: async () => apiRequest("/api/groups"),
    enabled: !authLoading && isAuthorized,
  });

  const groups: GroupRecord[] = useMemo(() => data?.data ?? [], [data]);

  useEffect(() => {
    if (!isAuthorized && !authLoading) {
      toast({
        title: "Insufficient access",
        description: "Group enrollment is limited to agents and admins.",
        variant: "destructive",
      });
    }
  }, [isAuthorized, authLoading, toast]);

  const createGroupMutation = useMutation({
    mutationFn: async () => {
      const normalizedDiscount = newGroupForm.discountCode.trim().toUpperCase();
      const discountCode = normalizedDiscount || undefined;
      if (discountCode) {
        const lastValidationMatches =
          discountValidation &&
          discountValidation.isValid &&
          discountValidation.code === normalizedDiscount;
        if (!lastValidationMatches) {
          throw new Error("Validate the discount code before saving");
        }
      }

      const payload = {
        name: newGroupForm.name.trim(),
        groupType: newGroupForm.groupType.trim() || undefined,
        payorType: newGroupForm.payorType,
        discountCode,
      };
      return apiRequest("/api/groups", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      toast({
        title: "Group created",
        description: "Group record saved. You can start adding members now.",
      });
      setNewGroupOpen(false);
      setNewGroupForm({ name: "", groupType: "", payorType: "full", discountCode: "" });
      setDiscountValidation(null);
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
    },
    onError: (err: any) => {
      toast({
        title: "Unable to create group",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const fetchGroupDetail = async (groupId: string) => {
    const response = await apiRequest(`/api/groups/${groupId}`);
    setSelectedGroup(response as GroupDetailResponse);
    return response as GroupDetailResponse;
  };

  const refreshGroups = () => queryClient.invalidateQueries({ queryKey: ["/api/groups"] });

  const upsertMemberMutation = useMutation({
    mutationFn: async () => {
      const groupId = selectedGroup?.data?.id;
      if (!groupId) throw new Error("Select a group first");

      const payload = {
        firstName: memberForm.firstName.trim(),
        lastName: memberForm.lastName.trim(),
        email: memberForm.email.trim().toLowerCase(),
        tier: memberForm.tier,
        payorType: memberForm.payorType,
        status: memberForm.status,
      };

      if (editingMember) {
        return apiRequest(`/api/groups/${groupId}/members/${editingMember.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }

      return apiRequest(`/api/groups/${groupId}/members`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      if (selectedGroup?.data?.id) {
        await fetchGroupDetail(selectedGroup.data.id);
      }
      refreshGroups();
      setMemberDialogOpen(false);
      setEditingMember(null);
      resetMemberForm();
      toast({
        title: "Member saved",
        description: "The member record was updated.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Unable to save member",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const deleteMemberMutation = useMutation({
    mutationFn: async (member: GroupMemberRecord) => {
      if (!selectedGroup?.data?.id) throw new Error("Select a group first");
      return apiRequest(`/api/groups/${selectedGroup.data.id}/members/${member.id}`, {
        method: "DELETE",
      });
    },
    onSuccess: async () => {
      if (selectedGroup?.data?.id) {
        await fetchGroupDetail(selectedGroup.data.id);
      }
      refreshGroups();
      toast({
        title: "Member removed",
        description: "The member was removed from this group.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Unable to remove member",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const completeGroupMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGroup?.data?.id) throw new Error("Select a group first");
      return apiRequest(`/api/groups/${selectedGroup.data.id}/complete`, {
        method: "POST",
        body: JSON.stringify({ status: "registered" }),
      });
    },
    onSuccess: async () => {
      if (selectedGroup?.data?.id) {
        await fetchGroupDetail(selectedGroup.data.id);
      }
      refreshGroups();
      toast({
        title: "Marked ready",
        description: "Group registration marked ready for hosted checkout.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Unable to mark ready",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

    const handleValidateDiscount = async () => {
      const normalized = newGroupForm.discountCode.trim().toUpperCase();
      if (!normalized) {
        toast({
          title: "Enter a discount code",
          description: "Add a code before running validation.",
        });
        return;
      }

      setIsValidatingDiscount(true);
      try {
        const result = await apiRequest(`/api/discount-codes/validate?code=${encodeURIComponent(normalized)}`);
        const isValid = Boolean(result?.isValid);
        setDiscountValidation({
          code: normalized,
          isValid,
          message: result?.message,
          discountType: result?.discountType,
          durationType: result?.durationType,
        });
        toast({
          title: isValid ? "Discount applied" : "Discount not valid",
          description: result?.message || (isValid ? `Code ${normalized} is active.` : `Code ${normalized} cannot be used.`),
          variant: isValid ? undefined : "destructive",
        });
      } catch (err: any) {
        setDiscountValidation({ code: normalized, isValid: false, message: err?.message || "Unable to validate" });
        toast({
          title: "Unable to validate",
          description: err?.message || "Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsValidatingDiscount(false);
      }
    };

  const handleMemberDialogToggle = (open: boolean) => {
    if (!open) {
      setMemberDialogOpen(false);
      setEditingMember(null);
      resetMemberForm();
      upsertMemberMutation.reset();
      return;
    }
    setMemberDialogOpen(true);
  };

  const handleViewGroup = async (groupId: string) => {
    setDetailLoading(true);
    try {
      await fetchGroupDetail(groupId);
      setDetailOpen(true);
    } catch (err: any) {
      toast({
        title: "Failed to load group",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const handleAddMemberClick = () => {
    setEditingMember(null);
    resetMemberForm();
    setMemberDialogOpen(true);
  };

  const handleEditMemberClick = (member: GroupMemberRecord) => {
    setEditingMember(member);
    resetMemberForm({
      id: member.id,
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      tier: member.tier,
      payorType: member.payorType || selectedGroup?.data?.payorType || "full",
      status: member.status || "draft",
    });
    setMemberDialogOpen(true);
  };

  const isMemberFormValid =
    memberForm.firstName.trim().length > 1 &&
    memberForm.lastName.trim().length > 1 &&
    memberForm.email.trim().length > 5;

  const memberDialogTitle = editingMember ? "Edit Group Member" : "Add Group Member";
  const memberDialogDescription = editingMember
    ? "Update this record before sending the hosted checkout link."
    : "Enter each enrollee before triggering hosted checkout.";
  const memberCount = selectedGroup?.members?.length ?? 0;
  const canMarkReady = memberCount > 0 && selectedGroup?.data?.status !== "registered";
  const hostedStatusLabel = selectedGroup?.data?.status === "registered"
    ? "ready"
    : selectedGroup?.data?.hostedCheckoutStatus || "not-started";
  const hostedStatusBadgeClass = hostedStatusLabel === "ready"
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : hostedStatusLabel === "in-progress"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-slate-50 text-slate-600 border-slate-200";

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="max-w-lg w-full">
          <CardHeader>
            <CardTitle>Access Restricted</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">
              Only active agents, admins, and super admins can access the group enrollment workspace.
              Please switch accounts or contact a super admin for access.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-2">
            {canAccessAdminViews && (
              <Button
                variant="ghost"
                onClick={() => setLocation("/admin")}
                className="w-fit px-0 text-sm text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Admin View
              </Button>
            )}
            <p className="text-sm text-gray-500 uppercase tracking-wide">Stage 1 Manual Workflow</p>
            <h1 className="text-3xl font-bold text-gray-900">Group Enrollment</h1>
            <p className="text-gray-600 mt-1">Create employer groups, review payor types, and track hosted checkout readiness.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/groups"] })}>
              Refresh
            </Button>
            <Button onClick={() => setNewGroupOpen(true)} className="bg-blue-600 text-white hover:bg-blue-700">
              <Plus className="h-4 w-4 mr-2" />
              Enroll a Group
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Unable to load groups</AlertTitle>
            <AlertDescription>Check your connection and try again.</AlertDescription>
          </Alert>
        )}

        <section className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-gray-500 uppercase">Active Groups</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{groups.length}</p>
              <p className="text-sm text-gray-500">Groups staged for hosted checkout</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-gray-500 uppercase">Payor Mix</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {payorOptions.map((option) => {
                const count = groups.filter((g) => g.payorType === option.value).length;
                return (
                  <div key={option.value} className="flex items-center justify-between text-sm">
                    <span>{option.label}</span>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-gray-500 uppercase">Next Step</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-gray-700">Capture group info, add members manually, then launch hosted checkout.</p>
              <Button variant="outline" onClick={() => setNewGroupOpen(true)} className="w-full">
                Start New Group
              </Button>
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Group Pipeline</CardTitle>
                <p className="text-sm text-gray-500">Monitor each employer group before payment handoff.</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {groups.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Users className="h-10 w-10 mx-auto mb-4 text-gray-400" />
                <p>No groups created yet.</p>
                <p className="text-sm">Use the "Enroll a Group" button to start.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Group</TableHead>
                      <TableHead>Payor Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Discount</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groups.map((group) => (
                      <TableRow key={group.id}>
                        <TableCell>
                          <div className="font-medium">{group.name}</div>
                          <div className="text-sm text-gray-500">{group.groupType || 'General'}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{group.payorType}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {group.status === 'registered' ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <Layers className="h-4 w-4 text-amber-500" />
                            )}
                            <span className="capitalize">{group.status}</span>
                          </div>
                        </TableCell>
                        <TableCell>{group.discountCode || '—'}</TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {group.updatedAt ? formatDistanceToNow(new Date(group.updatedAt), { addSuffix: true }) : 'just now'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => handleViewGroup(group.id)}>
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={newGroupOpen} onOpenChange={setNewGroupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enroll a New Group</DialogTitle>
            <DialogDescription>Capture the basic employer information to begin manual registration.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="group-name">Group Name</Label>
              <Input
                id="group-name"
                placeholder="Acme Logistics"
                value={newGroupForm.name}
                onChange={(event) => setNewGroupForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="group-type">Group Type</Label>
              <Input
                id="group-type"
                placeholder="Industry or segment"
                value={newGroupForm.groupType}
                onChange={(event) => setNewGroupForm((prev) => ({ ...prev, groupType: event.target.value }))}
              />
            </div>
            <div>
              <Label>Payor Type</Label>
              <Select
                value={newGroupForm.payorType}
                onValueChange={(value) => setNewGroupForm((prev) => ({ ...prev, payorType: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payor" />
                </SelectTrigger>
                <SelectContent>
                  {payorOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="discount-code">Discount Code (optional)</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="discount-code"
                  placeholder="WELCOME20"
                  value={newGroupForm.discountCode}
                  onChange={(event) => {
                    const value = event.target.value.toUpperCase();
                    setNewGroupForm((prev) => ({ ...prev, discountCode: value }));
                    setDiscountValidation(null);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleValidateDiscount}
                  disabled={!newGroupForm.discountCode.trim() || isValidatingDiscount}
                >
                  {isValidatingDiscount ? 'Checking...' : 'Validate'}
                </Button>
              </div>
              {discountValidation &&
                newGroupForm.discountCode.trim().toUpperCase() === discountValidation.code && (
                  <p className={`text-xs mt-1 ${discountValidation.isValid ? 'text-emerald-600' : 'text-red-600'}`}>
                    {discountValidation.message ||
                      (discountValidation.isValid ? 'Discount code is valid.' : 'Discount code is invalid.')}
                  </p>
                )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewGroupOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createGroupMutation.mutate()}
              disabled={!newGroupForm.name || createGroupMutation.isPending}
            >
              {createGroupMutation.isPending ? 'Saving...' : 'Save Group'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selectedGroup?.data?.name || 'Group Details'}</DialogTitle>
            <DialogDescription>
              Manual member entry and hosted checkout prep live here. Use the API-backed flow to keep downtime low.
            </DialogDescription>
          </DialogHeader>
          {detailLoading || !selectedGroup ? (
            <div className="flex items-center justify-center py-10">
              <LoadingSpinner />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Status</Label>
                  <p className="font-medium capitalize">{selectedGroup.data.status}</p>
                </div>
                <div>
                  <Label>Payor Type</Label>
                  <p className="font-medium capitalize">{selectedGroup.data.payorType}</p>
                </div>
                <div>
                  <Label>Group Type</Label>
                  <p className="font-medium">{selectedGroup.data.groupType || 'General'}</p>
                </div>
                <div>
                  <Label>Discount Code</Label>
                  <p className="font-medium">{selectedGroup.data.discountCode || 'Not applied'}</p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Users className="h-4 w-4" /> Members
                  </h3>
                  <Button variant="outline" size="sm" onClick={handleAddMemberClick}>
                    <UserPlus className="h-4 w-4 mr-1" />
                    Add Member
                  </Button>
                </div>
                <div className="border rounded-lg divide-y bg-white">
                  {selectedGroup?.members && selectedGroup.members.length > 0 ? (
                    selectedGroup.members.map((member) => (
                      <div key={member.id} className="p-3 flex items-center justify-between">
                        <div>
                          <p className="font-medium">{member.firstName} {member.lastName}</p>
                          <p className="text-sm text-gray-500">{tierLabels[member.tier] || member.tier}</p>
                        </div>
                        <div className="text-right">
                          <Badge variant="outline" className="mb-1">{member.status || 'draft'}</Badge>
                          <p className="text-xs text-gray-500">{member.registeredAt ? formatDistanceToNow(new Date(member.registeredAt), { addSuffix: true }) : 'Pending'}</p>
                          <div className="flex justify-end gap-2 mt-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleEditMemberClick(member)}
                              aria-label="Edit member"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-600"
                              disabled={deleteMemberMutation.isPending}
                              onClick={() => deleteMemberMutation.mutate(member)}
                              aria-label="Remove member"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-sm text-gray-500">No members captured yet.</div>
                  )}
                </div>
              </div>

              <div className="border rounded-lg p-4 bg-slate-50 flex flex-col gap-4">
                <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-600 uppercase">
                  <ClipboardCheck className="h-4 w-4 text-blue-600" /> Hosted Checkout Readiness
                </div>
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-2">
                    <p className="text-sm text-slate-600">
                      {memberCount === 0
                        ? 'Add at least one member before handing off to payments.'
                        : selectedGroup.data.status === 'registered'
                          ? 'This group is already marked ready for hosted checkout.'
                          : 'Review member details, then mark ready to generate the hosted checkout link.'}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Members captured</span>
                        <Badge variant="secondary">{memberCount}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Status</span>
                        <Badge variant="outline" className={`capitalize ${hostedStatusBadgeClass}`}>
                          {hostedStatusLabel}
                        </Badge>
                      </div>
                      {selectedGroup.data.registrationCompletedAt && (
                        <span className="text-xs text-slate-500">
                          Marked {formatDistanceToNow(new Date(selectedGroup.data.registrationCompletedAt), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                    {selectedGroup.data.hostedCheckoutLink && (
                      <a
                        href={selectedGroup.data.hostedCheckoutLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex text-sm text-blue-600 hover:text-blue-700"
                      >
                        Open hosted checkout
                      </a>
                    )}
                  </div>
                  <div className="w-full md:w-auto">
                    <Button
                      className="w-full"
                      onClick={() => completeGroupMutation.mutate()}
                      disabled={!canMarkReady || completeGroupMutation.isPending}
                    >
                      {selectedGroup.data.status === 'registered'
                        ? 'Ready'
                        : completeGroupMutation.isPending
                          ? 'Marking...'
                          : 'Mark Ready'}
                    </Button>
                    {!canMarkReady && selectedGroup.data.status !== 'registered' && (
                      <p className="mt-2 text-xs text-slate-500 text-center">
                        Add members before marking the group ready.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Manual registration</AlertTitle>
                <AlertDescription>
                  Add all members, confirm payor amounts, then trigger hosted checkout from this workspace. Payment automation hooks into the existing EPX hosted checkout service.
                </AlertDescription>
              </Alert>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDetailOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => setLocation(canAccessAdminViews ? '/admin/enrollments' : '/agent')}
              variant="secondary"
            >
              {canAccessAdminViews ? 'Go to Enrollment Records' : 'Back to Dashboard'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={memberDialogOpen} onOpenChange={handleMemberDialogToggle}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{memberDialogTitle}</DialogTitle>
            <DialogDescription>{memberDialogDescription}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="member-first-name">First Name</Label>
                <Input
                  id="member-first-name"
                  value={memberForm.firstName}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, firstName: event.target.value }))}
                  placeholder="Leslie"
                />
              </div>
              <div>
                <Label htmlFor="member-last-name">Last Name</Label>
                <Input
                  id="member-last-name"
                  value={memberForm.lastName}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, lastName: event.target.value }))}
                  placeholder="Knope"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="member-email">Email</Label>
              <Input
                id="member-email"
                type="email"
                value={memberForm.email}
                onChange={(event) => setMemberForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="leslie@example.com"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Tier</Label>
                <Select
                  value={memberForm.tier}
                  onValueChange={(value) => setMemberForm((prev) => ({ ...prev, tier: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select tier" />
                  </SelectTrigger>
                  <SelectContent>
                    {tierOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={memberForm.status}
                  onValueChange={(value) => setMemberForm((prev) => ({ ...prev, status: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Payor</Label>
              <Select
                value={memberForm.payorType}
                onValueChange={(value) => setMemberForm((prev) => ({ ...prev, payorType: value }))}
                disabled={Boolean(selectedGroup?.data?.payorType && selectedGroup.data.payorType !== 'mixed')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Payor" />
                </SelectTrigger>
                <SelectContent>
                  {payorOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedGroup?.data?.payorType && selectedGroup.data.payorType !== 'mixed' && (
                <p className="text-xs text-gray-500 mt-1">Payor mirrors the group setting.</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => handleMemberDialogToggle(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => upsertMemberMutation.mutate()}
              disabled={!isMemberFormValid || upsertMemberMutation.isPending}
            >
              {upsertMemberMutation.isPending ? 'Saving...' : editingMember ? 'Save Changes' : 'Add Member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
