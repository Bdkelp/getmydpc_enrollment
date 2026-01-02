/**
 * EPX Hosted Checkout Payment Component
 * Simpler implementation using EPX's hosted payment page
 * Form is handled by EPX's post.js library
 */

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CreditCard, AlertCircle, Loader2, Home } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { apiClient } from '@/lib/apiClient';
import { useToast } from '@/hooks/use-toast';

const DEFAULT_RECAPTCHA_SITE_KEY = '6LflwiQgAAAAAC8yO38mzv-g9a9QiR91Bw4y62ww';
const RECAPTCHA_SITE_KEY = ((import.meta as any)?.env?.VITE_RECAPTCHA_SITE_KEY || DEFAULT_RECAPTCHA_SITE_KEY) as string;

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
  redirectOnSuccess?: boolean;
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
  onError,
  redirectOnSuccess = true
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
  const [registrationData, setRegistrationData] = useState<any>(null);
  const [tempRegistrationId, setTempRegistrationId] = useState<string | null>(null);
  const [paymentAttempts, setPaymentAttempts] = useState(0);
  const { toast } = useToast();
  
  const refreshCaptchaToken = useCallback(async (): Promise<string | null> => {
    if (!RECAPTCHA_SITE_KEY) {
      console.warn('[reCAPTCHA] Site key not configured');
      return null;
    }

    if (!window.grecaptcha || typeof window.grecaptcha.ready !== 'function') {
      throw new Error('reCAPTCHA not ready');
    }

    return new Promise((resolve, reject) => {
      window.grecaptcha.ready(() => {
        window.grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: 'hosted_checkout' })
          .then((token: string) => {
            console.log('[reCAPTCHA] Token acquired');
            setCaptchaToken((prev) => prev || token);
            resolve(token);
          })
          .catch((error: any) => {
            console.error('[reCAPTCHA] Token acquisition failed:', error);
            reject(error);
          });
      });
    });
  }, []);
  
  // Determine which address to use based on checkbox
  const [populatedBillingAddress, setPopulatedBillingAddress] = useState(billingAddress);

  // Load registration data and payment attempts from sessionStorage
  useEffect(() => {
    try {
      const storedRegData = sessionStorage.getItem('registrationData');
      if (storedRegData) {
        setRegistrationData(JSON.parse(storedRegData));
      }
      const storedTempId = sessionStorage.getItem('tempRegistrationId');
      if (storedTempId) {
        setTempRegistrationId(storedTempId);
      }
      
      const attempts = sessionStorage.getItem('paymentAttempts');
      if (attempts) {
        setPaymentAttempts(parseInt(attempts));
      }
    } catch (err) {
      console.error('[EPX] Error loading registration data:', err);
    }
  }, []);

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
    if (sessionData) {
      return;
    }
    
    
    const initSession = async () => {
      try {
        console.log('[EPX Hosted] Initializing payment session');
        
        // Wait for captcha token before creating payment session
        if (!captchaToken) {
          console.log('[EPX Hosted] Waiting for reCAPTCHA token...');
          return;
        }
        
        console.log('[EPX Hosted] Sending reCAPTCHA token to backend');
        
        // Get session data from backend
        const response = await apiClient.post('/api/epx/hosted/create-payment', {
          amount,
          customerId,
          customerEmail,
          customerName,
          planId,
          subscriptionId,
          description: description || 'DPC Subscription Payment',
          billingAddress: populatedBillingAddress,
          captchaToken: captchaToken,
          tempRegistrationId: tempRegistrationId || sessionStorage.getItem('tempRegistrationId') || null
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
  }, [amount, customerId, customerEmail, populatedBillingAddress, captchaToken, sessionData]);

  // Load and execute Google reCAPTCHA v3 to get token
  useEffect(() => {
    if (!RECAPTCHA_SITE_KEY) {
      console.warn('[reCAPTCHA] Site key not configured');
      return;
    }

    const handleReady = () => {
      refreshCaptchaToken().catch((error) => {
        console.error('[reCAPTCHA] Token acquisition failed after load:', error);
      });
    };

    const existingScript = document.querySelector('script[src*="recaptcha/api.js"]') as HTMLScriptElement | null;

    if (!existingScript) {
      const recaptchaScript = document.createElement('script');
      recaptchaScript.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
      recaptchaScript.async = true;
      recaptchaScript.onload = handleReady;
      recaptchaScript.onerror = () => {
        console.error('[reCAPTCHA] Failed to load script');
        setError('Unable to load captcha protection. Please refresh and try again.');
      };
      document.head.appendChild(recaptchaScript);

      return () => {
        recaptchaScript.onload = null;
        recaptchaScript.onerror = null;
      };
    }

    if (window.grecaptcha && typeof window.grecaptcha.ready === 'function') {
      handleReady();
      return;
    }

    existingScript.addEventListener('load', handleReady);
    return () => {
      existingScript.removeEventListener('load', handleReady);
    };
  }, [refreshCaptchaToken, setError]);

  // Setup callback functions
  useEffect(() => {
    // Success callback
    window.epxSuccessCallback = async (msg: string) => {
      console.log('[EPX Hosted] Payment success payload (raw):', msg);
      setError(null);

      const parsedMessage = parseHostedMessage(msg);
      console.log('[EPX Hosted] Parsed success payload:', parsedMessage);
      const tokenFromPayload = extractPaymentToken(parsedMessage);
      const transactionFromPayload = parsedMessage.transactionId || parsedMessage.orderNumber || sessionData?.transactionId;
      const effectiveTempId = tempRegistrationId || sessionStorage.getItem('tempRegistrationId') || null;
      const effectiveRegistration = registrationData || (() => {
        try {
          const stored = sessionStorage.getItem('registrationData');
          return stored ? JSON.parse(stored) : null;
        } catch (storageError) {
          console.warn('[EPX Hosted] Unable to parse stored registration data after payment', storageError);
          return null;
        }
      })();

      if (!tokenFromPayload) {
        console.error('[EPX Hosted] Missing BRIC token in success payload. Parsed message:', parsedMessage);
        setError('Payment succeeded, but no billing token was returned. Please contact support.');
        toast({
          title: 'Payment Received – Action Needed',
          description: 'Payment succeeded, but we could not finalize enrollment automatically. Please contact support.',
          variant: 'destructive'
        });
        return;
      }

      if (!transactionFromPayload) {
        console.error('[EPX Hosted] Missing transaction/order number in success payload');
        setError('Payment succeeded, but transaction details were missing. Please contact support.');
        return;
      }

      setIsLoading(true);

      try {
        await apiClient.post('/api/epx/hosted/complete', {
          transactionId: transactionFromPayload,
          paymentToken: tokenFromPayload,
          paymentMethodType: parsedMessage.paymentMethodType || parsedMessage.PaymentMethodType || 'CreditCard',
          tempRegistrationId: effectiveTempId,
          registrationData: effectiveRegistration,
          authGuid: extractAuthGuid(parsedMessage),
          authCode: parsedMessage.authCode || parsedMessage.AUTH_CODE,
          amount: parsedMessage.amount || amount
        });

        sessionStorage.removeItem('registrationData');
        sessionStorage.removeItem('tempRegistrationId');
        sessionStorage.removeItem('paymentAttempts');

        toast({
          title: 'Payment Successful',
          description: 'Enrollment finalized successfully.'
        });

        if (sessionData?.transactionId && onSuccess) {
          onSuccess(sessionData.transactionId);
        }

        if (redirectOnSuccess !== false) {
          setTimeout(() => {
            const transactionId = transactionFromPayload || sessionData?.transactionId || 'unknown';
            const params = new URLSearchParams({
              transaction: transactionId,
              amount: amount.toFixed(2)
            });
            if (planId) {
              params.append('planId', planId);
            }
            window.location.href = `/confirmation?${params.toString()}`;
          }, 1500);
        }
      } catch (completionError: any) {
        console.error('[EPX Hosted] Failed to finalize enrollment after payment', completionError);
        const message = completionError?.message || 'Payment succeeded, but we could not finalize enrollment. Please try again or contact support.';
        setError(message);
        toast({
          title: 'Finalize Failed',
          description: message,
          variant: 'destructive'
        });
      } finally {
        setIsLoading(false);
      }
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

  const handleSubmit = async () => {
    if (!scriptLoaded || !window.Epx) {
      setError('Payment processor not ready. Please refresh the page.');
      return;
    }

    let latestToken: string | null = null;
    try {
      latestToken = await refreshCaptchaToken();
    } catch (captchaError) {
      console.error('[EPX Hosted] Unable to refresh reCAPTCHA token:', captchaError);
      setError('Unable to verify reCAPTCHA. Please refresh the page and try again.');
      return;
    }

    if (!latestToken) {
      setError('Missing reCAPTCHA token. Please refresh and try again.');
      return;
    }

    const captchaInput = document.querySelector<HTMLInputElement>('#EpxCheckoutForm input[name="Captcha"]');
    if (captchaInput) {
      captchaInput.value = latestToken;
    }

    try {
      console.log('[EPX Hosted] Submitting payment form');
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
          <input type="hidden" name="TerminalProfileId" value={sessionData?.terminalProfileId || ''} />
          <input type="hidden" name="Captcha" value={captchaToken || ''} />
          <input type="hidden" name="SuccessCallback" value="epxSuccessCallback" />
          <input type="hidden" name="FailureCallback" value="epxFailureCallback" />
          <input type="hidden" name="tempRegistrationId" value={tempRegistrationId || ''} />
          
          {/* Payment-First Flow: Include registration data */}
          {registrationData && (
            <>
              <input type="hidden" name="registrationData" value={JSON.stringify(registrationData)} />
              <input type="hidden" name="paymentMethodType" value="CreditCard" />
              <input type="hidden" name="paymentAttempts" value={paymentAttempts.toString()} />
            </>
          )}
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

const EPX_GUID_CANDIDATES = [
  'AUTH_GUID',
  'authGuid',
  'ORIG_AUTH_GUID',
  'origAuthGuid',
  'ORIG_AUTH',
  'origAuth'
];

const EPX_TOKEN_CANDIDATES = [
  'GUID',
  'paymentToken',
  'token',
  'BRIC',
  'BRIC_TOKEN',
  'BRICTOKEN',
  'BRIC_GUID',
  'bricToken',
  'bric_token',
  'BricToken',
  'bricGuid'
];
const GENERIC_TOKEN_KEYS = ['token', 'guid', 'bric', 'payment_token'];
const GUID_PATTERN = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

function parseHostedMessage(message: string): Record<string, any> {
  if (!message) {
    return {};
  }

  if (typeof message === 'object') {
    return message as Record<string, any>;
  }

  try {
    return JSON.parse(message);
  } catch (jsonError) {
    try {
      const params = new URLSearchParams(message);
      const parsed: Record<string, any> = {};
      params.forEach((value, key) => {
        parsed[key] = value;
      });
      if (Object.keys(parsed).length > 0) {
        return parsed;
      }
    } catch (paramError) {
      // Ignore parsing failure – fall through to raw message
    }
  }

  return { rawMessage: message };
}

function extractCandidate(payload: Record<string, any>, candidates: string[]): string | undefined {
  for (const key of candidates) {
    if (payload[key]) {
      return payload[key];
    }
    if (payload.result && payload.result[key]) {
      return payload.result[key];
    }
  }
  return undefined;
}

function findValueByKeyMatch(payload: any, matcher: (key: string) => boolean): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  for (const [key, value] of Object.entries(payload)) {
    if (matcher(key) && typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
    if (typeof value === 'object') {
      const nested = findValueByKeyMatch(value, matcher);
      if (nested) {
        return nested;
      }
    }
  }

  return undefined;
}

function findGuidLikeValue(payload: any): string | undefined {
  if (!payload) {
    return undefined;
  }

  if (typeof payload === 'string') {
    const match = payload.match(GUID_PATTERN);
    return match ? match[0] : undefined;
  }

  if (typeof payload === 'object') {
    for (const value of Object.values(payload)) {
      const candidate = findGuidLikeValue(value);
      if (candidate) {
        return candidate;
      }
    }
  }

  return undefined;
}

function extractAuthGuid(payload: Record<string, any>): string | undefined {
  return (
    extractCandidate(payload, EPX_GUID_CANDIDATES) ||
    findValueByKeyMatch(payload, key => key.toLowerCase().includes('auth_guid') || key.toLowerCase().includes('authguid')) ||
    findGuidLikeValue(payload)
  );
}

function extractPaymentToken(payload: Record<string, any>): string | undefined {
  return (
    extractCandidate(payload, EPX_TOKEN_CANDIDATES) ||
    findValueByKeyMatch(payload, key => GENERIC_TOKEN_KEYS.some(fragment => key.toLowerCase().includes(fragment))) ||
    findGuidLikeValue(payload)
  );
}