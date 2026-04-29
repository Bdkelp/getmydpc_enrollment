import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AdminUserDialogsProps {
  assignAgentNumberDialog: { open: boolean; userId: string; currentNumber: string | null };
  setAssignAgentNumberDialog: (value: { open: boolean; userId: string; currentNumber: string | null }) => void;
  agentNumberInput: string;
  setAgentNumberInput: (value: string) => void;
  editUserDialog: { open: boolean; user: any | null };
  setEditUserDialog: (value: { open: boolean; user: any | null }) => void;
  editFormData: { firstName: string; lastName: string; email: string; phone: string };
  setEditFormData: (value: { firstName: string; lastName: string; email: string; phone: string }) => void;
  refetch: () => void;
  toast: (args: { title: string; description: string; variant?: "default" | "destructive" }) => void;
}

export const AdminUserDialogs: React.FC<AdminUserDialogsProps> = ({
  assignAgentNumberDialog,
  setAssignAgentNumberDialog,
  agentNumberInput,
  setAgentNumberInput,
  editUserDialog,
  setEditUserDialog,
  editFormData,
  setEditFormData,
  refetch,
  toast,
}) => {
  return (
    <>
      <Dialog
        open={assignAgentNumberDialog.open}
        onOpenChange={(open) => setAssignAgentNumberDialog({ ...assignAgentNumberDialog, open })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {assignAgentNumberDialog.currentNumber ? "Edit Agent Number" : "Assign Agent Number"}
            </DialogTitle>
            <DialogDescription>
              Enter a unique agent number for commission tracking. Each agent/admin must have a unique identifier.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="agent-number" className="text-right">
                Agent Number
              </Label>
              <Input
                id="agent-number"
                value={agentNumberInput}
                onChange={(e) => setAgentNumberInput(e.target.value.toUpperCase())}
                placeholder="e.g., MPP0001"
                className="col-span-3"
                maxLength={10}
              />
            </div>
            <div className="space-y-2 ml-[108px]">
              <div className="text-sm text-gray-600 font-medium">Format Guidelines:</div>
              <div className="text-sm text-gray-500">
                • Standard format: <span className="font-mono bg-gray-100 px-1">MPP####</span> (e.g., MPP0001,
                MPP0100)
              </div>
              <div className="text-sm text-gray-500">• Admins typically use: MPP0001 - MPP0099</div>
              <div className="text-sm text-gray-500">• Agents typically use: MPP0100 and above</div>
              {assignAgentNumberDialog.currentNumber && (
                <div className="text-sm text-blue-600 mt-2">
                  Current: <span className="font-mono font-bold">{assignAgentNumberDialog.currentNumber}</span>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAssignAgentNumberDialog({ open: false, userId: "", currentNumber: null })}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!agentNumberInput) {
                  toast({
                    title: "Error",
                    description: "Agent number cannot be empty",
                    variant: "destructive",
                  });
                  return;
                }

                if (!agentNumberInput.match(/^MPP\d{4}$/)) {
                  toast({
                    title: "Error",
                    description: "Agent number must be in format MPP#### (e.g., MPP0001)",
                    variant: "destructive",
                  });
                  return;
                }

                try {
                  const { supabase } = await import("@/lib/supabase");
                  const {
                    data: { session },
                  } = await supabase.auth.getSession();

                  if (!session?.access_token) {
                    throw new Error("Authentication required");
                  }

                  const response = await fetch(
                    `/api/admin/users/${assignAgentNumberDialog.userId}/assign-agent-number`,
                    {
                      method: "PUT",
                      headers: {
                        Authorization: `Bearer ${session.access_token}`,
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        agentNumber: agentNumberInput,
                      }),
                    },
                  );

                  if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || "Failed to assign agent number");
                  }

                  toast({
                    title: "Success",
                    description: `Agent number ${agentNumberInput} assigned successfully`,
                  });

                  setAssignAgentNumberDialog({ open: false, userId: "", currentNumber: null });
                  setAgentNumberInput("");
                  refetch();
                } catch (error: any) {
                  toast({
                    title: "Error",
                    description: error.message || "Failed to assign agent number",
                    variant: "destructive",
                  });
                }
              }}
            >
              {assignAgentNumberDialog.currentNumber ? "Update" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editUserDialog.open} onOpenChange={(open) => setEditUserDialog({ open, user: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User Information</DialogTitle>
            <DialogDescription>Update user profile information for {editUserDialog.user?.email}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-firstName" className="text-right">
                First Name
              </Label>
              <Input
                id="edit-firstName"
                name="firstName"
                value={editFormData.firstName}
                onChange={(e) => setEditFormData({ ...editFormData, firstName: e.target.value })}
                className="col-span-3"
                autoComplete="given-name"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-lastName" className="text-right">
                Last Name
              </Label>
              <Input
                id="edit-lastName"
                name="lastName"
                value={editFormData.lastName}
                onChange={(e) => setEditFormData({ ...editFormData, lastName: e.target.value })}
                className="col-span-3"
                autoComplete="family-name"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-email" className="text-right">
                Email
              </Label>
              <Input
                id="edit-email"
                name="email"
                type="email"
                value={editFormData.email}
                onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                className="col-span-3"
                autoComplete="email"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-phone" className="text-right">
                Phone
              </Label>
              <Input
                id="edit-phone"
                name="phone"
                type="tel"
                value={editFormData.phone}
                onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                className="col-span-3"
                autoComplete="tel"
                placeholder="(555) 555-5555"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUserDialog({ open: false, user: null })}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!editFormData.firstName || !editFormData.lastName || !editFormData.email) {
                  toast({
                    title: "Error",
                    description: "First name, last name, and email are required",
                    variant: "destructive",
                  });
                  return;
                }

                try {
                  const { supabase } = await import("@/lib/supabase");
                  const {
                    data: { session },
                  } = await supabase.auth.getSession();

                  if (!session?.access_token) {
                    throw new Error("Authentication required");
                  }

                  const response = await fetch(`/api/admin/users/${editUserDialog.user.id}`, {
                    method: "PUT",
                    headers: {
                      Authorization: `Bearer ${session.access_token}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      firstName: editFormData.firstName,
                      lastName: editFormData.lastName,
                      email: editFormData.email,
                      phone: editFormData.phone,
                    }),
                  });

                  if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || "Failed to update user");
                  }

                  toast({
                    title: "Success",
                    description: "User information updated successfully",
                  });

                  setEditUserDialog({ open: false, user: null });
                  refetch();
                } catch (error: any) {
                  toast({
                    title: "Error",
                    description: error.message || "Failed to update user",
                    variant: "destructive",
                  });
                }
              }}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
