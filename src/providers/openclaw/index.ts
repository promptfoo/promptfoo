import { OpenClawAgentProvider } from './agent';
import { OpenClawChatProvider } from './chat';
import { OpenClawEmbeddingProvider } from './embedding';
import { OpenClawResponsesProvider } from './responses';
import { OpenClawToolInvokeProvider } from './tools';

import type { EnvOverrides } from '../../types/env';
import type { ApiProvider, ProviderOptions } from '../../types/providers';

export { OpenClawAgentProvider } from './agent';
export { OpenClawChatProvider } from './chat';
export { OpenClawEmbeddingProvider } from './embedding';
export { OpenClawResponsesProvider } from './responses';
export {
  buildOpenClawModelName,
  readOpenClawConfig,
  resetConfigCache,
  resolveAuthSecret,
  resolveAuthToken,
  resolveGatewayUrl,
  resolveGatewayWsUrl,
} from './shared';
export { OpenClawToolInvokeProvider } from './tools';

/**
 * Create an OpenClaw provider from a provider path string.
 *
 * Routing:
 *   openclaw                → OpenClawChatProvider(default agent)
 *   openclaw:main           → OpenClawChatProvider('main')
 *   openclaw:my-agent       → OpenClawChatProvider('my-agent')
 *   openclaw:responses      → OpenClawResponsesProvider(default agent)
 *   openclaw:responses:X    → OpenClawResponsesProvider('X')
 *   openclaw:embedding      → OpenClawEmbeddingProvider(default agent)
 *   openclaw:embedding:X    → OpenClawEmbeddingProvider('X')
 *   openclaw:embeddings     → OpenClawEmbeddingProvider(default agent)
 *   openclaw:embeddings:X   → OpenClawEmbeddingProvider('X')
 *   openclaw:agent          → OpenClawAgentProvider(default agent)
 *   openclaw:agent:X        → OpenClawAgentProvider('X')
 *   openclaw:tools:sessions_list → OpenClawToolInvokeProvider('sessions_list')
 */
export function createOpenClawProvider(
  providerPath: string,
  providerOptions: ProviderOptions = {},
  env?: EnvOverrides,
): ApiProvider {
  const splits = providerPath.split(':');
  const keyword = splits[1];
  // Agent IDs and tool names may themselves contain colons.
  const target = splits.slice(2).join(':') || undefined;
  const opts = { ...providerOptions, env };

  if (keyword === 'responses') {
    return new OpenClawResponsesProvider(target, opts);
  }

  if (keyword === 'embedding' || keyword === 'embeddings') {
    return new OpenClawEmbeddingProvider(target, opts);
  }

  if (keyword === 'agent') {
    return new OpenClawAgentProvider(target, opts);
  }

  if (keyword === 'tools') {
    if (!target) {
      throw new Error('OpenClaw tools provider requires a tool name: openclaw:tools:<tool-name>');
    }
    return new OpenClawToolInvokeProvider(target, opts);
  }

  // Default: chat provider
  const agentId = splits.length > 1 ? splits.slice(1).join(':') || undefined : undefined;
  return new OpenClawChatProvider(agentId, opts);
}
