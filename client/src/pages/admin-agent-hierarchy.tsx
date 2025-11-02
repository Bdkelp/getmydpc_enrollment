import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
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
  firstName: string;
  lastName: string;
  agentNumber: string;
  uplineAgentId?: string;
  overrideCommissionRate: number;
  hierarchyLevel: number;
  canReceiveOverrides: boolean;
  uplineEmail?: string;
  downlineCount?: number;
}

interface OverrideConfig {
  agentId: string;
  overrideAmount: number;
  overrideType: 'fixed' | 'percentage';
  notes?: string;
}

export default function AdminAgentHierarchy() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [newUplineId, setNewUplineId] = useState<string>("");
  const [overrideAmount, setOverrideAmount] = useState<number>(5);
  const [changeReason, setChangeReason] = useState("");

  // Fetch all agents
  const { data: agents, isLoading } = useQuery<Agent[]>({
    queryKey: ["/api/admin/agents/hierarchy"],
    enabled: !!user && user.role === 'admin',
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

  const safeAgents = useMemo(() => {
    return Array.isArray(agents) ? agents : [];
  }, [agents]);

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

  // Get potential upline agents (exclude self and downlines)
  const potentialUplines = useMemo(() => {
    if (!selectedAgent) return safeAgents;
    return safeAgents.filter(a => 
      a.id !== selectedAgent.id && 
      a.hierarchyLevel <= selectedAgent.hierarchyLevel
    );
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

  const stats = useMemo(() => {
    const totalAgents = safeAgents.length;
    const topLevelAgents = safeAgents.filter(a => !a.uplineAgentId).length;
    const agentsWithDownlines = safeAgents.filter(a => (a.downlineCount || 0) > 0).length;
    const avgOverride = safeAgents.length > 0
      ? safeAgents.reduce((sum, a) => sum + (a.overrideCommissionRate || 0), 0) / safeAgents.length
      : 0;

    return { totalAgents, topLevelAgents, agentsWithDownlines, avgOverride };
  }, [safeAgents]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold text-gray-900">Agent Hierarchy Management</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
              <CardTitle className="text-sm font-medium">Top Level Agents</CardTitle>
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
                          <TableRow key={agent.id} className={level > 0 ? 'bg-blue-50' : ''}>
                            <TableCell className="font-medium">
                              {agent.firstName} {agent.lastName}
                            </TableCell>
                            <TableCell>{agent.email}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{agent.agentNumber}</Badge>
                            </TableCell>
                            <TableCell>
                              {agent.uplineEmail ? (
                                <span className="text-sm text-gray-600">{agent.uplineEmail}</span>
                              ) : (
                                <Badge>Top Level</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className="font-semibold text-green-600">
                                ${agent.overrideCommissionRate?.toFixed(2) || '0.00'}
                              </span>
                            </TableCell>
                            <TableCell>
                              {agent.canReceiveOverrides && (
                                <Badge className="bg-purple-100 text-purple-800">
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
      </main>

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
                  <SelectItem value="none">No Upline (Top Level)</SelectItem>
                  {potentialUplines.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.firstName} {agent.lastName} ({agent.agentNumber}) - Level {agent.hierarchyLevel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="override">Override Commission Rate ($1-$10)</Label>
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
    </div>
  );
}
