import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Switch } from "@/components/ui/switch";
import { TableCell, TableRow } from "@/components/ui/table";
import { hasAtLeastRole } from "@/lib/roles";
import { Search } from "lucide-react";

interface AdminUsersTableCardProps {
  usersLoading: boolean;
  usersData: any;
  setAgentNumberInput: (value: string) => void;
  setAssignAgentNumberDialog: (value: { open: boolean; userId: string; currentNumber: string | null }) => void;
  setEditFormData: (value: { firstName: string; lastName: string; email: string; phone: string }) => void;
  setEditUserDialog: (value: { open: boolean; user: any | null }) => void;
  toast: (args: { title: string; description: string; variant?: "default" | "destructive" }) => void;
  refetch: () => void;
}

export const AdminUsersTableCard: React.FC<AdminUsersTableCardProps> = ({
  usersLoading,
  usersData,
  setAgentNumberInput,
  setAssignAgentNumberDialog,
  setEditFormData,
  setEditUserDialog,
  toast,
  refetch,
}) => {
  return (
    <Card className="mt-8">
      <CardContent className="p-0">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-gray-900">All App Users (Agents & Admins)</h2>
            <div className="mt-4 sm:mt-0">
              <div className="relative">
                <Input
                  id="admin-user-search"
                  name="userSearch"
                  placeholder="Search users..."
                  className="pl-10 pr-4 py-2"
                  autoComplete="off"
                />
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {usersLoading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Agent Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {usersData?.users?.map((user: any) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      {user.firstName} {user.lastName}
                      {user.role === "agent" && (
                        <span className="ml-2 text-xs text-blue-600 font-medium">(Staff)</span>
                      )}
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge variant={hasAtLeastRole(user.role, "admin") ? "default" : user.role === "agent" ? "secondary" : "outline"}>
                        {user.role === "super_admin" ? "Super Admin" : user.role === "agent" ? "Agent (Staff)" : user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <span>{user.agentNumber || "Not Assigned"}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-blue-600 hover:text-blue-900 p-1 h-6"
                          onClick={() => {
                            setAgentNumberInput(user.agentNumber || "");
                            setAssignAgentNumberDialog({ open: true, userId: user.id, currentNumber: user.agentNumber });
                          }}
                        >
                          {user.agentNumber ? "Edit" : "Assign"}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col space-y-1">
                        <div className="flex items-center space-x-2">
                          <Badge
                            variant={user.approvalStatus === "approved" ? "default" : user.approvalStatus === "suspended" ? "destructive" : user.approvalStatus === "rejected" ? "outline" : "secondary"}
                            className={user.approvalStatus === "approved" ? "bg-green-100 text-green-800" : ""}
                          >
                            {user.approvalStatus || "pending"}
                          </Badge>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={user.isActive}
                            onCheckedChange={async () => {
                              try {
                                const { supabase } = await import("@/lib/supabase");
                                const {
                                  data: { session },
                                } = await supabase.auth.getSession();

                                if (!session?.access_token) {
                                  throw new Error("Authentication required");
                                }

                                const response = await fetch(`/api/admin/users/${user.id}/toggle-status`, {
                                  method: "PUT",
                                  headers: {
                                    Authorization: `Bearer ${session.access_token}`,
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    isActive: !user.isActive,
                                    userRole: user.role,
                                  }),
                                });

                                if (!response.ok) {
                                  const errorData = await response.json();
                                  throw new Error(errorData.message || "Failed to update status");
                                }

                                toast({
                                  title: "Success",
                                  description: `${user.role === "agent" ? "Agent" : "User"} ${!user.isActive ? "activated" : "deactivated"} successfully`,
                                });

                                refetch();
                              } catch (error: any) {
                                toast({
                                  title: "Error",
                                  description: error.message || "Failed to update user status",
                                  variant: "destructive",
                                });
                              }
                            }}
                          />
                          <span className="text-sm">{user.isActive ? "Active" : "Inactive"}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-medical-blue-600 hover:text-medical-blue-900 mr-3"
                        onClick={() => {
                          setEditFormData({
                            firstName: user.firstName || "",
                            lastName: user.lastName || "",
                            email: user.email || "",
                            phone: user.phone || "",
                          });
                          setEditUserDialog({ open: true, user });
                        }}
                      >
                        Edit
                      </Button>
                      {user.isActive ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-900"
                          onClick={async () => {
                            try {
                              const { supabase } = await import("@/lib/supabase");
                              const {
                                data: { session },
                              } = await supabase.auth.getSession();

                              if (!session?.access_token) {
                                throw new Error("Authentication required");
                              }

                              const response = await fetch(`/api/admin/users/${user.id}/suspend`, {
                                method: "PUT",
                                headers: {
                                  Authorization: `Bearer ${session.access_token}`,
                                  "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                  reason: "Suspended by administrator",
                                }),
                              });

                              if (!response.ok) {
                                const errorData = await response.json();
                                throw new Error(errorData.message || "Failed to suspend user");
                              }

                              toast({
                                title: "Success",
                                description: "User suspended successfully",
                              });

                              refetch();
                            } catch (error: any) {
                              toast({
                                title: "Error",
                                description: error.message || "Failed to suspend user",
                                variant: "destructive",
                              });
                            }
                          }}
                        >
                          Suspend
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-green-600 hover:text-green-900"
                          onClick={async () => {
                            try {
                              const { supabase } = await import("@/lib/supabase");
                              const {
                                data: { session },
                              } = await supabase.auth.getSession();

                              if (!session?.access_token) {
                                throw new Error("Authentication required");
                              }

                              const response = await fetch(`/api/admin/users/${user.id}/reactivate`, {
                                method: "PUT",
                                headers: {
                                  Authorization: `Bearer ${session.access_token}`,
                                  "Content-Type": "application/json",
                                },
                              });

                              if (!response.ok) {
                                const errorData = await response.json();
                                throw new Error(errorData.message || "Failed to reactivate user");
                              }

                              toast({
                                title: "Success",
                                description: "User reactivated successfully",
                              });

                              refetch();
                            } catch (error: any) {
                              toast({
                                title: "Error",
                                description: error.message || "Failed to reactivate user",
                                variant: "destructive",
                              });
                            }
                          }}
                        >
                          Reactivate
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Showing <span className="font-medium">1</span> to{" "}
              <span className="font-medium">{Math.min(10, usersData?.users?.length || 0)}</span> of{" "}
              <span className="font-medium">{usersData?.totalCount || 0}</span> results
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="ghost" size="sm" disabled>
                Previous
              </Button>
              <Button size="sm" className="bg-white hover:bg-gray-100 text-black border border-gray-300">
                1
              </Button>
              <Button variant="ghost" size="sm">
                2
              </Button>
              <Button variant="ghost" size="sm">
                3
              </Button>
              <Button variant="ghost" size="sm">
                Next
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
