/**
 * Bank Account Form Component
 * For ACH payment collection - "quiet" option, not prominently displayed
 * Used for group enrollments or when member doesn't have credit/debit card
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, University, AlertCircle, Info } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';

interface BankAccountFormProps {
  amount: number;
  customerId: string;
  customerEmail: string;
  customerName?: string;
  description?: string;
  onSuccess?: (transactionId?: string | null, amount?: number) => void;
  onError?: (error: string) => void;
  redirectOnSuccess?: boolean;
}

export default function BankAccountForm({
  amount,
  customerId,
  customerEmail,
  customerName = 'Customer',
  description,
  onSuccess,
  onError,
  redirectOnSuccess = true
}: BankAccountFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    routingNumber: '',
    accountNumber: '',
    confirmAccountNumber: '',
    accountType: 'Checking' as 'Checking' | 'Savings',
    accountHolderName: customerName || ''
  });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const { toast } = useToast();

  // Update account holder name when customerName changes
  useEffect(() => {
    if (customerName && !formData.accountHolderName) {
      setFormData(prev => ({ ...prev, accountHolderName: customerName }));
    }
  }, [customerName]);

  /**
   * Validate ABA routing number using checksum algorithm
   * https://en.wikipedia.org/wiki/Routing_transit_number#Check_digit
   */
  const validateRoutingNumber = (routing: string): boolean => {
    if (routing.length !== 9 || !/^\d{9}$/.test(routing)) {
      return false;
    }

    const digits = routing.split('').map(Number);
    const checksum = (
      3 * (digits[0] + digits[3] + digits[6]) +
      7 * (digits[1] + digits[4] + digits[7]) +
      (digits[2] + digits[5] + digits[8])
    ) % 10;

    return checksum === 0;
  };

  /**
   * Validate form fields
   */
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    // Routing number validation
    if (!formData.routingNumber) {
      errors.routingNumber = 'Routing number is required';
    } else if (!validateRoutingNumber(formData.routingNumber)) {
      errors.routingNumber = 'Invalid routing number (9 digits required)';
    }

    // Account number validation
    if (!formData.accountNumber) {
      errors.accountNumber = 'Account number is required';
    } else if (formData.accountNumber.length < 4 || formData.accountNumber.length > 17) {
      errors.accountNumber = 'Account number must be 4-17 digits';
    } else if (!/^\d+$/.test(formData.accountNumber)) {
      errors.accountNumber = 'Account number must contain only digits';
    }

    // Confirm account number validation
    if (!formData.confirmAccountNumber) {
      errors.confirmAccountNumber = 'Please confirm your account number';
    } else if (formData.accountNumber !== formData.confirmAccountNumber) {
      errors.confirmAccountNumber = 'Account numbers do not match';
    }

    // Account holder name validation
    if (!formData.accountHolderName) {
      errors.accountHolderName = 'Account holder name is required';
    } else if (formData.accountHolderName.length < 2) {
      errors.accountHolderName = 'Name must be at least 2 characters';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  /**
   * Handle form field changes
   */
  const handleFieldChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear validation error for this field
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const updated = { ...prev };
        delete updated[field];
        return updated;
      });
    }
  };

  /**
   * Handle form submission
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast({
        title: "Validation Error",
        description: "Please correct the errors in the form",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Call backend ACH payment endpoint
      const response = await fetch('/api/payments/ach/initial', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          memberId: customerId,
          amount,
          routingNumber: formData.routingNumber,
          accountNumber: formData.accountNumber,
          accountType: formData.accountType,
          accountHolderName: formData.accountHolderName
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        // Handle expected "not yet implemented" response
        if (response.status === 501) {
          toast({
            title: "Feature Coming Soon",
            description: data.message || "ACH payment processing is being finalized. Please contact support for assistance.",
            variant: "default"
          });
        } else {
          throw new Error(data.error || 'ACH payment failed');
        }
        
        if (onError) {
          onError(data.error || "ACH payment processing is not yet available");
        }
        return;
      }

      // Success!
      toast({
        title: "Payment Submitted",
        description: "Your ACH payment is being processed. This typically takes 3-5 business days.",
      });

      if (onSuccess) {
        onSuccess(data.transactionId, amount);
      }

      if (redirectOnSuccess) {
        window.location.href = '/confirmation';
      }

    } catch (err: any) {
      const errorMessage = err.message || 'Failed to process ACH payment';
      setError(errorMessage);
      toast({
        title: "Payment Error",
        description: errorMessage,
        variant: "destructive"
      });
      if (onError) {
        onError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <University className="w-5 h-5" />
          Bank Account Payment
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* ACH Processing Notice */}
        <Alert className="mb-4">
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>ACH Processing:</strong> Bank account payments typically take 3-5 business days to process. 
            You'll receive a confirmation email once your payment is complete.
          </AlertDescription>
        </Alert>

        {/* Error Display */}
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Bank Account Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Routing Number */}
          <div className="space-y-2">
            <Label htmlFor="routingNumber">
              Routing Number <span className="text-red-500">*</span>
            </Label>
            <Input
              id="routingNumber"
              type="text"
              inputMode="numeric"
              pattern="\d*"
              maxLength={9}
              placeholder="9-digit routing number"
              value={formData.routingNumber}
              onChange={(e) => handleFieldChange('routingNumber', e.target.value.replace(/\D/g, ''))}
              disabled={isLoading}
              className={validationErrors.routingNumber ? 'border-red-500' : ''}
            />
            {validationErrors.routingNumber && (
              <p className="text-sm text-red-500">{validationErrors.routingNumber}</p>
            )}
            <p className="text-xs text-muted-foreground">
              The 9-digit number found at the bottom-left of your check
            </p>
          </div>

          {/* Account Number */}
          <div className="space-y-2">
            <Label htmlFor="accountNumber">
              Account Number <span className="text-red-500">*</span>
            </Label>
            <Input
              id="accountNumber"
              type="text"
              inputMode="numeric"
              pattern="\d*"
              maxLength={17}
              placeholder="Bank account number"
              value={formData.accountNumber}
              onChange={(e) => handleFieldChange('accountNumber', e.target.value.replace(/\D/g, ''))}
              disabled={isLoading}
              className={validationErrors.accountNumber ? 'border-red-500' : ''}
            />
            {validationErrors.accountNumber && (
              <p className="text-sm text-red-500">{validationErrors.accountNumber}</p>
            )}
          </div>

          {/* Confirm Account Number */}
          <div className="space-y-2">
            <Label htmlFor="confirmAccountNumber">
              Confirm Account Number <span className="text-red-500">*</span>
            </Label>
            <Input
              id="confirmAccountNumber"
              type="text"
              inputMode="numeric"
              pattern="\d*"
              maxLength={17}
              placeholder="Re-enter account number"
              value={formData.confirmAccountNumber}
              onChange={(e) => handleFieldChange('confirmAccountNumber', e.target.value.replace(/\D/g, ''))}
              disabled={isLoading}
              className={validationErrors.confirmAccountNumber ? 'border-red-500' : ''}
            />
            {validationErrors.confirmAccountNumber && (
              <p className="text-sm text-red-500">{validationErrors.confirmAccountNumber}</p>
            )}
          </div>

          {/* Account Type */}
          <div className="space-y-2">
            <Label>
              Account Type <span className="text-red-500">*</span>
            </Label>
            <RadioGroup
              value={formData.accountType}
              onValueChange={(value) => setFormData(prev => ({ ...prev, accountType: value as 'Checking' | 'Savings' }))}
              disabled={isLoading}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Checking" id="checking" />
                <Label htmlFor="checking" className="font-normal cursor-pointer">
                  Checking Account
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Savings" id="savings" />
                <Label htmlFor="savings" className="font-normal cursor-pointer">
                  Savings Account
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Account Holder Name */}
          <div className="space-y-2">
            <Label htmlFor="accountHolderName">
              Account Holder Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="accountHolderName"
              type="text"
              placeholder="Full name on the account"
              value={formData.accountHolderName}
              onChange={(e) => handleFieldChange('accountHolderName', e.target.value)}
              disabled={isLoading}
              className={validationErrors.accountHolderName ? 'border-red-500' : ''}
            />
            {validationErrors.accountHolderName && (
              <p className="text-sm text-red-500">{validationErrors.accountHolderName}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Must match the name on your bank account
            </p>
          </div>

          {/* Payment Amount Display */}
          <div className="bg-muted p-4 rounded-lg">
            <div className="flex justify-between items-center">
              <span className="font-medium">Payment Amount:</span>
              <span className="text-2xl font-bold">${amount.toFixed(2)}</span>
            </div>
          </div>

          {/* NACHA Authorization */}
          <Alert>
            <AlertDescription className="text-xs">
              <strong>Authorization:</strong> By submitting this form, you authorize {description || 'GetMyDPC'} to 
              electronically debit your account and, if necessary, initiate credit entries to your account to correct 
              erroneous debits. This authorization will remain in effect until you notify us to cancel it.
            </AlertDescription>
          </Alert>

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing Payment...
              </>
            ) : (
              <>
                Submit Payment ${amount.toFixed(2)}
              </>
            )}
          </Button>
        </form>

        {/* Security Notice */}
        <div className="mt-4 text-center text-xs text-muted-foreground">
          <p>🔒 Your bank account information is encrypted and secure</p>
        </div>
      </CardContent>
    </Card>
  );
}
