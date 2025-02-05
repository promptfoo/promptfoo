const BEGIN_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----';
const END_PRIVATE_KEY = '-----END PRIVATE KEY-----';
const BEGIN_RSA_PRIVATE_KEY = '-----BEGIN RSA PRIVATE KEY-----';
const END_RSA_PRIVATE_KEY = '-----END RSA PRIVATE KEY-----';
const BEGIN_EC_PRIVATE_KEY = '-----BEGIN EC PRIVATE KEY-----';
const END_EC_PRIVATE_KEY = '-----END EC PRIVATE KEY-----';

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

/**
 * Validates a private key string by attempting to parse it as a PKCS8 key
 *
 * @param input - The private key string, either raw base64 or in PEM format
 * @returns The formatted PEM string if valid, throws error if invalid
 */
export async function validatePrivateKey(input: string): Promise<string> {
  // Remove any leading/trailing whitespace
  const trimmedInput = input.trim();

  try {
    // Format the key first
    let formattedKey: string;
    const isTraditionalRsa = trimmedInput.includes(BEGIN_RSA_PRIVATE_KEY);
    const isEcKey = trimmedInput.includes(BEGIN_EC_PRIVATE_KEY);

    if (trimmedInput.startsWith(BEGIN_PRIVATE_KEY) && trimmedInput.endsWith(END_PRIVATE_KEY)) {
      formattedKey = trimmedInput;
    } else if (
      trimmedInput.startsWith(BEGIN_RSA_PRIVATE_KEY) &&
      trimmedInput.endsWith(END_RSA_PRIVATE_KEY)
    ) {
      formattedKey = trimmedInput;
    } else if (
      trimmedInput.startsWith(BEGIN_EC_PRIVATE_KEY) &&
      trimmedInput.endsWith(END_EC_PRIVATE_KEY)
    ) {
      formattedKey = trimmedInput;
    } else {
      // Clean the key
      const cleanKey = trimmedInput.replace(/[\s-]/g, '');
      // Split into 64-character chunks
      const chunks = cleanKey.match(/.{1,64}/g) || [];
      formattedKey = [BEGIN_EC_PRIVATE_KEY, ...chunks, END_EC_PRIVATE_KEY].join('\n');
    }

    // Extract the base64 content
    const base64Content = formattedKey
      .replace(BEGIN_PRIVATE_KEY, '')
      .replace(END_PRIVATE_KEY, '')
      .replace(BEGIN_RSA_PRIVATE_KEY, '')
      .replace(END_RSA_PRIVATE_KEY, '')
      .replace(BEGIN_EC_PRIVATE_KEY, '')
      .replace(END_EC_PRIVATE_KEY, '')
      .replace(/\s/g, '');

    // Convert base64 to binary
    const binaryDer = atob(base64Content);
    const der = new Uint8Array(binaryDer.length);
    for (let i = 0; i < binaryDer.length; i++) {
      der[i] = binaryDer.charCodeAt(i);
    }

    // For EC keys, try specific EC import
    if (der.length === 132 || isEcKey) {
      // P-256 key length
      try {
        await window.crypto.subtle.importKey(
          'raw',
          der.slice(7), // Skip SEC1 header
          {
            name: 'ECDSA',
            namedCurve: 'P-256',
          },
          true,
          ['sign'],
        );
        return formattedKey;
      } catch (error) {
        console.log('EC import error:', error);
      }
    }

    // Try other algorithms as fallback
    const algorithms = [
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      { name: 'RSA-PSS', hash: 'SHA-256' },
      { name: 'ECDH', namedCurve: 'P-256' },
      { name: 'ECDH', namedCurve: 'P-384' },
      { name: 'ECDH', namedCurve: 'P-521' },
      { name: 'ECDSA', namedCurve: 'P-256' },
      { name: 'ECDSA', namedCurve: 'P-384' },
      { name: 'ECDSA', namedCurve: 'P-521' },
      { name: 'Ed25519' },
    ];

    for (const algorithm of algorithms) {
      try {
        const format = isTraditionalRsa ? 'pkcs1' : 'pkcs8';
        await window.crypto.subtle.importKey(format, der, algorithm, true, ['sign']);
        return formattedKey;
      } catch (error) {
        console.log('error:', error);
        continue;
      }
    }

    throw new Error('Key format is valid but algorithm type could not be determined');
  } catch (error) {
    throw new Error('Invalid private key format. Details: ' + error);
  }
}
