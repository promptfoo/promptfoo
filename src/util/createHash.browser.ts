/**
 * Browser-compatible hash utilities using SubtleCrypto.
 * Uses the Web Crypto API which is available in all modern browsers.
 *
 * Note: SubtleCrypto is async, so sha256 returns a Promise.
 * Vite aliases this module in place of ./createHash for browser builds.
 */

/**
 * Compute SHA-256 hash of a string and return hex digest.
 * Uses the Web Crypto API (SubtleCrypto).
 *
 * @param str - The string to hash
 * @returns Promise resolving to the hex-encoded SHA-256 hash
 */
export async function sha256(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a random alphanumeric sequence.
 * Uses Math.random() for simplicity (same as Node version).
 */
export function randomSequence(length: number = 3): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}
