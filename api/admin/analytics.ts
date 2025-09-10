import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../lib/auth';
import { getComprehensiveAnalytics } from '../lib/db';

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
    const user = await requireAuth(req, 'admin');
    
    const { days = "30", refresh = "false" } = req.query;

    console.log(`[Analytics API] Fetching analytics for ${days} days (refresh: ${refresh})`);

    // Get comprehensive analytics data
    const analytics = await getComprehensiveAnalytics(parseInt(days as string));

    console.log('[Analytics API] Analytics overview:', {
      totalMembers: analytics.overview?.totalMembers || 0,
      activeSubscriptions: analytics.overview?.activeSubscriptions || 0,
      monthlyRevenue: analytics.overview?.monthlyRevenue || 0,
      recentEnrollments: analytics.recentEnrollments?.length || 0
    });

    return res.status(200).json(analytics);
  } catch (error: any) {
    console.error("Error fetching analytics:", error);
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (error.message === 'Forbidden') {
      return res.status(403).json({ message: "Admin access required" });
    }
    return res.status(500).json({ 
      message: "Failed to fetch analytics", 
      error: error.message 
    });
  }
}