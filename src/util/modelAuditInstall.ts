import { getModelAuditCurrentVersion } from '../updates';

/**
 * Check if modelaudit is installed and get its version.
 *
 * Lives in the node layer (rather than the modelScan CLI command) so the
 * view-server route can detect modelaudit availability without importing the
 * cli layer.
 */
export async function checkModelAuditInstalled(): Promise<{
  installed: boolean;
  version: string | null;
}> {
  const version = await getModelAuditCurrentVersion();
  return { installed: version !== null, version };
}
