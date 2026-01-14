import sgMail from '@sendgrid/mail';

// Initialize SendGrid if API key is available
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  console.log('[Notifications] SendGrid initialized');
} else {
  console.log('[Notifications] SendGrid API key not configured - email notifications disabled');
}

const parseEmailList = (value?: string, fallback: string[] = []): string[] => {
  if (!value) {
    return fallback;
  }
  const parsed = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : fallback;
};

const DEFAULT_ADMIN_EMAILS = [
  'michael@mypremierplans.com',
  'travis@mypremierplans.com',
  'info@mypremierplans.com'
];

const SUPPORT_EMAIL = (process.env.SUPPORT_EMAIL || process.env.SENDGRID_FROM_EMAIL || 'support@mypremierplans.com').trim();
const COMPANY_EMAIL = (process.env.COMPANY_EMAIL || SUPPORT_EMAIL).trim();
const DEFAULT_FROM_EMAIL = (process.env.SENDGRID_FROM_EMAIL || COMPANY_EMAIL).trim();
const ADMIN_NOTIFICATION_EMAILS = parseEmailList(process.env.ADMIN_NOTIFICATION_EMAILS, DEFAULT_ADMIN_EMAILS);
const LEAD_NOTIFICATION_EMAILS = parseEmailList(process.env.LEAD_NOTIFICATION_EMAILS, ADMIN_NOTIFICATION_EMAILS.length ? ADMIN_NOTIFICATION_EMAILS : [COMPANY_EMAIL]);
const SALES_EMAIL = (process.env.SALES_EMAIL || COMPANY_EMAIL).trim();
const PARTNER_TEAM_EMAIL = (process.env.PARTNER_TEAM_EMAIL || 'info@mypremierplans.com').trim();

interface EnrollmentNotification {
  memberName: string;
  memberEmail: string;
  planName: string;
  memberType: string;
  amount: number;
  agentName?: string;
  agentNumber?: string;
  agentEmail?: string | null;
  agentUserId?: string | null;
  commission?: number;
  enrollmentDate: Date;
}

/**
 * Send enrollment notification to member, agent, and admins
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
    // Send to admins
    await sgMail.sendMultiple({
      to: ADMIN_NOTIFICATION_EMAILS,
      from: DEFAULT_FROM_EMAIL,
      subject: `New Enrollment: ${data.memberName} - ${data.planName}`,
      text: textContent,
      html: htmlContent
    });

    // Send welcome email to member
    await sendMemberWelcomeEmail(data);

    // Send notification to agent if applicable
    if (data.agentName || data.agentEmail) {
      await sendAgentEnrollmentNotification(data);
    }

    console.log('[Notification] Enrollment notifications sent to all parties');
  } catch (error) {
    console.error('[Notification] Failed to send enrollment emails:', error);
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
      from: DEFAULT_FROM_EMAIL,
      subject: `Payment ${statusText}: ${data.memberName} - $${data.amount.toFixed(2)}`,
      text: textContent,
      html: htmlContent
    });
    console.log('[Notification] Payment notification sent to admins');
  } catch (error) {
    console.error('[Notification] Failed to send payment email:', error);
  }
}

export interface ManualConfirmationEmailPayload {
  recipientEmail: string;
  memberName: string;
  customerNumber?: string;
  planName?: string;
  transactionId?: string;
  amount?: number;
}

/**
 * Send an on-demand confirmation email from the dashboard actions.
 */
