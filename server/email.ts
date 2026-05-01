import sgMail from '@sendgrid/mail';

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const COMPANY_EMAIL = (process.env.COMPANY_EMAIL || 'support@mypremierplans.com').trim();
const SENDGRID_FROM_EMAIL = (process.env.SENDGRID_FROM_EMAIL || COMPANY_EMAIL).trim();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

interface WelcomeWithPasswordData {
  email: string;
  firstName: string;
  temporaryPassword: string;
  loginUrl: string;
}

export async function sendWelcomeWithPassword(data: WelcomeWithPasswordData): Promise<boolean> {
  if (!SENDGRID_API_KEY) {
    console.warn('[Email] Skipping welcome email - SendGrid not configured');
    return false;
  }

  try {
    await sgMail.send({
      to: data.email,
      from: SENDGRID_FROM_EMAIL,
      subject: 'Welcome to MyPremierPlans - Your Account Details',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
          <div style="background: #0f172a; color: #fff; padding: 24px; border-radius: 12px 12px 0 0;">
            <h2 style="margin: 0; font-size: 24px;">Welcome to MyPremierPlans, ${data.firstName}!</h2>
          </div>
          <div style="border: 1px solid #e2e8f0; border-top: none; padding: 32px; background: #fff;">
            <p style="font-size: 16px; color: #1f2937;">Your account has been created by an administrator. You can now access the enrollment portal using the credentials below.</p>
            
            <div style="background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0;">
              <p style="margin: 0 0 12px 0; font-size: 14px; color: #64748b; font-weight: 600;">LOGIN CREDENTIALS</p>
              <p style="margin: 0 0 8px 0; font-size: 15px; color: #1f2937;">
                <strong>Email:</strong> ${data.email}
              </p>
              <p style="margin: 0; font-size: 15px; color: #1f2937;">
                <strong>Temporary Password:</strong> <span style="font-family: monospace; background: #fff; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px;">${data.temporaryPassword}</span>
              </p>
            </div>

            <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 24px 0;">
              <p style="margin: 0; font-size: 14px; color: #92400e;">
                <strong>⚠️ Important:</strong> You will be required to change your password upon first login for security purposes.
              </p>
            </div>

            <div style="margin: 32px 0; text-align: center;">
              <a href="${data.loginUrl}" style="background: linear-gradient(90deg, #2563eb 0%, #1d4ed8 100%); color: white; padding: 14px 28px; text-decoration: none; border-radius: 999px; font-weight: 600; display: inline-block;">
                Log In Now
              </a>
            </div>

            <p style="font-size: 14px; color: #4b5563;">Or visit:</p>
            <p style="font-size: 14px; color: #2563eb; word-break: break-all;">${data.loginUrl}</p>
            
            <p style="margin-top: 24px; color: #6b7280; font-size: 13px;">If you have any questions or did not expect to receive this account, please contact your administrator immediately.</p>
          </div>
          <div style="background: #0f172a; color: #94a3b8; padding: 16px; text-align: center; border-radius: 0 0 12px 12px; font-size: 12px;">
            MyPremierPlans · Direct Primary Care Enrollment Platform<br>
            Need help? Contact support@mypremierplans.com
          </div>
        </div>
      `
    });

    console.log('[Email] Welcome email with password sent via SendGrid to:', data.email);
    return true;
  } catch (error) {
    console.error('[Email] Failed to send welcome email:', error);
    return false;
  }
}

export interface RecurringBillingCycleReportRow {
  subscriptionId: number;
  memberId: number;
  payerDisplayName?: string | null;
  amount?: string;
  paymentMethodType?: string;
  result: string;
  skipReason?: string | null;
  billingEventId?: number | null;
}

export interface RecurringBillingCycleReportData {
  recipients: string[];
  mode: 'LIVE' | 'DRY RUN';
  source: 'automatic' | 'manual';
  startedAt: string;
  completedAt: string;
  dueCount: number;
  succeeded: RecurringBillingCycleReportRow[];
  unsuccessful: RecurringBillingCycleReportRow[];
}

export async function sendRecurringBillingCycleReport(
  data: RecurringBillingCycleReportData,
): Promise<boolean> {
  if (!SENDGRID_API_KEY) {
    console.warn('[Email] Skipping recurring billing cycle report - SendGrid not configured');
    return false;
  }

  const recipients = (data.recipients || []).map((entry) => String(entry || '').trim()).filter(Boolean);
  if (recipients.length === 0) {
    console.warn('[Email] Skipping recurring billing cycle report - no recipients configured');
    return false;
  }

  const succeededRows = data.succeeded || [];
  const unsuccessfulRows = data.unsuccessful || [];

  const renderRows = (rows: RecurringBillingCycleReportRow[], emptyLabel: string) => {
    if (!rows.length) {
      return `<p style="font-size: 14px; color: #6b7280; margin: 8px 0 0;">${escapeHtml(emptyLabel)}</p>`;
    }

    const rowHtml = rows
      .map((row) => {
        const payer = escapeHtml((row.payerDisplayName || `Member ${row.memberId}`).toString());
        const amount = escapeHtml(String(row.amount || '0.00'));
        const method = escapeHtml(String(row.paymentMethodType || 'UNKNOWN'));
        const result = escapeHtml(String(row.result || 'unknown'));
        const skipReason = row.skipReason ? ` (${escapeHtml(String(row.skipReason))})` : '';
        return `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${row.subscriptionId}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${row.memberId}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${payer}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">$${amount}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${method}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${result}${skipReason}</td>
          </tr>
        `;
      })
      .join('');

    return `
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px;">
        <thead>
          <tr style="background: #f8fafc; text-align: left;">
            <th style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Subscription</th>
            <th style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Member</th>
            <th style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Name</th>
            <th style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Amount</th>
            <th style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Method</th>
            <th style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Outcome</th>
          </tr>
        </thead>
        <tbody>
          ${rowHtml}
        </tbody>
      </table>
    `;
  };

  const subject =
    `[Recurring Billing] ${data.mode} ${data.source} cycle ` +
    `- success ${succeededRows.length}, unsuccessful ${unsuccessfulRows.length}`;

  try {
    await sgMail.send({
      to: recipients,
      from: SENDGRID_FROM_EMAIL,
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto;">
          <div style="background: #0f172a; color: #fff; padding: 20px; border-radius: 10px 10px 0 0;">
            <h2 style="margin: 0; font-size: 20px;">Recurring Billing Cycle Summary</h2>
          </div>
          <div style="border: 1px solid #e5e7eb; border-top: none; padding: 20px; background: #fff;">
            <p style="margin: 0 0 8px; font-size: 14px; color: #111827;"><strong>Mode:</strong> ${escapeHtml(data.mode)}</p>
            <p style="margin: 0 0 8px; font-size: 14px; color: #111827;"><strong>Source:</strong> ${escapeHtml(data.source)}</p>
            <p style="margin: 0 0 8px; font-size: 14px; color: #111827;"><strong>Started:</strong> ${escapeHtml(data.startedAt)}</p>
            <p style="margin: 0 0 8px; font-size: 14px; color: #111827;"><strong>Completed:</strong> ${escapeHtml(data.completedAt)}</p>
            <p style="margin: 0 0 8px; font-size: 14px; color: #111827;"><strong>Due Count:</strong> ${data.dueCount}</p>
            <p style="margin: 0 0 18px; font-size: 14px; color: #111827;"><strong>Successful:</strong> ${succeededRows.length} &nbsp; <strong>Unsuccessful:</strong> ${unsuccessfulRows.length}</p>

            <h3 style="margin: 18px 0 8px; color: #065f46;">Successful Transactions</h3>
            ${renderRows(succeededRows, 'No successful transactions in this cycle.')}

            <h3 style="margin: 24px 0 8px; color: #991b1b;">Unsuccessful / Skipped Transactions</h3>
            ${renderRows(unsuccessfulRows, 'No unsuccessful or skipped transactions in this cycle.')}
          </div>
        </div>
      `,
    });

    console.log('[Email] Recurring billing cycle report sent to:', recipients.join(', '));
    return true;
  } catch (error) {
    console.error('[Email] Failed to send recurring billing cycle report:', error);
    return false;
  }
}

