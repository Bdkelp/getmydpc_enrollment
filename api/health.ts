import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: 'vercel',
    message: 'API is running on Vercel serverless functions'
  });
}