export async function sendManualConfirmationEmail(data: ManualConfirmationEmailPayload): Promise<void> {
  if (!process.env.SENDGRID_API_KEY) {
    console.log('[Notification] Manual confirmation email skipped - SendGrid not configured');
    return;
  }

  const memberName = data.memberName?.trim() || 'My Premier Plans Member';
  const planName = data.planName?.trim() || 'My Premier Plans Membership';
  const amountDisplay = typeof data.amount === 'number' && Number.isFinite(data.amount)
    ? `$${data.amount.toFixed(2)}`
    : 'Pending';

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0;">
        <h1 style="margin: 0;">Enrollment Confirmation</h1>
      </div>
      <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none;">
        <p style="color: #374151; line-height: 1.6;">Hi ${memberName},</p>
        <p style="color: #374151; line-height: 1.6;">
          Here is a copy of your enrollment confirmation${planName ? ` for <strong>${planName}</strong>` : ''}.
        </p>
        <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
          ${data.customerNumber ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280; width: 40%;"><strong>Customer Number</strong></td>
            <td style="padding: 8px 0; color: #111827;">${data.customerNumber}</td>
          </tr>` : ''}
          <tr>
            <td style="padding: 8px 0; color: #6b7280;"><strong>Plan</strong></td>
            <td style="padding: 8px 0; color: #111827;">${planName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;"><strong>Monthly Amount</strong></td>
            <td style="padding: 8px 0; color: #111827;">${amountDisplay}</td>
          </tr>
          ${data.transactionId ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280;"><strong>Transaction ID</strong></td>
            <td style="padding: 8px 0; color: #111827;">${data.transactionId}</td>
          </tr>` : ''}
        </table>
        <p style="color: #374151; line-height: 1.6;">
          Save this email for your records. If you need help or have questions about your membership, reply to this email or contact us at ${SUPPORT_EMAIL}.
        </p>
        <p style="color: #374151;">
          — The My Premier Plans Team
        </p>
      </div>
      <div style="background: #111827; color: #e5e7eb; text-align: center; padding: 12px; border-radius: 0 0 10px 10px; font-size: 12px;">
        Need support? Email ${SUPPORT_EMAIL}
      </div>
    </div>
  `;

  const textContent = `Hi ${memberName},

Here is your My Premier Plans enrollment confirmation.

Plan: ${planName}
Monthly Amount: ${amountDisplay}
${data.customerNumber ? `Customer Number: ${data.customerNumber}
` : ''}${data.transactionId ? `Transaction ID: ${data.transactionId}
` : ''}
Save this email for your records. For help, contact ${SUPPORT_EMAIL}.
`;

  try {
    await sgMail.send({
      to: data.recipientEmail,
      from: SUPPORT_EMAIL,
      replyTo: SUPPORT_EMAIL,
      subject: 'Your My Premier Plans enrollment confirmation',
      text: textContent,
      html: htmlContent
    });
    console.log('[Notification] Manual confirmation email sent to', data.recipientEmail);
  } catch (error) {
    console.error('[Notification] Failed to send manual confirmation email:', error);
    throw error;
  }
}

/**
 * Send welcome email to new member
 */
async function sendMemberWelcomeEmail(data: EnrollmentNotification): Promise<void> {
  if (!process.env.SENDGRID_API_KEY) {
    console.log('[Notification] Member welcome email disabled - SendGrid not configured');
    return;
  }

  const formattedDate = data.enrollmentDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #0066cc 0%, #004499 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0;">
        <h1 style="margin: 0;">Welcome to My Premier Plans!</h1>
      </div>
      
      <div style="background: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-top: none;">
        <h2 style="color: #333;">Dear ${data.memberName},</h2>
        <p style="color: #666; line-height: 1.6;">
          Congratulations! Your enrollment in <strong>${data.planName}</strong> has been successfully completed. 
          We're excited to have you as part of the My Premier Plans family.
        </p>

        <div style="background: #e8f4fd; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #0066cc; margin: 0 0 10px 0;">Your Membership Details:</h3>
          <table style="width: 100%;">
            <tr>
              <td style="padding: 5px 0; color: #666;"><strong>Plan:</strong></td>
              <td style="padding: 5px 0;">${data.planName}</td>
            </tr>
            <tr>
              <td style="padding: 5px 0; color: #666;"><strong>Coverage:</strong></td>
              <td style="padding: 5px 0;">${data.memberType}</td>
            </tr>
            <tr>
              <td style="padding: 5px 0; color: #666;"><strong>Monthly Amount:</strong></td>
              <td style="padding: 5px 0; color: #0066cc;"><strong>$${data.amount.toFixed(2)}</strong></td>
            </tr>
            <tr>
              <td style="padding: 5px 0; color: #666;"><strong>Enrollment Date:</strong></td>
              <td style="padding: 5px 0;">${formattedDate}</td>
            </tr>
          </table>
        </div>

        <div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; border: 1px solid #ffeaa7;">
          <h3 style="color: #856404; margin: 0 0 10px 0;">Important Reminders:</h3>
          <ul style="color: #856404; margin: 0; padding-left: 20px;">
            <li>Your membership will automatically renew monthly</li>
            <li>You can cancel anytime with 14 days written notice</li>
            <li>Contact us at ${COMPANY_EMAIL} for any questions</li>
          </ul>
        </div>

        <p style="color: #666; line-height: 1.6;">
          If you have any questions about your membership or need assistance, please don't hesitate to contact us.
          Our team is here to help you make the most of your healthcare benefits.
        </p>

        <p style="color: #666;">
          Best regards,<br>
          <strong>The My Premier Plans Team</strong>
        </p>
      </div>
      
      <div style="background: #333; color: #999; padding: 15px; text-align: center; border-radius: 0 0 10px 10px; font-size: 12px;">
        <p style="margin: 0;">For questions or support, contact us at ${COMPANY_EMAIL}</p>
      </div>
    </div>
  `;

  const textContent = `
Welcome to My Premier Plans!

Dear ${data.memberName},

Congratulations! Your enrollment in ${data.planName} has been successfully completed.

Your Membership Details:
- Plan: ${data.planName}
- Coverage: ${data.memberType}
- Monthly Amount: $${data.amount.toFixed(2)}
- Enrollment Date: ${formattedDate}

Important Reminders:
- Your membership will automatically renew monthly
- You can cancel anytime with 14 days written notice
- Contact us at ${COMPANY_EMAIL} for any questions

Best regards,
The My Premier Plans Team

For questions or support, contact us at ${COMPANY_EMAIL}
  `;

  try {
    await sgMail.send({
      to: data.memberEmail,
      from: SUPPORT_EMAIL,
      subject: `Welcome to My Premier Plans - Your ${data.planName} Enrollment Confirmed`,
      text: textContent,
      html: htmlContent
    });
    console.log('[Notification] Welcome email sent to member:', data.memberEmail);
  } catch (error) {
    console.error('[Notification] Failed to send member welcome email:', error);
  }
}

