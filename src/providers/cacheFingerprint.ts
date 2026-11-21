import { createHmac, randomBytes } from 'node:crypto';

import { isFipsEnabled } from '../util/fips';

let fipsCacheKey: Buffer | undefined;

/** Fingerprint sensitive cache identity without persisting the original value. */
export function fingerprintCacheIdentity(value: string, context: string): string {
  if (!isFipsEnabled()) {
    // Preserve existing cache namespaces outside FIPS mode.
    return createHmac('sha256', value).update(context).digest('hex');
  }

  // Configuration values (including empty headers and short profile names) are
  // data, not suitable HMAC keys. Keep the random key private to this process:
  // credential-scoped entries intentionally do not survive a process restart.
  fipsCacheKey ??= randomBytes(32);
  return createHmac('sha256', fipsCacheKey)
    .update(JSON.stringify([context, value]))
    .digest('hex');
}
