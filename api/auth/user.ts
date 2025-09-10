import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../lib/auth';
import { getUserSubscription, getPlan } from '../lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }
  
  try {
    const user = await requireAuth(req);

    // Get user's subscription and plan info
    const activeSubscription = await getUserSubscription(user.id);

    let planInfo = null;
    if (activeSubscription && activeSubscription.planId) {
      try {
        const plan = await getPlan(activeSubscription.planId);
        planInfo = plan;
      } catch (error) {
        console.error('Error fetching plan:', error);
        // Continue without plan info
      }
    }

    const userResponse = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      agentNumber: user.agentNumber,
      subscription: activeSubscription,
      plan: planInfo,
      isActive: user.isActive,
      approvalStatus: user.approvalStatus
    };

    return res.status(200).json(userResponse);
  } catch (error: any) {
    console.error("Error in /api/auth/user:", error);
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ message: "User not found" });
    }
    return res.status(500).json({ message: "Internal server error" });
  }
}