/**
 * Send enrollment notification to agent
 */
async function sendAgentEnrollmentNotification(data: EnrollmentNotification): Promise<void> {
  if (!process.env.SENDGRID_API_KEY || !data.agentName) {
    return;
  }

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #28a745 0%, #218838 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0;">
        <h1 style="margin: 0;">New Enrollment Completed</h1>
      </div>
      
      <div style="background: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-top: none;">
        <h2 style="color: #333;">Great news, ${data.agentName}!</h2>
        <p style="color: #666; line-height: 1.6;">
          Your client <strong>${data.memberName}</strong> has successfully enrolled in <strong>${data.planName}</strong>.
        </p>

        <div style="background: #d4edda; padding: 15px; border-radius: 5px; margin: 20px 0; border: 1px solid #c3e6cb;">
          <h3 style="color: #155724; margin: 0 0 10px 0;">Enrollment Details:</h3>
          <table style="width: 100%;">
            <tr>
              <td style="padding: 5px 0; color: #155724;"><strong>Member:</strong></td>
              <td style="padding: 5px 0;">${data.memberName}</td>
            </tr>
            <tr>
              <td style="padding: 5px 0; color: #155724;"><strong>Plan:</strong></td>
              <td style="padding: 5px 0;">${data.planName}</td>
            </tr>
            <tr>
              <td style="padding: 5px 0; color: #155724;"><strong>Monthly Amount:</strong></td>
              <td style="padding: 5px 0; color: #28a745;"><strong>$${data.amount.toFixed(2)}</strong></td>
            </tr>
            ${data.commission ? `
            <tr>
              <td style="padding: 5px 0; color: #155724;"><strong>Your Commission:</strong></td>
              <td style="padding: 5px 0; color: #28a745;"><strong>$${data.commission.toFixed(2)}</strong></td>
            </tr>
            ` : ''}
          </table>
        </div>

        <p style="color: #666;">
          Keep up the excellent work!<br>
          <strong>The My Premier Plans Team</strong>
        </p>
      </div>
      
      <div style="background: #333; color: #999; padding: 15px; text-align: center; border-radius: 0 0 10px 10px; font-size: 12px;">
        <p style="margin: 0;">For questions or support, contact us at ${COMPANY_EMAIL}</p>
      </div>
    </div>
  `;

  const agentRecipients = data.agentEmail
    ? [data.agentEmail]
    : ADMIN_NOTIFICATION_EMAILS;

  try {
    await sgMail.send({
      to: agentRecipients,
      from: DEFAULT_FROM_EMAIL,
      subject: `New Enrollment${data.agentName ? ` for ${data.agentName}` : ''}: ${data.memberName}`,
      html: htmlContent,
      bcc: data.agentEmail ? ADMIN_NOTIFICATION_EMAILS : undefined
    });
    console.log('[Notification] Agent enrollment notification sent');
  } catch (error) {
    console.error('[Notification] Failed to send agent enrollment email:', error);
  }
}

interface WeeklyRecapData {
  weekOf: string;
  totalEnrollments: number;
  totalRevenue: number;
  newMembers: Array<{
    name: string;
    plan: string;
    amount: number;
    enrollmentDate: string;
    agentName?: string;
  }>;
  agentPerformance: Array<{
    agentName: string;
    enrollments: number;
    totalCommissions: number;
  }>;
  planBreakdown: Array<{
    planName: string;
    enrollments: number;
    revenue: number;
  }>;
}

export interface LeadSubmissionDetails {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message?: string;
  source?: string;
}

function formatLeadSource(source?: string) {
  if (!source) return 'contact_form';
  return source.replace(/_/g, ' ');
}

function buildLeadAdminHtml(data: LeadSubmissionDetails) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%); color: white; padding: 18px; border-radius: 10px 10px 0 0;">
        <h2 style="margin: 0;">New Lead Submission</h2>
      </div>
      <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-top: none; padding: 20px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; width: 35%;"><strong>Name</strong></td>
            <td style="padding: 8px 0; color: #111827;">${data.firstName} ${data.lastName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;"><strong>Email</strong></td>
            <td style="padding: 8px 0; color: #111827;">${data.email}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;"><strong>Phone</strong></td>
            <td style="padding: 8px 0; color: #111827;">${data.phone}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;"><strong>Source</strong></td>
            <td style="padding: 8px 0; color: #111827;">${formatLeadSource(data.source)}</td>
          </tr>
        </table>
        ${data.message ? `
          <div style="margin-top: 20px;">
            <p style="color: #6b7280; margin: 0 0 6px 0;"><strong>Message</strong></p>
            <div style="background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; color: #111827;">
              ${data.message}
            </div>
          </div>
        ` : ''}
      </div>
      <div style="background: #111827; color: #e5e7eb; text-align: center; padding: 12px; border-radius: 0 0 10px 10px; font-size: 12px;">
        Lead submitted on ${new Date().toLocaleString()}
      </div>
    </div>
  `;
}

