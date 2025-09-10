import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getActivePlans } from './lib/db';

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
    console.log('[API /plans] Fetching plans...');
    const allPlans = await getActivePlans();
    
    console.log('[API /plans] Retrieved plans:', {
      total: allPlans.length,
      active: allPlans.filter(plan => plan.isActive).length
    });

    if (allPlans.length > 0) {
      console.log('[API /plans] Sample plan:', {
        id: allPlans[0].id,
        name: allPlans[0].name,
        isActive: allPlans[0].isActive,
        price: allPlans[0].price
      });
    }

    const activePlans = allPlans.filter(plan => plan.isActive);
    console.log('[API /plans] Returning active plans:', activePlans.length);
    
    return res.status(200).json(activePlans);
  } catch (error: any) {
    console.error("[API /plans] Error fetching plans:", error);
    return res.status(500).json({ 
      message: "Failed to fetch plans", 
      error: error.message 
    });
  }
}