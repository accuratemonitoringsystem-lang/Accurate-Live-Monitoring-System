/**
 * Security & Password Hashing Utilities
 * Uses Web Crypto API SHA-256 with factory cryptographic salt.
 * Ensures passwords are never stored or transmitted in plain text.
 */

const FACTORY_CRYPTO_SALT = 'AGIPL_ACCURATE_GAUGING_2026_SECURITY_SALT';

/**
 * Hash a plain text password using SHA-256 and salt
 */
export async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder();
  const saltedData = enc.encode(`${FACTORY_CRYPTO_SALT}_${password}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', saltedData);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Verify a plain text password against a stored SHA-256 hash
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!password || !storedHash) return false;
  const computedHash = await hashPassword(password);
  return computedHash === storedHash;
}
