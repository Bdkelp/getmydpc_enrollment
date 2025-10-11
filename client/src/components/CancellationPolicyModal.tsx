import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, Download, FileText } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface CancellationPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: () => void;
}

export function CancellationPolicyModal({
  isOpen,
  onClose,
  onAccept,
}: CancellationPolicyModalProps) {
  const [hasAcknowledged, setHasAcknowledged] = useState(false);

  const policyContent = `MyPremierPlans Membership Cancellation and Refund Terms

CANCELLATION PROCESS

Agent-Assisted Process Required
MyPremierPlans operates an agent-assisted membership model for both enrollment and cancellation to ensure proper plan selection, compliance with Direct Primary Care regulations, and accurate processing of membership benefits.

Written Notice Requirement
All membership cancellations must be submitted through one of the following methods:
• Phone: Call our toll-free number at 888-346-9372 during business hours
• Email: cancellations@mypremierplans.com
• Mail: Certified mail to My Premier Plans LLC, 22211 W. I-10, San Antonio, TX 78253, Bldg. 1 Ste. 1206

Required Information:
• Full name and member ID
• Email address associated with the account
• Effective date requested for cancellation
• Reason for cancellation (optional)

REFUND TERMS

Initial 14-Day Period
• FULL REFUND AVAILABLE: If you cancel within the first 14 days AND have not used any services
• NO REFUND: If you cancel within the first 14 days AND have used any covered services

What Constitutes "Service Usage":
• Any scheduled or completed appointment (in-person or telehealth)
• Any consultation via phone, email, or messaging platform
• Access to member-only resources or platforms
• Use of any covered medical services or benefits

After 14-Day Period
• NO REFUNDS: After the initial 14-day period, all membership fees are non-refundable
• You may cancel your membership at any time with 14 days' written notice

CANCELLATION TERMS

Notice Period
• 14-DAY WRITTEN NOTICE REQUIRED to avoid being charged for the subsequent billing period
• EFFECTIVE DATE: Cancellations become effective at the end of your current billing period
• INSUFFICIENT NOTICE: If less than 14 days' notice is provided, you will be charged for one additional billing period

Billing After Cancellation
• FINAL BILLING: Your membership remains active until the end of your current billing period
• ACCESS TERMINATION: Access to services terminates at 11:59 PM on the last day of your final billing period
• NO PRORATION: Partial month refunds are not provided

IMPORTANT INFORMATION

Automatic Renewal
• Memberships automatically renew monthly unless cancelled according to these terms
• You will receive email notification of upcoming renewals

Re-enrollment
• Former members may re-enroll at any time, subject to current rates and terms

Payment Processing
• Refunds, when applicable, will be processed within 5-10 business days
• Refunds will be issued to the original payment method

Contact Information
Toll-Free: 888-346-9372
Email: support@mypremierplans.com
Business Hours: Monday-Friday 9:00 AM - 6:00 PM CT

LEGAL COMPLIANCE
These terms comply with:
• Federal Trade Commission regulations including the Negative Option Rule
• State of Texas consumer protection laws
• Payment processor requirements for recurring billing services
• Direct Primary Care regulatory requirements

Effective Date: January 1, 2025
Last Updated: January 31, 2025`;

  const downloadPolicy = () => {
    // Create a blob with the terms content
    const blob = new Blob([policyContent], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'MyPremierPlans_Cancellation_Refund_Terms.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handleAccept = () => {
    if (hasAcknowledged) {
      // Download terms automatically when accepted
      downloadPolicy();
      onAccept();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <FileText className="h-5 w-5" />
            Membership Cancellation and Refund Terms
          </DialogTitle>
          <DialogDescription>
            Please review and acknowledge our cancellation and refund terms before proceeding with payment
          </DialogDescription>
        </DialogHeader>

        <Alert className="border-amber-200 bg-amber-50">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            <strong>Important:</strong> This is a recurring monthly membership that will automatically renew unless cancelled with 14 days' written notice.
          </AlertDescription>
        </Alert>

        <ScrollArea className="h-[400px] w-full rounded-md border p-4 bg-gray-50">
          <div className="space-y-6 text-sm">
            {/* Cancellation Process */}
            <div>
              <h3 className="font-bold text-base mb-3 text-blue-900">CANCELLATION PROCESS</h3>

              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">Agent-Assisted Process Required</h4>
                  <p className="text-gray-700">
                    MyPremierPlans operates an agent-assisted membership model for both enrollment and cancellation 
                    to ensure proper plan selection, compliance with Direct Primary Care regulations, and accurate 
                    processing of membership benefits.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Written Notice Requirement</h4>
                  <p className="text-gray-700 mb-2">All membership cancellations must be submitted through one of the following methods:</p>
                  <ul className="list-disc pl-5 space-y-1 text-gray-700">
                    <li><strong>Phone:</strong> Call our toll-free number at 888-346-9372 during business hours</li>
                    <li><strong>Email:</strong> cancellations@mypremierplans.com</li>
                    <li><strong>Mail:</strong> Certified mail to My Premier Plans LLC, 22211 W. I-10, San Antonio, TX 78253, Bldg. 1 Ste. 1206</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Required Information</h4>
                  <ul className="list-disc pl-5 space-y-1 text-gray-700">
                    <li>Full name and member ID</li>
                    <li>Email address associated with the account</li>
                    <li>Effective date requested for cancellation</li>
                    <li>Reason for cancellation (optional)</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Refund Terms */}
            <div>
              <h3 className="font-bold text-base mb-3 text-blue-900">REFUND TERMS</h3>

              <div className="space-y-4">
                <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                  <h4 className="font-semibold mb-2">Initial 14-Day Period</h4>
                  <p className="text-gray-700 mb-2">
                    <strong className="text-green-700">FULL REFUND AVAILABLE:</strong> If you cancel within the first 14 days 
                    AND have not used any services
                  </p>
                  <p className="text-gray-700">
                    <strong className="text-red-700">NO REFUND:</strong> If you cancel within the first 14 days 
                    AND have used any covered services
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">What Constitutes "Service Usage":</h4>
                  <ul className="list-disc pl-5 space-y-1 text-gray-700">
                    <li>Any scheduled or completed appointment (in-person or telehealth)</li>
                    <li>Any consultation via phone, email, or messaging platform</li>
                    <li>Access to member-only resources or platforms</li>
                    <li>Use of any covered medical services or benefits</li>
                  </ul>
                </div>

                <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                  <h4 className="font-semibold mb-2">After 14-Day Period</h4>
                  <p className="text-gray-700">
                    <strong>NO REFUNDS:</strong> After the initial 14-day period, all membership fees are non-refundable.
                    You may cancel your membership at any time with 14 days' written notice.
                  </p>
                </div>
              </div>
            </div>

            {/* Cancellation Terms */}
            <div>
              <h3 className="font-bold text-base mb-3 text-blue-900">CANCELLATION TERMS</h3>

              <div className="space-y-4">
                <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                  <h4 className="font-semibold mb-2">Notice Period</h4>
                  <ul className="space-y-2 text-gray-700">
                    <li><strong>14-DAY WRITTEN NOTICE REQUIRED</strong> to avoid being charged for the subsequent billing period</li>
                    <li><strong>EFFECTIVE DATE:</strong> Cancellations become effective at the end of your current billing period</li>
                    <li><strong>INSUFFICIENT NOTICE:</strong> If less than 14 days' notice is provided, you will be charged for one additional billing period</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Billing After Cancellation</h4>
                  <ul className="list-disc pl-5 space-y-1 text-gray-700">
                    <li><strong>Final Billing:</strong> Your membership remains active until the end of your current billing period</li>
                    <li><strong>Access Termination:</strong> Access to services terminates at 11:59 PM on the last day of your final billing period</li>
                    <li><strong>No Proration:</strong> Partial month refunds are not provided</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Important Information */}
            <div>
              <h3 className="font-bold text-base mb-3 text-blue-900">IMPORTANT INFORMATION</h3>

              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">Automatic Renewal</h4>
                  <ul className="list-disc pl-5 space-y-1 text-gray-700">
                    <li>Memberships automatically renew monthly unless cancelled according to this policy</li>
                    <li>You will receive email notification of upcoming renewals</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Contact Information</h4>
                  <div className="text-gray-700">
                    <p><strong>Toll-Free:</strong> 888-346-9372</p>
                    <p><strong>Email:</strong> support@mypremierplans.com</p>
                    <p><strong>Business Hours:</strong> Monday-Friday 9:00 AM - 6:00 PM CT</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Legal Compliance */}
            <div className="bg-gray-100 p-3 rounded-lg">
              <h4 className="font-semibold mb-2">Legal Compliance</h4>
              <p className="text-gray-700 text-xs">
                This policy complies with Federal Trade Commission regulations including the Negative Option Rule, 
                State of Texas consumer protection laws, Payment processor requirements for recurring billing services, 
                and Direct Primary Care regulatory requirements.
              </p>
              <p className="text-gray-600 text-xs mt-2">
                Effective Date: January 1, 2025 | Last Updated: January 31, 2025
              </p>
            </div>
          </div>
        </ScrollArea>

        <div className="space-y-4">
          {/* Acknowledgment Checkbox */}
          <div className="flex items-start space-x-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <Checkbox
              id="acknowledge"
              checked={hasAcknowledged}
              onCheckedChange={(checked) => setHasAcknowledged(checked as boolean)}
              className="mt-1"
            />
            <label 
              htmlFor="acknowledge" 
              className="text-sm font-medium leading-relaxed cursor-pointer"
            >
              I acknowledge that I have read and understand the cancellation and refund policy. 
              I understand this is a recurring monthly membership that will automatically renew unless 
              I provide 14 days' written notice of cancellation. I understand that refunds are only 
              available within the first 14 days if no services have been used, and that no refunds 
              are available after 14 days.
            </label>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between gap-4">
            <Button
              variant="outline"
              onClick={downloadPolicy}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Download Policy
            </Button>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAccept}
                disabled={!hasAcknowledged}
                className="min-w-[150px]"
              >
                Accept & Continue
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}