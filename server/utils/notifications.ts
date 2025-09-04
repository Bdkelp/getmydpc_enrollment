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
  'travis@mypremierplans.com',
  'info@mypremierplans.com'
];

// Default company email for all correspondence
const COMPANY_EMAIL = 'info@mypremierplans.com';

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
      from: COMPANY_EMAIL,
      subject: `New Enrollment: ${data.memberName} - ${data.planName}`,
      text: textContent,
      html: htmlContent
    });

    // Send welcome email to member
    await sendMemberWelcomeEmail(data);

    // Send notification to agent if applicable
    if (data.agentName) {
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
      from: COMPANY_EMAIL,
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

  // Note: In production, you'd need to get the agent's email from the database
  // For now, we'll send to the admin emails as a placeholder
  try {
    await sgMail.sendMultiple({
      to: ADMIN_NOTIFICATION_EMAILS,
      from: COMPANY_EMAIL,
      subject: `New Enrollment by Agent ${data.agentName}: ${data.memberName}`,
      html: htmlContent
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