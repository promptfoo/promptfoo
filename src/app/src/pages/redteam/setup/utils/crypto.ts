const BEGIN_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----';
const END_PRIVATE_KEY = '-----END PRIVATE KEY-----';
const BEGIN_RSA_PRIVATE_KEY = '-----BEGIN RSA PRIVATE KEY-----';
const END_RSA_PRIVATE_KEY = '-----END RSA PRIVATE KEY-----';
const BEGIN_EC_PRIVATE_KEY = '-----BEGIN EC PRIVATE KEY-----';
const END_EC_PRIVATE_KEY = '-----END EC PRIVATE KEY-----';

// EC key constants
const EC_POINT_FORMAT_BYTE = 0x04;
const EC_PUBLIC_KEY_LENGTH = 65; // Size in bytes of uncompressed EC public key
const EC_TYPICAL_KEY_LENGTH = 132; // Common total size for EC private key in DER format

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
    if (der.length === EC_TYPICAL_KEY_LENGTH || isEcKey) {
      try {
        // Find the actual key data by looking for the EC point format byte
        let keyStart = -1;
        for (let i = 0; i < der.length - EC_PUBLIC_KEY_LENGTH; i++) {
          if (der[i] === EC_POINT_FORMAT_BYTE && der.length - i >= EC_PUBLIC_KEY_LENGTH) {
            keyStart = i;
            break;
          }
        }

        if (keyStart === -1) {
          throw new Error('Could not find EC key data');
        }

        // Try different EC curves
        const curves = ['P-256', 'P-384', 'P-521'];
        for (const curve of curves) {
          try {
            await window.crypto.subtle.importKey(
              'raw',
              der.slice(keyStart),
              {
                name: 'ECDSA',
                namedCurve: curve,
              },
              true,
              ['sign'],
            );
            return formattedKey;
          } catch (error) {
            console.log(`EC import error for ${curve}:`, error);
            continue;
          }
        }
      } catch (error) {
        console.log('EC key parsing error:', error);
      }
    }

    // Try PKCS8 verification with the raw key data as a fallback
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
        const format = 'pkcs8';
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
