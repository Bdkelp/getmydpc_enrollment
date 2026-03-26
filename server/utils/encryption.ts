/**
 * SSN Encryption & Security Utilities
 * Provides encryption, decryption, masking, and pseudo-SSN generation
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

const parseHexKey = (raw: string | undefined): Buffer | null => {
  if (!raw) return null;

  const trimmed = raw.trim();
  if (!/^[a-fA-F0-9]{64}$/.test(trimmed)) {
    console.warn('[Encryption] Ignoring invalid key format. Expected 64-char hex key.');
    return null;
  }

  return Buffer.from(trimmed, 'hex');
};

const buildKeyRing = (): Buffer[] => {
  const keys: Buffer[] = [];
  const seen = new Set<string>();

  const addKey = (raw: string | undefined) => {
    const parsed = parseHexKey(raw);
    if (!parsed) return;
    const fingerprint = parsed.toString('hex');
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);
    keys.push(parsed);
  };

  // Preferred key for SSN encryption/decryption.
  addKey(process.env.SSN_ENCRYPTION_KEY);

  // Optional fallback to existing encryption key for environments not yet split.
  addKey(process.env.ENCRYPTION_KEY);

  // Optional list of retired keys for decrypt-only support during key rotation.
  const previous = (process.env.SSN_ENCRYPTION_PREVIOUS_KEYS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  previous.forEach(addKey);

  if (keys.length === 0) {
    console.error('[Encryption] No valid SSN encryption keys configured. Set SSN_ENCRYPTION_KEY (preferred) or ENCRYPTION_KEY.');
  }

  return keys;
};

const SSN_KEY_RING = buildKeyRing();
const PRIMARY_SSN_KEY = SSN_KEY_RING[0] || null;

const PSEUDO_SSN_SECRET = process.env.PSEUDO_SSN_SECRET || process.env.ENCRYPTION_KEY || 'development-only-pseudo-secret';

/**
 * Encrypt SSN for secure storage
 * Returns format: iv:authTag:encrypted
 */
export function encryptSSN(ssn: string): string {
  if (!ssn) return '';

  if (!PRIMARY_SSN_KEY) {
    throw new Error('SSN encryption key is not configured. Set SSN_ENCRYPTION_KEY.');
  }
  
  // Remove formatting and validate
  const cleanSSN = ssn.replace(/\D/g, '');
  if (cleanSSN.length !== 9) {
    throw new Error('SSN must be 9 digits');
  }

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, PRIMARY_SSN_KEY, iv);
  
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

  if (SSN_KEY_RING.length === 0) {
    return '';
  }

  const parts = encryptedSSN.split(':');
  if (parts.length !== 3) {
    return encryptedSSN; // Return as-is if invalid format
  }

  const [ivHex, authTagHex, encrypted] = parts;

  for (const key of SSN_KEY_RING) {
    try {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
        key,
      Buffer.from(ivHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
    } catch (_error) {
      // Continue trying additional keys in key ring.
    }
  }

  console.error('[Encryption] Failed to decrypt SSN with all configured keys');
  return ''; // Return empty on decrypt failure
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
