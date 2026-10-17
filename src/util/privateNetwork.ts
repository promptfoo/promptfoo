import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { getEnvBool } from '../envars';
import logger from '../logger';

/**
 * Guards for the opt-in `PROMPTFOO_BLOCK_PRIVATE_RANGES` mode (see #11768).
 *
 * Deployments that intentionally expose the local server beyond loopback
 * (Docker, LAN shares, `PROMPTFOO_SERVER_HOST`) let remote callers ask the
 * server to fetch arbitrary provider URLs (`POST /api/providers/test`,
 * `POST /api/providers/discover`). Without a guard, the operator's process
 * becomes a proxy for cloud-metadata theft (169.254.169.254) and quiet
 * internal port scanning. When the flag is set, caller-supplied URLs are
 * resolved and rejected before any request is issued if every route to the
 * host stays inside private, loopback, or link-local space.
 *
 * Scope note: this intentionally covers only the server routes that fetch
 * caller-chosen URLs. Eval-time provider calls (e.g. a local Ollama at
 * 127.0.0.1) are unaffected so local development keeps working.
 *
 * DNS-rebinding caveat: the hostname is resolved once, before the request.
 * A record that flips between the check and the connection (rebind attack)
 * is not defended against here; operators needing that guarantee should
 * terminate provider traffic at an egress proxy.
 */

// [start, end] as unsigned 32-bit ints, sorted for readability.
const IPV4_PRIVATE_RANGES: Array<readonly [number, number]> = [
  [0x0a000000, 0x0affffff], // 10.0.0.0/8      RFC1918
  [0xac100000, 0xac1fffff], // 172.16.0.0/12   RFC1918
  [0xc0a80000, 0xc0a8ffff], // 192.168.0.0/16  RFC1918
  [0x7f000000, 0x7fffffff], // 127.0.0.0/8      loopback
  [0xa9fe0000, 0xa9feffff], // 169.254.0.0/16  link-local (cloud metadata lives here)
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return null;
  }
  let value = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return null;
    }
    const octet = Number(part);
    if (octet < 0 || octet > 255) {
      return null;
    }
    value = value * 256 + octet;
  }
  return value;
}

/**
 * Expand an IPv6 literal to 16 bytes. Returns null for malformed input.
 * Handles `::` compression and an embedded dotted-quad tail (`::ffff:1.2.3.4`).
 */
function expandIPv6(ip: string): number[] | null {
  const halves = ip.split('::');
  if (halves.length > 2) {
    return null;
  }
  const parseGroups = (section: string): number[] | null => {
    if (section === '') {
      return [];
    }
    const out: number[] = [];
    for (const group of section.split(':')) {
      if (group.includes('.')) {
        // Embedded IPv4 tail occupies the final 32 bits.
        const v4 = ipv4ToInt(group);
        if (v4 === null) {
          return null;
        }
        out.push((v4 >>> 16) & 0xffff, v4 & 0xffff);
      } else {
        if (!/^[0-9a-fA-F]{1,4}$/.test(group)) {
          return null;
        }
        out.push(Number.parseInt(group, 16));
      }
    }
    return out;
  };

  const head = parseGroups(halves[0]);
  const tail = halves.length === 2 ? parseGroups(halves[1]) : [];
  if (head === null || tail === null) {
    return null;
  }
  // Without `::` the address must be exactly 8 groups; with it, fewer.
  if (halves.length === 1 && head.length !== 8) {
    return null;
  }
  if (head.length + tail.length > 8) {
    return null;
  }
  const groups = [...head, ...new Array(8 - head.length - tail.length).fill(0), ...tail];
  const bytes: number[] = [];
  for (const g of groups) {
    bytes.push((g >>> 8) & 0xff, g & 0xff);
  }
  return bytes;
}

function isPrivateIPv6(bytes: number[]): boolean {
  // ::1 loopback
  if (bytes.slice(0, 15).every((b) => b === 0) && bytes[15] === 1) {
    return true;
  }
  // fe80::/10 link-local
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) {
    return true;
  }
  // fc00::/7 unique-local (the IPv6 counterpart of RFC1918)
  if ((bytes[0] & 0xfe) === 0xfc) {
    return true;
  }
  // ::ffff:0:0/96 IPv4-mapped — judge by the embedded IPv4 address.
  if (bytes.slice(0, 10).every((b) => b === 0) && bytes[10] === 0xff && bytes[11] === 0xff) {
    const v4 = bytes.slice(12).join('.');
    return isPrivateIPv4(v4);
  }
  return false;
}

