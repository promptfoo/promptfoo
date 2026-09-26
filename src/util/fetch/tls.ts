import * as fsPromises from 'node:fs/promises';
import path from 'node:path';
import type { ConnectionOptions } from 'node:tls';

import { Agent, type Dispatcher, interceptors } from 'undici';
import cliState from '../../cliState';
import { getEnvBool, getEnvString } from '../../envars';
import logger from '../../logger';
import { isFipsEnabled } from '../fips';
import { stripDecompressionHeaders } from './stripDecompressionHeaders';

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
    .compose(interceptors.decompress({ skipErrorResponses: false }))
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

export function resolveTlsOptions(): ConnectionOptions | Promise<ConnectionOptions> {
  assertFipsTlsVerification();
  const tlsOptions: ConnectionOptions = {
    rejectUnauthorized: !getEnvBool('PROMPTFOO_INSECURE_SSL', !isFipsEnabled()),
  };
  const caCertPath = getEnvString('PROMPTFOO_CA_CERT_PATH');
  if (!caCertPath) {
    return tlsOptions;
  }
  return (async () => {
    try {
      const resolvedPath = path.resolve(cliState.basePath || '', caCertPath);
      tlsOptions.ca = await fsPromises.readFile(resolvedPath, 'utf8');
      logger.debug(`Using custom CA certificate from ${resolvedPath}`);
    } catch (error) {
      if (isFipsEnabled()) {
        throw Object.assign(
          new Error('Failed to read the configured CA certificate in FIPS mode'),
          { cause: error },
        );
      }
      logger.warn(`Failed to read CA certificate from ${caCertPath}: ${error}`);
    }
    return tlsOptions;
  })();
}
