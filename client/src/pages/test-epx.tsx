
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import apiClient from '@/lib/apiClient';

export default function TestEPX() {
  const [testAmount, setTestAmount] = useState('10.00');
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const testCreatePayment = async () => {
    if (!user?.id || !user?.email) {
      toast({
        title: "Authentication required",
        description: "Please sign in first",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      console.log('[Test EPX] Creating test payment...');
      
      const response = await apiClient.post('/api/epx/create-payment', {
        amount: parseFloat(testAmount),
        customerId: user.id,
        customerEmail: user.email,
        planId: '1',
        description: 'EPX Test Payment',
        paymentMethod: 'card'
      });

      console.log('[Test EPX] Payment creation response:', response);

      if (response.success && response.formData) {
        // Show form data for debugging
        toast({
          title: "Payment session created",
          description: `Transaction ID: ${response.transactionId}`,
        });

        // Create the form
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = response.formData.actionUrl;
        form.target = '_self';

        const fields = {
          'TAC': response.formData.tac,
          'TRAN_CODE': response.formData.tranCode,
          'TRAN_GROUP': response.formData.tranGroup,
          'AMOUNT': response.formData.amount.toFixed(2),
          'TRAN_NBR': response.formData.tranNbr,
          'REDIRECT_URL': response.formData.redirectUrl,
          'RESPONSE_URL': response.formData.responseUrl,
          'REDIRECT_ECHO': response.formData.redirectEcho,
          'RESPONSE_ECHO': response.formData.responseEcho,
          'RECEIPT': response.formData.receipt
        };

        Object.entries(fields).forEach(([key, value]) => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = key;
          input.value = String(value);
          form.appendChild(input);
        });

        document.body.appendChild(form);
        form.submit();
      }
    } catch (error: any) {
      console.error('[Test EPX] Error:', error);
      toast({
        title: "Test failed",
        description: error.message,
        variant: "destructive"
      });
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-2xl mx-auto px-4">
        <Card>
          <CardHeader>
            <CardTitle>EPX Payment Testing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="amount">Test Amount</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={testAmount}
                onChange={(e) => setTestAmount(e.target.value)}
                placeholder="10.00"
              />
            </div>

            <Button 
              onClick={testCreatePayment}
              disabled={isLoading || !user?.id}
              className="w-full"
            >
              {isLoading ? 'Creating Payment...' : 'Test EPX Payment'}
            </Button>

            {user && (
              <div className="text-sm text-gray-600">
                <p>User ID: {user.id}</p>
                <p>Email: {user.email}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
