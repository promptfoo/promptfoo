/**
 * SSRF Protection Levels
 *
 * Level 0 (none): No protection - vulnerable to SSRF
 * Level 1 (blocklist): Block known internal hosts - can be bypassed
 * Level 2 (allowlist): Only allow approved domains - recommended approach
 */

import { URL } from 'url';
import dns from 'dns';
import { promisify } from 'util';

const dnsLookup = promisify(dns.lookup);

export type ProtectionResult = { allowed: boolean; error?: string };

export function noProtection(_url: string): ProtectionResult {
  /** Level 0: No protection - allows any URL (VULNERABLE) */
  return { allowed: true };
}

export function blocklist_protection(url: string): ProtectionResult {
  /**
   * Level 1: Blocklist approach - block known internal hosts
   *
   * This is better than nothing but has many bypasses:
   * - URL encoding tricks
   * - Alternative IP representations (decimal, hex, octal)
   * - DNS rebinding
   * - IPv6 representations
   */
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, error: 'Invalid URL' };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (!hostname) {
    return { allowed: false, error: 'Invalid URL: no hostname' };
  }

  // Block common internal hostnames
  const blockedHosts = [
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '169.254.169.254', // AWS metadata
    'metadata.google.internal', // GCP metadata
    '169.254.169.253', // Azure metadata
  ];

  if (blockedHosts.includes(hostname)) {
    return { allowed: false, error: `Blocked: ${hostname} is a known internal host` };
  }

  // Check if it's an IP address in private ranges
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = hostname.match(ipv4Regex);

  if (match) {
    const octets = match.slice(1).map(Number);
    const [a, b, c, d] = octets;

    // Validate IP format
    if (octets.some((o) => o > 255)) {
      return { allowed: false, error: 'Invalid IP address' };
    }

    // 127.x.x.x (loopback)
    if (a === 127) {
      return { allowed: false, error: `Blocked: ${hostname} is a loopback address` };
    }

    // 10.x.x.x (private)
    if (a === 10) {
      return { allowed: false, error: `Blocked: ${hostname} is a private IP` };
    }

    // 172.16.0.0 - 172.31.255.255 (private)
    if (a === 172 && b >= 16 && b <= 31) {
      return { allowed: false, error: `Blocked: ${hostname} is a private IP` };
    }

    // 192.168.x.x (private)
    if (a === 192 && b === 168) {
      return { allowed: false, error: `Blocked: ${hostname} is a private IP` };
    }

    // 169.254.x.x (link-local)
    if (a === 169 && b === 254) {
      return { allowed: false, error: `Blocked: ${hostname} is a link-local address` };
    }

    // 0.0.0.0
    if (a === 0 && b === 0 && c === 0 && d === 0) {
      return { allowed: false, error: `Blocked: ${hostname} is not a valid target` };
    }
  }

  return { allowed: true };
}

// Domains that are allowed to be fetched
const ALLOWED_DOMAINS = [
  'example.com',
  'httpbin.org',
  'api.github.com',
  'jsonplaceholder.typicode.com',
];

export async function allowlistProtection(url: string): Promise<ProtectionResult> {
  /**
   * Level 2: Allowlist approach - only allow explicitly approved domains
   *
   * This is the recommended approach:
   * - Only pre-approved domains can be accessed
   * - Much harder to bypass
   * - Principle of least privilege
   */
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, error: 'Invalid URL' };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (!hostname) {
    return { allowed: false, error: 'Invalid URL: no hostname' };
  }

  // Check against allowlist
  if (!ALLOWED_DOMAINS.includes(hostname)) {
    return {
      allowed: false,
      error: `Blocked: ${hostname} not in allowlist. Allowed: ${ALLOWED_DOMAINS.join(', ')}`,
    };
  }

  // Additional safety: resolve DNS and verify it doesn't point to internal IP
  try {
    const result = await dnsLookup(hostname);
    const ip = result.address;

    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = ip.match(ipv4Regex);

    if (match) {
      const [a, b] = match.slice(1, 3).map(Number);

      // Check for internal IPs
      if (
        a === 127 ||
        a === 10 ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 169 && b === 254)
      ) {
        return { allowed: false, error: `Blocked: ${hostname} resolves to internal IP ${ip}` };
      }
    }
  } catch {
    return { allowed: false, error: `Blocked: Could not resolve ${hostname}` };
  }

  return { allowed: true };
}

export const PROTECTION_FUNCTIONS: Record<
  number,
  (url: string) => ProtectionResult | Promise<ProtectionResult>
> = {
  0: noProtection,
  1: blocklist_protection,
  2: allowlistProtection,
};

export const PROTECTION_NAMES: Record<number, string> = {
  0: 'none (vulnerable)',
  1: 'blocklist',
  2: 'allowlist',
};
