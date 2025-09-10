import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../lib/auth';
import { getCommissionStats, getAgentEnrollments } from '../lib/db';

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
    const user = await requireAuth(req, 'agent');
    const agentId = user.id;

    // Get commission stats
    const commissionStats = await getCommissionStats(agentId);

    // Get enrollment counts
    const enrollments = await getAgentEnrollments(agentId);
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const monthlyEnrollments = enrollments.filter(e => 
      new Date(e.createdAt) >= thisMonth
    ).length;

    // Get active members count
    const activeMembers = enrollments.filter(e => e.isActive).length;

    return res.status(200).json({
      totalEnrollments: enrollments.length,
      monthlyEnrollments,
      activeMembers,
      ...commissionStats
    });
  } catch (error: any) {
    console.error("Error fetching agent stats:", error);
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (error.message === 'Forbidden') {
      return res.status(403).json({ message: "Agent access required" });
    }
    return res.status(500).json({ message: "Failed to fetch agent stats" });
  }
}