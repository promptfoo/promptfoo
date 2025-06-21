/**
 * Validates a private key format without restricting algorithms
 * Since actual signing happens server-side with Node.js crypto (which supports more algorithms)
 */
async function validateKeyWithWebCrypto(pemKey: string): Promise<void> {
  try {
    // Extract base64 content
    const base64Content = pemKey
      .replace(/-----BEGIN[^-]+-----/g, '')
      .replace(/-----END[^-]+-----/g, '')
      .replace(/\s/g, '');

    // Basic validation: check if it's valid base64
    atob(base64Content);

    // That's enough validation - let the server handle algorithm-specific validation
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invalid character')) {
      throw new Error('Invalid base64 encoding in private key');
    }
    throw new Error(
      `Invalid private key format. Ensure the key is a valid PEM-formatted private key (PKCS#8, PKCS#1, or SEC1 format). Details: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Converts a private key string to PEM format and validates it
 * Uses basic format validation since actual signing happens server-side
 *
 * @param input - The private key string in various formats
 * @returns The properly formatted PEM string
 */
export async function convertStringKeyToPem(input: string): Promise<string> {
  const trimmedInput = input.trim();

  if (!trimmedInput) {
    throw new Error('Private key cannot be empty');
  }

  // If it's already in PEM format, validate it and return
  if (trimmedInput.includes('-----BEGIN') && trimmedInput.includes('-----END')) {
    await validateKeyWithWebCrypto(trimmedInput);
    return trimmedInput;
  }

  // Try to format as PKCS8 PEM (assumes raw base64 is PKCS#8 format)
  const cleanKey = trimmedInput.replace(/\s/g, '');
  const chunks = cleanKey.match(/.{1,64}/g) || [];
  const pemFormatted = ['-----BEGIN PRIVATE KEY-----', ...chunks, '-----END PRIVATE KEY-----'].join(
    '\n',
  );

  // Validate the formatted key
  await validateKeyWithWebCrypto(pemFormatted);
  return pemFormatted;
}

/**
 * Validates a private key string by attempting to parse it
 *
 * @param input - The private key string
 */
export async function validatePrivateKey(input: string): Promise<void> {
  if (!input.trim()) {
    throw new Error('Private key cannot be empty');
  }

  // Use the robust conversion function which includes validation
  await convertStringKeyToPem(input);
}
