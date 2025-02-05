const BEGIN_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----';
const END_PRIVATE_KEY = '-----END PRIVATE KEY-----';

/**
 * Converts a raw base64-encoded RSA private key string into PEM format
 * by adding PKCS8 headers and proper line breaks if needed
 *
 * @param input - The private key string, either raw base64 or already in PEM format
 * @returns The properly formatted PEM string
 */
export function convertStringKeyToPem(input: string): string {
  // Remove any leading/trailing whitespace
  const trimmedInput = input.trim();

  // If it's already a properly formatted PEM, return as-is
  if (trimmedInput.startsWith(BEGIN_PRIVATE_KEY) && trimmedInput.endsWith(END_PRIVATE_KEY)) {
    return trimmedInput;
  }

  // Clean the key by removing any existing headers, footers, or whitespace
  const cleanKey = trimmedInput
    .replace(new RegExp(BEGIN_PRIVATE_KEY, 'g'), '')
    .replace(new RegExp(END_PRIVATE_KEY, 'g'), '')
    .replace(/[\s-]/g, '');

  // Split into 64-character chunks
  const chunks = cleanKey.match(/.{1,64}/g) || [];

  return [BEGIN_PRIVATE_KEY, ...chunks, END_PRIVATE_KEY].join('\n');
}
