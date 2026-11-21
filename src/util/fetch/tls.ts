import { constants } from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import path from 'node:path';
import type { ConnectionOptions } from 'node:tls';

import { Agent, type Dispatcher } from 'undici';
import cliState from '../../cliState';
import { getEnvBool, getEnvString } from '../../envars';
import logger from '../../logger';
import { waitForPromiseWithAbort } from '../../providers/shared';
import { isFipsEnabled } from '../fips';
import { createDecompressionInterceptor, stripDecompressionHeaders } from './decompress';

const verifiedFipsDispatchers = new WeakSet<Pick<Dispatcher, 'dispatch'>>();

export function assertFipsTlsVerification(rejectUnauthorized?: boolean): void {
  if (!isFipsEnabled()) {
    return;
  }
  if (
    rejectUnauthorized === false ||
    getEnvBool('PROMPTFOO_INSECURE_SSL', false) ||
    getEnvString('NODE_TLS_REJECT_UNAUTHORIZED') === '0' ||
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0'
  ) {
    throw new Error(
      'FIPS mode requires TLS certificate verification. Remove insecure TLS overrides and configure a trusted CA certificate instead.',
    );
  }
}

/** Build the HTTP provider's TLS dispatcher after validating its settings. */
export function createTlsAgent(tlsOptions: ConnectionOptions): Dispatcher {
  assertFipsTlsVerification(tlsOptions.rejectUnauthorized);
  const dispatcher = new Agent({ connect: tlsOptions })
    .compose(createDecompressionInterceptor())
    .compose(stripDecompressionHeaders());
  if (isFipsEnabled()) {
    verifiedFipsDispatchers.add(dispatcher);
  }
  return dispatcher;
}

/** Opaque dispatchers cannot be inspected reliably for their TLS policy. */
export function assertFipsDispatcher(dispatcher?: Pick<Dispatcher, 'dispatch'>): void {
  if (isFipsEnabled() && dispatcher && !verifiedFipsDispatchers.has(dispatcher)) {
    throw new Error(
      'FIPS mode requires a Promptfoo-managed HTTP dispatcher. Use the HTTP provider tls configuration for PEM cert/key and CA settings.',
    );
  }
}

/** Bound preflight reads as well as reads made under the transport's existing deadline. */
export async function readFipsCaCertificate(
  filename: string,
  caller?: AbortSignal | null,
  timeoutMs?: number,
): Promise<string> {
  const deadline = new AbortController();
  const signal = caller ? AbortSignal.any([caller, deadline.signal]) : deadline.signal;
  const timer =
    timeoutMs === undefined
      ? undefined
      : setTimeout(
          () => deadline.abort(new Error(`Request timed out after ${timeoutMs} ms`)),
          timeoutMs,
        );
  try {
    signal.throwIfAborted();
    // Nonblocking open also prevents a FIFO with no writer from stranding an fs worker.
    const ca = await waitForPromiseWithAbort(
      fsPromises.readFile(filename, {
        encoding: 'utf8',
        flag: constants.O_RDONLY | constants.O_NONBLOCK,
        signal,
      }),
      signal,
    );
    if (!ca.trim()) {
      throw new Error('Empty CA certificate');
    }
    return ca;
  } catch (error) {
    signal.throwIfAborted();
    throw new Error('Failed to read the configured CA certificate in FIPS mode', { cause: error });
  } finally {
    clearTimeout(timer);
  }
}

export function resolveTlsOptions(
  logEnabled = true,
  signal?: AbortSignal | null,
  timeoutMs?: number,
): ConnectionOptions | Promise<ConnectionOptions> {
  assertFipsTlsVerification();
  const fips = isFipsEnabled();
  const tlsOptions: ConnectionOptions = {
    rejectUnauthorized: !getEnvBool('PROMPTFOO_INSECURE_SSL', !fips),
  };
  const caCertPath = getEnvString('PROMPTFOO_CA_CERT_PATH');
  if (!caCertPath) {
    return tlsOptions;
  }
  return (async () => {
    const resolvedPath = path.resolve(cliState.basePath || '', caCertPath);
    try {
      tlsOptions.ca = fips
        ? await readFipsCaCertificate(resolvedPath, signal, timeoutMs)
        : await fsPromises.readFile(resolvedPath, 'utf8');
      if (logEnabled) {
        logger.debug(`Using custom CA certificate from ${resolvedPath}`);
      }
    } catch (error) {
      if (fips) {
        throw error;
      }
      if (logEnabled) {
        logger.warn(`Failed to read CA certificate from ${caCertPath}: ${error}`);
      }
    }
    return tlsOptions;
  })();
}
