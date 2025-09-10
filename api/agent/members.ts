import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../lib/auth';
import { getAgentEnrollments, getAgentCommissions, getUser, getUserSubscription, getFamilyMembers } from '../lib/db';

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
    
    // Get all users enrolled by this agent plus users they have commissions for
    const enrolledUsers = await getAgentEnrollments(user.id);

    // Get users from commissions
    const agentCommissions = await getAgentCommissions(user.id);
    const commissionUserIds = agentCommissions.map(c => c.userId);

    // Fetch additional users from commissions that weren't directly enrolled
    const additionalUsers = [];
    for (const userId of commissionUserIds) {
      if (!enrolledUsers.find(u => u.id === userId)) {
        const additionalUser = await getUser(userId);
        if (additionalUser) additionalUsers.push(additionalUser);
      }
    }

    const allMembers = [...enrolledUsers, ...additionalUsers];

    // Get subscription info for each member
    const membersWithDetails = await Promise.all(allMembers.map(async (member) => {
      const subscription = await getUserSubscription(member.id);
      const familyMembers = await getFamilyMembers(member.id);

      return {
        ...member,
        subscription,
        familyMembers,
        totalFamilyMembers: familyMembers.length
      };
    }));

    return res.status(200).json(membersWithDetails);
  } catch (error: any) {
    console.error("Error fetching agent members:", error);
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (error.message === 'Forbidden') {
      return res.status(403).json({ message: "Agent access required" });
    }
    return res.status(500).json({ message: "Failed to fetch agent members" });
  }
}