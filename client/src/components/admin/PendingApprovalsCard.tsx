import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, Shield, XCircle } from "lucide-react";

interface PendingApprovalsCardProps {
  pendingLoading: boolean;
  pendingUsers: any[] | undefined;
  approveUserMutation: {
    mutate: (userId: string) => void;
    isPending: boolean;
  };
  rejectUserMutation: {
    mutate: (args: { userId: string; reason: string }) => void;
    isPending: boolean;
  };
}

export const PendingApprovalsCard: React.FC<PendingApprovalsCardProps> = ({
  pendingLoading,
  pendingUsers,
  approveUserMutation,
  rejectUserMutation,
}) => {
  return (
    <Card className="mb-8">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-yellow-600" />
            <h2 className="text-lg font-semibold text-gray-900">Pending User Approvals</h2>
            {pendingUsers && pendingUsers.length > 0 && (
              <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                {pendingUsers.length} pending
              </span>
            )}
          </div>
          <Button variant="ghost" className="text-medical-blue-600 hover:text-medical-blue-700">
            View All
          </Button>
        </div>

        <div className="space-y-4">
          {pendingLoading ? (
            <div className="text-center py-4 text-gray-500">Loading pending users...</div>
          ) : pendingUsers && pendingUsers.length > 0 ? (
            pendingUsers.map((user: any) => {
              const riskLevel =
                user.suspiciousFlags?.length > 2
                  ? "critical"
                  : user.suspiciousFlags?.length > 0
                  ? "high"
                  : "low";
              const registeredAt = new Date(user.createdAt).toLocaleString();

              return (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="font-medium text-gray-900">
                          {user.firstName} {user.lastName}
                        </p>
                        <p className="text-sm text-gray-600">{user.email}</p>
                        <p className="text-xs text-gray-500 mt-1">Registered {registeredAt}</p>
                      </div>
                      <div
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          riskLevel === "critical"
                            ? "bg-red-100 text-red-800"
                            : riskLevel === "high"
                            ? "bg-orange-100 text-orange-800"
                            : "bg-green-100 text-green-800"
                        }`}
                      >
                        {riskLevel === "critical"
                          ? "Critical Risk"
                          : riskLevel === "high"
                          ? "High Risk"
                          : "Low Risk"}
                      </div>
                    </div>
                    {user.suspiciousFlags && user.suspiciousFlags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {user.suspiciousFlags.map((flag: string, idx: number) => (
                          <span key={idx} className="text-xs bg-yellow-50 text-yellow-700 px-2 py-1 rounded">
                            {flag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-green-600 hover:text-green-700 hover:bg-green-50"
                      onClick={() => approveUserMutation.mutate(user.id)}
                      disabled={approveUserMutation.isPending}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() =>
                        rejectUserMutation.mutate({ userId: user.id, reason: "Failed security check" })
                      }
                      disabled={rejectUserMutation.isPending}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Shield className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>No pending users to review</p>
              <p className="text-sm mt-1">All users have been approved or rejected</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
