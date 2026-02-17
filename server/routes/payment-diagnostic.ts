/**
 * Payment Execution Diagnostic Tool
 * Checks if member #7 actually completed payment through EPX
 */

import { Router, Response } from 'express';
import { storage } from '../storage';
import { authenticateToken, type AuthRequest } from '../auth/supabaseAuth';
import { isAtLeastAdmin } from '../auth/roles';
import { query } from '../lib/neonDb';
import { getRecentEPXLogs } from '../services/epx-payment-logger';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

/**
 * Diagnostic: Check if payment actually executed for a specific member
 */
router.get('/api/admin/diagnostic/payment-execution/:memberId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isAtLeastAdmin(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const memberId = parseInt(req.params.memberId);
    if (isNaN(memberId)) {
      return res.status(400).json({ error: 'Invalid member ID' });
    }

    // 1. Get member details
    const member = await storage.getMemberById(memberId);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // 2. Check for payment record linked to this member
    const memberPaymentResult = await query(
      'SELECT * FROM payments WHERE member_id = $1 ORDER BY created_at DESC LIMIT 1',
      [memberId]
    );
    const memberPayment = memberPaymentResult.rows[0];

    // 3. Check for payments by this agent around enrollment date
    const enrollmentDate = new Date(member.enrollment_date);
    const dateBefore = new Date(enrollmentDate.getTime() - 24 * 60 * 60 * 1000); // 1 day before
    const dateAfter = new Date(enrollmentDate.getTime() + 24 * 60 * 60 * 1000); // 1 day after

    const agentPaymentsResult = await query(
      `SELECT * FROM payments 
       WHERE user_id = $1 
         AND created_at >= $2 
         AND created_at <= $3
       ORDER BY created_at DESC`,
      [member.enrolled_by_agent_id, dateBefore.toISOString(), dateAfter.toISOString()]
    );
    const agentPayments = agentPaymentsResult.rows;

    // 4. Check for orphaned payments (no member linked) around that time
    const orphanedPaymentsResult = await query(
      `SELECT * FROM payments 
       WHERE member_id IS NULL 
         AND created_at >= $1 
         AND created_at <= $2
       ORDER BY created_at DESC`,
      [dateBefore.toISOString(), dateAfter.toISOString()]
    );
    const orphanedPayments = orphanedPaymentsResult.rows;

    // 5. Check for payments with matching amount
    const matchingAmountResult = await query(
      `SELECT * FROM payments 
       WHERE amount::numeric = $1 
         AND created_at >= $2 
         AND created_at <= $3
       ORDER BY created_at DESC`,
      [member.total_monthly_price, dateBefore.toISOString(), dateAfter.toISOString()]
    );
    const matchingAmountPayments = matchingAmountResult.rows;

    // 6. Check commission record
    const commissionResult = await query(
      'SELECT * FROM agent_commissions WHERE member_id = $1',
      [memberId]
    );
    const commissions = commissionResult.rows;

    // 7. Check EPX logs (in-memory buffer + log files)
    let epxLogs: any[] = [];
    try {
      // Get recent EPX logs from memory
      const recentLogs = getRecentEPXLogs(200);
      
      // Filter logs around enrollment date
      const enrollmentDateStr = enrollmentDate.toISOString().split('T')[0];
      epxLogs = recentLogs.filter(log => {
        const logDate = log.timestamp.split('T')[0];
        return logDate === enrollmentDateStr;
      });

      // Also try to read from log files
      const logDir = process.env.EPX_LOG_DIR || path.join(process.cwd(), 'logs', 'epx');
      const logFile = path.join(logDir, `epx-${enrollmentDateStr}.jsonl`);
      
      if (fs.existsSync(logFile)) {
        const fileContent = fs.readFileSync(logFile, 'utf8');
        const fileLines = fileContent.split('\n').filter(line => line.trim());
        const fileLogs = fileLines.map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        }).filter(log => log !== null);
        
        // Look for logs mentioning this member or agent
        const relevantLogs = fileLogs.filter((log: any) => {
          const data = log.data || {};
          return (
            data.memberId === memberId ||
            data.member_id === memberId ||
            data.customerId === member.customer_number ||
            data.customerEmail === member.email ||
            data.userId === member.enrolled_by_agent_id ||
            (data.amount && parseFloat(data.amount) === member.total_monthly_price)
          );
        });
        
        epxLogs = [...epxLogs, ...relevantLogs];
      }
    } catch (logError: any) {
      console.warn('[Diagnostic] Error reading EPX logs:', logError.message);
    }

    // 8. Determine conclusion
    let conclusion = '';
    let paymentExecuted = false;
    let evidence: string[] = [];

    if (memberPayment) {
      paymentExecuted = true;
      evidence.push(`✅ Payment record exists (ID: ${memberPayment.id}, Status: ${memberPayment.status})`);
    } else {
      evidence.push('❌ No payment record found for this member');
    }

    if (agentPayments.length > 0) {
      evidence.push(`🔍 Found ${agentPayments.length} payment(s) by this agent around enrollment date`);
    }

    if (orphanedPayments.length > 0) {
      evidence.push(`⚠️  Found ${orphanedPayments.length} orphaned payment(s) (no member linked) around enrollment date`);
    }

    if (matchingAmountPayments.length > 0) {
      evidence.push(`💰 Found ${matchingAmountPayments.length} payment(s) matching amount ($${member.total_monthly_price})`);
    }

    if (commissions.length > 0) {
      evidence.push(`✅ Commission record exists (${commissions.length} record(s))`);
    }

    if (epxLogs.length > 0) {
      const successLogs = epxLogs.filter((log: any) => 
        log.message?.toLowerCase().includes('success') || 
        log.data?.status === 'succeeded'
      );
      evidence.push(`📋 Found ${epxLogs.length} EPX log entries (${successLogs.length} success indicators)`);
    }

    // Determine what likely happened
    if (memberPayment && memberPayment.status === 'succeeded') {
      conclusion = '✅ PAYMENT EXECUTED: Payment record exists with succeeded status. Member completed checkout successfully.';
    } else if (orphanedPayments.length > 0 || matchingAmountPayments.length > 0) {
      conclusion = '⚠️  PAYMENT LIKELY EXECUTED BUT NOT LINKED: Found payment records that might belong to this member but aren\'t properly associated.';
      paymentExecuted = true;
    } else if (epxLogs.some((log: any) => log.level === 'error' || log.message?.toLowerCase().includes('fail'))) {
      conclusion = '❌ PAYMENT FAILED: EPX logs show errors. Payment processing failed.';
    } else if (commissions.length > 0 && !memberPayment) {
      conclusion = '🚨 INCONSISTENT STATE: Commission exists but payment record missing. This is the bug we found - payment tracking failed during enrollment.';
    } else {
      conclusion = '❓ PAYMENT LIKELY NOT EXECUTED: No evidence of payment processing. Member may have abandoned checkout or payment was never initiated.';
    }

    res.json({
      success: true,
      memberId: memberId,
      memberInfo: {
        customerNumber: member.customer_number,
        name: `${member.first_name} ${member.last_name}`,
        email: member.email,
        amount: member.total_monthly_price,
        enrollmentDate: member.enrollment_date,
        agentNumber: member.agent_number,
        status: member.status,
        hasPaymentToken: !!member.payment_token
      },
      evidence: {
        memberPayment: memberPayment || null,
        agentPayments: agentPayments.length,
        orphanedPayments: orphanedPayments.length,
        matchingAmountPayments: matchingAmountPayments.length,
        commissions: commissions.length,
        epxLogs: epxLogs.length
      },
      detailedEvidence: evidence,
      conclusion: conclusion,
      paymentExecuted: paymentExecuted,
      recommendations: paymentExecuted ? [
        'Payment likely executed - verify with EPX settlement reports',
        'If payment confirmed, create manual payment record for tracking',
        'Investigate why payment record wasn\'t created automatically'
      ] : [
        'Payment may not have been completed',
        'Check EPX merchant portal for transaction on this date',
        'If no transaction found, member abandoned checkout',
        'If transaction found, create manual payment record'
      ]
    });

  } catch (error: any) {
    console.error('[Diagnostic] Error checking payment execution:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

export default router;
