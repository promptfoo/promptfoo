/**
 * LiveKit provider for promptfoo
 *
 * This provider integrates with LiveKit agents to enable testing of
 * real-time AI applications with multi-modal capabilities.
 *
 * Usage:
 * providers:
 *   - id: livekit:agent:path/to/agent.js
 *     config:
 *       url: ws://localhost:7880
 *       apiKey: your_api_key
 *       apiSecret: your_api_secret
 */

import { LiveKitProvider } from './livekit/index';
import type { ProviderOptions } from '../types/providers';

export { LiveKitProvider } from './livekit/index';
export type { LiveKitConfig, LiveKitAgent, AgentResponse } from './livekit/types';

/**
 * Factory function to create LiveKit provider instances
 */
export function createLivekitProvider(
  providerPath: string,
  options: { config?: ProviderOptions; env?: any; basePath?: string } = {}
): LiveKitProvider {
  const { config = {}, env, basePath } = options;

  // Parse provider path to extract agent path
  // Expected format: livekit:agent:path/to/agent.js
  const pathParts = providerPath.split(':');
  let agentPath = '';

  if (pathParts.length >= 3 && pathParts[1] === 'agent') {
    // Format: livekit:agent:path/to/agent.js
    agentPath = pathParts.slice(2).join(':');
  } else if (pathParts.length >= 2) {
    // Format: livekit:path/to/agent.js
    agentPath = pathParts.slice(1).join(':');
  } else {
    throw new Error(`Invalid LiveKit provider path: ${providerPath}. Expected format: livekit:agent:path/to/agent.js`);
  }

  // If agentPath is relative and we have a basePath, resolve it
  if (basePath && !agentPath.startsWith('/') && !agentPath.startsWith(basePath)) {
    agentPath = `${basePath}/${agentPath}`;
  }

  return new LiveKitProvider(agentPath, {
    ...config,
    env,
  });
}