/**
 * Converts a raw base64-encoded RSA private key string into PEM format
 * by adding PKCS8 headers and proper line breaks
 *
 * @param rawBase64Key - The raw base64 string of the private key without headers
 * @returns The properly formatted PEM string
 */
export function convertStringKeyToPem(rawBase64Key: string): string {
  // Remove any existing whitespace
  const cleanKey = rawBase64Key.replace(/\s/g, '');

  // Split the key into 64-character chunks
  const chunks: string[] = [];
  for (let i = 0; i < cleanKey.length; i += 64) {
    chunks.push(cleanKey.slice(i, i + 64));
  }

  // Construct the PEM format with headers and line breaks
  return ['-----BEGIN PRIVATE KEY-----', chunks.join('\n'), '-----END PRIVATE KEY-----'].join('\n');
}
