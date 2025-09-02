import { Link } from 'wouter';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Ban, ArrowLeft, Home } from 'lucide-react';

export default function PaymentCancel() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-slate-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Ban className="h-12 w-12 text-gray-600" />
          </div>
          <CardTitle className="text-2xl text-gray-900">Payment Cancelled</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center space-y-2">
            <p className="text-gray-600">
              Your payment has been cancelled.
            </p>
            <p className="text-sm text-gray-500">
              No charges have been made to your account.
            </p>
          </div>

          <div className="bg-blue-50 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">Ready to continue?</h3>
            <p className="text-sm text-blue-800">
              Your enrollment information has been saved. You can complete your payment anytime to activate your subscription.
            </p>
          </div>

          <div className="space-y-3">
            <Link href="/enroll">
              <Button className="w-full" size="lg">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Enrollment
              </Button>
            </Link>
            <Link href="/">
              <Button variant="outline" className="w-full">
                <Home className="mr-2 h-4 w-4" />
                Return Home
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}