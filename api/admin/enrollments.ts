import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../lib/auth';
import { getAllEnrollments, getEnrollmentsByAgent } from '../lib/db';

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
    
    const { startDate, endDate, agentId } = req.query;

    let enrollments;
    if (agentId && agentId !== 'all') {
      enrollments = await getEnrollmentsByAgent(agentId as string, startDate as string, endDate as string);
    } else {
      enrollments = await getAllEnrollments(startDate as string, endDate as string);
    }

    // Ensure we always return an array
    const safeEnrollments = Array.isArray(enrollments) ? enrollments : [];
    
    return res.status(200).json(safeEnrollments);
  } catch (error: any) {
    console.error("Error fetching enrollments:", error);
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (error.message === 'Forbidden') {
      return res.status(403).json({ message: "Admin access required" });
    }
    return res.status(500).json({ 
      message: "Failed to fetch enrollments", 
      error: error.message 
    });
  }
}