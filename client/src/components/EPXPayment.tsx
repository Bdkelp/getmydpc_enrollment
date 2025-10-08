import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CreditCard, AlertCircle, Building2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import apiClient from '@/lib/apiClient';

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
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'ach'>('card');
  const [achData, setAchData] = useState({
    routingNumber: '',
    accountNumber: '',
    accountType: 'checking' as 'checking' | 'savings',
    accountName: ''
  });
  const { toast } = useToast();

  const handleBrowserPostPayment = async () => {
    // Validate ACH data if using ACH
    if (paymentMethod === 'ach') {
      if (!achData.routingNumber || achData.routingNumber.length !== 9) {
        setError('Please enter a valid 9-digit routing number');
        return;
      }
      if (!achData.accountNumber || achData.accountNumber.length < 4) {
        setError('Please enter a valid account number');
        return;
      }
      if (!achData.accountName) {
        setError('Please enter the account holder name');
        return;
      }
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get current Supabase session for auth token
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        console.error('[EPX Payment] No auth session available:', sessionError);
        setError('Authentication required. Please sign in again.');
        setIsLoading(false);
        return;
      }

      // Create payment session with EPX
      console.log('[EPX Payment] Creating payment session for amount:', amount);

      const data = await apiClient.post('/api/epx/create-payment', {
        amount,
        customerId,
        customerEmail,
        planId,
        subscriptionId,
        description: description || 'DPC Subscription Payment',
        paymentMethod,
        ...(paymentMethod === 'ach' && {
          achRoutingNumber: achData.routingNumber,
          achAccountNumber: achData.accountNumber,
          achAccountType: achData.accountType,
          achAccountName: achData.accountName
        })
      });
      console.log('[EPX Payment] Response data:', data);

      if (!data.success || !data.formData) {
        throw new Error(data.error || 'Failed to create payment session');
      }

      // Log the complete transaction POST details BEFORE form creation
      console.log('[EPX Payment] === RAW TRANSACTION POST ===');
      console.log('[EPX Payment] URL:', data.formData.actionUrl);
      console.log('[EPX Payment] Method: POST');
      console.log('[EPX Payment] Transaction Data:', {
        amount: data.formData.amount,
        tranNbr: data.formData.tranNbr,
        tranCode: data.formData.tranCode,
        paymentMethod,
        hasAchData: paymentMethod === 'ach' ? !!achData.routingNumber : false
      });
      console.log('[EPX Payment] === END TRANSACTION POST ===');

      // Create and submit the form to EPX
      console.log('[EPX Payment] Creating form for submission to:', data.formData.actionUrl);

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = data.formData.actionUrl;
      form.target = '_self'; // Navigate in same window

      // Add all form fields - EPX requires UPPERCASE field names
      // CRITICAL: Do NOT include RESPONSE_URL or RESPONSE_ECHO in Browser Post
      const fields: any = {
        'TAC': data.formData.TAC,
        'CUST_NBR': data.formData.CUST_NBR,
        'MERCH_NBR': data.formData.MERCH_NBR,
        'DBA_NBR': data.formData.DBA_NBR,
        'TERMINAL_NBR': data.formData.TERMINAL_NBR,
        'TRAN_CODE': data.formData.TRAN_CODE,
        'TRAN_GROUP': data.formData.TRAN_GROUP,
        'AMOUNT': data.formData.AMOUNT.toFixed ? data.formData.AMOUNT.toFixed(2) : data.formData.AMOUNT,
        'TRAN_NBR': data.formData.TRAN_NBR,
        'REDIRECT_URL': data.formData.REDIRECT_URL,
        'REDIRECT_ECHO': data.formData.REDIRECT_ECHO,
        'INDUSTRY_TYPE': data.formData.INDUSTRY_TYPE,
        'BATCH_ID': data.formData.BATCH_ID,
        'RECEIPT': data.formData.RECEIPT
      };

      // Add ACH fields if using ACH with correct EPX field names
      if (paymentMethod === 'ach') {
        fields['PAYMENT_TYPE'] = 'ACH';
        fields['ACH_ROUTING_NBR'] = achData.routingNumber;
        fields['ACH_ACCOUNT_NBR'] = achData.accountNumber;
        fields['ACH_ACCOUNT_TYPE'] = achData.accountType.toUpperCase();
        fields['ACH_ACCOUNT_NAME'] = achData.accountName;
      }

      if (data.formData.CANCEL_URL) {
        fields['CANCEL_URL'] = data.formData.CANCEL_URL;
      }

      // Additional fields are now included in the main fields object above

      // Add AVS information if available
      if (data.formData.ZIP_CODE) {
        fields['ZIP_CODE'] = data.formData.ZIP_CODE;
      }
      if (data.formData.ADDRESS) {
        fields['ADDRESS'] = data.formData.ADDRESS;
      }

      Object.entries(fields).forEach(([key, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = String(value);
        form.appendChild(input);
      });

      console.log('[EPX Payment] Form fields being submitted:', {
        actionUrl: form.action,
        method: form.method,
        fieldsCount: Object.keys(fields).length,
        fields: { ...fields, TAC: '***MASKED***' } // Mask sensitive data
      });

      // Log the complete transaction POST details
      console.log('[EPX Payment] === RAW TRANSACTION POST ===');
      console.log('[EPX Payment] URL:', form.action);
      console.log('[EPX Payment] Method:', form.method);
      console.log('[EPX Payment] Form Data:', Object.entries(fields).map(([key, value]) => 
        `${key}=${key === 'TAC' ? '***MASKED***' : value}`
      ).join('&'));
      console.log('[EPX Payment] === END TRANSACTION POST ===');

      // Append form to body and submit
      document.body.appendChild(form);
      console.log('[EPX Payment] Submitting form to EPX...');

      // Add a small delay to ensure logging completes before redirect
      setTimeout(() => {
        console.log('[EPX Payment] Form submission initiated - redirecting to EPX payment page');
        form.submit();
      }, 100);

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

  // Browser Post API only - no hosted checkout needed

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

        {/* Payment Method Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setPaymentMethod('card')}
            className={`flex-1 py-2 px-4 rounded-lg border transition-colors ${
              paymentMethod === 'card' 
                ? 'bg-blue-50 border-blue-500 text-blue-700' 
                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <CreditCard className="h-4 w-4 inline mr-2" />
            Card
          </button>
          <button
            onClick={() => setPaymentMethod('ach')}
            className={`flex-1 py-2 px-4 rounded-lg border transition-colors ${
              paymentMethod === 'ach' 
                ? 'bg-blue-50 border-blue-500 text-blue-700' 
                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Building2 className="h-4 w-4 inline mr-2" />
            Bank Account
          </button>
        </div>

        {/* ACH Form Fields */}
        {paymentMethod === 'ach' && (
          <div className="space-y-3 mb-4 p-4 bg-gray-50 rounded-lg">
            <div>
              <Label htmlFor="account-name">
                Account Holder Name
              </Label>
              <Input
                id="account-name"
                type="text"
                value={achData.accountName}
                onChange={(e) => setAchData({ ...achData, accountName: e.target.value })}
                placeholder="John Doe"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="routing-number">
                Routing Number
              </Label>
              <Input
                id="routing-number"
                type="text"
                value={achData.routingNumber}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 9);
                  setAchData({ ...achData, routingNumber: value });
                }}
                placeholder="123456789"
                maxLength={9}
                className="mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">9-digit routing number</p>
            </div>

            <div>
              <Label htmlFor="account-number">
                Account Number
              </Label>
              <Input
                id="account-number"
                type="text"
                value={achData.accountNumber}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 17);
                  setAchData({ ...achData, accountNumber: value });
                }}
                placeholder="Account number"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="account-type">
                Account Type
              </Label>
              <Select 
                value={achData.accountType} 
                onValueChange={(value: 'checking' | 'savings') => setAchData({ ...achData, accountType: value })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select account type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="checking">Checking</SelectItem>
                  <SelectItem value="savings">Savings</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Alert className="mt-3">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                By providing your bank account information, you authorize us to debit your account for the subscription amount.
              </AlertDescription>
            </Alert>
          </div>
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
                Processing Payment...
              </>
            ) : (
              <>
                {paymentMethod === 'card' ? (
                  <><CreditCard className="mr-2 h-4 w-4" />Pay with Card</>
                ) : (
                  <><Building2 className="mr-2 h-4 w-4" />Process ACH Payment</>
                )}
              </>
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
          {paymentMethod === 'ach' && (
            <p className="mt-1 text-amber-600">
              ACH payments may take 3-5 business days to process.
            </p>
          )}
          <p className="mt-1">Secure Browser Post Payment • Powered by North.com EPx</p>
        </div>
      </CardContent>
    </Card>
  );
}