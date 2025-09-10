import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './lib/auth';
import { getAllLeads, getAgentLeads, createLead } from './lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const user = await requireAuth(req);
    
    if (req.method === 'GET') {
      let leads;

      if (user.role === 'admin') {
        leads = await getAllLeads();
      } else if (user.role === 'agent') {
        leads = await getAgentLeads(user.id);
      } else {
        return res.status(403).json({ message: "Not authorized to view leads" });
      }

      return res.status(200).json(leads);
      
    } else if (req.method === 'POST') {
      const { firstName, lastName, email, phone, message, source } = req.body;

      const lead = await createLead({
        firstName,
        lastName,
        email,
        phone,
        message: message || '',
        source: source || 'contact_form',
        status: 'new',
        assignedAgentId: user.role === 'agent' ? user.id : null
      });

      return res.status(201).json(lead);
      
    } else {
      return res.status(405).json({ message: 'Method not allowed' });
    }
  } catch (error: any) {
    console.error("Error handling leads:", error);
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (error.message === 'Forbidden') {
      return res.status(403).json({ message: "Forbidden" });
    }
    return res.status(500).json({ message: "Failed to handle leads request" });
  }
}