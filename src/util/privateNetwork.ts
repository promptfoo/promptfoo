import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { getEnvBool, getEnvString } from '../envars';
import logger from '../logger';
import { maybeLoadFromExternalFile } from './file';

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
  config?: {
    apiBaseUrl?: unknown;
    baseUrl?: unknown;
    url?: unknown;
    gateway_url?: unknown;
    request?: unknown;
    useHttps?: unknown;
  };
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
  /**
   * True when the provider resolves `config.apiBaseUrl` ahead of this
   * default, so an explicit override replaces the default instead of
   * sitting beside it. Providers that build their fetch URL from an env
   * var alone leave this unset: their default stays a live target even
   * when an (ignored) `apiBaseUrl` is configured.
   */
  apiBaseUrlWins?: boolean;
  /**
   * True when the provider ignores `config.apiBaseUrl` and derives its
   * effective endpoint from `config.baseUrl` instead. The guard then
   * validates the explicit `config.baseUrl` when one is configured, and
   * the local default otherwise: suppressing the default on an
   * `apiBaseUrl` override would validate a URL that is never fetched
   * while the real target goes unchecked.
   */
  configBaseUrlWins?: boolean;
  /**
   * Same shape as `configBaseUrlWins` for providers whose endpoint key is
   * `config.gateway_url` (openclaw): the effective target is the explicit
   * `config.gateway_url` when one is configured, the local default
   * otherwise. The provider's config-file fallback (step 3 of
   * `resolveGatewayTransportUrl`) is not reproduced here: resolving it
   * would mean importing provider code into this shared util, so a
   * config-file-redirected public gateway still validates the local
   * default and fails closed. Operators can unblock that case with an
   * explicit `config.gateway_url` or gateway env override.
   */
  configGatewayUrlWins?: boolean;
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
    apiBaseUrlWins: true,
  },
  {
    test: (id) => id.startsWith('mlflow-gateway:'),
    baseUrl: () => getEnvString('MLFLOW_GATEWAY_URL') || 'http://localhost:5000',
  },
  {
    test: (id) => id.startsWith('helicone:'),
    baseUrl: () => 'http://localhost:8080',
    // HeliconeGatewayProvider derives its endpoint from config.baseUrl and
    // overwrites config.apiBaseUrl with `${baseUrl}/ai`, so the effective
    // target is the configured baseUrl (or the local default), never the
    // caller-supplied apiBaseUrl.
    configBaseUrlWins: true,
  },
  {
    test: (id) => id.startsWith('docker:'),
    baseUrl: () => getEnvString('DOCKER_MODEL_RUNNER_BASE_URL') || 'http://localhost:12434',
  },
  {
    test: (id) => id.startsWith('elevenlabs:'),
    baseUrl: () => 'https://api.elevenlabs.io/v1',
    // Every ElevenLabs provider (tts, stt, agents, ...) hands config.baseUrl
    // to ElevenLabsClient, which dispatches `${baseUrl}${endpoint}` via
    // fetchWithProxy. The client-side guard validates redirects but not the
    // initial hop, so the configured baseUrl must be preflighted here; the
    // public default needs no exception because it is public.
    configBaseUrlWins: true,
  },
  {
    test: (id) => id.startsWith('litellm:'),
    baseUrl: () => getEnvString('LITELLM_API_BASE') || 'http://0.0.0.0:4000',
    // createLiteLLMProvider resolves config.apiBaseUrl, then the
    // LITELLM_API_BASE env override, then the local proxy default, so an
    // explicit apiBaseUrl replaces the default outright.
    apiBaseUrlWins: true,
  },
  {
    test: (id) => /^(?:openclaw|clawdbot)(?::|$)/.test(id),
    baseUrl: () =>
      getEnvString('OPENCLAW_GATEWAY_URL') ||
      getEnvString('CLAWDBOT_GATEWAY_URL') ||
      'http://127.0.0.1:18789',
    // resolveGatewayTransportUrl resolves config.gateway_url, then the
    // gateway env overrides, then the local gateway default. The port
    // override needs no separate handling: the default host is loopback
    // on any port, so the verdict is the same.
    configGatewayUrlWins: true,
  },
];