export interface AnalyticsReportEmailData {
  recipient: string;
  reportType: string;
  format: 'csv' | 'xlsx' | 'pdf';
  fileBuffer: Buffer;
  timeRange?: string;
}

export async function sendAnalyticsReportEmail(data: AnalyticsReportEmailData): Promise<boolean> {
  if (!SENDGRID_API_KEY) {
    console.warn('[Email] Skipping analytics report email - SendGrid not configured');
    return false;
  }

  const recipient = String(data.recipient || '').trim();
  if (!recipient) {
    console.warn('[Email] Skipping analytics report email - recipient missing');
    return false;
  }

  const safeReportType = String(data.reportType || 'overview').trim().toLowerCase();
  const safeFormat = (data.format || 'csv') as 'csv' | 'xlsx' | 'pdf';
  const safeTimeRange = String(data.timeRange || '30');
  const filename = `${safeReportType}_report_${new Date().toISOString().slice(0, 10)}.${safeFormat}`;

  try {
    await sgMail.send({
      to: recipient,
      from: SENDGRID_FROM_EMAIL,
      subject: `Analytics Report Ready: ${safeReportType.toUpperCase()} (${safeTimeRange}d)`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
          <div style="background: #0f172a; color: #fff; padding: 24px; border-radius: 12px 12px 0 0;">
            <h2 style="margin: 0; font-size: 22px;">Analytics Report Attached</h2>
          </div>
          <div style="border: 1px solid #e2e8f0; border-top: none; padding: 24px; background: #fff;">
            <p style="font-size: 14px; color: #1f2937; margin: 0 0 12px;">
              Your <strong>${escapeHtml(safeReportType)}</strong> analytics report is attached in <strong>${escapeHtml(safeFormat.toUpperCase())}</strong> format.
            </p>
            <p style="font-size: 14px; color: #4b5563; margin: 0;">
              Requested window: ${escapeHtml(safeTimeRange)} days
            </p>
          </div>
        </div>
      `,
      attachments: [
        {
          content: data.fileBuffer.toString('base64'),
          filename,
          type:
            safeFormat === 'csv'
              ? 'text/csv'
              : safeFormat === 'xlsx'
                ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                : 'application/pdf',
          disposition: 'attachment',
        },
      ],
    });

    console.log('[Email] Analytics report email sent to:', recipient, 'file:', filename);
    return true;
  } catch (error) {
    console.error('[Email] Failed to send analytics report email:', error);
    return false;
  }
}
