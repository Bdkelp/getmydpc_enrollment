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

export interface EmailVerificationData {
  email: string;
  firstName: string;
  verificationUrl: string;
}

export async function sendEmailVerification(data: EmailVerificationData): Promise<boolean> {
  if (!transporter) {
    console.warn('[Email] Skipping email verification - transporter not configured');
    return false;
  }

  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: data.email,
      subject: 'Verify Your MyPremierPlans Account',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Welcome to MyPremierPlans, ${data.firstName}!</h2>
          
          <p>Thank you for joining our DPC enrollment platform. To complete your account setup, please verify your email address.</p>
          
          <div style="margin: 30px 0;">
            <a href="${data.verificationUrl}" 
               style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
              Verify Email Address
            </a>
          </div>
          
          <p>Or copy and paste this link into your browser:</p>
          <p style="color: #666; word-break: break-all;">${data.verificationUrl}</p>
          
          <p style="margin-top: 30px; color: #666; font-size: 14px;">
            This link will expire in 24 hours. If you didn't create this account, please ignore this email.
          </p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
          
          <p style="color: #999; font-size: 12px;">
            MyPremierPlans - Direct Primary Care Enrollment<br>
            <em>This is an automated message, please do not reply.</em>
          </p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('[Email] Verification email sent successfully:', info.messageId, 'to:', data.email);
    return true;
  } catch (error) {
    console.error('[Email] Failed to send verification email:', error);
    return false;
  }
}
