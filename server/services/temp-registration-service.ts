/**
 * Temporary Registration Storage Service
 * 
 * Manages temporary storage of registration data during payment processing.
 * Provides backup storage in case sessionStorage is lost (browser crash, etc).
 * Auto-expires after 1 hour.
 */

import { query } from "../lib/neonDb";

export interface TempRegistration {
  id: string;
  registrationData: any;
  paymentAttempts: number;
  lastPaymentError?: string;
  agentId?: string;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Create a new temporary registration record
 */
export async function createTempRegistration(
  registrationData: any,
  agentId?: string
): Promise<TempRegistration> {
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

  const result = await query(
    `INSERT INTO temp_registrations (registration_data, agent_id, expires_at, payment_attempts)
     VALUES ($1, $2, $3, 0)
     RETURNING *`,
    [JSON.stringify(registrationData), agentId || null, expiresAt]
  );

  return result.rows[0];
}

/**
 * Get a temporary registration by ID
 */
export async function getTempRegistration(id: string): Promise<TempRegistration | null> {
  const result = await query(
    `SELECT * FROM temp_registrations WHERE id = $1 AND expires_at > NOW()`,
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

/**
 * Increment payment attempt counter
 */
export async function incrementPaymentAttempt(
  id: string,
  errorMessage?: string
): Promise<number> {
  const result = await query(
    `UPDATE temp_registrations 
     SET payment_attempts = payment_attempts + 1,
         last_payment_error = $2
     WHERE id = $1
     RETURNING payment_attempts`,
    [id, errorMessage || null]
  );

  if (result.rows.length === 0) {
    throw new Error('Temp registration not found');
  }

  return result.rows[0].payment_attempts;
}

/**
 * Get payment attempt count
 */
export async function getPaymentAttemptCount(id: string): Promise<number> {
  const result = await query(
    `SELECT payment_attempts FROM temp_registrations WHERE id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    return 0;
  }

  return result.rows[0].payment_attempts;
}

/**
 * Delete a temporary registration (cleanup after success)
 */
export async function deleteTempRegistration(id: string): Promise<void> {
  await query(
    `DELETE FROM temp_registrations WHERE id = $1`,
    [id]
  );
}

/**
 * Delete temporary registrations that exceeded max attempts
 */
export async function purgeMaxAttemptsRegistrations(maxAttempts: number = 3): Promise<number> {
  const result = await query(
    `DELETE FROM temp_registrations 
     WHERE payment_attempts >= $1
     RETURNING id`,
    [maxAttempts]
  );

  return result.rowCount || 0;
}

/**
 * Cleanup expired temporary registrations
 */
export async function cleanupExpiredRegistrations(): Promise<number> {
  const result = await query(
    `DELETE FROM temp_registrations 
     WHERE expires_at < NOW()
     RETURNING id`
  );

  return result.rowCount || 0;
}

/**
 * Get all temporary registrations for an agent
 */
export async function getAgentTempRegistrations(agentId: string): Promise<TempRegistration[]> {
  const result = await query(
    `SELECT * FROM temp_registrations 
     WHERE agent_id = $1 AND expires_at > NOW()
     ORDER BY created_at DESC`,
    [agentId]
  );

  return result.rows;
}

/**
 * Schedule periodic cleanup (run every 15 minutes)
 */
export function scheduleCleanup() {
  setInterval(async () => {
    try {
      const expiredCount = await cleanupExpiredRegistrations();
      const maxAttemptsCount = await purgeMaxAttemptsRegistrations(3);
      
      if (expiredCount > 0 || maxAttemptsCount > 0) {
        console.log('[Temp Registrations] Cleanup completed:', {
          expired: expiredCount,
          maxAttempts: maxAttemptsCount
        });
      }
    } catch (error) {
      console.error('[Temp Registrations] Cleanup error:', error);
    }
  }, 15 * 60 * 1000); // 15 minutes
  
  console.log('[Temp Registrations] Cleanup scheduler started (every 15 minutes)');
}
