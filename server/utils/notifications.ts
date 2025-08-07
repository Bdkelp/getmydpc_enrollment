import sgMail from '@sendgrid/mail';

// Initialize SendGrid if API key is available
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  console.log('[Notifications] SendGrid initialized');
} else {
  console.log('[Notifications] SendGrid API key not configured - email notifications disabled');
}

// Admin emails that should receive notifications
const ADMIN_NOTIFICATION_EMAILS = [
  'michael@mypremierplans.com',
  'travis@mypremierplans.com'
];

interface EnrollmentNotification {
  memberName: string;
  memberEmail: string;
  planName: string;
  memberType: string;
  amount: number;
  agentName?: string;
  agentNumber?: string;
  commission?: number;
  enrollmentDate: Date;
}

/**
 * Send enrollment notification to admins
 */
export async function sendEnrollmentNotification(data: EnrollmentNotification): Promise<void> {
  // If SendGrid is not configured, log the notification instead
  if (!process.env.SENDGRID_API_KEY) {
    console.log('[Notification] New enrollment (email disabled):', data);
    return;
  }

  const formattedDate = data.enrollmentDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #0066cc 0%, #004499 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0;">
        <h1 style="margin: 0;">New Enrollment Completed</h1>
      </div>
      
      <div style="background: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-top: none;">
        <h2 style="color: #333; border-bottom: 2px solid #0066cc; padding-bottom: 10px;">Member Information</h2>
        <table style="width: 100%; margin: 15px 0;">
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Name:</strong></td>
            <td style="padding: 8px 0;">${data.memberName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Email:</strong></td>
            <td style="padding: 8px 0;">${data.memberEmail}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Plan:</strong></td>
            <td style="padding: 8px 0;">${data.planName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Coverage Type:</strong></td>
            <td style="padding: 8px 0;">${data.memberType}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Monthly Amount:</strong></td>
            <td style="padding: 8px 0; font-size: 18px; color: #0066cc;"><strong>$${data.amount.toFixed(2)}</strong></td>
          </tr>
        </table>

        ${data.agentName ? `
        <h2 style="color: #333; border-bottom: 2px solid #0066cc; padding-bottom: 10px; margin-top: 30px;">Agent Information</h2>
        <table style="width: 100%; margin: 15px 0;">
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Agent:</strong></td>
            <td style="padding: 8px 0;">${data.agentName}</td>
          </tr>
          ${data.agentNumber ? `
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Agent Number:</strong></td>
            <td style="padding: 8px 0;">${data.agentNumber}</td>
          </tr>
          ` : ''}
          ${data.commission ? `
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Commission:</strong></td>
            <td style="padding: 8px 0; color: #28a745;"><strong>$${data.commission.toFixed(2)}</strong></td>
          </tr>
          ` : ''}
        </table>
        ` : ''}

        <div style="background: #e8f4fd; padding: 15px; border-radius: 5px; margin-top: 20px;">
          <p style="margin: 0; color: #666;"><strong>Enrollment Date:</strong> ${formattedDate}</p>
        </div>
      </div>
      
      <div style="background: #333; color: #999; padding: 15px; text-align: center; border-radius: 0 0 10px 10px; font-size: 12px;">
        <p style="margin: 0;">This is an automated notification from the DPC Enrollment System</p>
      </div>
    </div>
  `;

  const textContent = `
New Enrollment Completed

Member Information:
- Name: ${data.memberName}
- Email: ${data.memberEmail}
- Plan: ${data.planName}
- Coverage Type: ${data.memberType}
- Monthly Amount: $${data.amount.toFixed(2)}

${data.agentName ? `Agent Information:
- Agent: ${data.agentName}
${data.agentNumber ? `- Agent Number: ${data.agentNumber}` : ''}
${data.commission ? `- Commission: $${data.commission.toFixed(2)}` : ''}
` : ''}

Enrollment Date: ${formattedDate}
  `;

  try {
    await sgMail.sendMultiple({
      to: ADMIN_NOTIFICATION_EMAILS,
      from: process.env.SENDGRID_FROM_EMAIL || 'noreply@mypremierplans.com',
      subject: `New Enrollment: ${data.memberName} - ${data.planName}`,
      text: textContent,
      html: htmlContent
    });
    console.log('[Notification] Enrollment notification sent to admins');
  } catch (error) {
    console.error('[Notification] Failed to send enrollment email:', error);
  }
}

interface PaymentNotification {
  memberName: string;
  memberEmail: string;
  amount: number;
  paymentMethod: string;
  paymentStatus: 'succeeded' | 'failed' | 'pending';
  transactionId?: string;
  paymentDate: Date;
}

/**
 * Send payment notification to admins
 */
export async function sendPaymentNotification(data: PaymentNotification): Promise<void> {
  // If SendGrid is not configured, log the notification instead
  if (!process.env.SENDGRID_API_KEY) {
    console.log('[Notification] Payment processed (email disabled):', data);
    return;
  }

  const formattedDate = data.paymentDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const statusColor = data.paymentStatus === 'succeeded' ? '#28a745' : 
                      data.paymentStatus === 'failed' ? '#dc3545' : '#ffc107';
  const statusText = data.paymentStatus.charAt(0).toUpperCase() + data.paymentStatus.slice(1);

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #28a745 0%, #218838 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0;">
        <h1 style="margin: 0;">Payment Processed</h1>
      </div>
      
      <div style="background: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-top: none;">
        <h2 style="color: #333; border-bottom: 2px solid #28a745; padding-bottom: 10px;">Payment Details</h2>
        <table style="width: 100%; margin: 15px 0;">
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Member:</strong></td>
            <td style="padding: 8px 0;">${data.memberName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Email:</strong></td>
            <td style="padding: 8px 0;">${data.memberEmail}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Amount:</strong></td>
            <td style="padding: 8px 0; font-size: 18px; color: #28a745;"><strong>$${data.amount.toFixed(2)}</strong></td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Payment Method:</strong></td>
            <td style="padding: 8px 0;">${data.paymentMethod}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Status:</strong></td>
            <td style="padding: 8px 0;"><span style="color: ${statusColor}; font-weight: bold;">${statusText}</span></td>
          </tr>
          ${data.transactionId ? `
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Transaction ID:</strong></td>
            <td style="padding: 8px 0; font-family: monospace;">${data.transactionId}</td>
          </tr>
          ` : ''}
        </table>

        <div style="background: #e8f4fd; padding: 15px; border-radius: 5px; margin-top: 20px;">
          <p style="margin: 0; color: #666;"><strong>Payment Date:</strong> ${formattedDate}</p>
        </div>
      </div>
      
      <div style="background: #333; color: #999; padding: 15px; text-align: center; border-radius: 0 0 10px 10px; font-size: 12px;">
        <p style="margin: 0;">This is an automated notification from the DPC Payment System</p>
      </div>
    </div>
  `;

  const textContent = `
Payment Processed

Payment Details:
- Member: ${data.memberName}
- Email: ${data.memberEmail}
- Amount: $${data.amount.toFixed(2)}
- Payment Method: ${data.paymentMethod}
- Status: ${statusText}
${data.transactionId ? `- Transaction ID: ${data.transactionId}` : ''}

Payment Date: ${formattedDate}
  `;

  try {
    await sgMail.sendMultiple({
      to: ADMIN_NOTIFICATION_EMAILS,
      from: process.env.SENDGRID_FROM_EMAIL || 'noreply@mypremierplans.com',
      subject: `Payment ${statusText}: ${data.memberName} - $${data.amount.toFixed(2)}`,
      text: textContent,
      html: htmlContent
    });
    console.log('[Notification] Payment notification sent to admins');
  } catch (error) {
    console.error('[Notification] Failed to send payment email:', error);
  }
}