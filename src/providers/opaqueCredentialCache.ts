import { hkdfSync, randomBytes } from 'node:crypto';

import { LRUCache } from 'lru-cache';

const processSalt = randomBytes(32);
const namespaces = new LRUCache<string, string>({
  max: 256,
  memoMethod: () => randomBytes(32).toString('hex'),
});

/** Match credentials only in memory. Persist only an independently generated random ID. */
export function getOpaqueCredentialCacheNamespace(identity: string): string {
  const lookup = hkdfSync('sha256', identity, processSalt, 'promptfoo:sdk-credential:v1', 32);
  return namespaces.memo(Buffer.from(lookup).toString('hex'));
}
