import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../lib/auth';
import { getMembersOnly } from '../lib/db';

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
    
    if (user.role !== 'admin' && user.role !== 'agent') {
      return res.status(403).json({ message: "Admin or agent access required" });
    }

    console.log('[Admin Members API] Fetching members only...');
    const membersResult = await getMembersOnly();

    console.log(`[Admin Members API] Found ${membersResult.users.length} members`);
    
    return res.status(200).json(membersResult);
  } catch (error: any) {
    console.error('[Admin Members API] Error fetching members:', error);
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ message: "Unauthorized" });
    }
    return res.status(500).json({ 
      message: "Failed to fetch members",
      error: error.message 
    });
  }
}