import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CreditCard, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface EPXPaymentProps {
  amount: number;
  customerId: string;
  customerEmail: string;
  planId?: string;
  subscriptionId?: string;
  description?: string;
  onSuccess?: (transactionId: string) => void;
  onError?: (error: string) => void;
  onCancel?: () => void;
}

export function EPXPayment({
  amount,
  customerId,
  customerEmail,
  planId,
  subscriptionId,
  description,
  onSuccess,
  onError,
  onCancel
}: EPXPaymentProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleBrowserPostPayment = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Create payment session with EPX
      const response = await fetch('/api/epx/create-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          amount,
          customerId,
          customerEmail,
          planId,
          subscriptionId,
          description: description || 'DPC Subscription Payment'
        })
      });

      const data = await response.json();

      if (!data.success || !data.formData) {
        throw new Error(data.error || 'Failed to create payment session');
      }

      // Create and submit the form to EPX
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = data.formData.actionUrl;
      form.target = '_self'; // Navigate in same window

      // Add all form fields
      const fields = {
        'TAC': data.formData.tac,
        'TRAN_CODE': data.formData.tranCode,
        'TRAN_GROUP': data.formData.tranGroup,
        'AMOUNT': data.formData.amount.toFixed(2),
        'TRAN_NBR': data.formData.tranNbr,
        'REDIRECT_URL': data.formData.redirectUrl,
        'RESPONSE_URL': data.formData.responseUrl,
        'REDIRECT_ECHO': data.formData.redirectEcho,
        'RESPONSE_ECHO': data.formData.responseEcho,
        'RECEIPT': data.formData.receipt
      };

      if (data.formData.cancelUrl) {
        fields['CANCEL_URL'] = data.formData.cancelUrl;
      }

      Object.entries(fields).forEach(([key, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = String(value);
        form.appendChild(input);
      });

      // Append form to body and submit
      document.body.appendChild(form);
      form.submit();
      
      // Form will redirect to EPX, so we don't need to clean up here
    } catch (err: any) {
      console.error('[EPX Payment] Error:', err);
      setError(err.message || 'Payment initialization failed');
      setIsLoading(false);
      
      toast({
        title: "Payment Error",
        description: err.message || 'Failed to initialize payment',
        variant: "destructive"
      });
      
      if (onError) {
        onError(err.message);
      }
    }
  };

  const handleHostedCheckout = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Get hosted checkout configuration
      const response = await fetch('/api/epx/checkout-config', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();

      if (!data.success || !data.config) {
        throw new Error(data.error || 'Failed to get checkout configuration');
      }

      // Load EPX hosted checkout script
      const script = document.createElement('script');
      script.src = data.config.scriptUrl;
      script.async = true;
      script.onload = () => {
        // Initialize hosted checkout
        if ((window as any).EPXHostedCheckout) {
          (window as any).EPXHostedCheckout.init({
            checkoutId: data.config.checkoutId,
            amount: amount,
            customerEmail: customerEmail,
            onSuccess: (result: any) => {
              toast({
                title: "Payment Successful",
                description: "Your payment has been processed successfully"
              });
              if (onSuccess) {
                onSuccess(result.transactionId);
              }
            },
            onError: (error: any) => {
              setError(error.message || 'Payment failed');
              if (onError) {
                onError(error.message);
              }
            },
            onCancel: () => {
              if (onCancel) {
                onCancel();
              }
            }
          });
        } else {
          throw new Error('Failed to load EPX checkout');
        }
      };
      script.onerror = () => {
        setError('Failed to load payment provider');
        setIsLoading(false);
      };
      
      document.body.appendChild(script);
    } catch (err: any) {
      console.error('[EPX Hosted Checkout] Error:', err);
      setError(err.message || 'Checkout initialization failed');
      setIsLoading(false);
      
      toast({
        title: "Checkout Error",
        description: err.message || 'Failed to initialize checkout',
        variant: "destructive"
      });
      
      if (onError) {
        onError(err.message);
      }
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Secure Payment
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center">
          <p className="text-2xl font-bold">${amount.toFixed(2)}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {description || 'DPC Subscription Payment'}
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <Button 
            onClick={handleBrowserPostPayment}
            disabled={isLoading}
            className="w-full"
            size="lg"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CreditCard className="mr-2 h-4 w-4" />
                Pay with Card
              </>
            )}
          </Button>

          <Button 
            onClick={handleHostedCheckout}
            disabled={isLoading}
            variant="outline"
            className="w-full"
            size="lg"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading Checkout...
              </>
            ) : (
              'Use Hosted Checkout'
            )}
          </Button>

          {onCancel && (
            <Button 
              onClick={onCancel}
              disabled={isLoading}
              variant="ghost"
              className="w-full"
            >
              Cancel
            </Button>
          )}
        </div>

        <div className="text-xs text-center text-muted-foreground">
          <p>Your payment information is secure and encrypted.</p>
          <p className="mt-1">Powered by North.com EPx</p>
        </div>
      </CardContent>
    </Card>
  );
}