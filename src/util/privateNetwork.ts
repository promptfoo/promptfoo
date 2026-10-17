import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { getEnvBool, getEnvString } from '../envars';
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
 * Scope note: this covers the server routes that fetch caller-chosen URLs
 * (`POST /api/providers/test`, `POST /api/providers/discover`,
 * `POST /api/providers/test-session`). Eval-time provider calls (e.g. a local
 * Ollama at 127.0.0.1) are unaffected so local development keeps working.
 * Agentic browser navigation targets are out of scope: driving a browser to
 * an arbitrary page is that provider's core function, not an endpoint to
 * guard.
 *
 * Redirects: the preflight below validates the initial target, and the fetch
 * layer (`fetchWithProxy`) re-validates every redirect destination while the
 * flag is set, so a public URL cannot 302 into private space.
 *
 * DNS-rebinding caveat: the hostname is resolved once, before the request.
 * A record that flips between the check and the connection (rebind attack)
 * is not defended against here; operators needing that guarantee should
 * terminate provider traffic at an egress proxy.
 */

// [start, end] as unsigned 32-bit ints, sorted for readability.
const IPV4_PRIVATE_RANGES: Array<readonly [number, number]> = [
  [0x00000000, 0x00000000], // 0.0.0.0/32        unspecified (connects to a local listener on Node)
  [0x0a000000, 0x0affffff], // 10.0.0.0/8        RFC1918
  [0x64400000, 0x647fffff], // 100.64.0.0/10     RFC6598 shared address space (carrier/overlay nets)
  [0xac100000, 0xac1fffff], // 172.16.0.0/12     RFC1918
  [0xc0a80000, 0xc0a8ffff], // 192.168.0.0/16    RFC1918
  [0x7f000000, 0x7fffffff], // 127.0.0.0/8       loopback
  [0xa9fe0000, 0xa9feffff], // 169.254.0.0/16    link-local (cloud metadata lives here)
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
  // :: unspecified (connects to a local listener on Node, like 0.0.0.0)
  if (bytes.every((b) => b === 0)) {
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
  config?: { apiBaseUrl?: unknown; url?: unknown };
}

/**
 * Named providers whose default endpoint is a local service. With the flag
 * set and no explicit URL override, the effective default (the provider's env
 * override, or the hardcoded local default) is validated instead of being
 * trusted as "public by default" — e.g. `ollama:chat:llama3` would otherwise
 * post to http://localhost:11434 unchecked.
 */
const LOCAL_DEFAULT_ENDPOINTS: Array<{
  /** Matches the provider ids that default to this local endpoint. */
  test: (id: string) => boolean;
  /** The effective default base URL, honoring the provider's env override. */
  baseUrl: () => string;
}> = [
  {
    test: (id) => id.startsWith('ollama:'),
    baseUrl: () => getEnvString('OLLAMA_BASE_URL') || 'http://localhost:11434',
  },
  {
    test: (id) => id === 'llama' || id.startsWith('llama:'),
    baseUrl: () => getEnvString('LLAMA_BASE_URL') || 'http://localhost:8080',
  },
  {
    test: (id) => id.startsWith('localai:'),
    baseUrl: () => getEnvString('LOCALAI_BASE_URL') || 'http://localhost:8080/v1',
  },
  {
    test: (id) => id.startsWith('mlflow-gateway:'),
    baseUrl: () => getEnvString('MLFLOW_GATEWAY_URL') || 'http://localhost:5000',
  },
  {
    test: (id) => id.startsWith('helicone:'),
    baseUrl: () => 'http://localhost:8080',
  },
  {
    test: (id) => id.startsWith('docker:'),
    baseUrl: () => getEnvString('DOCKER_MODEL_RUNNER_BASE_URL') || 'http://localhost:12434',
  },
];

/**
 * Extract the effective fetch target from provider options, if one can be
 * determined. Covers every shape that lets a caller choose the fetch target:
 *
 * - an explicit `config.apiBaseUrl` or `config.url` override (the latter is
 *   what `HttpProvider` actually requests for `{ id: 'http', ... }`),
 * - a bare `http(s)` provider id — parsed with `URL` so the non-canonical
 *   forms the provider registry accepts (`http:127.0.0.1`, backslash
 *   variants) are caught too,
 * - a named provider whose default endpoint is local (ollama, llama, ...),
 *   validated against its effective default base URL.
 *
 * Named providers without an override or a local default resolve to their
 * public defaults and need no check.
 */
export function getCallerSuppliedBaseUrl(providerOptions: ProviderTarget): string | undefined {
  const config = providerOptions?.config;
  for (const key of ['apiBaseUrl', 'url'] as const) {
    const configUrl = config?.[key];
    if (typeof configUrl === 'string' && configUrl.length > 0) {
      return configUrl;
    }
  }
  const id = providerOptions?.id;
  if (typeof id !== 'string' || id.length === 0) {
    return undefined;
  }
  try {
    const parsed = new URL(id);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return id;
    }
  } catch {
    // Not an absolute URL. The provider registry still accepts any `http:`-
    // prefixed id, so treat it as an HTTP target and let
    // assertUrlResolvesPublic fail closed on it.
    if (/^https?:/i.test(id)) {
      return id;
    }
  }
  const localDefault = LOCAL_DEFAULT_ENDPOINTS.find(({ test }) => test(id));
  return localDefault?.baseUrl();
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
