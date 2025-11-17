import nodemailer from 'nodemailer';

// Create a transporter using environment variables
const createTransporter = () => {
  const emailService = process.env.EMAIL_SERVICE || 'gmail';
  const emailUser = process.env.EMAIL_USER;
  const emailPassword = process.env.EMAIL_PASSWORD;

  if (!emailUser || !emailPassword) {
    console.warn('[Email] Email credentials not configured. Emails will not be sent.');
    return null;
  }

  return nodemailer.createTransport({
    service: emailService,
    auth: {
      user: emailUser,
      pass: emailPassword,
    },
  });
};

const transporter = createTransporter();

export interface LeadNotificationData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message?: string;
  source?: string;
}

export async function sendLeadNotification(leadData: LeadNotificationData): Promise<boolean> {
  if (!transporter) {
    console.warn('[Email] Skipping email notification - transporter not configured');
    return false;
  }

  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: 'info@mypremierplans.com',
      subject: `New Lead: ${leadData.firstName} ${leadData.lastName}`,
      html: `
        <h2>New Lead Submission</h2>
        <p><strong>Name:</strong> ${leadData.firstName} ${leadData.lastName}</p>
        <p><strong>Email:</strong> ${leadData.email}</p>
        <p><strong>Phone:</strong> ${leadData.phone}</p>
        <p><strong>Source:</strong> ${leadData.source || 'contact_form'}</p>
        ${leadData.message ? `<p><strong>Message:</strong><br>${leadData.message}</p>` : ''}
        <hr>
        <p><em>Submitted at ${new Date().toLocaleString()}</em></p>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('[Email] Lead notification sent successfully:', info.messageId);
    return true;
  } catch (error) {
    console.error('[Email] Failed to send lead notification:', error);
    return false;
  }
}
