import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import apiClient from '@/lib/apiClient';

export default function PaymentCallback() {
  const [, setLocation] = useLocation();
  const [processing, setProcessing] = useState(true);
  const [status, setStatus] = useState<'processing' | 'success' | 'failed'>('processing');

  useEffect(() => {
    // This page receives the POST from EPX with payment results
    const processPaymentResponse = async () => {
      try {
        // Get form data that EPX posted to this page
        const urlParams = new URLSearchParams(window.location.search);
        const formData: any = {};
        
        // Collect all parameters EPX sent
        for (const [key, value] of urlParams) {
          formData[key] = value;
        }
        
        console.log('[Payment Callback] Received from EPX:', formData);

        // Send to backend for processing
        const response = await apiClient.post('/api/epx/process-callback', formData);
        
        if (response.success) {
          setStatus('success');
          // Redirect to confirmation page
          setTimeout(() => {
            setLocation(`/confirmation?transaction=${formData.TRAN_NBR}&amount=${formData.AUTH_AMOUNT}`);
          }, 1500);
        } else {
          setStatus('failed');
          // Redirect to payment failed page
          setTimeout(() => {
            setLocation(`/payment/failed?reason=${formData.AUTH_RESP || 'Unknown error'}`);
          }, 1500);
        }
      } catch (error) {
        console.error('[Payment Callback] Error processing payment response:', error);
        setStatus('failed');
        setTimeout(() => {
          setLocation('/payment/failed?reason=processing_error');
        }, 1500);
      } finally {
        setProcessing(false);
      }
    };

    processPaymentResponse();
  }, [setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <Card className="max-w-md w-full">
        <CardContent className="p-8">
          <div className="text-center">
            {status === 'processing' && (
              <>
                <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-blue-600" />
                <h2 className="text-xl font-semibold mb-2">Processing Payment</h2>
                <p className="text-gray-600">Please wait while we confirm your payment...</p>
              </>
            )}
            
            {status === 'success' && (
              <>
                <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-600" />
                <h2 className="text-xl font-semibold mb-2">Payment Successful</h2>
                <p className="text-gray-600">Redirecting to confirmation...</p>
              </>
            )}
            
            {status === 'failed' && (
              <>
                <XCircle className="h-12 w-12 mx-auto mb-4 text-red-600" />
                <h2 className="text-xl font-semibold mb-2">Payment Failed</h2>
                <p className="text-gray-600">Redirecting...</p>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}