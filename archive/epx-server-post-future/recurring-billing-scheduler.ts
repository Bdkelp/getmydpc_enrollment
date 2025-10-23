/**
 * Recurring Billing Scheduler
 * Processes monthly membership charges using EPX Server Post API
 * 
 * Runs: Daily at 2:00 AM
 * Purpose: Charge members whose next_billing_date is due
 */

import cron from 'node-cron';
import { db } from '../db';
import { 
  billingSchedule, 
  paymentTokens, 
  recurringBillingLog, 
  payments,
  members,
  subscriptions
} from '../../shared/schema';
import { eq, and, lte, sql } from 'drizzle-orm';
import { EPXServerPostService, createEPXServerPostService } from './epx-server-post-service';

// ============================================================
// CONFIGURATION
// ============================================================

const SCHEDULER_CONFIG = {
  // Cron schedule: Daily at 2:00 AM
  cronSchedule: '0 2 * * *',
  
  // Retry configuration
  maxRetries: 3,
  retryDelays: [3, 7, 14], // Days after failure to retry (3 days, 7 days, 14 days)
  
  // Rate limiting
  delayBetweenCharges: 1000, // 1 second between charges
  
  // Email notifications
  sendReceiptEmails: true,
  sendFailureAlerts: true
};

// ============================================================
// RECURRING BILLING SCHEDULER
// ============================================================

export class RecurringBillingScheduler {
  private epxService: EPXServerPostService;
  private isRunning: boolean = false;
  private cronJob: any = null;

  constructor(epxService?: EPXServerPostService) {
    this.epxService = epxService || createEPXServerPostService();
  }

