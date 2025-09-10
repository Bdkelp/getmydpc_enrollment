import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './lib/auth';
import { getPlan } from './lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }
  
  try {
    const user = await requireAuth(req);
    
    console.log('[Payment Processing] Request received:', {
      userId: user.id,
      bodyKeys: Object.keys(req.body),
      amount: req.body.amount
    });

    const { planId, amount, paymentMethod } = req.body;

    if (!planId || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: planId and amount'
      });
    }

    // Validate plan exists
    const plan = await getPlan(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        error: 'Plan not found'
      });
    }

    // For now, redirect to EPX payment creation
    return res.status(200).json({
      success: true,
      message: 'Use EPX payment endpoint',
      redirectTo: '/api/epx/create-payment'
    });

  } catch (error: any) {
    console.error('[Payment Processing] Error:', error);
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ message: "Unauthorized" });
    }
    return res.status(500).json({
      success: false,
      error: 'Payment processing failed',
      details: error.message
    });
  }
}