function buildLeadFollowUpHtml(data: LeadSubmissionDetails) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 18px; border-radius: 10px 10px 0 0;">
        <h2 style="margin: 0;">Thanks for reaching out, ${data.firstName}!</h2>
      </div>
      <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-top: none; padding: 20px;">
        <p style="color: #374151; line-height: 1.6;">
          We received your inquiry and a member of the My Premier Plans team will contact you shortly.
          If you need immediate assistance, reply to this email or call us at ${SUPPORT_EMAIL}.
        </p>
        <div style="background: #ecfccb; border: 1px solid #bef264; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="margin: 0; color: #365314;">
            <strong>What happens next?</strong><br>
            - We review your submission within one business day.<br>
            - A licensed representative will reach out using the contact information you provided.<br>
            - Together we'll confirm your plan options and next steps for enrollment.
          </p>
        </div>
        <p style="color: #374151; line-height: 1.6;">
          Looking forward to helping you enjoy direct primary care with My Premier Plans.
        </p>
        <p style="color: #374151;">
          — The My Premier Plans Support Team
        </p>
      </div>
      <div style="background: #111827; color: #e5e7eb; text-align: center; padding: 12px; border-radius: 0 0 10px 10px; font-size: 12px;">
        Need help now? Email ${SUPPORT_EMAIL}
      </div>
    </div>
  `;
}

export interface PartnerLeadSubmissionDetails {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  agencyName: string;
  agencyWebsite?: string;
  statesServed?: string;
  experienceLevel?: string;
  volumeEstimate?: string;
  message?: string;
}

function buildPartnerAdminHtml(data: PartnerLeadSubmissionDetails) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%); color: white; padding: 18px; border-radius: 10px 10px 0 0;">
        <h2 style="margin: 0;">New Partner Inquiry</h2>
      </div>
      <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-top: none; padding: 20px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; width: 40%;"><strong>Contact</strong></td>
            <td style="padding: 8px 0; color: #111827;">${data.firstName} ${data.lastName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;"><strong>Email</strong></td>
            <td style="padding: 8px 0; color: #111827;">${data.email}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;"><strong>Phone</strong></td>
            <td style="padding: 8px 0; color: #111827;">${data.phone}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;"><strong>Agency</strong></td>
            <td style="padding: 8px 0; color: #111827;">${data.agencyName}</td>
          </tr>
          ${data.agencyWebsite ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280;"><strong>Website</strong></td>
            <td style="padding: 8px 0; color: #2563eb;"><a href="${data.agencyWebsite}" target="_blank" rel="noopener" style="color: #2563eb; text-decoration: none;">${data.agencyWebsite}</a></td>
          </tr>
          ` : ''}
          ${data.statesServed ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280;"><strong>States</strong></td>
            <td style="padding: 8px 0; color: #111827;">${data.statesServed}</td>
          </tr>
          ` : ''}
          ${data.experienceLevel ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280;"><strong>Experience</strong></td>
            <td style="padding: 8px 0; color: #111827;">${data.experienceLevel}</td>
          </tr>
          ` : ''}
          ${data.volumeEstimate ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280;"><strong>Member Volume</strong></td>
            <td style="padding: 8px 0; color: #111827;">${data.volumeEstimate}</td>
          </tr>
          ` : ''}
        </table>
        ${data.message ? `
          <div style="margin-top: 20px;">
            <p style="color: #6b7280; margin: 0 0 6px 0;"><strong>Notes</strong></p>
            <div style="background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; color: #111827; line-height: 1.5;">
              ${data.message}
            </div>
          </div>
        ` : ''}
      </div>
      <div style="background: #0f172a; color: #e2e8f0; text-align: center; padding: 12px; border-radius: 0 0 10px 10px; font-size: 12px;">
        Submitted on ${new Date().toLocaleString()}
      </div>
    </div>
  `;
}

