import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../lib/auth';
import { getUserSubscriptions } from '../lib/db';

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
    const subscriptions = await getUserSubscriptions(user.id);
    return res.status(200).json(subscriptions);
  } catch (error: any) {
    console.error("Error fetching subscriptions:", error);
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ message: "Unauthorized" });
    }
    return res.status(500).json({ message: "Failed to fetch subscriptions" });
  }
}