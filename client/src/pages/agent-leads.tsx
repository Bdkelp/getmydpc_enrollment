import { useState } from "react";
import AppShell from "@/components/AppShell";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Phone, Mail, MessageSquare, CheckCircle, Plus } from "lucide-react";
import { format } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAgentLeadsQueries, type Lead } from "@/hooks/useAgentLeadsQueries";
import { useAgentLeadsMutations } from "@/hooks/useAgentLeadsMutations";

const EMPTY_LEAD = { firstName: "", lastName: "", email: "", phone: "", message: "" };

export default function AgentLeads() {
  const [, setLocation] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showActivityDialog, setShowActivityDialog] = useState(false);
  const [showAddLeadDialog, setShowAddLeadDialog] = useState(false);
  const [activityType, setActivityType] = useState<string>("call");
  const [activityNotes, setActivityNotes] = useState<string>("");
  const [newLead, setNewLead] = useState(EMPTY_LEAD);

  const { leads, isLoading } = useAgentLeadsQueries(statusFilter);
  const { updateLeadMutation, addActivityMutation, addLeadMutation } = useAgentLeadsMutations();

  const handleStatusChange = (leadId: number, newStatus: string) => {
    updateLeadMutation.mutate({ leadId, status: newStatus });
  };

  const handleAddActivity = () => {
    if (selectedLead && activityNotes) {
      addActivityMutation.mutate(
        { leadId: selectedLead.id, activityType, notes: activityNotes },
        { onSuccess: () => { setShowActivityDialog(false); setActivityNotes(""); } }
      );
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new':
        return 'bg-blue-100 text-blue-700';
      case 'contacted':
        return 'bg-yellow-100 text-yellow-700';
      case 'qualified':
        return 'bg-green-100 text-green-700';
      case 'enrolled':
        return 'bg-purple-100 text-purple-700';
      case 'closed':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  const safeLeads = Array.isArray(leads) ? leads : [];
  const filteredLeads = statusFilter === 'all' 
    ? safeLeads 
    : safeLeads.filter(lead => lead && lead.status === statusFilter);

  return (
    <AppShell
      title="Lead Management"
      breadcrumb={["Agent"]}
      actions={
        <Button
          onClick={() => setShowAddLeadDialog(true)}
          className="bg-medical-blue-600 hover:bg-medical-blue-700 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Lead
        </Button>
      }
    >
      <div className="mb-4">
        <Select value={statusFilter} onValueChange={setStatusFilter} name="statusFilter">
          <SelectTrigger id="statusFilter" className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Leads</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="contacted">Contacted</SelectItem>
            <SelectItem value="qualified">Qualified</SelectItem>
            <SelectItem value="enrolled">Enrolled</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4">
        {filteredLeads?.map((lead) => (
          <Card key={lead.id} className="hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-2">
                    <h3 className="text-xl font-semibold">
                      {lead.firstName} {lead.lastName}
                    </h3>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(lead.status)}`}>
                      {lead.status.charAt(0).toUpperCase() + lead.status.slice(1)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-3">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      <a href={`mailto:${lead.email}`} className="hover:text-medical-blue-600">
                        {lead.email}
                      </a>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      <a href={`tel:${lead.phone}`} className="hover:text-medical-blue-600">
                        {lead.phone}
                      </a>
                    </div>
                  </div>

                  {lead.message && (
                    <div className="bg-gray-50 p-3 rounded mb-3">
                      <p className="text-sm text-gray-700">{lead.message}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>Created: {format(new Date(lead.createdAt), "MMM d, yyyy h:mm a")}</span>
                    <span>•</span>
                    <span>Last updated: {format(new Date(lead.updatedAt), "MMM d, yyyy h:mm a")}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 ml-4">
                  <Select
                    value={lead.status}
                    onValueChange={(value) => handleStatusChange(lead.id, value)}
                    name={`leadStatus_${lead.id}`}
                  >
                    <SelectTrigger id={`leadStatus_${lead.id}`} className="w-[140px]">
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

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedLead(lead);
                      setShowActivityDialog(true);
                    }}
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Add Activity
                  </Button>

                  {lead.status === 'qualified' && (
                    <Button
                      size="sm"
                      onClick={() => setLocation("/registration")}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Start Enrollment
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredLeads?.length === 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-gray-500">No leads found {statusFilter !== 'all' ? `with status "${statusFilter}"` : ''}</p>
          </CardContent>
        </Card>
      )}

      {/* Add Lead Dialog */}
      <Dialog open={showAddLeadDialog} onOpenChange={setShowAddLeadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Lead</DialogTitle>
            <DialogDescription>
              Enter the lead's information to add them to your pipeline
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  name="firstName"
                  autoComplete="given-name"
                  value={newLead.firstName}
                  onChange={(e) => setNewLead({ ...newLead, firstName: e.target.value })}
                  placeholder="John"
                />
              </div>
              <div>
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  name="lastName"
                  autoComplete="family-name"
                  value={newLead.lastName}
                  onChange={(e) => setNewLead({ ...newLead, lastName: e.target.value })}
                  placeholder="Doe"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={newLead.email}
                onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
                placeholder="john@example.com"
              />
            </div>

            <div>
              <Label htmlFor="phone">Phone *</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                value={newLead.phone}
                onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                placeholder="(210) 555-0123"
              />
            </div>

            <div>
              <Label htmlFor="message">Notes</Label>
              <Textarea
                id="message"
                name="message"
                autoComplete="off"
                value={newLead.message}
                onChange={(e) => setNewLead({ ...newLead, message: e.target.value })}
                placeholder="Any additional information about this lead..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddLeadDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => addLeadMutation.mutate(newLead, { onSuccess: () => { setShowAddLeadDialog(false); setNewLead(EMPTY_LEAD); } })}
              disabled={!newLead.firstName || !newLead.lastName || !newLead.email || !newLead.phone || addLeadMutation.isPending}
            >
              {addLeadMutation.isPending ? "Adding..." : "Add Lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Activity Dialog */}
      <Dialog open={showActivityDialog} onOpenChange={setShowActivityDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Activity</DialogTitle>
            <DialogDescription>
              Record an interaction with {selectedLead?.firstName} {selectedLead?.lastName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="activityType" className="text-sm font-medium">Activity Type</Label>
              <Select value={activityType} onValueChange={setActivityType} name="activityType">
                <SelectTrigger id="activityType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Phone Call</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="note">Note</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="activityNotes" className="text-sm font-medium">Notes</Label>
              <Textarea
                id="activityNotes"
                name="activityNotes"
                autoComplete="off"
                value={activityNotes}
                onChange={(e) => setActivityNotes(e.target.value)}
                placeholder="Enter details about this interaction..."
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowActivityDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddActivity} disabled={!activityNotes}>
              Add Activity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}