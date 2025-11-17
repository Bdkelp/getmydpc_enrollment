import { useEffect, useState } from 'react';
import { useLocation, Link } from 'wouter';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Home, FileText } from 'lucide-react';

export default function PaymentSuccess() {
  const [location] = useLocation();
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [amount, setAmount] = useState<string | null>(null);

  useEffect(() => {
    // Parse URL parameters
    const params = new URLSearchParams(window.location.search);
    const txn = params.get('transaction');
    const amt = params.get('amount');
    if (txn) setTransactionId(txn);
    if (amt) setAmount(amt);

    // Redirect to confirmation after 3 seconds
    const timer = setTimeout(() => {
      window.location.href = '/confirmation';
    }, 3000);
    return () => clearTimeout(timer);
  }, [location]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-12 w-12 text-green-600" />
          </div>
          <CardTitle className="text-2xl text-green-900">Payment Successful!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center space-y-2">
            <p className="text-gray-600">
              Your payment has been processed successfully.
            </p>
            {amount && (
              <p className="text-2xl font-bold text-gray-900">
                ${parseFloat(amount).toFixed(2)}
              </p>
            )}
            {transactionId && (
              <p className="text-sm text-gray-500">
                Transaction ID: {transactionId}
              </p>
            )}
          </div>

          <div className="bg-green-50 rounded-lg p-4">
            <h3 className="font-semibold text-green-900 mb-2">What's Next?</h3>
            <ul className="space-y-2 text-sm text-green-800">
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-0.5">✓</span>
                <span>You'll receive a confirmation email shortly</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-0.5">✓</span>
                <span>Your subscription is now active</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-0.5">✓</span>
                <span>Access your benefits in your dashboard</span>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <Link href="/dashboard">
              <Button className="w-full" size="lg">
                <Home className="mr-2 h-4 w-4" />
                Go to Dashboard
              </Button>
            </Link>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => window.print()}
            >
              <FileText className="mr-2 h-4 w-4" />
              Download Receipt
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}