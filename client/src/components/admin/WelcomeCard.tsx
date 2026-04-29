import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, Shield } from "lucide-react";
import { format } from "date-fns";

interface WelcomeCardProps {
  user?: {
    firstName?: string;
    name?: string;
    email?: string;
    lastLoginAt?: string;
  };
}

export const WelcomeCard: React.FC<WelcomeCardProps> = ({ user }) => {
  const getTimeOfDayGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const getUserName = () => {
    if (user?.firstName) return user.firstName;
    if (user?.name) return user.name.split(" ")[0];
    if (user?.email) return user.email.split("@")[0];
    return "Admin";
  };

  return (
    <Card className="mb-8 bg-gradient-to-r from-navy-500 to-blue-500 text-white shadow-colored">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-1">
              {getTimeOfDayGreeting()}, {getUserName()}! 👋
            </h2>
            <p className="text-blue-100">
              Welcome to your admin dashboard. You have full system access to manage the platform.
            </p>
            <div className="mt-4 flex items-center space-x-6">
              <div>
                <p className="text-sm text-blue-100 font-medium">Platform Status</p>
                <p className="text-lg font-semibold flex items-center">
                  <CheckCircle className="h-5 w-5 mr-1" />
                  All Systems Operational
                </p>
              </div>
              <div className="border-l border-blue-300 pl-6">
                <p className="text-sm text-blue-100 font-medium">Last Login</p>
                <p className="text-lg font-semibold">
                  {user?.lastLoginAt ? format(new Date(user.lastLoginAt), "MMM d, h:mm a") : "First login"}
                </p>
              </div>
            </div>
          </div>
          <div className="hidden md:block">
            <Shield className="h-24 w-24 text-blue-200 opacity-50" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
