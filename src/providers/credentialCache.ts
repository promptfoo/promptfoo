import { createHash, randomUUID } from 'node:crypto';
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

const opaqueNamespaces = new Map<string, string>();
/** Opaque tokens without a public identity can only share a cache within this process. */
export function getOpaqueCredentialCacheNamespace(token: string): string {
  let namespace = opaqueNamespaces.get(token);
  if (namespace === undefined) {
    namespace = randomUUID();
    if (opaqueNamespaces.size >= 256) {
      opaqueNamespaces.delete(opaqueNamespaces.keys().next().value!);
    }
    opaqueNamespaces.set(token, namespace);
  }
  return namespace;
}
