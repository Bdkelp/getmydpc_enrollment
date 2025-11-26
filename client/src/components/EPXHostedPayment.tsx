/**
 * EPX Hosted Checkout Payment Component
 * Simpler implementation using EPX's hosted payment page
 * Form is handled by EPX's post.js library
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CreditCard, AlertCircle, Loader2, Home } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { apiClient } from '@/lib/apiClient';
import { useToast } from '@/hooks/use-toast';

interface EPXHostedPaymentProps {
  amount: number;
  customerId: string;
  customerEmail: string;
  customerName?: string;
  planId?: string;
  subscriptionId?: string;
  description?: string;
  billingAddress?: {
    streetAddress?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
  onSuccess?: (transactionId: string) => void;
  onError?: (error: string) => void;
}

declare global {
  interface Window {
    Epx: any;
    epxSuccessCallback: (msg: string) => void;
    epxFailureCallback: (msg: string) => void;
    grecaptcha: any;
  }
}

export default function EPXHostedPayment({
  amount,
  customerId,
  customerEmail,
  customerName = 'Customer',
  planId,
  subscriptionId,
  description,
  billingAddress = {},
  onSuccess,
  onError
}: EPXHostedPaymentProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<any>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [sameAsHome, setSameAsHome] = useState(true);
  const [homeAddress, setHomeAddress] = useState<any>(null);
  const [manualBillingAddress, setManualBillingAddress] = useState({
    streetAddress: '',
    city: '',
    state: '',
    postalCode: ''
  });
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const { toast } = useToast();
  
  // Determine which address to use based on checkbox
  const [populatedBillingAddress, setPopulatedBillingAddress] = useState(billingAddress);

  // Load home address from sessionStorage
  useEffect(() => {
    try {
      const storedAddress = sessionStorage.getItem('primaryAddress');
      if (storedAddress) {
        const parsed = JSON.parse(storedAddress);
        const homeAddr = {
          streetAddress: parsed.address || '',
          city: parsed.city || '',
          state: parsed.state || '',
          postalCode: parsed.zipCode || ''
        };
        setHomeAddress(homeAddr);
        
        // If we have a home address and billing wasn't provided, use home address
        if (!billingAddress.streetAddress) {
          setPopulatedBillingAddress(homeAddr);
          setSameAsHome(true);
        } else {
          // Check if provided billing address matches home address
          const matches = billingAddress.streetAddress === homeAddr.streetAddress &&
                         billingAddress.city === homeAddr.city &&
                         billingAddress.state === homeAddr.state &&
                         billingAddress.postalCode === homeAddr.postalCode;
          setSameAsHome(matches);
          if (!matches) {
            setManualBillingAddress({
              streetAddress: billingAddress.streetAddress || '',
              city: billingAddress.city || '',
              state: billingAddress.state || '',
              postalCode: billingAddress.postalCode || ''
            });
          }
        }
      } else if (billingAddress.streetAddress) {
        // No home address in storage, but billing was provided
        setManualBillingAddress({
          streetAddress: billingAddress.streetAddress || '',
          city: billingAddress.city || '',
          state: billingAddress.state || '',
          postalCode: billingAddress.postalCode || ''
        });
        setSameAsHome(false);
      }
    } catch (e) {
      console.log('[EPX Hosted] Could not parse stored address:', e);
    }
  }, [billingAddress]);

  // Update populated address when checkbox changes
  useEffect(() => {
    if (sameAsHome && homeAddress) {
      setPopulatedBillingAddress(homeAddress);
    } else {
      setPopulatedBillingAddress(manualBillingAddress);
    }
  }, [sameAsHome, homeAddress, manualBillingAddress]);

  // Initialize payment session
  useEffect(() => {
    
    const initSession = async () => {
      try {
        console.log('[EPX Hosted] Initializing payment session');
        
        // Get session data from backend
        const response = await apiClient.post('/api/epx/hosted/create-payment', {
          amount,
          customerId,
          customerEmail,
          customerName,
          planId,
          subscriptionId,
          description: description || 'DPC Subscription Payment',
          billingAddress: populatedBillingAddress
        });

        if (!response.success) {
          throw new Error(response.error || 'Failed to create payment session');
        }

        console.log('[EPX Hosted] Session created:', response);
        setSessionData(response);

        // Load EPX script
        if (!scriptLoaded && response.scriptUrl) {
          const script = document.createElement('script');
          script.src = response.scriptUrl;
          script.async = true;
          script.onload = () => {
            console.log('[EPX Hosted] Script loaded successfully');
            setScriptLoaded(true);
            setIsLoading(false);
          };
          script.onerror = () => {
            console.error('[EPX Hosted] Failed to load EPX script');
            setError('Failed to load payment processor');
            setIsLoading(false);
          };
          document.head.appendChild(script);
        } else {
          setIsLoading(false);
        }
      } catch (err: any) {
        console.error('[EPX Hosted] Initialization error:', err);
        setError(err.message || 'Failed to initialize payment');
        setIsLoading(false);
      }
    };

    initSession();
  }, [amount, customerId, customerEmail, populatedBillingAddress]);

  // Load and execute Google reCAPTCHA v3 to get token
  useEffect(() => {
    const siteKey = (import.meta as any).env?.VITE_RECAPTCHA_SITE_KEY || '6LflwiQgAAAAAC8yO38mzv-g9a9QiR91Bw4y62ww';
    if (!siteKey) {
      console.warn('[reCAPTCHA] Site key not configured');
      return;
    }

    // Load the reCAPTCHA script if not already loaded
    const existing = document.querySelector('script[src*="recaptcha/api.js"]');
    if (!existing) {
      const recaptchaScript = document.createElement('script');
      recaptchaScript.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
      recaptchaScript.async = true;
      recaptchaScript.onload = () => {
        if (window.grecaptcha && window.grecaptcha.ready) {
          window.grecaptcha.ready(() => {
            window.grecaptcha.execute(siteKey, { action: 'hosted_checkout' }).then((token: string) => {
              console.log('[reCAPTCHA] Token acquired');
              setCaptchaToken(token);
            }).catch((e: any) => {
              console.error('[reCAPTCHA] Token acquisition failed:', e);
            });
          });
        } else {
          console.warn('[reCAPTCHA] grecaptcha not ready');
        }
      };
      recaptchaScript.onerror = () => {
        console.error('[reCAPTCHA] Failed to load script');
      };
      document.head.appendChild(recaptchaScript);
    } else if (window.grecaptcha && window.grecaptcha.ready) {
      window.grecaptcha.ready(() => {
        window.grecaptcha.execute(siteKey, { action: 'hosted_checkout' }).then((token: string) => {
          console.log('[reCAPTCHA] Token acquired');
          setCaptchaToken(token);
        }).catch((e: any) => {
          console.error('[reCAPTCHA] Token acquisition failed:', e);
        });
      });
    }
  }, []);

  // Setup callback functions
  useEffect(() => {
    // Success callback
    window.epxSuccessCallback = (msg: string) => {
      console.log('[EPX Hosted] Payment success:', msg);
      toast({
        title: "Payment Successful",
        description: "Your payment has been processed successfully."
      });
      
      if (sessionData?.transactionId && onSuccess) {
        onSuccess(sessionData.transactionId);
      }

      // Redirect to confirmation page with transaction details
      // Include planId so confirmation can show plan details even if sessionStorage cleared
      setTimeout(() => {
        const transactionId = sessionData?.transactionId || 'unknown';
        const params = new URLSearchParams({
          transaction: transactionId,
          amount: amount.toFixed(2)
        });
        
        // Add planId if available (won't affect EPX - this is our internal redirect)
        if (planId) {
          params.append('planId', planId);
        }
        
        window.location.href = `/confirmation?${params.toString()}`;
      }, 2000);
    };

    // Failure callback
    window.epxFailureCallback = (msg: string) => {
      console.error('[EPX Hosted] Payment failed:', msg);
      setError(msg || 'Payment failed');
      toast({
        title: "Payment Failed",
        description: msg || "There was an error processing your payment.",
        variant: "destructive"
      });
      
      if (onError) {
        onError(msg);
      }
    };

    return () => {
      // Cleanup
      if (window.epxSuccessCallback) {
        window.epxSuccessCallback = undefined as any;
      }
      if (window.epxFailureCallback) {
        window.epxFailureCallback = undefined as any;
      }
    };
  }, [sessionData, onSuccess, onError]);

  const handleSubmit = () => {
    if (!scriptLoaded || !window.Epx) {
      setError('Payment processor not ready. Please refresh the page.');
      return;
    }

    try {
      console.log('[EPX Hosted] Submitting payment form');
      // Call EPX's sendPost method
      window.Epx.sendPost();
    } catch (err: any) {
      console.error('[EPX Hosted] Submit error:', err);
      setError('Failed to submit payment');
    }
  };

  if (isLoading) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin mr-2" />
          <span>Initializing secure payment...</span>
        </CardContent>
      </Card>
    );
  }

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

        {/* EPX Hosted Checkout Form */}
        <form id="EpxCheckoutForm" name="EpxCheckoutForm" className="space-y-4">
          {/* Card Number */}
          <div>
            <Label htmlFor="PAN">Card Number</Label>
            <Input
              type="text"
              id="PAN"
              name="PAN"
              placeholder="1234 5678 9012 3456"
              className="font-mono"
              required
            />
          </div>

          {/* Expiry */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="Expire">Expiry (MMYY)</Label>
              <Input
                type="text"
                id="Expire"
                name="Expire"
                placeholder="0826"
                maxLength={4}
                required
              />
            </div>
            <div>
              <Label htmlFor="CVV">CVV</Label>
              <Input
                type="text"
                id="CVV"
                name="CVV"
                placeholder="123"
                maxLength={4}
                required
              />
            </div>
          </div>

          {/* Billing Name */}
          <div>
            <Label htmlFor="BillingName">Billing Name</Label>
            <Input
              type="text"
              id="BillingName"
              name="BillingName"
              defaultValue={customerName}
              required
            />
          </div>

          {/* Email */}
          <div>
            <Label htmlFor="Email">Email</Label>
            <Input
              type="email"
              id="Email"
              name="Email"
              defaultValue={customerEmail}
              required
            />
          </div>

          {/* Billing Address Section */}
          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="sameAsHome"
                checked={sameAsHome}
                onCheckedChange={(checked) => setSameAsHome(checked as boolean)}
              />
              <Label 
                htmlFor="sameAsHome" 
                className="flex items-center gap-2 cursor-pointer font-medium"
              >
                <Home className="h-4 w-4" />
                Billing address same as home address
              </Label>
            </div>

            {/* Street Address */}
            <div>
              <Label htmlFor="BillingStreetAddress">Street Address</Label>
              <Input
                type="text"
                id="BillingStreetAddress"
                name="BillingStreetAddress"
                value={sameAsHome && homeAddress ? homeAddress.streetAddress : manualBillingAddress.streetAddress}
                onChange={(e) => !sameAsHome && setManualBillingAddress({...manualBillingAddress, streetAddress: e.target.value})}
                readOnly={sameAsHome && !!homeAddress}
                className={sameAsHome && homeAddress ? "bg-gray-50" : ""}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="BillingCity">City</Label>
                <Input
                  type="text"
                  id="BillingCity"
                  name="BillingCity"
                  value={sameAsHome && homeAddress ? homeAddress.city : manualBillingAddress.city}
                  onChange={(e) => !sameAsHome && setManualBillingAddress({...manualBillingAddress, city: e.target.value})}
                  readOnly={sameAsHome && !!homeAddress}
                  className={sameAsHome && homeAddress ? "bg-gray-50" : ""}
                  required
                />
              </div>
              <div>
                <Label htmlFor="BillingState">State</Label>
                <Input
                  type="text"
                  id="BillingState"
                  name="BillingState"
                  value={sameAsHome && homeAddress ? homeAddress.state : manualBillingAddress.state}
                  onChange={(e) => !sameAsHome && setManualBillingAddress({...manualBillingAddress, state: e.target.value})}
                  readOnly={sameAsHome && !!homeAddress}
                  className={sameAsHome && homeAddress ? "bg-gray-50" : ""}
                  maxLength={2}
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="BillingPostalCode">Postal Code</Label>
              <Input
                type="text"
                id="BillingPostalCode"
                name="BillingPostalCode"
                value={sameAsHome && homeAddress ? homeAddress.postalCode : manualBillingAddress.postalCode}
                onChange={(e) => !sameAsHome && setManualBillingAddress({...manualBillingAddress, postalCode: e.target.value})}
                readOnly={sameAsHome && !!homeAddress}
                className={sameAsHome && homeAddress ? "bg-gray-50" : ""}
                required
              />
            </div>
          </div>

          {/* Hidden fields - Required by EPX Hosted Checkout */}
          <input type="hidden" name="Amount" value={amount.toFixed(2)} />
          <input type="hidden" name="OrderNumber" value={sessionData?.transactionId || ''} />
          <input type="hidden" name="InvoiceNumber" value={sessionData?.transactionId || ''} />
          <input type="hidden" name="PublicKey" value={sessionData?.publicKey || ''} />
          <input type="hidden" name="Captcha" value={captchaToken || sessionData?.captcha || ''} />
          <input type="hidden" name="SuccessCallback" value="epxSuccessCallback" />
          <input type="hidden" name="FailureCallback" value="epxFailureCallback" />
        </form>

        {/* Submit Button */}
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!scriptLoaded}
          className="w-full"
        >
          {scriptLoaded ? 'Process Payment' : 'Loading...'}
        </Button>

        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <CreditCard className="h-3 w-3" />
          <span>Secure payment processed by EPX</span>
        </div>
      </CardContent>
    </Card>
  );
}