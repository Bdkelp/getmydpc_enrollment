import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Phone, Mail, ShieldX } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function NoAccess() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <ShieldX className="h-12 w-12 text-red-500" />
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">
            No Dashboard Access
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center text-gray-600">
            <p className="mb-2">
              Welcome, {user?.firstName || user?.email}!
            </p>
            <p>
              Member dashboard access is not currently available. Please contact your agent or customer service for assistance with your account.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center space-x-3 text-gray-700">
              <Phone className="h-5 w-5 text-medical-blue-600" />
              <span className="font-semibold">210-512-4318</span>
            </div>
            
            <div className="flex items-center space-x-3 text-gray-700">
              <Mail className="h-5 w-5 text-medical-blue-600" />
              <a href="mailto:info@mypremierplans.com" className="hover:text-medical-blue-600">
                info@mypremierplans.com
              </a>
            </div>
          </div>

          <div className="flex flex-col space-y-3">
            <Link href="/">
              <Button className="w-full bg-medical-blue-600 hover:bg-medical-blue-700 text-white">
                Return to Home
              </Button>
            </Link>
            
            <Button 
              variant="outline" 
              className="w-full"
              onClick={async () => {
                await logout({ redirectTo: "/", redirectMode: "assign" });
              }}
            >
              Log Out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}