/**
 * PayAnywhere Webhook Handler
 * Processes payment notifications from North.com PayAnywhere
 */

import { Request, Response } from 'express';
import { paymentService } from '../services/payment-service';
import { storage } from '../storage';

export interface PayAnywhereWebhookEvent {
  event: string;
  timestamp: string;
  data: {
    transactionId: string;
    merchantId: string;
    amount: number;
    currency: string;
    status: 'approved' | 'declined' | 'refunded' | 'voided';
    cardLast4?: string;
    cardType?: string;
    authorizationCode?: string;
    metadata?: Record<string, any>;
    refundData?: {
      refundId: string;
      refundAmount: number;
      refundReason?: string;
    };
  };
}

/**
 * Handle PayAnywhere webhook events
 */
export async function handlePayAnywhereWebhook(req: Request, res: Response) {
  try {
    console.log('[PayAnywhere Webhook] Received event');
    
    // Verify webhook signature
    const signature = req.headers['x-payanywhere-signature'] as string;
    if (!signature) {
      console.error('[PayAnywhere Webhook] Missing signature');
      return res.status(401).json({ error: 'Missing signature' });
    }
    
    // Validate the webhook using payment service
    const isValid = paymentService.validateWebhook(req.body, signature);
    if (!isValid) {
      console.error('[PayAnywhere Webhook] Invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    const event = req.body as PayAnywhereWebhookEvent;
    console.log(`[PayAnywhere Webhook] Processing event: ${event.event}`, {
      transactionId: event.data.transactionId,
      status: event.data.status
    });
    
    // Process different event types
    switch (event.event) {
      case 'payment.approved':
        await handlePaymentApproved(event);
        break;
        
      case 'payment.declined':
        await handlePaymentDeclined(event);
        break;
        
      case 'payment.refunded':
        await handlePaymentRefunded(event);
        break;
        
      case 'payment.voided':
        await handlePaymentVoided(event);
        break;
        
      default:
        console.log(`[PayAnywhere Webhook] Unhandled event type: ${event.event}`);
    }
    
    // Acknowledge receipt
    res.status(200).json({ received: true });
    
  } catch (error) {
    console.error('[PayAnywhere Webhook] Error processing webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}

/**
 * Handle successful payment
 */
async function handlePaymentApproved(event: PayAnywhereWebhookEvent) {
  const { transactionId, metadata } = event.data;
  
  if (!metadata?.subscriptionId) {
    console.warn('[PayAnywhere Webhook] No subscription ID in metadata');
    return;
  }
  
  try {
    // TODO: When PayAnywhere integration is complete, implement:
    // 1. Find payment by transaction ID
    // 2. Update payment status to 'succeeded'
    // 3. Activate the subscription
    
    console.log(`[PayAnywhere Webhook] Payment approved for subscription: ${metadata.subscriptionId}`);
    console.log('Transaction details:', {
      transactionId,
      amount: event.data.amount,
      currency: event.data.currency,
      authCode: event.data.authorizationCode
    });
    
    // Activate the subscription
    if (metadata.subscriptionId) {
      await storage.updateSubscription(metadata.subscriptionId, {
        status: 'active',
        pendingReason: null
      });
    }
    
  } catch (error) {
    console.error('[PayAnywhere Webhook] Error handling payment approval:', error);
  }
}

/**
 * Handle declined payment
 */
async function handlePaymentDeclined(event: PayAnywhereWebhookEvent) {
  const { transactionId, metadata } = event.data;
  
  if (!metadata?.subscriptionId) {
    console.warn('[PayAnywhere Webhook] No subscription ID in metadata');
    return;
  }
  
  try {
    // TODO: When PayAnywhere integration is complete, implement:
    // 1. Find payment by transaction ID
    // 2. Update payment status to 'failed'
    
    console.log(`[PayAnywhere Webhook] Payment declined for subscription: ${metadata.subscriptionId}`);
    console.log('Decline details:', {
      transactionId,
      amount: event.data.amount,
      status: event.data.status
    });
    
    // Update subscription status
    if (metadata.subscriptionId) {
      await storage.updateSubscription(metadata.subscriptionId, {
        status: 'pending',
        pendingReason: 'payment_declined'
      });
    }
    
  } catch (error) {
    console.error('[PayAnywhere Webhook] Error handling payment decline:', error);
  }
}

/**
 * Handle refunded payment
 */
async function handlePaymentRefunded(event: PayAnywhereWebhookEvent) {
  const { transactionId, refundData } = event.data;
  
  if (!refundData) {
    console.warn('[PayAnywhere Webhook] No refund data provided');
    return;
  }
  
  try {
    // TODO: When PayAnywhere integration is complete, implement:
    // 1. Find payment by transaction ID
    // 2. Create refund record in database
    // 3. Update payment status to 'refunded'
    
    console.log(`[PayAnywhere Webhook] Payment refunded: ${transactionId}`);
    console.log('Refund details:', {
      refundId: refundData.refundId,
      amount: refundData.refundAmount,
      reason: refundData.refundReason
    });
    
  } catch (error) {
    console.error('[PayAnywhere Webhook] Error handling refund:', error);
  }
}

/**
 * Handle voided payment
 */
async function handlePaymentVoided(event: PayAnywhereWebhookEvent) {
  const { transactionId, metadata } = event.data;
  
  try {
    // TODO: When PayAnywhere integration is complete, implement:
    // 1. Find payment by transaction ID
    // 2. Update payment status to 'canceled'
    // 3. Update linked subscription if applicable
    
    console.log(`[PayAnywhere Webhook] Payment voided: ${transactionId}`);
    console.log('Void details:', {
      transactionId,
      amount: event.data.amount,
      subscriptionId: metadata?.subscriptionId
    });
    
    // Update subscription if linked
    if (metadata?.subscriptionId) {
      await storage.updateSubscription(metadata.subscriptionId, {
        status: 'pending',
        pendingReason: 'payment_voided'
      });
    }
    
  } catch (error) {
    console.error('[PayAnywhere Webhook] Error handling void:', error);
  }
}