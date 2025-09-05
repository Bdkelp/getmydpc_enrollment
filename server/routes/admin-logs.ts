
import { Router, Request, Response } from 'express';
import { storage } from '../storage';

const router = Router();

/**
 * Get transaction logs for admin review
 */
router.get('/api/admin/transaction-logs', async (req: Request, res: Response) => {
  try {
    const { 
      startDate, 
      endDate, 
      status, 
      environment,
      transactionId,
      customerId,
      limit = 100 
    } = req.query;

    // Get payments with filters
    const payments = await storage.getPaymentsWithFilters({
      startDate: startDate as string,
      endDate: endDate as string,
      status: status as string,
      transactionId: transactionId as string,
      customerId: customerId as string,
      limit: parseInt(limit as string)
    });

    // Format for logging view
    const logEntries = payments.map(payment => ({
      transactionId: payment.transactionId,
      timestamp: payment.createdAt,
      status: payment.status,
      amount: payment.amount,
      customerId: payment.userId,
      paymentMethod: payment.paymentMethod,
      environment: payment.metadata?.environment || 'sandbox',
      authCode: payment.authorizationCode,
      bricToken: payment.metadata?.bricToken ? 'Present' : 'None',
      processingTime: payment.metadata?.processingTime,
      error: payment.metadata?.error,
      ipAddress: payment.metadata?.ipAddress,
      userAgent: payment.metadata?.userAgent
    }));

    res.json({
      success: true,
      logs: logEntries,
      total: logEntries.length,
      filters: {
        startDate,
        endDate,
        status,
        environment: environment || process.env.EPX_ENVIRONMENT || 'sandbox'
      }
    });

  } catch (error: any) {
    console.error('[Admin Logs] Error fetching transaction logs:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch transaction logs'
    });
  }
});

/**
 * Export transaction logs as CSV for audit
 */
router.get('/api/admin/export-logs', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    
    const payments = await storage.getPaymentsWithFilters({
      startDate: startDate as string,
      endDate: endDate as string
    });

    // Convert to CSV format
    const csvHeader = 'Transaction ID,Timestamp,Status,Amount,Customer ID,Payment Method,Environment,Auth Code,Error\n';
    const csvRows = payments.map(p => 
      `"${p.transactionId}","${p.createdAt}","${p.status}","${p.amount}","${p.userId}","${p.paymentMethod}","${p.metadata?.environment || 'sandbox'}","${p.authorizationCode || ''}","${p.metadata?.error || ''}"`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="transaction-logs-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvHeader + csvRows);

  } catch (error: any) {
    console.error('[Admin Logs] Error exporting logs:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to export logs'
    });
  }
});

export default router;
