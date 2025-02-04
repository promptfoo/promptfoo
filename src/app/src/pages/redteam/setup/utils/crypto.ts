/**
 * Converts a raw base64-encoded RSA private key string into PEM format
 * by adding PKCS8 headers and proper line breaks
 *
 * @param rawBase64Key - The raw base64 string of the private key without headers
 * @returns The properly formatted PEM string
 */

const BEGIN_PRIVATE_KEY_HEADER = '-----BEGIN PRIVATE KEY-----';
const END_PRIVATE_KEY_FOOTER = '-----END PRIVATE KEY-----';

export function convertStringKeyToPem(rawBase64Key: string): string {
  // Remove any existing whitespace
  const cleanKey = rawBase64Key.replace(/\s/g, '');
  const linesToJoin: string[] = [];

  if (!cleanKey.includes(BEGIN_PRIVATE_KEY_HEADER)) {
    linesToJoin.push(BEGIN_PRIVATE_KEY_HEADER);
  }

  // Split the key into 64-character chunks
  for (let i = 0; i < cleanKey.length; i += 64) {
    linesToJoin.push(cleanKey.slice(i, i + 64));
  }

  if (!cleanKey.includes(END_PRIVATE_KEY_FOOTER)) {
    linesToJoin.push(END_PRIVATE_KEY_FOOTER);
  }

  // Construct the PEM format with headers and line breaks
  return linesToJoin.join('\n');
}
