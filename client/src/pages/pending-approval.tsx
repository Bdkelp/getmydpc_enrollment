import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Shield, CheckCircle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function PendingApproval() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="relative">
              <Shield className="h-16 w-16 text-medical-blue-600" />
              <Clock className="h-8 w-8 text-yellow-500 absolute -bottom-1 -right-1" />
            </div>
          </div>
          <CardTitle className="text-2xl">Account Pending Approval</CardTitle>
          <CardDescription className="text-lg mt-2">
            Thank you for registering with MyPremierPlans
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center text-gray-600 space-y-4">
            <p>
              Your account has been successfully created and is currently under review by our team.
            </p>
            <p>
              This security measure helps us maintain the quality and safety of our healthcare platform.
            </p>
          </div>
          
          <div className="bg-blue-50 rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              What happens next?
            </h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li>• Our team will review your registration within 1-2 business hours</li>
              <li>• You'll receive an email once your account is approved</li>
              <li>• After approval, you can sign in and complete your enrollment</li>
            </ul>
          </div>
          
          <div className="text-center space-y-4">
            <p className="text-sm text-gray-600">
              Questions? Contact us at{" "}
              <a href="mailto:info@mypremierplans.com" className="text-medical-blue-600 hover:underline">
                info@mypremierplans.com
              </a>
            </p>
            
            <div className="pt-4">
              <Link href="/">
                <Button variant="outline" className="w-full">
                  Return to Home
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}