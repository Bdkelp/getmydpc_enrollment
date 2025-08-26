import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import { ChevronLeft, Phone, Mail, Clock, UserCheck, Users, AlertCircle, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';

interface Lead {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message: string;
  source: string;
  status: string;
  assignedAgentId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Agent {
  id: string;
  name: string;
  email: string;
  agentNumber?: string;
}

export default function AdminLeads() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [assignmentFilter, setAssignmentFilter] = useState<string>('all');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [activityNotes, setActivityNotes] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>(''); // State for search term

  // Check if user is admin
  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'admin')) {
      setLocation('/login');
    }
  }, [user, authLoading, setLocation]);

  // Fetch all leads
  const { data: leads = [], isLoading: leadsLoading, error: leadsError } = useQuery<Lead[]>({
    queryKey: ['/api/admin/leads', statusFilter, assignmentFilter],
    enabled: !!user && user.role === 'admin',
    queryFn: async () => {
      let url = '/api/admin/leads?';
      if (statusFilter !== 'all') url += `status=${statusFilter}&`;
      if (assignmentFilter === 'unassigned') url += 'assignedAgentId=unassigned&';
      else if (assignmentFilter !== 'all') url += `assignedAgentId=${assignmentFilter}&`;

      console.log('[AdminLeads] Fetching leads from URL:', url.slice(0, -1));

      const response = await apiRequest(url.slice(0, -1), {
        method: "GET"
      });

      console.log('[AdminLeads] API Response:', response);
      console.log('[AdminLeads] Response type:', typeof response);
      console.log('[AdminLeads] Is array:', Array.isArray(response));

      return response; // apiRequest already returns parsed JSON
    }
  });

  // Log error if any
  useEffect(() => {
    if (leadsError) {
      console.error('[AdminLeads] Failed to fetch leads:', leadsError);
    }
    if (leads && leads.length > 0) {
      console.log('[AdminLeads] Successfully fetched leads:', leads.length);
    }
  }, [leadsError, leads]);

  // Fetch agents for assignment
  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ['/api/admin/agents'],
    enabled: !!user && user.role === 'admin',
    queryFn: async () => {
      const response = await apiRequest('/api/admin/agents', {
        method: "GET"
      });
      return response; // apiRequest already returns parsed JSON
    }
  });

  // Update lead status
  const updateLeadMutation = useMutation({
    mutationFn: async ({ leadId, updates }: { leadId: number; updates: Partial<Lead> }) => {
      const response = await apiRequest(`/api/leads/${leadId}`, {
        method: "PUT",
        body: JSON.stringify(updates)
      });
      return response; // apiRequest already returns parsed JSON
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/leads'] });
      toast({
        title: "Lead Updated",
        description: "Lead has been updated successfully.",
      });
    },
  });

  // Assign lead to agent
  const assignLeadMutation = useMutation({
    mutationFn: async ({ leadId, agentId }: { leadId: number; agentId: string }) => {
      const response = await apiRequest(`/api/admin/leads/${leadId}/assign`, {
        method: "PUT",
        body: JSON.stringify({ agentId })
      });
      return response; // apiRequest already returns parsed JSON
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/leads'] });
      setShowAssignDialog(false);
      setSelectedLead(null);
      setSelectedAgentId('');
      toast({
        title: "Lead Assigned",
        description: "Lead has been assigned to agent successfully.",
      });
    },
  });

  // Add activity note
  const addActivityMutation = useMutation({
    mutationFn: async ({ leadId, notes }: { leadId: number; notes: string }) => {
      const response = await apiRequest(`/api/leads/${leadId}/activities`, {
        method: "POST",
        body: JSON.stringify({ 
          activityType: 'note',
          notes 
        })
      });
      return response; // apiRequest already returns parsed JSON
    },
    onSuccess: () => {
      setActivityNotes('');
      toast({
        title: "Activity Added",
        description: "Note has been added successfully.",
      });
    },
  });

  const handleAssignLead = () => {
    if (selectedLead && selectedAgentId) {
      // Update status to qualified if it's still new
      if (selectedLead.status === 'new') {
        updateLeadMutation.mutate({ 
          leadId: selectedLead.id, 
          updates: { status: 'qualified' } 
        });
      }

      assignLeadMutation.mutate({
        leadId: selectedLead.id,
        agentId: selectedAgentId,
      });

      // Add activity note if provided
      if (activityNotes) {
        addActivityMutation.mutate({
          leadId: selectedLead.id,
          notes: `Lead assigned to agent: ${activityNotes}`,
        });
      }
    }
  };

  const getStatusBadge = (status: string) => {
    const statusColors = {
      new: 'bg-blue-100 text-blue-800',
      contacted: 'bg-yellow-100 text-yellow-800',
      qualified: 'bg-purple-100 text-purple-800',
      enrolled: 'bg-green-100 text-green-800',
      closed: 'bg-gray-100 text-gray-800',
    };

    return (
      <Badge className={statusColors[status as keyof typeof statusColors] || 'bg-gray-100 text-gray-800'}>
        {status}
      </Badge>
    );
  };

  const unassignedCount = (leads || []).filter(lead => !lead.assignedAgentId).length;
  const newLeadsCount = (leads || []).filter(lead => lead.status === 'new').length;

  if (authLoading || leadsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading leads...</p>
        </div>
      </div>
    );
  }

  if (leadsError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">Error loading leads: {leadsError.message}</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    );
  }

  // Filter leads based on search and status
  const filteredLeads = (leads || []).filter(lead => {
    const matchesSearch = searchTerm === "" || 
      lead.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.email?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === "all" || lead.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => setLocation("/admin")}
          className="mb-4"
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>

        <h1 className="text-3xl font-bold mb-6">Lead Management</h1>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{leads.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unassigned</CardTitle>
              <AlertCircle className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{unassignedCount}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">New Leads</CardTitle>
              <Clock className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{newLeadsCount}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {leads.length > 0 
                  ? Math.round((leads.filter(l => l.status === 'enrolled').length / leads.length) * 100) 
                  : 0}%
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="contacted">Contacted</SelectItem>
              <SelectItem value="qualified">Qualified</SelectItem>
              <SelectItem value="enrolled">Enrolled</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>

          <Select value={assignmentFilter} onValueChange={setAssignmentFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by assignment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Leads</SelectItem>
              <SelectItem value="unassigned">Unassigned Only</SelectItem>
              {agents.map(agent => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {/* Search Input */}
          <Input 
            placeholder="Search leads by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-[300px]"
          />
        </div>
      </div>

      {/* Leads Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Leads</CardTitle>
          <CardDescription>
            Review, qualify, and assign leads to agents
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredLeads.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No leads found matching your filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLeads.map((lead) => {
                    const assignedAgent = agents.find(a => a.id === lead.assignedAgentId);
                    return (
                      <TableRow key={lead.id}>
                        <TableCell className="font-medium">
                          {lead.firstName} {lead.lastName}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-center text-sm">
                              <Mail className="h-3 w-3 mr-1 text-gray-400" />
                              {lead.email}
                            </div>
                            <div className="flex items-center text-sm">
                              <Phone className="h-3 w-3 mr-1 text-gray-400" />
                              {lead.phone}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(lead.status)}</TableCell>
                        <TableCell>
                          {assignedAgent ? (
                            <span className="text-sm">{assignedAgent.name}</span>
                          ) : (
                            <Badge variant="outline" className="text-orange-600">
                              Unassigned
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {format(new Date(lead.createdAt), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {!lead.assignedAgentId && (
                              <Button
                                size="sm"
                                onClick={() => {
                                  setSelectedLead(lead);
                                  setShowAssignDialog(true);
                                }}
                              >
                                <UserCheck className="h-4 w-4 mr-1" />
                                Assign
                              </Button>
                            )}
                            <Select
                              value={lead.status}
                              onValueChange={(value) => 
                                updateLeadMutation.mutate({ 
                                  leadId: lead.id, 
                                  updates: { status: value } 
                                })
                              }
                            >
                              <SelectTrigger className="w-[120px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="new">New</SelectItem>
                                <SelectItem value="contacted">Contacted</SelectItem>
                                <SelectItem value="qualified">Qualified</SelectItem>
                                <SelectItem value="enrolled">Enrolled</SelectItem>
                                <SelectItem value="closed">Closed</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assign Lead Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Lead to Agent</DialogTitle>
            <DialogDescription>
              Select an agent to assign this lead to. The lead will be marked as qualified.
            </DialogDescription>
          </DialogHeader>

          {selectedLead && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold mb-2">Lead Information</h4>
                <p className="text-sm">{selectedLead.firstName} {selectedLead.lastName}</p>
                <p className="text-sm text-gray-600">{selectedLead.email}</p>
                <p className="text-sm text-gray-600">{selectedLead.phone}</p>
                {selectedLead.message && (
                  <p className="text-sm text-gray-600 mt-2">Message: {selectedLead.message}</p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Select Agent</label>
                <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map(agent => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name} {agent.agentNumber && `(#${agent.agentNumber})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Assignment Notes (Optional)</label>
                <Textarea
                  placeholder="Add any notes about this assignment..."
                  value={activityNotes}
                  onChange={(e) => setActivityNotes(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAssignLead} 
              disabled={!selectedAgentId}
            >
              Assign Lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}