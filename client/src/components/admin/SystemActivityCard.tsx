import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { hasAtLeastRole } from "@/lib/roles";
import { Clock } from "lucide-react";

interface SystemActivityCardProps {
  sessionsLoading: boolean;
  allLoginSessions: any[];
}

export const SystemActivityCard: React.FC<SystemActivityCardProps> = ({
  sessionsLoading,
  allLoginSessions,
}) => {
  return (
    <Card className="mb-8">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Recent System Activity</h2>
          </div>
          <Button variant="ghost" className="text-medical-blue-600 hover:text-medical-blue-700">
            View All Sessions
          </Button>
        </div>

        <div className="space-y-3">
          {sessionsLoading ? (
            <div className="text-center py-4 text-gray-500">Loading login activity...</div>
          ) : allLoginSessions && allLoginSessions.length > 0 ? (
            allLoginSessions.slice(0, 8).map((session: any) => (
              <div key={session.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      session.is_active ? "bg-green-500" : "bg-gray-300"
                    }`}
                  />
                  <div>
                    <p className="font-medium text-gray-900">
                      {session.users?.firstName} {session.users?.lastName}
                    </p>
                    <p className="text-sm text-gray-600">{session.users?.email}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">
                    {session.device_type} • {session.browser}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(session.login_time).toLocaleDateString()} at{" "}
                    {new Date(session.login_time).toLocaleTimeString()}
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      hasAtLeastRole(session.users?.role, "admin")
                        ? "bg-red-100 text-red-800"
                        : session.users?.role === "agent"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-green-100 text-green-800"
                    }`}
                  >
                    {session.users?.role}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Clock className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>No recent login activity</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