function isPrivateIPv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  if (value === null) {
    return false;
  }
  return IPV4_PRIVATE_RANGES.some(([start, end]) => value >= start && value <= end);
}

/**
 * True when the literal IP address is in private, loopback, or link-local
 * space. Hostnames are NOT resolved here; use {@link assertUrlResolvesPublic}.
 */
export function isPrivateIpAddress(ip: string): boolean {
  const host = ip.replace(/^\[(.*)\]$/, '$1');
  const family = isIP(host);
  if (family === 4) {
    return isPrivateIPv4(host);
  }
  if (family === 6) {
    const bytes = expandIPv6(host);
    return bytes !== null && isPrivateIPv6(bytes);
  }
  return false;
}

export function isPrivateRangeBlockingEnabled(): boolean {
  return getEnvBool('PROMPTFOO_BLOCK_PRIVATE_RANGES');
}

export class PrivateRangeBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrivateRangeBlockedError';
  }
}

/**
 * Resolve the URL's host and throw {@link PrivateRangeBlockedError} when it
 * is a private, loopback, or link-local address, or when the host cannot be
 * resolved (fail closed: an unverifiable target must not be fetched on an
 * exposed server).
 */
export async function assertUrlResolvesPublic(rawUrl: string): Promise<void> {
  let hostname: string;
  try {
    hostname = new URL(rawUrl).hostname;
  } catch {
    throw new PrivateRangeBlockedError(
      `PROMPTFOO_BLOCK_PRIVATE_RANGES is set: refusing to fetch unparseable provider URL ${JSON.stringify(rawUrl)}`,
    );
  }
  const host = hostname.replace(/^\[(.*)\]$/, '$1');

  if (isIP(host) !== 0) {
    if (isPrivateIpAddress(host)) {
      throw new PrivateRangeBlockedError(
        `PROMPTFOO_BLOCK_PRIVATE_RANGES is set: refusing to fetch provider URL with private address ${JSON.stringify(host)}`,
      );
    }
    return;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host, { all: true });
  } catch (error) {
    throw new PrivateRangeBlockedError(
      `PROMPTFOO_BLOCK_PRIVATE_RANGES is set: refusing to fetch provider URL whose host ${JSON.stringify(host)} could not be resolved: ${(error as Error).message}`,
    );
  }
  const blocked = addresses.filter(({ address }) => isPrivateIpAddress(address));
  if (blocked.length > 0) {
    logger.debug('[privateNetwork] Blocked provider URL resolving to private range', {
      host,
      blocked: blocked.map(({ address }) => address),
    });
    throw new PrivateRangeBlockedError(
      `PROMPTFOO_BLOCK_PRIVATE_RANGES is set: refusing to fetch provider URL whose host ${JSON.stringify(host)} resolves to a private address`,
    );
  }
}

interface ProviderTarget {
  id?: unknown;
  config?: { apiBaseUrl?: unknown };
}

/**
 * Extract the caller-supplied base URL from provider options, if any. Covers
 * the two shapes that let a caller choose the fetch target: a bare
 * `http(s)://` provider id, and an explicit `config.apiBaseUrl`. Named
 * providers without an override resolve to their public defaults and need no
 * check.
 */
export function getCallerSuppliedBaseUrl(providerOptions: ProviderTarget): string | undefined {
  const configUrl = providerOptions?.config?.apiBaseUrl;
  if (typeof configUrl === 'string' && configUrl.length > 0) {
    return configUrl;
  }
  const id = providerOptions?.id;
  if (typeof id === 'string' && /^(https?):\/\//i.test(id)) {
    return id;
  }
  return undefined;
}

/**
 * No-op unless `PROMPTFOO_BLOCK_PRIVATE_RANGES` is set. Otherwise resolves the
 * caller-supplied provider target and throws {@link PrivateRangeBlockedError}
 * when it is not publicly routable.
 */
export async function assertProviderTargetPublic(providerOptions: ProviderTarget): Promise<void> {
  if (!isPrivateRangeBlockingEnabled()) {
    return;
  }
  const url = getCallerSuppliedBaseUrl(providerOptions);
  if (!url) {
    return;
  }
  await assertUrlResolvesPublic(url);
}
