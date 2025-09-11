import type { VercelRequest, VercelResponse } from '@vercel/node';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { leads } from '../../shared/schema';

// Get database URL from environment variable
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Create database connection
const sql = neon(DATABASE_URL);
const db = drizzle(sql);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Authorization');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [Public Leads] Request received`);
  console.log(`[${timestamp}] [Public Leads] Body:`, req.body);

  try {
    // Check if body exists
    if (!req.body) {
      console.error(`[${timestamp}] [Public Leads] No request body found`);
      return res.status(400).json({ 
        error: "No data received",
        debug: "Request body is empty",
        timestamp
      });
    }

    const { firstName, lastName, email, phone, message } = req.body;

    // Check required fields
    const missingFields = [];
    if (!firstName) missingFields.push('firstName');
    if (!lastName) missingFields.push('lastName');
    if (!email) missingFields.push('email');
    if (!phone) missingFields.push('phone');

    if (missingFields.length > 0) {
      console.log(`[${timestamp}] [Public Leads] Missing required fields:`, missingFields);
      return res.status(400).json({ 
        error: "Missing required fields",
        missingFields,
        receivedData: { firstName, lastName, email, phone },
        timestamp
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log(`[${timestamp}] [Public Leads] Invalid email format:`, email);
      return res.status(400).json({ error: "Invalid email format", timestamp });
    }

    console.log(`[${timestamp}] [Public Leads] Validation passed, creating lead...`);

    // Create lead data
    const leadData = {
      firstName,
      lastName,
      email,
      phone,
      message: message || '',
      source: 'contact_form' as const,
      status: 'new' as const,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    console.log(`[${timestamp}] [Public Leads] Lead data to create:`, leadData);

    // Insert into database
    const [newLead] = await db.insert(leads).values(leadData).returning();

    console.log(`[${timestamp}] [Public Leads] Lead created successfully:`, {
      id: newLead.id,
      email: newLead.email,
      status: newLead.status,
      source: newLead.source
    });

    // Return success response
    return res.status(200).json({
      success: true,
      leadId: newLead.id,
      message: "Lead submitted successfully",
      timestamp
    });

  } catch (error: any) {
    console.error(`[${timestamp}] [Public Leads] Error:`, error);

    // Return detailed error for debugging
    return res.status(500).json({ 
      error: "Failed to create lead",
      message: error.message || "Internal server error",
      timestamp
    });
  }
}