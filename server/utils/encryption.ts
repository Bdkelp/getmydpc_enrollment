/**
 * SSN Encryption & Security Utilities
 * Provides encryption, decryption, masking, and pseudo-SSN generation
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const SECRET_KEY = process.env.SSN_ENCRYPTION_KEY 
  ? Buffer.from(process.env.SSN_ENCRYPTION_KEY, 'hex')
  : crypto.randomBytes(32); // Generate random key if not set (for dev only!)

const PSEUDO_SSN_SECRET = process.env.PSEUDO_SSN_SECRET || 'default-pseudo-secret-change-in-production';

/**
 * Encrypt SSN for secure storage
 * Returns format: iv:authTag:encrypted
 */
export function encryptSSN(ssn: string): string {
  if (!ssn) return '';
  
  // Remove formatting and validate
  const cleanSSN = ssn.replace(/\D/g, '');
  if (cleanSSN.length !== 9) {
    throw new Error('SSN must be 9 digits');
  }

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);
  
  let encrypted = cipher.update(cleanSSN, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt SSN from storage
 * Expects format: iv:authTag:encrypted
 */
export function decryptSSN(encryptedSSN: string): string {
  if (!encryptedSSN || !encryptedSSN.includes(':')) {
    return encryptedSSN; // Return as-is if not encrypted (legacy data)
  }

  try {
    const parts = encryptedSSN.split(':');
    if (parts.length !== 3) {
      return encryptedSSN; // Return as-is if invalid format
    }

    const [ivHex, authTagHex, encrypted] = parts;
    
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      SECRET_KEY,
      Buffer.from(ivHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('[Encryption] Failed to decrypt SSN:', error);
    return ''; // Return empty on decrypt failure
  }
}

/**
 * Mask SSN for display (show only last 4 digits)
 */
export function maskSSN(ssn: string | null | undefined): string {
  if (!ssn) return '***-**-****';
  
  // If already masked, return as-is
  if (ssn.includes('*')) return ssn;
  
  const cleanSSN = ssn.replace(/\D/g, '');
  if (cleanSSN.length < 4) return '***-**-****';
  
  const last4 = cleanSSN.slice(-4);
  return `***-**-${last4}`;
}

/**
 * Get last 4 digits of SSN
 */
export function getSSNLast4(ssn: string): string {
  if (!ssn) return '';
  const cleanSSN = ssn.replace(/\D/g, '');
  return cleanSSN.slice(-4);
}

/**
 * Generate deterministic pseudo-SSN for banking requirements
 * Uses HMAC to ensure same member always gets same pseudo-SSN
 */
export function generatePseudoSSN(memberId: number): string {
  const hash = crypto
    .createHmac('sha256', PSEUDO_SSN_SECRET)
    .update(`member_${memberId}`)
    .digest('hex');
  
  // Convert hex to numeric and take first 9 digits
  const numeric = parseInt(hash.slice(0, 16), 16) % 1000000000;
  const formatted = String(numeric).padStart(9, '0');
  
  // Format as XXX-XX-XXXX
  return `${formatted.slice(0, 3)}-${formatted.slice(3, 5)}-${formatted.slice(5)}`;
}

/**
 * Format SSN with dashes (XXX-XX-XXXX)
 */
export function formatSSN(ssn: string): string {
  if (!ssn) return '';
  const cleanSSN = ssn.replace(/\D/g, '');
  if (cleanSSN.length !== 9) return ssn;
  
  return `${cleanSSN.slice(0, 3)}-${cleanSSN.slice(3, 5)}-${cleanSSN.slice(5)}`;
}

/**
 * Validate SSN format
 */
export function isValidSSN(ssn: string): boolean {
  if (!ssn) return false;
  const cleanSSN = ssn.replace(/\D/g, '');
  
  // Must be 9 digits
  if (cleanSSN.length !== 9) return false;
  
  // Cannot be all zeros or invalid patterns
  if (cleanSSN === '000000000') return false;
  if (cleanSSN === '111111111') return false;
  if (cleanSSN === '123456789') return false;
  
  // First 3 digits cannot be 000, 666, or 900-999
  const areaNumber = parseInt(cleanSSN.slice(0, 3));
  if (areaNumber === 0 || areaNumber === 666 || areaNumber >= 900) return false;
  
  return true;
}
