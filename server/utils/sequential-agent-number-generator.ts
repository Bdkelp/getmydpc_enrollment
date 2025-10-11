/**
 * Sequential Agent Number Generation Utility
 * Format: MPP + Sequential Number (4 digits)
 * Examples: MPP0001, MPP0002, MPP0003, etc.
 * 
 * This replaces the previous SSN-based generator to use simple sequential numbering
 */

import { db } from '../db';
import { users } from '@shared/schema';
import { sql } from 'drizzle-orm';

export interface SequentialAgentNumberResult {
  agentNumber: string;
  sequentialId: number;
}

/**
 * Generate the next sequential agent number
 * Queries existing agent numbers to find the highest number and increments it
 * Format: MPP0001, MPP0002, etc.
 */
export async function generateSequentialAgentNumber(): Promise<SequentialAgentNumberResult> {
  const companyCode = "MPP";
  
  try {
    // Find the highest existing sequential agent number
    const result = await db
      .select({
        maxNumber: sql<string>`MAX(
          CASE 
            WHEN agent_number ~ '^MPP[0-9]{4}$' 
            THEN CAST(SUBSTRING(agent_number FROM 4) AS INTEGER)
            ELSE 0
          END
        )`
      })
      .from(users)
      .where(sql`agent_number IS NOT NULL`);

    // Get the max number, default to 0 if no agents exist yet
    const maxNumber = result[0]?.maxNumber ? parseInt(result[0].maxNumber as string) : 0;
    
    // Increment for next agent
    const nextNumber = maxNumber + 1;
    
    // Format as 4-digit number with leading zeros (e.g., 0001, 0002, 0003)
    const paddedNumber = nextNumber.toString().padStart(4, '0');
    
    const agentNumber = `${companyCode}${paddedNumber}`;
    
    console.log(`[Agent Number Generator] Generated: ${agentNumber} (sequential ID: ${nextNumber})`);
    
    return {
      agentNumber,
      sequentialId: nextNumber
    };
    
  } catch (error) {
    console.error('[Agent Number Generator] Error:', error);
    // Fallback: return MPP0001 if there's an error
    console.warn('[Agent Number Generator] Falling back to MPP0001 due to error');
    return {
      agentNumber: 'MPP0001',
      sequentialId: 1
    };
  }
}

/**
 * Parse a sequential agent number into its components
 */
export function parseSequentialAgentNumber(agentNumber: string): { companyCode: string; sequentialId: number } | null {
  const pattern = /^(MPP)(\d{4})$/;
  const match = agentNumber.match(pattern);
  
  if (!match) {
    return null;
  }

  return {
    companyCode: match[1],
    sequentialId: parseInt(match[2], 10)
  };
}

/**
 * Validate a sequential agent number format
 */
export function validateSequentialAgentNumber(agentNumber: string): boolean {
  return /^MPP\d{4}$/.test(agentNumber);
}

/**
 * Get human-readable description of agent number
 */
export function getAgentNumberDescription(agentNumber: string): string {
  const components = parseSequentialAgentNumber(agentNumber);
  if (!components) {
    return 'Invalid agent number format';
  }

  return `MyPremierPlans Agent #${components.sequentialId}`;
}

/**
 * Check if an agent number is already taken
 */
export async function isAgentNumberTaken(agentNumber: string): Promise<boolean> {
  try {
    const result = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(users)
      .where(sql`agent_number = ${agentNumber}`);
    
    return (result[0]?.count ?? 0) > 0;
  } catch (error) {
    console.error('[Agent Number Generator] Error checking if number is taken:', error);
    return true; // Assume taken if there's an error
  }
}

/**
 * Assign agent number to a user
 * This should be called when creating a new agent or admin user
 */
export async function assignAgentNumber(userId: string): Promise<string> {
  try {
    const { agentNumber } = await generateSequentialAgentNumber();
    
    // Update user with agent number
    await db
      .update(users)
      .set({ agentNumber, updatedAt: new Date() })
      .where(sql`id = ${userId}`);
    
    console.log(`[Agent Number Generator] Assigned ${agentNumber} to user ${userId}`);
    
    return agentNumber;
  } catch (error) {
    console.error('[Agent Number Generator] Error assigning agent number:', error);
    throw new Error('Failed to assign agent number');
  }
}
