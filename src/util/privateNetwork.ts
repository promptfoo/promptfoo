import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { CLOUD_PROVIDER_PREFIX } from '../constants';
import { getEnvBool, getEnvString } from '../envars';
import logger from '../logger';
import { maybeLoadFromExternalFile } from './file';
import { isProviderConfigFileReference } from './providerRef';

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
 * guard context is active. The effective first hop is checked there too.
 *
 * DNS-rebinding caveat: the hostname is resolved before the connection.
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
  // fec0::/10 site-local (deprecated, but still routable on hosts that route it)
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0xc0) {
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
 * Every message raised by this module shares one prefix. Guard failures
 * surface downstream as plain strings (provider `{ error }` results,
 * evaluation summaries), so callers that only see the string cannot use
 * `instanceof` on them. Matching on the shared prefix lets a caller
 * redact a guard failure without distinguishing why it was refused.
 */
const PRIVATE_RANGE_BLOCKED_MESSAGE_PREFIX = 'PROMPTFOO_BLOCK_PRIVATE_RANGES is set:';

export function isPrivateRangeBlockedMessage(message: unknown): boolean {
  return typeof message === 'string' && message.includes(PRIVATE_RANGE_BLOCKED_MESSAGE_PREFIX);
}

/**
 * Resolve the URL's host and throw {@link PrivateRangeBlockedError} when it
 * is a private, loopback, or link-local address, or when the host cannot be
 * resolved (fail closed: an unverifiable target must not be fetched on an
 * exposed server).
 */
export async function assertUrlResolvesPublic(rawUrl: string): Promise<void> {
  // A URL that still carries a template placeholder was never validated as
  // the target that will actually be fetched: providers render Nunjucks
  // templates in URL fields at call time (e.g. HttpProvider renders
  // `config.url` with the prompt), so `http://{{prompt}}@public.example/`
  // preflights as public.example but can dispatch to 127.0.0.1 once the
  // prompt fills the userinfo slot. Refuse it outright: the preflight
  // cannot prove the rendered target public.
  if (rawUrl.includes('{{')) {
    throw new PrivateRangeBlockedError(
      'PROMPTFOO_BLOCK_PRIVATE_RANGES is set: refusing to fetch provider URL with an unresolved template whose rendered target cannot be validated before loading',
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new PrivateRangeBlockedError(
      'PROMPTFOO_BLOCK_PRIVATE_RANGES is set: refusing to fetch unparseable provider URL',
    );
  }
  // Fail closed on targets with no host to resolve (e.g. ws+unix:///path,
  // where the hostname is empty and dns.lookup('') returns [] with no
  // error, so the DNS check below would pass a Unix socket dial) and on
  // schemes outside the http/https/ws/wss set this preflight ever
  // legitimately validates (e.g. file:, ws+unix:). A hostless or
  // unsupported-scheme target has no public network endpoint to verify.
  if (parsed.hostname === '' || !['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)) {
    throw new PrivateRangeBlockedError(
      'PROMPTFOO_BLOCK_PRIVATE_RANGES is set: refusing to fetch provider URL with no resolvable host or unsupported scheme',
    );
  }
  const hostname = parsed.hostname;
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
  /** Top-level executable transform (`ProviderOptions.transform`). */
  transform?: unknown;
  config?: {
    auth?: unknown;
    apiBaseUrl?: unknown;
    baseUrl?: unknown;
    url?: unknown;
    gateway_url?: unknown;
    request?: unknown;
    useHttps?: unknown;
    server?: unknown;
    servers?: unknown;
    transformRequest?: unknown;
    transformResponse?: unknown;
    responseParser?: unknown;
    mcp?: unknown;
    session?: unknown;
    sessionParser?: unknown;
    validateStatus?: unknown;
    functionToolCallbacks?: unknown;
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
    // fetchWithProxy. Preflight the same baseUrl before constructing the client.
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
 * Provider ids that execute caller-chosen code instead of fetching a URL.
 * With the flag set, the guarded routes must refuse these before any
 * provider is loaded: the registry routes them to code execution outside
 * the fetch layer, so neither the preflight nor redirect validation would
 * see the network access they perform. `exec:` runs an arbitrary command
 * (ScriptCompletionProvider via execFile), `python:`/`golang:`/`ruby:`
 * run caller-chosen scripts, and the JS factory's suffix match is
 * prefix-agnostic, so any `file://` script module or bare JS/TS path is
 * loaded as a custom module. The shapes mirror the factories exactly:
 * prefixed ids, `file://` script modules (including the
 * `file://script.py:function` form the script factories accept), and bare
 * JS/TS module paths. A bare `.py`/`.go`/`.rb` path matches no factory,
 * so it is left for the loader to reject without executing. The JS
 * factory's suffix match is case-insensitive, unlike the script
 * factories, so the JS check lowercases the path.
 */
const SCRIPT_PROVIDER_PREFIXES = ['exec:', 'python:', 'golang:', 'ruby:'];
const JAVASCRIPT_FILE_EXTENSIONS = ['js', 'cjs', 'mjs', 'ts', 'cts', 'mts'];
// Extensions the script factories route from file:// paths (the JS
// factory below is suffix-only, so its extensions stay out of this list).
const SCRIPT_FACTORY_EXTENSIONS = ['py', 'go', 'rb'];

function isMcpProviderId(id: string): boolean {
  return id === 'mcp' || id.startsWith('mcp:');
}

type McpServerTransport = {
  command?: unknown;
  path?: unknown;
  url?: unknown;
};

/**
 * The MCP servers a caller-supplied config would connect to: the single
 * `server` object, plus every entry of the `servers` array when present (the
 * shared client prefers the array). Defensive reads only: the preflight must
 * fail closed on malformed shapes, never throw a TypeError on them.
 */
function getMcpServers(config: ProviderTarget['config']): McpServerTransport[] {
  const servers: McpServerTransport[] = [];
  const server = config?.server;
  if (typeof server === 'object' && server !== null) {
    servers.push(server as McpServerTransport);
  }
  const serversRaw = config?.servers;
  if (Array.isArray(serversRaw)) {
    for (const entry of serversRaw) {
      if (typeof entry === 'object' && entry !== null) {
        servers.push(entry as McpServerTransport);
      }
    }
  }
  return servers;
}

/**
 * Refuse a subprocess MCP transport, collect a remote server URL for
 * validation. Shared by the standalone `mcp:` providers and the embedded
 * `config.mcp` configs below: both spawn the transport outside the fetch
 * layer when the provider initializes, so neither the preflight nor
 * redirect validation would see the network access it performs. `command`
 * is a string for the shared MCP client and an argv array for opencode-sdk
 * local servers; either form spawns a subprocess.
 */
function handleMcpServerTransport(server: McpServerTransport, urls: string[]): void {
  const hasCommand =
    (typeof server.command === 'string' && server.command.length > 0) ||
    (Array.isArray(server.command) && server.command.length > 0);
  if (hasCommand) {
    throw new PrivateRangeBlockedError(
      'PROMPTFOO_BLOCK_PRIVATE_RANGES is set: refusing MCP server command transport whose subprocess would execute outside the fetch guard',
    );
  }
  if (typeof server.path === 'string' && server.path.length > 0) {
    throw new PrivateRangeBlockedError(
      'PROMPTFOO_BLOCK_PRIVATE_RANGES is set: refusing MCP local server path whose script would execute outside the fetch guard',
    );
  }
  if (typeof server.url === 'string' && server.url.length > 0) {
    urls.push(server.url);
  }
}

/**
 * MCP servers execute outside the fetch layer too: command/path transports
 * spawn a subprocess (or a local script) when the provider initializes, so
 * they are refused outright like script providers. A remote server URL is
 * collected for validation like any other caller-supplied URL instead.
 */
function handleMcpProviderTargets(
  id: string,
  config: ProviderTarget['config'],
  urls: string[],
): void {
  if (!isMcpProviderId(id)) {
    return;
  }
  for (const server of getMcpServers(config)) {
    handleMcpServerTransport(server, urls);
  }
}

/**
 * MCP configs embedded in another provider's config (`config.mcp`): the
 * outer provider id is not `mcp:`, so the standalone check above never
 * runs, but the provider still initializes the servers when it loads.
 * OpenAiChatCompletionProvider starts MCPClient.initialize() from its
 * constructor when `config.mcp.enabled` is set, McpClientSession (used by
 * the Anthropic, Azure, and Google providers) starts it from its own
 * constructor, and the remaining embedded-MCP providers start it on first
 * use, all inside the guarded route's load call. The transport check is
 * the same as for standalone MCP providers: command/path transports are
 * refused outright, remote server URLs are collected for validation. Not
 * gated on `enabled`: the flag defaults to true at execution parse in
 * some paths, and reproducing each provider's enabled default here would
 * risk a divergence the bypass could hide in. Two shapes are handled: the
 * MCPConfig object (`server`/`servers`, openai/anthropic/azure/bedrock/
 * google) and the opencode-sdk record of per-server configs (local servers
 * carry `command` as an argv array, remote servers carry `url`).
 */
function handleEmbeddedMcpTargets(config: ProviderTarget['config'], urls: string[]): void {
  const mcp = config?.mcp;
  if (typeof mcp !== 'object' || mcp === null) {
    return;
  }
  const mcpRecord = mcp as { server?: unknown; servers?: unknown };
  if ('server' in mcpRecord || 'servers' in mcpRecord) {
    for (const server of getMcpServers(mcpRecord)) {
      handleMcpServerTransport(server, urls);
    }
    return;
  }
  for (const server of Object.values(mcpRecord)) {
    if (typeof server === 'object' && server !== null) {
      handleMcpServerTransport(server as McpServerTransport, urls);
    }
  }
}

function isScriptProviderId(id: string): boolean {
  if (SCRIPT_PROVIDER_PREFIXES.some((prefix) => id.startsWith(prefix))) {
    return true;
  }
  if (id.startsWith('file://')) {
    const scriptPath = id.slice('file://'.length);
    if (
      SCRIPT_FACTORY_EXTENSIONS.some(
        (ext) => scriptPath.endsWith(`.${ext}`) || scriptPath.includes(`.${ext}:`),
      )
    ) {
      return true;
    }
    return JAVASCRIPT_FILE_EXTENSIONS.some((ext) => scriptPath.toLowerCase().endsWith(`.${ext}`));
  }
  return JAVASCRIPT_FILE_EXTENSIONS.some((ext) => id.toLowerCase().endsWith(`.${ext}`));
}

/**
 * Derive the effective fetch target of an HttpProvider raw request
 * (`config.request`), mirroring `callApiWithRawRequest`: the Host header is
 * the effective authority (the provider strips an absolute-form request
 * target to its path via `urlEncodeRawRequestPath` and re-resolves it
 * against the Host header), so a Host header is validated whenever one is
 * present, even alongside an absolute-form target. Without a Host header an
 * absolute-form target is refused: the provider would resolve the stripped
 * path against a missing Host header instead of this target, so validating
 * the absolute target would approve a URL that is never fetched. A `file://` reference is resolved the
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
  // A template in the request line or headers can rewrite the effective
  // target at call time: HttpProvider renders the whole request with
  // Nunjucks before parsing, and its header reducer lets a later Host
  // overwrite the first, so `{{prompt}}: 127.0.0.1` with prompt `Host`
  // preflights as the literal public Host but dispatches to loopback. A
  // template literal can also smuggle a newline into a header value
  // (`{{ "a\nHost: 127.0.0.1" }}`), so refusing templates only in header
  // names is not enough: refuse any template opener in the header block
  // outright. Templates in the body stay allowed: the body cannot change
  // the dispatch target (only the request line and the Host header do).
  // Nunjucks `{% %}` tags need no refusal here: renderRawRequestWithNunjucks
  // raw-wraps the request and only re-enables `{{...}}` variables, so
  // `{% %}` never renders.
  if (headerBlock.includes('{{')) {
    throw new PrivateRangeBlockedError(
      'PROMPTFOO_BLOCK_PRIVATE_RANGES is set: refusing provider raw request with an unresolved template in the request line or headers whose rendered target cannot be validated before loading',
    );
  }
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
    // No Host header: the provider strips this absolute target to its path
    // and re-resolves it against the (missing) Host header, so the actual
    // dispatch target is http(s)://undefined, not this target. Validating
    // the absolute target would approve a URL that is never fetched.
    throw new PrivateRangeBlockedError(
      'PROMPTFOO_BLOCK_PRIVATE_RANGES is set: refusing provider raw request with an absolute request target but no Host header to resolve it against',
    );
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
 * - a file-backed provider id (`file://` YAML/JSON config), refused outright:
 *   `loadApiProvider` expands the file and instantiates the inner provider,
 *   so the preflight cannot validate the effective target without reading
 *   the file, and expanding it here would drag the provider loader into
 *   this shared guard. A templated `file://` id is refused for the same
 *   reason: env-template rendering at load time could turn it into a
 *   config-file reference the preflight never saw,
 * - a cloud provider id (`promptfoo://provider/<uuid>`), refused outright:
 *   `loadApiProvider` replaces it with the saved provider from Cloud and
 *   instantiates that, so the preflight sees no URL here, and resolving
 *   the saved target here would drag the Cloud client into this shared
 *   guard. Refusal keeps the flag fail closed,
 * - a script provider id (`exec:`, `python:`, `golang:`, `ruby:`, a
 *   `file://` script module, or a bare JS/TS module path), refused
 *   outright: the registry executes these outside the fetch layer, so
 *   neither the preflight nor redirect validation would see the network
 *   access they perform,
 * - a provider id carrying an unresolved template (`{{ ... }}`), refused
 *   outright: `loadApiProvider` renders env templates after this preflight
 *   runs, so the rendered id could be a script provider or a private URL
 *   this check never saw, and reproducing the loader's env merge here
 *   would risk a divergence the bypass could hide in,
 * - a string HttpProvider transform (`config.transformRequest`,
 *   `config.transformResponse`, `config.responseParser`), refused
 *   outright: the provider compiles the string with `new Function` and
 *   runs it before dispatch (request) or after fetch (response) with a
 *   process shim that exposes `require`, so a public URL must not mask
 *   code that can reach private services outside `fetchWithProxy`. A
 *   function value cannot arrive over a JSON route body and is left
 *   alone,
 * - a top-level string `transform` on the provider options, refused
 *   outright for the same reason: `loadApiProvider` attaches it to the
 *   loaded provider and the evaluator executes it with the process shim,
 *   so the nested config transforms above do not cover it,
 * - an MCP config embedded in another provider (`config.mcp`), refused
 *   or collected like a standalone MCP provider: the outer id is not
 *   `mcp:`, so the standalone check never runs, yet the provider still
 *   initializes the servers at load time (openai:chat from its
 *   constructor, Anthropic/Azure/Google via McpClientSession). Command
 *   and path transports are refused outright, remote server URLs are
 *   collected for validation, in both the MCPConfig (`server`/`servers`)
 *   and opencode-sdk record shapes,
 * - an HttpProvider session endpoint (`config.session.url`), collected
 *   for validation before the provider is constructed,
 * - a string HttpProvider `sessionParser` or `validateStatus`, or a
 *   string entry in `config.functionToolCallbacks`, refused outright
 *   like the transforms above: the provider compiles them with
 *   `new Function` (or loads a `file://` module) before or around the
 *   fetch, outside the fetch guard. A function value cannot arrive over
 *   a JSON route body and is left alone,
 * - a template (`{{ ... }}`) in the request line or headers of an
 *   HttpProvider raw `config.request`, refused outright: the provider
 *   renders the whole request with Nunjucks before parsing, so a
 *   template can become a second Host header that overwrites the
 *   preflighted one. Templates in the request body stay allowed: the
 *   body cannot change the dispatch target,
 * - a URL field that still carries a `{{ ... }}` template (`config.url`,
 *   `config.apiBaseUrl`, `config.session.url`, an MCP `server.url`, a
 *   raw-request Host header),
 *   refused outright by the URL validation below: providers render URL
 *   templates with call-time variables (e.g. the prompt), so the raw
 *   template can preflight as a public host while the rendered URL
 *   dispatches to a private address,
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
function collectHttpTargets(config: ProviderTarget['config'], urls: string[]): void {
  const auth = config?.auth as { type?: unknown; tokenUrl?: unknown } | undefined;
  if (auth?.type === 'file') {
    throw new PrivateRangeBlockedError(
      'PROMPTFOO_BLOCK_PRIVATE_RANGES is set: refusing file authentication outside the fetch guard',
    );
  }
  if (auth?.type === 'oauth' && typeof auth.tokenUrl === 'string') {
    urls.push(auth.tokenUrl);
  }
  const session = config?.session as { url?: unknown; responseParser?: unknown } | undefined;
  if (typeof session?.url === 'string' && session.url.length > 0) {
    urls.push(session.url);
  }
  // The HTTP provider compiles this expression. Guarded session endpoints
  // may select a property of the response but cannot invoke arbitrary code.
  if (
    typeof session?.responseParser === 'string' &&
    !/^data(?:\.[A-Za-z_$][\w$]*)+$/.test(session.responseParser.trim())
  ) {
    throw new PrivateRangeBlockedError(
      'PROMPTFOO_BLOCK_PRIVATE_RANGES is set: refusing an executable session endpoint response parser',
    );
  }
}

/**
 * Refuse string executable fields: the provider compiles them with
 * `new Function` (or loads a `file://` module) before or around the
 * fetch, outside the fetch guard. A function value cannot arrive over a
 * JSON route body and is left alone. Provider function callbacks are the
 * same class: OpenAiAssistantProvider preloads
 * config.functionToolCallbacks during construction, so an inline IIFE can
 * reach a private service with process.getBuiltinModule('http'). The
 * top-level `transform` is not a config field: `loadApiProvider`
 * attaches it to the loaded provider and the evaluator executes the
 * string with the `process.mainModule.require` shim, so the nested
 * config transforms do not cover it.
 */
function refuseExecutableFields(providerOptions: ProviderTarget): void {
  const config = providerOptions?.config;
  for (const key of ['transformRequest', 'transformResponse', 'responseParser'] as const) {
    const transform = config?.[key];
    if (typeof transform === 'string' && transform.length > 0) {
      throw new PrivateRangeBlockedError(
        `PROMPTFOO_BLOCK_PRIVATE_RANGES is set: refusing provider with a string ${key} transform that would execute outside the fetch guard`,
      );
    }
  }
  // HttpProvider compiles these the same way (new Function, with a file://
  // module load for file references), so they get the same refusal as the
  // transforms above: a string sessionParser or validateStatus runs before
  // or around the fetch, outside fetchWithProxy.
  for (const key of ['sessionParser', 'validateStatus'] as const) {
    const executable = config?.[key];
    if (typeof executable === 'string' && executable.length > 0) {
      throw new PrivateRangeBlockedError(
        `PROMPTFOO_BLOCK_PRIVATE_RANGES is set: refusing provider with a string ${key} that would execute outside the fetch guard`,
      );
    }
  }
  const functionToolCallbacks = config?.functionToolCallbacks;
  if (typeof functionToolCallbacks === 'object' && functionToolCallbacks !== null) {
    for (const callback of Object.values(functionToolCallbacks)) {
      if (typeof callback === 'string' && callback.length > 0) {
        throw new PrivateRangeBlockedError(
          'PROMPTFOO_BLOCK_PRIVATE_RANGES is set: refusing provider with a string functionToolCallbacks entry that would execute outside the fetch guard',
        );
      }
    }
  }
  const topLevelTransform = providerOptions?.transform;
  if (typeof topLevelTransform === 'string' && topLevelTransform.length > 0) {
    throw new PrivateRangeBlockedError(
      'PROMPTFOO_BLOCK_PRIVATE_RANGES is set: refusing provider with a top-level string transform that would execute outside the fetch guard',
    );
  }
}

export function getCallerSuppliedBaseUrls(providerOptions: ProviderTarget): string[] {
  const urls: string[] = [];
  const config = providerOptions?.config;
  for (const key of ['apiBaseUrl', 'url'] as const) {
    const configUrl = config?.[key];
    if (typeof configUrl === 'string' && configUrl.length > 0) {
      urls.push(configUrl);
    }
  }
  if (typeof providerOptions?.id === 'string' && /^https?(?:$|:)/.test(providerOptions.id)) {
    collectHttpTargets(config, urls);
  }
  const rawRequest = config?.request;
  if (typeof rawRequest === 'string' && rawRequest.length > 0) {
    urls.push(getRawRequestTarget(rawRequest, config?.useHttps === true));
  }
  refuseExecutableFields(providerOptions);
  const id = providerOptions?.id;
  if (typeof id !== 'string' || id.length === 0) {
    return urls;
  }
  if (id.includes('{{')) {
    throw new PrivateRangeBlockedError(
      'PROMPTFOO_BLOCK_PRIVATE_RANGES is set: refusing provider id with an unresolved template whose rendered target cannot be validated before loading',
    );
  }
  if (id.startsWith('file://') && (isProviderConfigFileReference(id) || id.includes('{{'))) {
    throw new PrivateRangeBlockedError(
      'PROMPTFOO_BLOCK_PRIVATE_RANGES is set: refusing file-backed provider reference whose expanded target cannot be validated before loading',
    );
  }
  if (id.startsWith(CLOUD_PROVIDER_PREFIX)) {
    throw new PrivateRangeBlockedError(
      'PROMPTFOO_BLOCK_PRIVATE_RANGES is set: refusing cloud provider reference whose saved target cannot be validated before loading',
    );
  }
  if (isScriptProviderId(id)) {
    throw new PrivateRangeBlockedError(
      'PROMPTFOO_BLOCK_PRIVATE_RANGES is set: refusing script provider reference whose code would execute outside the fetch guard',
    );
  }
  handleMcpProviderTargets(id, config, urls);
  handleEmbeddedMcpTargets(config, urls);
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
