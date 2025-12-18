import { useEffect, useState } from 'react';
import { useLocation, Link } from 'wouter';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { XCircle, RefreshCw, Home, HelpCircle } from 'lucide-react';

export default function PaymentFailed() {
  const [location] = useLocation();
  const [, setLocation] = useLocation();
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [paymentAttempts, setPaymentAttempts] = useState(0);
  const [hasRegistrationData, setHasRegistrationData] = useState(false);
  const MAX_ATTEMPTS = 3;

  useEffect(() => {
    // Parse URL parameters
    const params = new URLSearchParams(window.location.search);
    const txn = params.get('transaction');
    const rsn = params.get('reason');
    
    if (txn) setTransactionId(txn);
    if (rsn) setReason(rsn);

    // Check payment attempts
    const attempts = parseInt(sessionStorage.getItem('paymentAttempts') || '0');
    setPaymentAttempts(attempts);

    // Increment attempt counter
    const newAttempts = attempts + 1;
    sessionStorage.setItem('paymentAttempts', newAttempts.toString());
    setPaymentAttempts(newAttempts);

    // Check if we have registration data
    const regData = sessionStorage.getItem('registrationData');
    setHasRegistrationData(!!regData);
  }, [location]);

  const handleTryAgain = () => {
    if (paymentAttempts >= MAX_ATTEMPTS) {
      // Clear sessionStorage and start over
      sessionStorage.removeItem('registrationData');
      sessionStorage.removeItem('paymentAttempts');
      sessionStorage.removeItem('selectedPlanId');
      sessionStorage.removeItem('memberData');
      sessionStorage.removeItem('tempRegistrationId');
      setLocation('/enroll');
    } else {
      // Retry payment with existing registration data
      setLocation('/payment');
    }
  };

  const handleStartOver = () => {
    // Clear all session data
    sessionStorage.removeItem('registrationData');
    sessionStorage.removeItem('paymentAttempts');
    sessionStorage.removeItem('selectedPlanId');
    sessionStorage.removeItem('memberData');
    sessionStorage.removeItem('coverageType');
    sessionStorage.removeItem('familyMembers');
    sessionStorage.removeItem('tempRegistrationId');
    setLocation('/enroll');
  };

  const getErrorMessage = (reason: string | null) => {
    if (!reason) return 'Your payment could not be processed.';
    
    switch (reason.toUpperCase()) {
      case 'DECLINE':
        return 'Your card was declined. Please check your card details or try a different payment method.';
      case 'INSUFFICIENT_FUNDS':
        return 'Insufficient funds. Please ensure you have enough balance or try a different card.';
      case 'EXPIRED_CARD':
        return 'Your card has expired. Please use a different card.';
      case 'INVALID_CARD':
        return 'Invalid card information. Please check your card details and try again.';
      case 'CANCELLED':
        return 'Payment was cancelled. You can try again when you\'re ready.';
      default:
        return 'Your payment could not be processed. Please try again or contact support.';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="h-12 w-12 text-red-600" />
          </div>
          <CardTitle className="text-2xl text-red-900">Payment Failed</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert variant="destructive">
            <AlertDescription>
              {getErrorMessage(reason)}
            </AlertDescription>
          </Alert>

          {transactionId && (
            <p className="text-sm text-gray-500 text-center">
              Reference: {transactionId}
            </p>
          )}

          {/* Payment attempt counter */}
          {hasRegistrationData && (
            <Alert>
              <AlertDescription className="text-center">
                Payment attempt {paymentAttempts} of {MAX_ATTEMPTS}
                {paymentAttempts >= MAX_ATTEMPTS && (
                  <span className="block mt-2 font-semibold text-orange-700">
                    Maximum attempts reached. Please start over with a new enrollment.
                  </span>
                )}
              </AlertDescription>
            </Alert>
          )}

          <div className="bg-orange-50 rounded-lg p-4">
            <h3 className="font-semibold text-orange-900 mb-2">What can you do?</h3>
            <ul className="space-y-2 text-sm text-orange-800">
              <li className="flex items-start gap-2">
                <span className="text-orange-600 mt-0.5">•</span>
                <span>Verify your card information is correct</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-600 mt-0.5">•</span>
                <span>Ensure you have sufficient funds</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-600 mt-0.5">•</span>
                <span>Try a different payment method</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-600 mt-0.5">•</span>
                <span>Contact your bank if the issue persists</span>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            {hasRegistrationData && paymentAttempts < MAX_ATTEMPTS && (
              <Button onClick={handleTryAgain} className="w-full" size="lg">
                <RefreshCw className="mr-2 h-4 w-4" />
                Try Again ({MAX_ATTEMPTS - paymentAttempts} {MAX_ATTEMPTS - paymentAttempts === 1 ? 'attempt' : 'attempts'} remaining)
              </Button>
            )}

            {hasRegistrationData && paymentAttempts >= MAX_ATTEMPTS && (
              <Button onClick={handleStartOver} variant="destructive" className="w-full" size="lg">
                <RefreshCw className="mr-2 h-4 w-4" />
                Start Over (New Enrollment)
              </Button>
            )}

            {!hasRegistrationData && (
              <Link href="/enroll">
                <Button className="w-full" size="lg">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Try Again
                </Button>
              </Link>
            )}

            <Link href="/">
              <Button variant="outline" className="w-full">
                <Home className="mr-2 h-4 w-4" />
                Return Home
              </Button>
            </Link>
            <Link href="/contact">
              <Button variant="ghost" className="w-full">
                <HelpCircle className="mr-2 h-4 w-4" />
                Contact Support
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}