function buildPartnerFollowUpHtml(data: PartnerLeadSubmissionDetails) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #0891b2 0%, #0e7490 100%); color: white; padding: 18px; border-radius: 10px 10px 0 0;">
        <h2 style="margin: 0;">Thanks for your interest, ${data.firstName}!</h2>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-top: none; padding: 20px;">
        <p style="color: #0f172a; line-height: 1.6;">
          We received your partner inquiry for <strong>${data.agencyName}</strong>. Our team will review your details and reach out shortly to discuss onboarding, commission structures, and co-marketing support.
        </p>
        <div style="background: #e0f2fe; border: 1px solid #bae6fd; border-radius: 8px; padding: 16px; margin: 20px 0; color: #0c4a6e;">
          <strong>Typical next steps</strong>
          <ul style="margin: 12px 0 0 18px; padding: 0;">
            <li>Schedule a 20-minute discovery call</li>
            <li>Share our onboarding toolkit and marketing assets</li>
            <li>Provide dedicated support for your first enrollments</li>
          </ul>
        </div>
        <p style="color: #0f172a; line-height: 1.6;">
          Need immediate assistance? Reply to this email or call us at ${SUPPORT_EMAIL} and mention your partner request.
        </p>
        <p style="color: #0f172a;">
          — The My Premier Plans Partnerships Team
        </p>
      </div>
      <div style="background: #0f172a; color: #e2e8f0; text-align: center; padding: 12px; border-radius: 0 0 10px 10px; font-size: 12px;">
        We appreciate your partnership interest
      </div>
    </div>
  `;
}

export async function sendLeadSubmissionEmails(data: LeadSubmissionDetails): Promise<void> {
  if (!process.env.SENDGRID_API_KEY) {
    console.log('[Notification] Lead submission emails disabled - SendGrid not configured');
    return;
  }

  const adminHtml = buildLeadAdminHtml(data);
  const adminText = `New lead submission\nName: ${data.firstName} ${data.lastName}\nEmail: ${data.email}\nPhone: ${data.phone}\nSource: ${formatLeadSource(data.source)}\n${data.message ? `Message: ${data.message}` : ''}`;

  try {
    await sgMail.sendMultiple({
      to: LEAD_NOTIFICATION_EMAILS,
      from: SALES_EMAIL,
      subject: `New Lead: ${data.firstName} ${data.lastName}`,
      text: adminText,
      html: adminHtml
    });
    console.log('[Notification] Lead admin notification sent');
  } catch (error) {
    console.error('[Notification] Failed to send lead admin notification:', error);
  }

  try {
    await sgMail.send({
      to: data.email,
      from: SUPPORT_EMAIL,
      replyTo: SUPPORT_EMAIL,
      subject: 'We received your My Premier Plans inquiry',
      html: buildLeadFollowUpHtml(data)
    });
    console.log('[Notification] Lead follow-up email sent to prospect');
  } catch (error) {
    console.error('[Notification] Failed to send lead follow-up email:', error);
  }
}

/**
 * Generate and send weekly recap email
 */
export async function sendWeeklyRecap(data: WeeklyRecapData): Promise<void> {
  if (!process.env.SENDGRID_API_KEY) {
    console.log('[Notification] Weekly recap disabled - SendGrid not configured');
    return;
  }

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #6f42c1 0%, #5a2d91 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0;">
        <h1 style="margin: 0;">Weekly Enrollment Recap</h1>
        <p style="margin: 10px 0 0 0; opacity: 0.9;">Week of ${data.weekOf}</p>
      </div>
      
      <div style="background: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-top: none;">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px;">
          <div style="background: #fff; padding: 20px; border-radius: 8px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h3 style="color: #0066cc; margin: 0; font-size: 2em;">${data.totalEnrollments}</h3>
            <p style="color: #666; margin: 5px 0 0 0;">New Enrollments</p>
          </div>
          <div style="background: #fff; padding: 20px; border-radius: 8px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h3 style="color: #28a745; margin: 0; font-size: 2em;">$${data.totalRevenue.toFixed(0)}</h3>
            <p style="color: #666; margin: 5px 0 0 0;">Weekly Revenue</p>
          </div>
        </div>

        ${data.newMembers.length > 0 ? `
        <div style="margin-bottom: 30px;">
          <h2 style="color: #333; border-bottom: 2px solid #0066cc; padding-bottom: 10px;">New Members This Week</h2>
          <div style="background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background: #f8f9fa;">
                  <th style="padding: 12px; text-align: left; border-bottom: 1px solid #dee2e6;">Member</th>
                  <th style="padding: 12px; text-align: left; border-bottom: 1px solid #dee2e6;">Plan</th>
                  <th style="padding: 12px; text-align: left; border-bottom: 1px solid #dee2e6;">Amount</th>
                  <th style="padding: 12px; text-align: left; border-bottom: 1px solid #dee2e6;">Agent</th>
                  <th style="padding: 12px; text-align: left; border-bottom: 1px solid #dee2e6;">Date</th>
                </tr>
              </thead>
              <tbody>
                ${data.newMembers.map((member, index) => `
                <tr style="background: ${index % 2 === 0 ? '#fff' : '#f8f9fa'};">
                  <td style="padding: 12px; border-bottom: 1px solid #dee2e6;">${member.name}</td>
                  <td style="padding: 12px; border-bottom: 1px solid #dee2e6;">${member.plan}</td>
                  <td style="padding: 12px; border-bottom: 1px solid #dee2e6; color: #28a745; font-weight: bold;">$${member.amount.toFixed(2)}</td>
                  <td style="padding: 12px; border-bottom: 1px solid #dee2e6;">${member.agentName || 'Direct'}</td>
                  <td style="padding: 12px; border-bottom: 1px solid #dee2e6;">${member.enrollmentDate}</td>
                </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
        ` : ''}

        ${data.agentPerformance.length > 0 ? `
        <div style="margin-bottom: 30px;">
          <h2 style="color: #333; border-bottom: 2px solid #28a745; padding-bottom: 10px;">Agent Performance</h2>
          <div style="background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background: #f8f9fa;">
                  <th style="padding: 12px; text-align: left; border-bottom: 1px solid #dee2e6;">Agent</th>
                  <th style="padding: 12px; text-align: left; border-bottom: 1px solid #dee2e6;">Enrollments</th>
                  <th style="padding: 12px; text-align: left; border-bottom: 1px solid #dee2e6;">Commissions</th>
                </tr>
              </thead>
              <tbody>
                ${data.agentPerformance.map((agent, index) => `
                <tr style="background: ${index % 2 === 0 ? '#fff' : '#f8f9fa'};">
                  <td style="padding: 12px; border-bottom: 1px solid #dee2e6;">${agent.agentName}</td>
                  <td style="padding: 12px; border-bottom: 1px solid #dee2e6;">${agent.enrollments}</td>
                  <td style="padding: 12px; border-bottom: 1px solid #dee2e6; color: #28a745; font-weight: bold;">$${agent.totalCommissions.toFixed(2)}</td>
                </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
        ` : ''}

        <div style="text-align: center; margin-top: 30px; padding: 20px; background: #e8f4fd; border-radius: 8px;">
          <p style="color: #666; margin: 0;">
            This automated weekly report was generated on ${new Date().toLocaleDateString()}
          </p>
        </div>
      </div>
      
      <div style="background: #333; color: #999; padding: 15px; text-align: center; border-radius: 0 0 10px 10px; font-size: 12px;">
        <p style="margin: 0;">My Premier Plans - Weekly Performance Report</p>
      </div>
    </div>
  `;

  const textContent = `
Weekly Enrollment Recap - Week of ${data.weekOf}

Summary:
- New Enrollments: ${data.totalEnrollments}
- Weekly Revenue: $${data.totalRevenue.toFixed(2)}

${data.newMembers.length > 0 ? `
New Members:
${data.newMembers.map(member => 
  `- ${member.name} (${member.plan}) - $${member.amount.toFixed(2)} - ${member.agentName || 'Direct'} - ${member.enrollmentDate}`
).join('\n')}
` : ''}

${data.agentPerformance.length > 0 ? `
Agent Performance:
${data.agentPerformance.map(agent => 
  `- ${agent.agentName}: ${agent.enrollments} enrollments, $${agent.totalCommissions.toFixed(2)} commissions`
).join('\n')}
` : ''}

This automated weekly report was generated on ${new Date().toLocaleDateString()}
  `;

  try {
    await sgMail.send({
      to: COMPANY_EMAIL,
      from: COMPANY_EMAIL,
      subject: `Weekly Enrollment Recap - Week of ${data.weekOf}`,
      text: textContent,
      html: htmlContent
    });
    console.log('[Notification] Weekly recap sent to:', COMPANY_EMAIL);
  } catch (error) {
    console.error('[Notification] Failed to send weekly recap:', error);
  }
}

export async function sendPartnerInquiryEmails(data: PartnerLeadSubmissionDetails): Promise<void> {
  if (!process.env.SENDGRID_API_KEY) {
    console.log('[Notification] Partner inquiry emails disabled - SendGrid not configured');
    return;
  }

  const adminHtml = buildPartnerAdminHtml(data);
  const adminText = `New partner inquiry from ${data.firstName} ${data.lastName} (${data.agencyName})\n` +
    `Email: ${data.email}\nPhone: ${data.phone}\n` +
    `${data.statesServed ? `States: ${data.statesServed}\n` : ''}` +
    `${data.experienceLevel ? `Experience: ${data.experienceLevel}\n` : ''}` +
    `${data.volumeEstimate ? `Member volume: ${data.volumeEstimate}\n` : ''}` +
    `${data.message ? `Notes: ${data.message}` : ''}`;

  try {
    await sgMail.send({
      to: PARTNER_TEAM_EMAIL || COMPANY_EMAIL,
      from: SALES_EMAIL,
      subject: `New Partner Inquiry: ${data.agencyName}`,
      text: adminText,
      html: adminHtml
    });
    console.log('[Notification] Partner inquiry sent to partnerships team');
  } catch (error) {
    console.error('[Notification] Failed to send partner inquiry email:', error);
  }

  try {
    await sgMail.send({
      to: data.email,
      from: SUPPORT_EMAIL,
      replyTo: SUPPORT_EMAIL,
      subject: 'Thanks for your interest in partnering with My Premier Plans',
      html: buildPartnerFollowUpHtml(data)
    });
    console.log('[Notification] Partner inquiry follow-up sent to prospect');
  } catch (error) {
    console.error('[Notification] Failed to send partner follow-up email:', error);
  }
}