/**
 * Resolve a provider id to a fetchable URL when the registry routes it to a
 * URL-fetching provider. URL-bearing ids are unwrapped because the
 * providers strip the prefix before fetching the inner URL: `webhook:`
 * (WebhookProvider), `n8n:` (createN8nProvider strips the prefix for the
 * webhook URL), and `a2a:` (A2AProvider stores the remainder as
 * `config.url`). `ws:` and `wss:` ids reach WebSocketProvider, which dials
 * the URL outside the fetch layer, so the route preflight is the only guard
 * for them.
 */
function getUrlFromProviderId(id: string): string | undefined {
  const wrappedPrefix = ['webhook:', 'n8n:', 'a2a:'].find((prefix) => id.startsWith(prefix));
  const candidate = wrappedPrefix ? id.slice(wrappedPrefix.length) : id;
  try {
    const parsed = new URL(candidate);
    if (
      parsed.protocol === 'http:' ||
      parsed.protocol === 'https:' ||
      parsed.protocol === 'ws:' ||
      parsed.protocol === 'wss:'
    ) {
      return candidate;
    }
  } catch {
    // Not an absolute URL. The provider registry still accepts any `http:`-
    // prefixed id, so treat it as an HTTP target and let
    // assertUrlResolvesPublic fail closed on it.
    if (/^https?:/i.test(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Derive the effective fetch target of an HttpProvider raw request
 * (`config.request`), mirroring `callApiWithRawRequest`: the Host header is
 * the effective authority (the provider strips an absolute-form request
 * target to its path via `urlEncodeRawRequestPath` and re-resolves it
 * against the Host header), so a Host header is validated whenever one is
 * present, even alongside an absolute-form target. Without a Host header an
 * absolute-form target is used as-is. A `file://` reference is resolved the
 * same way the provider resolves it.
 * Throws {@link PrivateRangeBlockedError} when no target can be determined:
 * fail closed, since an unverifiable target must not be fetched on an
 * exposed server (the raw request is rendered with caller-controlled
 * template variables at call time, so a missing Host header here cannot be
 * proven safe).
 */
function getRawRequestTarget(rawRequest: string, useHttps: boolean): string {
  let requestText = rawRequest;
  if (requestText.startsWith('file://')) {
    let loaded: unknown;
    try {
      loaded = maybeLoadFromExternalFile(requestText);
    } catch {
      loaded = undefined;
    }
    if (typeof loaded !== 'string' || loaded.length === 0) {
      throw new PrivateRangeBlockedError(
        'PROMPTFOO_BLOCK_PRIVATE_RANGES is set: refusing provider raw request whose file:// target could not be loaded for preflight validation',
      );
    }
    requestText = loaded;
  }
  const headerBlock = requestText.replace(/\r\n/g, '\n').split('\n\n')[0] ?? '';
  const lines = headerBlock.split('\n');
  const target = lines[0]?.trim().split(/\s+/)[1] ?? '';
  // Last Host header wins: the provider collapses duplicate headers by
  // overwriting, so the last one is the authority the fetch resolves against.
  const host = lines
    .slice(1)
    .filter((line) => /^\s*host\s*:/i.test(line))
    .pop()
    ?.replace(/^\s*host\s*:\s*/i, '')
    .trim();
  if (/^https?:\/\//i.test(target)) {
    if (host) {
      return `${useHttps ? 'https' : 'http'}://${host}`;
    }
    return target;
  }
  if (!host) {
    throw new PrivateRangeBlockedError(
      'PROMPTFOO_BLOCK_PRIVATE_RANGES is set: refusing provider raw request with no Host header or absolute request target to validate',
    );
  }
  return `${useHttps ? 'https' : 'http'}://${host}`;
}

/**
 * Extract every caller-supplied fetch target from provider options, so the
 * preflight can validate each one. A first-match lookup is not enough: the
 * provider that finally runs may ignore the first field and fetch another
 * (e.g. HttpProvider requests `config.url || id` and never reads
 * `config.apiBaseUrl`), which would let a validated public field mask the
 * private effective target.
 *
 * Covers every shape that lets a caller choose the fetch target:
 *
 * - explicit `config.apiBaseUrl` / `config.url` overrides,
 * - an HttpProvider raw `config.request` (Host header authority, else the
 *   absolute request target, mirroring `callApiWithRawRequest`),
 * - a bare `http(s)` provider id, parsed with `URL` so the non-canonical
 *   forms the provider registry accepts (`http:127.0.0.1`, backslash
 *   variants) are caught too,
 * - URL-bearing provider ids the registry unwraps before fetching
 *   (`webhook:<url>`, `n8n:<url>`, `a2a:<url>`, `ws:`/`wss:`),
 * - a named provider whose default endpoint is local (ollama, llama,
 *   litellm, openclaw, ...), validated against its effective default base
 *   URL, unless the provider resolves an explicit `config.apiBaseUrl`
 *   ahead of that default (localai, litellm), in which case the default
 *   is never fetched; providers that derive their endpoint from
 *   `config.baseUrl` instead (helicone, elevenlabs) are validated against
 *   the effective `config.baseUrl`, and providers that derive it from
 *   `config.gateway_url` (openclaw) against the effective gateway URL.
 *
 * Named providers without an override or a local default resolve to their
 * public defaults and need no check.
 */
export function getCallerSuppliedBaseUrls(providerOptions: ProviderTarget): string[] {
  const urls: string[] = [];
  const config = providerOptions?.config;
  for (const key of ['apiBaseUrl', 'url'] as const) {
    const configUrl = config?.[key];
    if (typeof configUrl === 'string' && configUrl.length > 0) {
      urls.push(configUrl);
    }
  }
  const rawRequest = config?.request;
  if (typeof rawRequest === 'string' && rawRequest.length > 0) {
    urls.push(getRawRequestTarget(rawRequest, config?.useHttps === true));
  }
  const id = providerOptions?.id;
  if (typeof id !== 'string' || id.length === 0) {
    return urls;
  }
  const idUrl = getUrlFromProviderId(id);
  if (idUrl) {
    urls.push(idUrl);
    return urls;
  }
  const localDefault = LOCAL_DEFAULT_ENDPOINTS.find(({ test }) => test(id));
  const defaultUrl = localDefault?.baseUrl();
  if (defaultUrl) {
    const target = getLocalDefaultTarget(localDefault, config, defaultUrl);
    if (target) {
      urls.push(target);
    }
  }
  return urls;
}

type LocalDefaultEndpoint = (typeof LOCAL_DEFAULT_ENDPOINTS)[number];

/**
 * Resolve the effective target for a named provider with a local default
 * endpoint. Providers that derive their endpoint from `config.baseUrl`
 * (helicone, elevenlabs) or `config.gateway_url` (openclaw) never fetch
 * `config.apiBaseUrl`, so the effective target is the explicit key when
 * one is configured, the local default otherwise. A provider that
 * resolves `config.apiBaseUrl` ahead of its local default (localai,
 * litellm) never fetches the default once an override is configured, so
 * the default is suppressed there; providers whose fetch URL comes from
 * an env var alone keep the default, since it remains their effective
 * target. Returns undefined only when the default is suppressed.
 */
function getLocalDefaultTarget(
  localDefault: LocalDefaultEndpoint | undefined,
  config: ProviderTarget['config'],
  defaultUrl: string,
): string | undefined {
  if (!localDefault) {
    return undefined;
  }
  if (localDefault.configBaseUrlWins) {
    const configBaseUrl = config?.baseUrl;
    return typeof configBaseUrl === 'string' && configBaseUrl.length > 0
      ? configBaseUrl
      : defaultUrl;
  }
  if (localDefault.configGatewayUrlWins) {
    const gatewayUrl = config?.gateway_url;
    return typeof gatewayUrl === 'string' && gatewayUrl.length > 0 ? gatewayUrl : defaultUrl;
  }
  const apiBaseUrl = config?.apiBaseUrl;
  const explicitApiBaseUrl =
    typeof apiBaseUrl === 'string' && apiBaseUrl.length > 0 ? apiBaseUrl : undefined;
  if (explicitApiBaseUrl && localDefault.apiBaseUrlWins) {
    return undefined;
  }
  return defaultUrl;
}

/**
 * No-op unless `PROMPTFOO_BLOCK_PRIVATE_RANGES` is set. Otherwise resolves
 * every caller-supplied provider target and throws
 * {@link PrivateRangeBlockedError} when any of them is not publicly routable.
 */
export async function assertProviderTargetPublic(providerOptions: ProviderTarget): Promise<void> {
  if (!isPrivateRangeBlockingEnabled()) {
    return;
  }
  const urls = getCallerSuppliedBaseUrls(providerOptions);
  for (const url of urls) {
    await assertUrlResolvesPublic(url);
  }
}
