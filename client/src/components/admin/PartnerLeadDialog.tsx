import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDistanceToNow } from "date-fns";

interface PartnerLeadDialogProps {
  selectedPartnerLead: any | null;
  setSelectedPartnerLead: (lead: any | null) => void;
  partnerLeadStatusSelection: string;
  setPartnerLeadStatusSelection: (value: string) => void;
  partnerLeadNote: string;
  setPartnerLeadNote: (value: string) => void;
  updatePartnerLeadMutation: { isPending: boolean };
  handlePartnerLeadUpdate: () => void;
  statusOptions: Array<{ value: string; label: string }>;
}

export const PartnerLeadDialog: React.FC<PartnerLeadDialogProps> = ({
  selectedPartnerLead,
  setSelectedPartnerLead,
  partnerLeadStatusSelection,
  setPartnerLeadStatusSelection,
  partnerLeadNote,
  setPartnerLeadNote,
  updatePartnerLeadMutation,
  handlePartnerLeadUpdate,
  statusOptions,
}) => {
  return (
    <Dialog
      open={!!selectedPartnerLead}
      onOpenChange={(open) => {
        if (!open && !updatePartnerLeadMutation.isPending) {
          setSelectedPartnerLead(null);
          setPartnerLeadNote("");
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update partner lead</DialogTitle>
          <DialogDescription>
            Set the follow-up status and leave a note for your admin teammates.
          </DialogDescription>
        </DialogHeader>
        {selectedPartnerLead && (
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
              <p className="font-semibold text-gray-900">{selectedPartnerLead.agencyName}</p>
              <p className="text-gray-600">
                {selectedPartnerLead.firstName} {selectedPartnerLead.lastName} · {selectedPartnerLead.email}
              </p>
              <p className="text-xs text-gray-500">{selectedPartnerLead.phone || "No phone provided"}</p>
            </div>

            <div className="space-y-1">
              <Label className="text-sm font-medium text-gray-700">Status</Label>
              <Select value={partnerLeadStatusSelection} onValueChange={setPartnerLeadStatusSelection}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose status" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.filter((option) => option.value !== "all").map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-sm font-medium text-gray-700">Add note</Label>
              <Textarea
                rows={4}
                value={partnerLeadNote}
                onChange={(event) => setPartnerLeadNote(event.target.value)}
                placeholder="Document your call, next steps, or reminders."
              />
              <p className="text-xs text-gray-500">Notes are shared with all admins tracking this partner.</p>
            </div>

            {selectedPartnerLead.adminNotes && selectedPartnerLead.adminNotes.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Recent notes</Label>
                <div className="max-h-40 space-y-3 overflow-y-auto rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-700">
                  {[...selectedPartnerLead.adminNotes].reverse().map((note: any) => {
                    const timestampLabel = note.createdAt
                      ? formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })
                      : "Recently";
                    return (
                      <div key={note.id} className="rounded bg-gray-50 p-2">
                        <p>{note.message}</p>
                        <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">
                          {timestampLabel}
                          {note.createdBy ? ` · ${note.createdBy}` : ""}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!updatePartnerLeadMutation.isPending) {
                setSelectedPartnerLead(null);
                setPartnerLeadNote("");
              }
            }}
            disabled={updatePartnerLeadMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handlePartnerLeadUpdate}
            disabled={updatePartnerLeadMutation.isPending}
            className="bg-cyan-600 text-white hover:bg-cyan-700"
          >
            {updatePartnerLeadMutation.isPending ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
