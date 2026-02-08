import { OpenClawAgentProvider } from './agent';
import { OpenClawChatProvider } from './chat';
import { OpenClawResponsesProvider } from './responses';
import { OpenClawToolInvokeProvider } from './tools';

import type { EnvOverrides } from '../../types/env';
import type { ApiProvider, ProviderOptions } from '../../types/providers';

export { OpenClawAgentProvider } from './agent';
export { OpenClawChatProvider } from './chat';
export { OpenClawResponsesProvider } from './responses';
export {
  readOpenClawConfig,
  resetConfigCache,
  resolveAuthToken,
  resolveGatewayUrl,
} from './shared';
export { OpenClawToolInvokeProvider } from './tools';

/**
 * Create an OpenClaw provider from a provider path string.
 *
 * Routing:
 *   openclaw                → OpenClawChatProvider('main')
 *   openclaw:main           → OpenClawChatProvider('main')
 *   openclaw:my-agent       → OpenClawChatProvider('my-agent')
 *   openclaw:responses      → OpenClawResponsesProvider('main')
 *   openclaw:responses:X    → OpenClawResponsesProvider('X')
 *   openclaw:agent          → OpenClawAgentProvider('main')
 *   openclaw:agent:X        → OpenClawAgentProvider('X')
 *   openclaw:tools:bash     → OpenClawToolInvokeProvider('bash')
 */
export function createOpenClawProvider(
  providerPath: string,
  providerOptions: ProviderOptions = {},
  env?: EnvOverrides,
): ApiProvider {
  const splits = providerPath.split(':');
  const keyword = splits[1];
  const opts = { ...providerOptions, env };

  if (keyword === 'responses') {
    const agentId = splits[2] || 'main';
    return new OpenClawResponsesProvider(agentId, opts);
  }

  if (keyword === 'agent') {
    const agentId = splits[2] || 'main';
    return new OpenClawAgentProvider(agentId, opts);
  }

  if (keyword === 'tools') {
    const toolName = splits.slice(2).join(':');
    if (!toolName) {
      throw new Error('OpenClaw tools provider requires a tool name: openclaw:tools:<tool-name>');
    }
    return new OpenClawToolInvokeProvider(toolName, opts);
  }

  // Default: chat provider
  const agentId = splits.length > 1 ? splits.slice(1).join(':') : 'main';
  return new OpenClawChatProvider(agentId, opts);
}
