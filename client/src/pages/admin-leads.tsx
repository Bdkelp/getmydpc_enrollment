import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { useDebugLog } from '@/hooks/useDebugLog';
import ErrorBoundary from '@/components/ErrorBoundary';
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
import { hasAtLeastRole } from "@/lib/roles";
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';

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
  isQualified?: boolean; // Added isQualified as it's used in the change
}

interface Agent {
  id: string;
  name: string;
  email: string;
  agentNumber?: string;
}

export default function AdminLeads() {
  const { log, logError, logWarning } = useDebugLog('AdminLeads');
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const isAdminUser = hasAtLeastRole(user?.role, 'admin');
  
  // ALL hooks must be declared BEFORE any conditional returns
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [assignmentFilter, setAssignmentFilter] = useState<string>('all');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [activityNotes, setActivityNotes] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Fetch all leads - MUST be before any conditional returns
  const { data: leads, isLoading: leadsLoading, error: leadsError } = useQuery<Lead[]>({
    queryKey: ['/api/admin/leads', statusFilter, assignmentFilter],
    enabled: !!user && isAdminUser,
    retry: (failureCount, error: any) => {
      logWarning('Query retry attempt', { failureCount, error: error?.message });
      if (error?.message?.includes('401') || error?.message?.includes('403')) {
        logError('Authentication error in query, not retrying');
        return false;
      }
      return failureCount < 2;
    },
    queryFn: async () => {
      try {
        let url = '/api/admin/leads?';
        if (statusFilter !== 'all') url += `status=${statusFilter}&`;
        if (assignmentFilter === 'unassigned') url += 'assignedAgentId=unassigned&';
        else if (assignmentFilter !== 'all') url += `assignedAgentId=${assignmentFilter}&`;

        const finalUrl = url.slice(0, -1);
        log('Fetching leads', { url: finalUrl, statusFilter, assignmentFilter });

        const response = await apiRequest(finalUrl, {
          method: "GET"
        });

        log('Leads API response received', { 
          responseType: typeof response, 
          isArray: Array.isArray(response),
          length: Array.isArray(response) ? response.length : 'N/A'
        });

        if (!Array.isArray(response)) {
          logWarning('Expected array response but got', typeof response);
          return [];
        }

        return response;
      } catch (error) {
        logError('Failed to fetch leads', error);
        throw error;
      }
    }
  });

  // Fetch agents for assignment - MUST be before any conditional returns
  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ['/api/admin/agents'],
    enabled: !!user && isAdminUser,
    queryFn: async () => {
      const response = await apiRequest('/api/admin/agents', {
        method: "GET"
      });
      return response; // apiRequest already returns parsed JSON
    }
  });

  // Update lead status - MUST be before any conditional returns
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

  // Assign lead to agent - MUST be before any conditional returns
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

  // Add activity note - MUST be before any conditional returns
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

  // Safely calculate arrays, ensuring 'leads' and 'agents' are arrays
  const safeLeads = Array.isArray(leads) ? leads : [];
  const safeAgents = Array.isArray(agents) ? agents : [];

  // Filter leads based on search and status - MUST be before any conditional returns
  const filteredLeads = React.useMemo(() => {
    return safeLeads.filter(lead => {
      if (!lead) return false;

      const matchesSearch = searchTerm === "" || 
        (lead.firstName && lead.firstName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (lead.lastName && lead.lastName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (lead.email && lead.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (lead.phone && lead.phone.includes(searchTerm));

      const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
      const matchesAgent = assignmentFilter === "all" || 
        (assignmentFilter === "unassigned" && !lead.assignedAgentId) ||
        lead.assignedAgentId === assignmentFilter;

      return matchesSearch && matchesStatus && matchesAgent;
    });
  }, [safeLeads, searchTerm, statusFilter, assignmentFilter]);

  // Check if user is admin - AFTER all hooks
  useEffect(() => {
    log('Auth check useEffect triggered', { 
      authLoading, 
      hasUser: !!user, 
      userRole: user?.role 
    });

    if (!authLoading) {
      if (!user) {
        logWarning('No user found, redirecting to login');
        setLocation('/login');
      } else if (!isAdminUser) {
        logWarning('User is not admin, redirecting to agent dashboard', { role: user.role });
        setLocation('/agent');
      } else {
        log('Admin user confirmed', { email: user.email });
      }
    }
  }, [user, authLoading, setLocation, log, logWarning, isAdminUser]);

  // Log error if any
  useEffect(() => {
    if (leadsError) {
      console.error('[AdminLeads] Failed to fetch leads:', leadsError);
    }
    if (leads && leads.length > 0) {
      console.log('[AdminLeads] Successfully fetched leads:', leads.length);
    }
  }, [leadsError, leads]);

  // MOVED: Log statement should be after hooks but before returns
  useEffect(() => {
    log('Component initialized', { user: user?.email, authLoading });
  }, [user, authLoading, log]);

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

  const getLeadTypeMeta = (source?: string | null) => {
    switch (source) {
      case 'partner_lead':
        return {
          label: 'Prospective Agent',
          badgeClass: 'bg-purple-100 text-purple-800 border border-purple-200',
          hint: 'Partner inquiry',
        };
      case 'contact_form':
      default:
        return {
          label: 'Prospective Member',
          badgeClass: 'bg-blue-100 text-blue-800 border border-blue-200',
          hint: 'Member inquiry',
        };
    }
  };

  const unassignedCount = safeLeads.filter(lead => !lead.assignedAgentId).length;
  const newLeadsCount = safeLeads.filter(lead => lead.status === 'new').length;
  const contactedCount = safeLeads.filter(lead => lead.status === 'contacted').length;
  const qualifiedCount = safeLeads.filter(lead => lead.status === 'qualified').length;
  const selectedLeadTypeMeta = selectedLead ? getLeadTypeMeta(selectedLead.source) : null;

  // Consolidated single check for loading and auth states
  if (authLoading || leadsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading leads...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  if (!isAdminUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">You don't have permission to access this page.</p>
          <Button onClick={() => setLocation('/agent')}>Go to Agent Dashboard</Button>
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
              <div className="text-2xl font-bold">{safeLeads.length}</div>
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
                {safeLeads.length > 0 
                  ? Math.round((safeLeads.filter(l => l.status === 'enrolled').length / safeLeads.length) * 100) 
                  : 0}%
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-4">
          <Select value={statusFilter} onValueChange={setStatusFilter} name="leadStatusFilter">
            <SelectTrigger id="admin-leads-status-filter" className="w-[180px]">
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

          <Select value={assignmentFilter} onValueChange={setAssignmentFilter} name="leadAssignmentFilter">
            <SelectTrigger id="admin-leads-assignment-filter" className="w-[200px]">
              <SelectValue placeholder="Filter by assignment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Leads</SelectItem>
              <SelectItem value="unassigned">Unassigned Only</SelectItem>
              {safeAgents.map(agent => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Search Input */}
          <Input 
            id="admin-leads-search"
            name="leadSearch"
            placeholder="Search leads by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-[300px]"
            autoComplete="off"
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
                    <TableHead>Lead Type</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLeads.map((lead) => {
                    const assignedAgent = safeAgents.find(a => a.id === lead.assignedAgentId);
                    const leadTypeMeta = getLeadTypeMeta(lead.source);
                    return (
                      <TableRow key={lead.id}>
                        <TableCell className="font-medium">
                          {lead.firstName} {lead.lastName}
                        </TableCell>
                        <TableCell>
                          <Badge className={`${leadTypeMeta.badgeClass} text-xs font-semibold`}>{leadTypeMeta.label}</Badge>
                          <div className="text-xs text-gray-500 mt-1 capitalize">{leadTypeMeta.hint}</div>
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
                {selectedLeadTypeMeta && (
                  <Badge className={`${selectedLeadTypeMeta.badgeClass} text-xs font-semibold mb-2`}>{selectedLeadTypeMeta.label}</Badge>
                )}
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
                    {safeAgents.map(agent => (
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
