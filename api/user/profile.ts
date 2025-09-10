import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../lib/auth';
import { updateUser, getUserByEmail } from '../lib/db';

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
    const user = await requireAuth(req);
    const updateData = req.body;
    
    // Remove protected fields
    delete updateData.id;
    delete updateData.role;
    delete updateData.createdAt;
    delete updateData.approvalStatus;
    delete updateData.agentNumber;

    // Validate phone number format if provided
    if (updateData.phone) {
      const phoneRegex = /^\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}$/;
      if (!phoneRegex.test(updateData.phone)) {
        return res.status(400).json({ message: "Invalid phone number format" });
      }
    }

    // Validate email format if changed
    if (updateData.email && updateData.email !== user.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(updateData.email)) {
        return res.status(400).json({ message: "Invalid email format" });
      }

      // Check if email is already in use by another user
      const existingUser = await getUserByEmail(updateData.email);
      if (existingUser && existingUser.id !== user.id) {
        return res.status(400).json({ message: "Email already in use" });
      }
    }

    const updatedUser = await updateUser(user.id, {
      ...updateData,
      updatedAt: new Date()
    });

    return res.status(200).json(updatedUser);
  } catch (error: any) {
    console.error("Error updating profile:", error);
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ message: "Unauthorized" });
    }
    return res.status(500).json({ message: "Failed to update profile" });
  }
}