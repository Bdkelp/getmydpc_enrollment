import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../lib/auth';
import { getAllLeads } from '../lib/db';

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
    
    console.log('[Admin Leads API] Fetching leads with filters:', req.query);
    const { status, assignedAgentId } = req.query;

    const leads = await getAllLeads(
      status as string || undefined,
      assignedAgentId as string || undefined
    );

    console.log(`[Admin Leads API] Found ${leads.length} leads`);

    return res.status(200).json(leads);
  } catch (error: any) {
    console.error('[Admin Leads API] Error fetching leads:', error);
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (error.message === 'Forbidden') {
      return res.status(403).json({ message: "Admin access required" });
    }
    return res.status(500).json({ 
      message: "Failed to fetch leads",
      error: error.message 
    });
  }
}