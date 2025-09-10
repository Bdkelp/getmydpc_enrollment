import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../../../lib/auth';
import { updateUser, getUserSubscription, updateSubscription } from '../../../lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'PUT') {
    return res.status(405).json({ message: 'Method not allowed' });
  }
  
  try {
    const user = await requireAuth(req, 'admin');
    const { userId } = req.query;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ message: "User ID is required" });
    }

    // Reactivate user
    const updatedUser = await updateUser(userId, {
      isActive: true,
      updatedAt: new Date()
    });

    // Also reactivate their subscription if it was suspended due to deactivation
    const subscription = await getUserSubscription(userId);
    if (subscription) {
      if (subscription.status === 'suspended' && subscription.pendingReason === 'user_deactivated') {
        await updateSubscription(subscription.id, {
          status: 'active',
          pendingReason: null,
          pendingDetails: null,
          updatedAt: new Date()
        });
      }
    }

    return res.status(200).json(updatedUser);
  } catch (error: any) {
    console.error("Error reactivating user:", error);
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (error.message === 'Forbidden') {
      return res.status(403).json({ message: "Admin access required" });
    }
    return res.status(500).json({ message: "Failed to reactivate user" });
  }
}