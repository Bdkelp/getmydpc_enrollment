import React, { useState, useMemo, useEffect } from "react";
import AppShell from "@/components/AppShell";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { hasAtLeastRole } from "@/lib/roles";
import { Users, TrendingUp, DollarSign, Network } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Agent {
  id: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
  agentNumber: string;
  uplineAgentId?: string;
  overrideCommissionRate: number;
  hierarchyLevel: number;
  canReceiveOverrides: boolean;
  overrideSuppressed: boolean;
  uplineEmail?: string;
  downlineCount?: number;
}

interface AgencyUserOption {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  agentNumber?: string | null;
}

interface AssignmentAgentOption {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  agentNumber?: string | null;
}

interface AgencyAssignmentsResponse {
  success: boolean;
  agencyUsers: AgencyUserOption[];
  assignableAgents: AssignmentAgentOption[];
  assignments: Record<string, string[]>;
}

export default function AdminAgentHierarchy() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdminUser = hasAtLeastRole(user?.role, 'admin');
  const queryClient = useQueryClient();

  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [newUplineId, setNewUplineId] = useState<string>("");
  const [overrideAmount, setOverrideAmount] = useState<number>(5);
  const [changeReason, setChangeReason] = useState("");
  const [selectedAgencyUserId, setSelectedAgencyUserId] = useState<string>("");
  const [selectedAssignedAgentIds, setSelectedAssignedAgentIds] = useState<string[]>([]);
  const [assignmentReason, setAssignmentReason] = useState("");

  // Fetch all agents
  const { data: agents, isLoading } = useQuery<Agent[]>({
    queryKey: ["/api/admin/agents/hierarchy"],
    enabled: !!user && isAdminUser,
  });

  const { data: assignmentDirectory, isLoading: assignmentsLoading } = useQuery<AgencyAssignmentsResponse>({
    queryKey: ["/api/admin/agency-assignments"],
    enabled: !!user && isAdminUser,
  });

  // Update agent hierarchy mutation
  const updateHierarchyMutation = useMutation({
    mutationFn: async (data: { 
      agentId: string; 
      uplineId: string | null; 
      overrideAmount: number;
      reason: string;
    }) => {
      return await apiRequest("/api/admin/agents/update-hierarchy", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Agent hierarchy updated successfully",
      });
      setEditDialogOpen(false);
      setSelectedAgent(null);
      setChangeReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agents/hierarchy"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update agent hierarchy",
        variant: "destructive",
      });
    },
  });

  const saveAssignmentsMutation = useMutation({
    mutationFn: async (data: { agencyUserId: string; agentIds: string[]; reason: string }) => {
      return await apiRequest(`/api/admin/agency-assignments/${data.agencyUserId}`, {
        method: "PUT",
        body: JSON.stringify({
          agentIds: data.agentIds,
          reason: data.reason,
        }),
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Agency assignments saved successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agency-assignments"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save agency assignments",
        variant: "destructive",
      });
    },
  });

  const safeAgents = useMemo(() => {
    return Array.isArray(agents) ? agents : [];
  }, [agents]);

  const agencyUsers = useMemo(() => {
    return Array.isArray(assignmentDirectory?.agencyUsers)
      ? assignmentDirectory!.agencyUsers
      : [];
  }, [assignmentDirectory]);

  const assignableAgents = useMemo(() => {
    return Array.isArray(assignmentDirectory?.assignableAgents)
      ? assignmentDirectory!.assignableAgents
      : [];
  }, [assignmentDirectory]);

  const assignmentMap = useMemo(() => {
    return assignmentDirectory?.assignments || {};
  }, [assignmentDirectory]);

  const selectedAgencyAssignedIds = useMemo(() => {
    if (!selectedAgencyUserId) return [];
    return assignmentMap[selectedAgencyUserId] || [];
  }, [assignmentMap, selectedAgencyUserId]);

  const selectedAgencyUser = useMemo(() => {
    return agencyUsers.find((u) => u.id === selectedAgencyUserId) || null;
  }, [agencyUsers, selectedAgencyUserId]);

  // Group agents by hierarchy level
  const agentsByLevel = useMemo(() => {
    const grouped: Record<number, Agent[]> = {};
    safeAgents.forEach(agent => {
      const level = agent.hierarchyLevel || 0;
      if (!grouped[level]) grouped[level] = [];
      grouped[level].push(agent);
    });
    return grouped;
  }, [safeAgents]);

  // All users can be uplines (admins too, but they won't receive override pay)
  const potentialUplines = useMemo(() => {
    if (!selectedAgent) return safeAgents;
    return safeAgents.filter(a => a.id !== selectedAgent.id);
  }, [safeAgents, selectedAgent]);

  const handleEditAgent = (agent: Agent) => {
    setSelectedAgent(agent);
    setNewUplineId(agent.uplineAgentId || "none");
    setOverrideAmount(agent.overrideCommissionRate || 5);
    setEditDialogOpen(true);
  };

  const handleSaveHierarchy = () => {
    if (!selectedAgent) return;

    updateHierarchyMutation.mutate({
      agentId: selectedAgent.id,
      uplineId: newUplineId === "none" ? null : newUplineId,
      overrideAmount: overrideAmount,
      reason: changeReason,
    });
  };

  const toggleAssignedAgent = (agentId: string) => {
    setSelectedAssignedAgentIds((current) =>
      current.includes(agentId)
        ? current.filter((id) => id !== agentId)
        : [...current, agentId],
    );
  };

  const handleSaveAssignments = () => {
    if (!selectedAgencyUserId) {
      toast({
        title: "Select an agency user",
        description: "Choose an agency user before saving assignments.",
        variant: "destructive",
      });
      return;
    }

    saveAssignmentsMutation.mutate({
      agencyUserId: selectedAgencyUserId,
      agentIds: selectedAssignedAgentIds,
      reason: assignmentReason,
    });
  };

  const stats = useMemo(() => {
    const totalAgents = safeAgents.length;
    const topLevelAgents = safeAgents.filter(a => !a.uplineAgentId).length;
    const agentsWithDownlines = safeAgents.filter(a => (a.downlineCount || 0) > 0).length;
    const avgOverride = safeAgents.length > 0
      ? safeAgents.reduce((sum, a) => sum + (a.overrideCommissionRate || 0), 0) / safeAgents.length
      : 0;

    return { totalAgents, topLevelAgents, agentsWithDownlines, avgOverride };
  }, [safeAgents]);

  useEffect(() => {
    if (!selectedAgencyUserId) {
      if (agencyUsers.length > 0) {
        setSelectedAgencyUserId(agencyUsers[0].id);
      }
      return;
    }

    setSelectedAssignedAgentIds(selectedAgencyAssignedIds);
  }, [selectedAgencyUserId, selectedAgencyAssignedIds, agencyUsers]);

  if (isLoading || assignmentsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <AppShell title="Agent Hierarchy" breadcrumb={["Admin", "Users"]}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-1 sm:px-2 md:px-0">

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Agents</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalAgents}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Direct Agents</CardTitle>
              <Network className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.topLevelAgents}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">With Downlines</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.agentsWithDownlines}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Override Rate</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${stats.avgOverride.toFixed(2)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Agent Hierarchy Table */}
        <Card>
          <CardHeader>
            <CardTitle>Agent Hierarchy</CardTitle>
            <p className="text-sm text-muted-foreground">
              Manage agent uplines, downlines, and override commission rates ($1-$10 per enrollment)
            </p>
          </CardHeader>
          <CardContent>
            {Object.keys(agentsByLevel).length > 0 ? (
              Object.keys(agentsByLevel)
                .map(Number)
                .sort((a, b) => a - b)
                .map(level => (
                  <div key={level} className="mb-6">
                    <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                      Level {level}
                      <Badge variant="outline">{agentsByLevel[level].length} agents</Badge>
                    </h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Agent</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Agent #</TableHead>
                          <TableHead>Upline</TableHead>
                          <TableHead>Override Rate</TableHead>
                          <TableHead>Downlines</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {agentsByLevel[level].map((agent) => (
                          <TableRow key={agent.id} className={agent.overrideSuppressed ? 'bg-amber-50' : level > 0 ? 'bg-sky-aqua-50/70' : ''}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {agent.firstName} {agent.lastName}
                                {agent.overrideSuppressed && (
                                  <Badge variant="outline" className="text-orange-700 border-orange-300 text-xs">Admin</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{agent.email}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{agent.agentNumber}</Badge>
                            </TableCell>
                            <TableCell>
                              {agent.uplineEmail ? (
                                <span className="text-sm text-gray-600">{agent.uplineEmail}</span>
                              ) : (
                                <Badge>Direct</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className={`font-semibold ${agent.overrideSuppressed ? 'text-gray-400' : 'text-green-600'}`}>
                                {agent.overrideSuppressed ? 'N/A' : `$${agent.overrideCommissionRate?.toFixed(2) || '0.00'}`}
                              </span>
                              {agent.overrideSuppressed && (
                                <span className="ml-1 text-xs text-orange-600">(no override)</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {agent.canReceiveOverrides && (
                                <Badge className="bg-bright-teal-blue-100/70 text-french-blue-800">
                                  {agent.downlineCount || 0} downline{agent.downlineCount !== 1 ? 's' : ''}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditAgent(agent)}
                              >
                                Edit
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-500">No agents found.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Agency Assignment Access</CardTitle>
            <p className="text-sm text-muted-foreground">
              Assign which agents each agency-level user can view across dashboards, enrollments, and commissions.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agencyUser">Agency User</Label>
              <Select
                value={selectedAgencyUserId}
                onValueChange={(value) => {
                  setSelectedAgencyUserId(value);
                  setAssignmentReason("");
                }}
              >
                <SelectTrigger id="agencyUser">
                  <SelectValue placeholder="Select agency user" />
                </SelectTrigger>
                <SelectContent>
                  {agencyUsers.map((agencyUser) => (
                    <SelectItem key={agencyUser.id} value={agencyUser.id}>
                      {agencyUser.firstName} {agencyUser.lastName} ({agencyUser.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedAgencyUser && (
              <div className="rounded-md border border-gray-200 p-3 bg-gray-50">
                <div className="text-sm font-medium text-gray-900">
                  {selectedAgencyUser.firstName} {selectedAgencyUser.lastName}
                </div>
                <div className="text-xs text-gray-600">{selectedAgencyUser.email}</div>
                <div className="text-xs text-gray-600">Role: {selectedAgencyUser.role}</div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Assignable Agents</Label>
              <div className="max-h-72 overflow-y-auto rounded-md border border-gray-200">
                {assignableAgents.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500">No active agents available.</div>
                ) : (
                  assignableAgents.map((agent) => {
                    const checked = selectedAssignedAgentIds.includes(agent.id);
                    return (
                      <label
                        key={agent.id}
                        className="flex items-center justify-between px-3 py-2 border-b last:border-b-0 hover:bg-gray-50"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">
                            {agent.firstName} {agent.lastName}
                          </div>
                          <div className="text-xs text-gray-600 truncate">
                            {agent.email} {agent.agentNumber ? `• ${agent.agentNumber}` : ""}
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAssignedAgent(agent.id)}
                          className="h-4 w-4"
                        />
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="assignmentReason">Reason (optional)</Label>
              <Input
                id="assignmentReason"
                placeholder="e.g., Team ownership update"
                value={assignmentReason}
                onChange={(e) => setAssignmentReason(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {selectedAssignedAgentIds.length} agent{selectedAssignedAgentIds.length !== 1 ? "s" : ""} selected
              </p>
              <Button
                onClick={handleSaveAssignments}
                disabled={saveAssignmentsMutation.isPending || !selectedAgencyUserId}
              >
                {saveAssignmentsMutation.isPending ? "Saving..." : "Save Agency Assignments"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit Hierarchy Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Agent Hierarchy</DialogTitle>
            <DialogDescription>
              Update upline agent and override commission rate for {selectedAgent?.firstName} {selectedAgent?.lastName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="upline">Upline Agent</Label>
              <Select value={newUplineId} onValueChange={setNewUplineId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select upline agent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Direct (No Upline)</SelectItem>
                  {potentialUplines.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.firstName} {agent.lastName} ({agent.agentNumber}){agent.overrideSuppressed ? ' — Admin (no override pay)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="override">Override Commission Rate ($1-$10)</Label>
              {newUplineId !== "none" && potentialUplines.find(a => a.id === newUplineId)?.overrideSuppressed ? (
                <p className="text-sm text-orange-600 bg-orange-50 border border-orange-200 rounded px-3 py-2">
                  Selected upline is an admin — override commissions are not paid to admins. This assignment is for org structure only.
                </p>
              ) : (
                <>
                  <Input
                    id="override"
                    type="number"
                    min="1"
                    max="10"
                    step="0.50"
                    value={overrideAmount}
                    onChange={(e) => setOverrideAmount(parseFloat(e.target.value) || 5)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Amount paid to upline agent per enrollment (based on contract level)
                  </p>
                </>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason for Change</Label>
              <Input
                id="reason"
                placeholder="e.g., Contract update, team restructure"
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveHierarchy}
              disabled={updateHierarchyMutation.isPending}
            >
              {updateHierarchyMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
