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
import { AlertTriangle, Plus, Users, Layers, CheckCircle2, ArrowLeft } from "lucide-react";

const payorOptions = [
  { value: "full", label: "Full Payor (Employer pays all)" },
  { value: "partial", label: "Partial Payor (Employer + Member)" },
  { value: "member", label: "Member Pays All" },
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
};

type GroupDetailResponse = {
  data: GroupRecord;
  members?: Array<{
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    tier: string;
    status?: string;
    paymentStatus?: string;
    registeredAt?: string;
  }>;
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
      const payload = {
        name: newGroupForm.name.trim(),
        groupType: newGroupForm.groupType.trim() || undefined,
        payorType: newGroupForm.payorType,
        discountCode: newGroupForm.discountCode.trim() || undefined,
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

  const handleViewGroup = async (groupId: string) => {
    setDetailLoading(true);
    try {
      const response = await apiRequest(`/api/groups/${groupId}`);
      setSelectedGroup(response as GroupDetailResponse);
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
              <Input
                id="discount-code"
                placeholder="WELCOME20"
                value={newGroupForm.discountCode}
                onChange={(event) => setNewGroupForm((prev) => ({ ...prev, discountCode: event.target.value }))}
              />
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toast({
                      title: "Manual entry coming next",
                      description: "Member entry UI is the next milestone. Use the API for now.",
                    })}
                  >
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
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-sm text-gray-500">No members captured yet.</div>
                  )}
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
    </div>
  );
}
