import { CONSENT_ENDPOINT, EVENTS_ENDPOINT, R_ENDPOINT } from '../../constants';
import { CLOUD_API_HOST } from '../../globalConfig/cloud';
import { getEnvBool } from '../../envars';

/**
 * Error thrown when a URL fails SSRF validation
 */
export class SSRFValidationError extends Error {
  constructor(
    message: string,
    public readonly url: string,
  ) {
    super(message);
    this.name = 'SSRFValidationError';
  }
}

/**
 * Check if an IP address is in a private range
 */
function isPrivateIp(ip: string): boolean {
  // IPv4 private ranges
  const ipv4Parts = ip.split('.');
  if (ipv4Parts.length === 4 && ipv4Parts.every((part) => /^\d+$/.test(part))) {
    const bytes = ipv4Parts.map(Number);

    // 10.0.0.0/8
    if (bytes[0] === 10) {
      return true;
    }

    // 172.16.0.0/12
    if (bytes[0] === 172 && bytes[1] >= 16 && bytes[1] <= 31) {
      return true;
    }

    // 192.168.0.0/16
    if (bytes[0] === 192 && bytes[1] === 168) {
      return true;
    }

    // 127.0.0.0/8 (loopback)
    if (bytes[0] === 127) {
      return true;
    }

    // 169.254.0.0/16 (link-local)
    if (bytes[0] === 169 && bytes[1] === 254) {
      return true;
    }

    // 0.0.0.0/8
    if (bytes[0] === 0) {
      return true;
    }
  }

  // IPv6 private ranges (simplified check)
  // Strip brackets if present (URL.hostname includes brackets for IPv6)
  const cleanIp = ip.replace(/^\[|\]$/g, '');
  const lowerIp = cleanIp.toLowerCase();

  // ::1 (loopback)
  if (lowerIp === '::1' || lowerIp === '0:0:0:0:0:0:0:1') {
    return true;
  }

  // fc00::/7 (unique local) - check if it starts with fc or fd
  if (/^fc[0-9a-f]{2}:/i.test(lowerIp) || /^fd[0-9a-f]{2}:/i.test(lowerIp)) {
    return true;
  }

  // fe80::/10 (link-local)
  if (/^fe80:/i.test(lowerIp)) {
    return true;
  }

  return false;
}

/**
 * Check if a hostname is localhost or a loopback address
 */
function isLocalhost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '::1' ||
    lower === '0:0:0:0:0:0:0:1' ||
    lower === '[::1]' ||
    lower.startsWith('127.') ||
    lower.endsWith('.localhost')
  );
}

/**
 * Validate a URL to prevent Server-Side Request Forgery (SSRF) attacks
 *
 * @param url - The URL to validate (string, URL object, or Request object)
 * @throws {SSRFValidationError} If the URL is potentially dangerous
 */
export function validateUrlForSSRF(url: string | URL | Request): void {
  // Skip validation if explicitly disabled (for development/testing)
  if (getEnvBool('PROMPTFOO_DISABLE_SSRF_PROTECTION')) {
    return;
  }

  let urlString: string;
  let parsedUrl: URL;

  // Extract URL string
  if (typeof url === 'string') {
    urlString = url;
  } else if (url instanceof URL) {
    urlString = url.toString();
  } else if (url instanceof Request) {
    urlString = url.url;
  } else {
    throw new SSRFValidationError('Invalid URL type', String(url));
  }

  // Parse URL
  try {
    parsedUrl = new URL(urlString);
  } catch (e) {
    throw new SSRFValidationError(`Invalid URL format: ${e}`, urlString);
  }

  // Allow whitelisted endpoints
  const whitelistedEndpoints = [
    CLOUD_API_HOST,
    R_ENDPOINT,
    CONSENT_ENDPOINT,
    EVENTS_ENDPOINT,
  ];

  for (const endpoint of whitelistedEndpoints) {
    if (urlString.startsWith(endpoint)) {
      return;
    }
  }

  // Check protocol - only allow http and https
  const protocol = parsedUrl.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new SSRFValidationError(
      `Blocked request with dangerous protocol: ${protocol}`,
      urlString,
    );
  }

  // Check for localhost
  const hostname = parsedUrl.hostname;
  if (isLocalhost(hostname)) {
    // Allow localhost in development mode
    if (getEnvBool('PROMPTFOO_ALLOW_LOCALHOST_REQUESTS')) {
      return;
    }
    throw new SSRFValidationError(`Blocked request to localhost: ${hostname}`, urlString);
  }

  // Check for private IP addresses
  if (isPrivateIp(hostname)) {
    throw new SSRFValidationError(`Blocked request to private IP: ${hostname}`, urlString);
  }

  // Check for IP address literals (additional safety check)
  // This catches some edge cases like decimal IP notation
  if (/^[\d.]+$/.test(hostname) || /^[0-9a-f:]+$/i.test(hostname)) {
    const bytes = hostname.split('.').map(Number);
    // Block any single-byte IP (like "127" instead of "127.0.0.1")
    if (bytes.length === 1 && !Number.isNaN(bytes[0])) {
      throw new SSRFValidationError(
        `Blocked request to suspicious IP format: ${hostname}`,
        urlString,
      );
    }
  }
}
