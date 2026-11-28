import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import type { LookupAddress } from 'node:dns';

import { Agent, type Dispatcher, interceptors, ProxyAgent } from 'undici';
import {
  createDecompressionInterceptor,
  stripDecompressionHeaders,
} from '../../util/fetch/decompress';
import { fetchWithProxy, getFetchTlsOptions, getProxyUrlForTarget } from '../../util/fetch/index';

const BLOCKED_IMAGE_HOSTNAMES = new Set(['localhost', 'metadata', 'metadata.google.internal']);

function normalizeExternalImageHostname(hostname: string): string {
  return hostname.replace(/^\[/, '').replace(/\]$/, '').replace(/\.$/, '').toLowerCase();
}

const blockedImageAddresses = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['192.88.99.0', 24],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
] as const) {
  blockedImageAddresses.addSubnet(address, prefix, 'ipv4');
  // Apply the same destination restrictions to NAT64 and 6to4 addresses.
  const octets = address.split('.').map(Number);
  const embedded = `${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  blockedImageAddresses.addSubnet(`64:ff9b::${embedded}`, 96 + prefix, 'ipv6');
  blockedImageAddresses.addSubnet(`2002:${embedded}::`, 16 + prefix, 'ipv6');
}
for (const [address, prefix] of [
  ['::', 96],
  ['::ffff:0:0:0', 96], // IPv4-translatable SIIT
  ['2001::', 32], // Teredo
  ['3fff::', 20],
  ['64:ff9b:1::', 48],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const) {
  blockedImageAddresses.addSubnet(address, prefix, 'ipv6');
}

function isPublicAddress({ address, family }: LookupAddress): boolean {
  if (!family || isIP(address) !== family) {
    return false;
  }
  // Node's BlockList treats mapped IPv6 as IPv4, so adding ::ffff:0:0/96 to
  // the shared list would accidentally deny every IPv4 address.
  if (family === 6 && new URL('https://[' + address + ']').hostname.startsWith('[::ffff:')) {
    return false;
  }
  return !blockedImageAddresses.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

async function validateExternalImageTarget(url: string, signal: AbortSignal) {
  const parsed = new URL(url);
  const hostname = normalizeExternalImageHostname(parsed.hostname);
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    BLOCKED_IMAGE_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.localhost')
  ) {
    return undefined;
  }
  const family = isIP(hostname);
  const addresses = family
    ? [{ address: hostname, family }]
    : await new Promise<LookupAddress[]>((resolve, reject) => {
        signal.throwIfAborted();
        const onAbort = () => reject(signal.reason);
        signal.addEventListener('abort', onAbort, { once: true });
        lookup(hostname, { all: true, verbatim: true })
          .then(resolve, reject)
          .finally(() => signal.removeEventListener('abort', onAbort));
      });
  return addresses.length && addresses.every(isPublicAddress) ? addresses : undefined;
}

async function createPinnedExternalImageDispatcher(
  url: string,
  resolvedAddresses: LookupAddress[],
  maxBytes: number,
): Promise<Dispatcher> {
  const tlsOptions = await getFetchTlsOptions();
  const proxyUrl = getProxyUrlForTarget(url);
  const hostname = normalizeExternalImageHostname(new URL(url).hostname);
  const requestTls = {
    ...tlsOptions,
    rejectUnauthorized: true,
    ...(isIP(hostname) ? {} : { servername: hostname }),
  };
  const agent = proxyUrl
    ? new ProxyAgent({ uri: proxyUrl, proxyTls: tlsOptions, requestTls })
    : new Agent({ connect: requestTls });
  const pinnedAgent = isIP(hostname)
    ? agent
    : agent.compose(
        interceptors.dns({
          // Pin the validated addresses while preserving the HTTP host and TLS server name.
          lookup: (_origin, _options, callback) => {
            callback(
              null,
              resolvedAddresses.map(({ address, family }) => ({
                address,
                family: family as 4 | 6,
                ttl: 60_000,
              })),
            );
          },
        }),
      );
  return pinnedAgent.compose(
    // DNS pinning rotates address families on another request. Retry route failures
    // that the DNS interceptor does not handle itself, using the same validated set.
    interceptors.retry({
      maxRetries: 1,
      minTimeout: 0,
      maxTimeout: 0,
      errorCodes: ['ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_CONNECT_TIMEOUT'],
      statusCodes: [],
    }),
    createDecompressionInterceptor(maxBytes),
    stripDecompressionHeaders(),
  );
}

function getDownloadedImageMimeType(buffer: Buffer): string | undefined {
  if (buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    return 'image/png';
  }
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return 'image/jpeg';
  }
  if (['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) {
    return 'image/gif';
  }
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buffer.length >= 16 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const boxEnd = Math.min(buffer.readUInt32BE(0), buffer.length);
    for (let offset = 8; offset + 4 <= boxEnd; offset += offset === 8 ? 8 : 4) {
      if (['avif', 'avis'].includes(buffer.subarray(offset, offset + 4).toString('ascii'))) {
        return 'image/avif';
      }
    }
  }
  return undefined;
}

export async function downloadExternalImage(
  url: string,
  abortSignal: AbortSignal,
  maxBytes: number,
): Promise<{ data: string; mimeType: string } | null> {
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, abortSignal]);
  let dispatcher: Dispatcher | undefined;
  try {
    signal.throwIfAborted();
    const validatedTarget = await validateExternalImageTarget(url, signal);
    if (!validatedTarget) {
      return null;
    }

    signal.throwIfAborted();
    dispatcher = await createPinnedExternalImageDispatcher(url, validatedTarget, maxBytes);
    signal.throwIfAborted();
    const downloadOptions = {
      redirect: 'error',
      signal,
      dispatcher,
      // Binary downloads must not be cloned for request logging or receive saved Cloud auth.
      headers: { 'x-promptfoo-silent': 'true' },
      skipCloudAuthInjection: true,
    } as const;
    const response = await fetchWithProxy(url, downloadOptions);
    if (!response.ok) {
      return null;
    }

    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      return null;
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          controller.abort();

          return null;
        }
        chunks.push(Buffer.from(value));
      }
    } else {
      const arrayBuffer = await response.arrayBuffer();
      totalBytes = arrayBuffer.byteLength;
      if (totalBytes > maxBytes) {
        controller.abort();

        return null;
      }
      chunks.push(Buffer.from(arrayBuffer));
    }

    const responseMimeType = response.headers
      .get('content-type')
      ?.split(';', 1)[0]
      ?.trim()
      .toLowerCase();
    const buffer = Buffer.concat(chunks, totalBytes);
    const mimeType = getDownloadedImageMimeType(buffer);
    const declaredMimeType = responseMimeType === 'image/jpg' ? 'image/jpeg' : responseMimeType;
    if (!mimeType || (declaredMimeType && declaredMimeType !== mimeType)) {
      return null;
    }
    return { data: `data:${mimeType};base64,${buffer.toString('base64')}`, mimeType };
  } catch {
    return null;
  } finally {
    controller.abort();
    await dispatcher?.destroy();
  }
}