  /**
   * Start the scheduler
   * Runs daily at 2:00 AM
   */
  start(): void {
    console.log('[Billing Scheduler] Starting...');
    console.log('[Billing Scheduler] Schedule: Daily at 2:00 AM');
    
    // Schedule cron job
    this.cronJob = cron.schedule(SCHEDULER_CONFIG.cronSchedule, async () => {
      console.log('[Billing Scheduler] ⏰ Running daily billing check...');
      await this.processDueBillings();
    });
    
    // Also run at startup for any missed billings
    console.log('[Billing Scheduler] Running initial check...');
    this.processDueBillings().catch(err => {
      console.error('[Billing Scheduler] Initial check failed:', err);
    });
    
    console.log('[Billing Scheduler] ✅ Started successfully');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      console.log('[Billing Scheduler] Stopped');
    }
  }

  /**
   * Process all subscriptions due for billing today
   */
  async processDueBillings(): Promise<void> {
    if (this.isRunning) {
      console.log('[Billing Scheduler] Already running, skipping...');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();
    
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      console.log('[Billing Scheduler] 🔍 Finding due billings for:', today.toISOString().split('T')[0]);

      // Find active billing schedules due for billing
      const dueCharges = await db
        .select({
          scheduleId: billingSchedule.id,
          memberId: billingSchedule.memberId,
          amount: billingSchedule.amount,
          paymentTokenId: billingSchedule.paymentTokenId,
          nextBillingDate: billingSchedule.nextBillingDate,
          consecutiveFailures: billingSchedule.consecutiveFailures,
          // Payment token details
          bricToken: paymentTokens.bricToken,
          originalNetworkTransId: paymentTokens.originalNetworkTransId,
          // Member details
          firstName: members.firstName,
          lastName: members.lastName,
          email: members.email,
          customerNumber: members.customerNumber,
          // Subscription details
          subscriptionId: subscriptions.id
        })
        .from(billingSchedule)
        .innerJoin(paymentTokens, eq(billingSchedule.paymentTokenId, paymentTokens.id))
        .innerJoin(members, eq(billingSchedule.memberId, members.id))
        .leftJoin(subscriptions, eq(subscriptions.memberId, members.id))
        .where(
          and(
            eq(billingSchedule.status, 'active'),
            lte(billingSchedule.nextBillingDate, today),
            eq(paymentTokens.isActive, true),
            eq(members.isActive, true)
          )
        );

      console.log(`[Billing Scheduler] 📋 Found ${dueCharges.length} subscriptions due for billing`);

      let successCount = 0;
      let failureCount = 0;
      let errorCount = 0;

      // Process each charge
      for (const charge of dueCharges) {
        try {
          const result = await this.processSingleBilling(charge);
          
          if (result.success) {
            successCount++;
          } else {
            failureCount++;
          }
          
          // Rate limiting: pause between charges
          await this.sleep(SCHEDULER_CONFIG.delayBetweenCharges);
          
        } catch (error: any) {
          console.error(`[Billing Scheduler] ❌ Error processing member ${charge.memberId}:`, error);
          errorCount++;
        }
      }

      const duration = Date.now() - startTime;
      
      console.log('[Billing Scheduler] ✅ Billing run completed');
      console.log(`[Billing Scheduler] 📊 Summary:`);
      console.log(`  - Processed: ${dueCharges.length} charges`);
      console.log(`  - Success: ${successCount}`);
      console.log(`  - Failed: ${failureCount}`);
      console.log(`  - Errors: ${errorCount}`);
      console.log(`  - Duration: ${(duration / 1000).toFixed(2)}s`);

    } catch (error: any) {
      console.error('[Billing Scheduler] ❌ Fatal error:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Process billing for a single subscription
   */
  private async processSingleBilling(charge: any): Promise<{ success: boolean }> {
    const memberId = charge.memberId;
    const scheduleId = charge.scheduleId;
    
    try {
      console.log(`[Billing Scheduler] 💳 Processing member ${charge.customerNumber}...`);

      // Check if payment token is valid
      if (!charge.bricToken || !charge.originalNetworkTransId) {
        console.error(`[Billing Scheduler] ❌ Member ${memberId}: Missing token or network trans ID`);
        await this.handleMissingToken(scheduleId);
        return { success: false };
      }

      // Generate unique invoice number
      const invoiceNumber = `SUB-${charge.subscriptionId || memberId}-${Date.now()}`;
      
      // Determine if this is first recurring payment
      const isFirstRecurring = charge.consecutiveFailures === 0;

      // Attempt charge via EPX Server Post API
      const chargeResult = await this.epxService.processRecurringCharge({
        bricToken: charge.bricToken,
        amount: parseFloat(charge.amount),
        invoiceNumber,
        orderDescription: `Monthly Membership - ${charge.customerNumber}`,
        customerData: {
          firstName: charge.firstName,
          lastName: charge.lastName,
          email: charge.email
        },
        originalNetworkTransactionId: charge.originalNetworkTransId,
        isFirstRecurringPayment: isFirstRecurring
      });

      if (chargeResult.Status === 'Approved') {
        await this.handleSuccessfulBilling(charge, chargeResult, invoiceNumber);
        console.log(`[Billing Scheduler] ✅ Member ${charge.customerNumber}: $${charge.amount} charged successfully`);
        return { success: true };
      } else {
        await this.handleFailedBilling(charge, chargeResult);
        console.log(`[Billing Scheduler] ⚠️  Member ${charge.customerNumber}: Payment declined - ${chargeResult.Message}`);
        return { success: false };
      }

    } catch (error: any) {
      console.error(`[Billing Scheduler] ❌ Member ${memberId}: Unexpected error:`, error);
      await this.handleBillingError(scheduleId, error.message);
      return { success: false };
    }
  }

  /**
   * Handle successful billing
   */
  private async handleSuccessfulBilling(charge: any, result: any, invoiceNumber: string): Promise<void> {
    const now = new Date();
    
    // 1. Create payment record
    const [payment] = await db.insert(payments).values({
      memberId: charge.memberId,
      subscriptionId: charge.subscriptionId,
      amount: charge.amount,
      status: 'succeeded',
      transactionId: result.TransactionId,
      paymentMethod: 'card',
      isRecurring: true,
      epxAuthCode: result.AuthorizationCode,
      epxResponseCode: result.ResponseCode,
      epxNetworkTransId: result.NetworkTransactionId,
      metadata: {
        invoiceNumber,
        billingScheduleId: charge.scheduleId,
        originalNetworkTransId: charge.originalNetworkTransId
      },
      createdAt: now
    }).returning();

    // 2. Log success in recurring_billing_log
    await db.insert(recurringBillingLog).values({
      subscriptionId: charge.subscriptionId,
      memberId: charge.memberId,
      paymentTokenId: charge.paymentTokenId,
      billingScheduleId: charge.scheduleId,
      amount: charge.amount,
      billingDate: now,
      attemptNumber: 1,
      status: 'success',
      epxTransactionId: result.TransactionId,
      epxNetworkTransId: result.NetworkTransactionId,
      epxAuthCode: result.AuthorizationCode,
      epxResponseCode: result.ResponseCode,
      paymentId: payment.id,
      processedAt: now
    });

    // 3. Update billing schedule (trigger will handle next_billing_date)
    const nextBilling = new Date(charge.nextBillingDate);
    nextBilling.setMonth(nextBilling.getMonth() + 1);
    
    await db.update(billingSchedule)
      .set({
        lastBillingDate: now,
        lastSuccessfulBilling: now,
        nextBillingDate: nextBilling,
        consecutiveFailures: 0,
        lastFailureReason: null,
        updatedAt: now
      })
      .where(eq(billingSchedule.id, charge.scheduleId));

    // 4. Update subscription
    if (charge.subscriptionId) {
      await db.update(subscriptions)
        .set({
          lastSuccessfulBilling: now,
          nextBillingDate: nextBilling,
          billingRetryCount: 0,
          billingFailureReason: null,
          status: 'active',
          updatedAt: now
        })
        .where(eq(subscriptions.id, charge.subscriptionId));
    }

    // 5. Update payment token last used
    await db.update(paymentTokens)
      .set({ lastUsedAt: now })
      .where(eq(paymentTokens.id, charge.paymentTokenId));

    // 6. Send receipt email (if enabled)
    if (SCHEDULER_CONFIG.sendReceiptEmails) {
      await this.sendReceiptEmail(charge, payment, result);
    }
  }

  /**
   * Handle failed billing
   */
  private async handleFailedBilling(charge: any, result: any): Promise<void> {
    const now = new Date();
    const attemptNumber = (charge.consecutiveFailures || 0) + 1;
    const maxRetries = SCHEDULER_CONFIG.maxRetries;
    
    // Calculate next retry date
    let nextRetryDate = null;
    if (attemptNumber <= maxRetries) {
      const retryDelay = SCHEDULER_CONFIG.retryDelays[attemptNumber - 1] || 7;
      nextRetryDate = new Date(now);
      nextRetryDate.setDate(nextRetryDate.getDate() + retryDelay);
    }

    // Log failure
    await db.insert(recurringBillingLog).values({
      subscriptionId: charge.subscriptionId,
      memberId: charge.memberId,
      paymentTokenId: charge.paymentTokenId,
      billingScheduleId: charge.scheduleId,
      amount: charge.amount,
      billingDate: now,
      attemptNumber,
      status: attemptNumber >= maxRetries ? 'failed' : 'retry',
      epxResponseCode: result.ResponseCode,
      epxResponseMessage: result.Message,
      failureReason: result.Message,
      nextRetryDate,
      processedAt: now
    });

    // Update billing schedule (trigger will handle consecutive_failures)
    if (attemptNumber >= maxRetries) {
      // Suspend after max retries
      await db.update(billingSchedule)
        .set({
          status: 'suspended',
          lastFailureReason: `Payment failed after ${maxRetries} attempts: ${result.Message}`,
          updatedAt: now
        })
        .where(eq(billingSchedule.id, charge.scheduleId));

      // Suspend subscription
      if (charge.subscriptionId) {
        await db.update(subscriptions)
          .set({
            status: 'suspended',
            billingFailureReason: result.Message,
            updatedAt: now
          })
          .where(eq(subscriptions.id, charge.subscriptionId));
      }

      // Send suspension email
      if (SCHEDULER_CONFIG.sendFailureAlerts) {
        await this.sendSuspensionEmail(charge, result.Message);
      }
    } else {
      // Schedule retry
      await db.update(billingSchedule)
        .set({
          consecutiveFailures: attemptNumber,
          lastFailureReason: result.Message,
          updatedAt: now
        })
        .where(eq(billingSchedule.id, charge.scheduleId));

      // Send retry notification
      if (SCHEDULER_CONFIG.sendFailureAlerts) {
        await this.sendRetryNotificationEmail(charge, attemptNumber, nextRetryDate);
      }
    }
  }

  /**
   * Handle missing token
   */
  private async handleMissingToken(scheduleId: number): Promise<void> {
    await db.update(billingSchedule)
      .set({
        status: 'suspended',
        lastFailureReason: 'No valid payment token',
        updatedAt: new Date()
      })
      .where(eq(billingSchedule.id, scheduleId));
  }

  /**
   * Handle unexpected errors
   */
  private async handleBillingError(scheduleId: number, errorMessage: string): Promise<void> {
    await db.update(billingSchedule)
      .set({
        lastFailureReason: `System error: ${errorMessage}`,
        updatedAt: new Date()
      })
      .where(eq(billingSchedule.id, scheduleId));
  }

  /**
   * Email notifications (placeholders - implement with actual email service)
   */
  private async sendReceiptEmail(charge: any, payment: any, result: any): Promise<void> {
    console.log(`[Email] Receipt sent to ${charge.email}`);
    // TODO: Implement with nodemailer or email service
  }

  private async sendRetryNotificationEmail(charge: any, attemptNumber: number, nextRetryDate: Date): Promise<void> {
    console.log(`[Email] Retry notification sent to ${charge.email}`);
    // TODO: Implement with nodemailer or email service
  }

  private async sendSuspensionEmail(charge: any, reason: string): Promise<void> {
    console.log(`[Email] Suspension notice sent to ${charge.email}`);
    // TODO: Implement with nodemailer or email service
  }

  /**
   * Utility: Sleep for ms milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================
// SINGLETON INSTANCE
// ============================================================

let schedulerInstance: RecurringBillingScheduler | null = null;

export function getRecurringBillingScheduler(): RecurringBillingScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new RecurringBillingScheduler();
  }
  return schedulerInstance;
}

export function startRecurringBillingScheduler(): void {
  const scheduler = getRecurringBillingScheduler();
  scheduler.start();
}

export function stopRecurringBillingScheduler(): void {
  if (schedulerInstance) {
    schedulerInstance.stop();
  }
}
