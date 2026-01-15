import sgMail from '@sendgrid/mail';

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const COMPANY_EMAIL = (process.env.COMPANY_EMAIL || 'support@mypremierplans.com').trim();
const SENDGRID_FROM_EMAIL = (process.env.SENDGRID_FROM_EMAIL || COMPANY_EMAIL).trim();

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
  console.log('[Email] SendGrid transporter initialized');
} else {
  console.warn('[Email] SENDGRID_API_KEY not configured. Emails will not be sent.');
}

export interface EmailVerificationData {
  email: string;
  firstName: string;
  verificationUrl: string;
}

export async function sendEmailVerification(data: EmailVerificationData): Promise<boolean> {
  if (!SENDGRID_API_KEY) {
    console.warn('[Email] Skipping email verification - SendGrid not configured');
    return false;
  }

  try {
    await sgMail.send({
      to: data.email,
      from: SENDGRID_FROM_EMAIL,
      subject: 'Verify Your MyPremierPlans Account',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
          <div style="background: #0f172a; color: #fff; padding: 24px; border-radius: 12px 12px 0 0;">
            <h2 style="margin: 0; font-size: 24px;">Welcome to MyPremierPlans, ${data.firstName}!</h2>
          </div>
          <div style="border: 1px solid #e2e8f0; border-top: none; padding: 32px; background: #fff;">
            <p style="font-size: 16px; color: #1f2937;">Thanks for joining our enrollment platform. Please confirm your email address to finish setting up your account.</p>
            <div style="margin: 32px 0; text-align: center;">
              <a href="${data.verificationUrl}" style="background: linear-gradient(90deg, #2563eb 0%, #1d4ed8 100%); color: white; padding: 14px 28px; text-decoration: none; border-radius: 999px; font-weight: 600; display: inline-block;">
                Verify Email Address
              </a>
            </div>
            <p style="font-size: 14px; color: #4b5563;">Or copy and paste this link into your browser:</p>
            <p style="font-size: 13px; color: #6366f1; word-break: break-all;">${data.verificationUrl}</p>
            <p style="margin-top: 24px; color: #6b7280; font-size: 13px;">This link expires in 24 hours. If you didn’t create this account, you can safely ignore this email.</p>
          </div>
          <div style="background: #0f172a; color: #94a3b8; padding: 16px; text-align: center; border-radius: 0 0 12px 12px; font-size: 12px;">
            MyPremierPlans · Direct Primary Care Enrollment Platform
          </div>
        </div>
      `
    });

    console.log('[Email] Verification email sent via SendGrid to:', data.email);
    return true;
  } catch (error) {
    console.error('[Email] Failed to send verification email:', error);
    return false;
  }
}

interface CredentialEmailData {
  email: string;
  firstName: string;
  loginUrl: string;
  setPasswordUrl: string;
}

export async function sendUserCredentialsEmail(data: CredentialEmailData): Promise<boolean> {
  if (!SENDGRID_API_KEY) {
    console.warn('[Email] Skipping credential email - SendGrid not configured');
    return false;
  }

  try {
    await sgMail.send({
      to: data.email,
      from: SENDGRID_FROM_EMAIL,
      subject: 'Your MyPremierPlans Account Is Ready',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
          <div style="background: #0f172a; color: #fff; padding: 24px; border-radius: 12px 12px 0 0;">
            <h2 style="margin: 0; font-size: 24px;">You're all set, ${data.firstName}!</h2>
          </div>
          <div style="border: 1px solid #e2e8f0; border-top: none; padding: 32px; background: #fff;">
            <p style="font-size: 16px; color: #1f2937;">Your email has been confirmed. Set your password now and start using the enrollment portal.</p>
            <div style="margin: 24px 0; text-align: center;">
              <a href="${data.setPasswordUrl}" style="background: linear-gradient(90deg, #0ea5e9 0%, #0284c7 100%); color: white; padding: 14px 28px; text-decoration: none; border-radius: 999px; font-weight: 600; display: inline-block;">
                Set My Password
              </a>
            </div>
            <p style="font-size: 15px; color: #4b5563;">After setting your password, sign in any time at:</p>
            <p style="font-size: 15px; color: #2563eb;">${data.loginUrl}</p>
            <p style="margin-top: 24px; color: #6b7280; font-size: 13px;">For security, this password setup link expires in 24 hours. If it expires, you can request a new link from the login page.</p>
          </div>
          <div style="background: #0f172a; color: #94a3b8; padding: 16px; text-align: center; border-radius: 0 0 12px 12px; font-size: 12px;">
            Need help? Contact support@mypremierplans.com
          </div>
        </div>
      `
    });

    console.log('[Email] Credential setup email sent via SendGrid to:', data.email);
    return true;
  } catch (error) {
    console.error('[Email] Failed to send credential email:', error);
    return false;
  }
}
