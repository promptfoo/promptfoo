import { parseEnvBool } from '../../envars';

// This must be a process-level opt-in. getEnvBool also reads untrusted
// evaluation/config env overrides, which must never grant server permissions.
export function allowLocalCloudProxyRequests(): boolean {
  return parseEnvBool(process.env.PROMPTFOO_ALLOW_LOCAL_CLOUD_PROXY);
}

export const LOCAL_CLOUD_PROXY_DISABLED_MESSAGE =
  'Cloud-backed setup is disabled for local API requests. Restart the server with PROMPTFOO_ALLOW_LOCAL_CLOUD_PROXY=true only when you trust local callers and accept cloud quota usage.';
