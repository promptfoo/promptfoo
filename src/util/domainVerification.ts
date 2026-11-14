import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

import { getProxyForUrl } from 'proxy-from-env';
import { Agent, request } from 'undici';

export interface VerificationResult {
  url: string;
  status?: number;
  exists: boolean | null;
  error?: string;
  duration: number;
}

const DEFAULT_TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 4;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const blockedIPv4 = new BlockList();
// Exclude nonpublic IANA special-use ranges, including multicast and reserved space.
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['168.63.129.16', 32], // Azure WireServer platform address
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blockedIPv4.addSubnet(address, prefix);
}
const globalIPv6 = new BlockList();
globalIPv6.addSubnet('2000::', 3, 'ipv6');
const blockedIPv6 = new BlockList();
// Exclude special allocations, documentation and IPv4-embedding transition space.
blockedIPv6.addSubnet('2001::', 23, 'ipv6');
blockedIPv6.addSubnet('2001:db8::', 32, 'ipv6');
blockedIPv6.addSubnet('2002::', 16, 'ipv6');
blockedIPv6.addSubnet('3fff::', 20, 'ipv6');

function isPublicAddress(address: string, family: number): boolean {
  if (isIP(address) !== family) {
    return false;
  }
  if (family === 4) {
    return !blockedIPv4.check(address);
  }
  return family === 6 && globalIPv6.check(address, 'ipv6') && !blockedIPv6.check(address, 'ipv6');
}

function classifyExistence(status: number): boolean | null {
  if (status >= 200 && status < 400) {
    return true;
  }
  if (status === 404 || status === 410) {
    return false;
  }
  return null;
}

function validateDestination(url: URL): string {
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) {
    throw new Error('Reference must use HTTP(S) on its default port without credentials');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const family = isIP(hostname);
  if (family && !isPublicAddress(hostname, family)) {
    throw new Error('Reference resolves to a non-public address');
  }

  // Avoid local search domains and names reserved for local or private resolution.
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  if (
    !family &&
    (!normalized.includes('.') ||
      /(?:^|\.)(?:localhost|local|internal|home\.arpa)$/.test(normalized))
  ) {
    throw new Error('Reference uses a local hostname');
  }
  return hostname;
}

async function checkHop(url: URL, signal: AbortSignal) {
  const hostname = validateDestination(url);
  if (getProxyForUrl(url.href)) {
    throw new Error('Reference verification is unavailable through a configured HTTP proxy');
  }

  // Resolve at connect time and return a validated IP directly to the socket.
  // The request URL retains the hostname for HTTP Host and TLS verification.
  // IP literals bypass DNS lookup and are checked by validateDestination.
  const dispatcher = new Agent({
    connect: {
      lookup(requestedHost, options, callback) {
        if (requestedHost !== hostname) {
          callback(new Error('Unexpected reference hostname'), '', 0);
          return;
        }
        void lookup(hostname, { all: true }).then(
          (addresses) => {
            if (
              signal.aborted ||
              addresses.length === 0 ||
              addresses.some(({ address, family }) => !isPublicAddress(address, family))
            ) {
              callback(new Error('Reference resolves to a non-public address'), '', 0);
              return;
            }
            const candidates = options.family
              ? addresses.filter(({ family }) => family === options.family)
              : addresses;
            if (!candidates.length) {
              callback(new Error('Reference has no public address in the requested family'), '', 0);
              return;
            }
            if (options.all) {
              callback(null, candidates);
            } else {
              const [{ address, family }] = candidates;
              callback(null, address, family);
            }
          },
          (error: Error) => callback(error, '', 0),
        );
      },
    },
  });

  try {
    // Use a dedicated direct dispatcher. The shared fetch path can add credentials
    // and proxy routes, whose DNS and redirect policies are outside this validator.
    const { statusCode, headers } = await request(url, {
      dispatcher,
      method: 'HEAD',
      headers: { 'User-Agent': 'promptfoo-redteam' },
      signal,
    });
    if (Array.isArray(headers.location)) {
      throw new Error('Reference returned ambiguous redirect destinations');
    }
    return { status: statusCode, location: headers.location };
  } finally {
    await dispatcher.destroy();
  }
}

export async function verifyGithubRepo(
  owner: string,
  repo: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<VerificationResult> {
  if (
    !/^[a-z\d-]+$/i.test(owner) ||
    !/^[a-z\d_.-]+$/i.test(repo) ||
    repo === '.' ||
    repo === '..'
  ) {
    return {
      url: 'https://api.github.com',
      exists: null,
      error: 'invalid GitHub repository',
      duration: 0,
    };
  }
  return verifyHttpUrl(`https://api.github.com/repos/${owner}/${repo}`, timeoutMs);
}

export async function verifyHttpUrl(
  url: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<VerificationResult> {
  const startTime = Date.now();
  const inconclusive = (error: string): VerificationResult => ({
    url,
    exists: null,
    error,
    duration: Date.now() - startTime,
  });

  let signal: AbortSignal | undefined;
  try {
    signal = AbortSignal.timeout(timeoutMs);
    let destination = new URL(url);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const { status, location } = await checkHop(destination, signal);
      if (!REDIRECT_STATUSES.has(status) || !location) {
        return { url, status, exists: classifyExistence(status), duration: Date.now() - startTime };
      }
      destination = new URL(location, destination);
    }
    return inconclusive('Reference exceeded the redirect limit');
  } catch (error) {
    if (signal?.aborted) {
      return inconclusive('timeout');
    }
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
    return inconclusive(cause instanceof Error ? cause.message : 'unknown error');
  }
}
