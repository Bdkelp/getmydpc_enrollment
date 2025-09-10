import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../../../lib/auth';
import { updateUser, getUserByAgentNumber } from '../../../lib/db';

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
    const { agentNumber } = req.body;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ message: "User ID is required" });
    }

    if (!agentNumber) {
      return res.status(400).json({ message: "Agent number is required" });
    }

    // Check if agent number is already taken
    const existingUser = await getUserByAgentNumber(agentNumber);
    if (existingUser && existingUser.id !== userId) {
      return res.status(400).json({ message: "Agent number already assigned to another user" });
    }

    // Update user with new agent number
    const updatedUser = await updateUser(userId, {
      agentNumber: agentNumber,
      updatedAt: new Date()
    });

    return res.status(200).json(updatedUser);
  } catch (error: any) {
    console.error("Error assigning agent number:", error);
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (error.message === 'Forbidden') {
      return res.status(403).json({ message: "Admin access required" });
    }
    return res.status(500).json({ message: "Failed to assign agent number" });
  }
}