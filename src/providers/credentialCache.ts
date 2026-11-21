import { createHash, hkdfSync, randomBytes } from 'node:crypto';
import { statSync } from 'node:fs';

/** Partition by public identity selectors, including changes to selected credential files. */
export function getCredentialCacheNamespace(
  identity: readonly (string | undefined)[],
  files: readonly string[] = [],
): string {
  const revisions = files.map((file) => {
    try {
      const stat = statSync(file);
      return [file, stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs];
    } catch {
      // A missing credential file will fail authentication. Its later creation
      // must not reuse a result from a different file revision.
      return [file];
    }
  });
  return createHash('sha256')
    .update(JSON.stringify(['sdk-identity-v1', identity, revisions]))
    .digest('hex');
}

const processSalt = randomBytes(32);

/** Share opaque identities only within this process, without keeping raw credentials. */
export function getOpaqueCredentialCacheNamespace(token: string): string {
  const key = hkdfSync('sha256', token, processSalt, 'promptfoo:sdk-credential:v1', 32);
  return Buffer.from(key).toString('hex');
}
