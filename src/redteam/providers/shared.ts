import cliState from '../../cliState';
import logger from '../../logger';
import {
  isProviderOptions,
  isApiProvider,
  type RedteamFileConfig,
  type ApiProvider,
  type CallApiOptionsParams,
  type TokenUsage,
  type CallApiContextParams,
} from '../../types';
import { ATTACKER_MODEL, ATTACKER_MODEL_SMALL, TEMPERATURE } from './constants';

async function loadRedteamProvider({
  provider,
  jsonOnly = false,
  preferSmallModel = false,
}: {
  provider?: RedteamFileConfig['provider'];
  jsonOnly?: boolean;
  preferSmallModel?: boolean;
} = {}) {
  let ret;
  const redteamProvider = provider || cliState.config?.redteam?.provider;
  if (isApiProvider(redteamProvider)) {
    logger.debug(`Using redteam provider: ${redteamProvider}`);
    ret = redteamProvider;
  } else if (typeof redteamProvider === 'string' || isProviderOptions(redteamProvider)) {
    logger.debug(`Loading redteam provider: ${JSON.stringify(redteamProvider)}`);
    const loadApiProvidersModule = await import('../../providers');
    // Async import to avoid circular dependency
    ret = (await loadApiProvidersModule.loadApiProviders([redteamProvider]))[0];
  } else {
    const defaultModel = preferSmallModel ? ATTACKER_MODEL_SMALL : ATTACKER_MODEL;
    logger.debug(`Using default redteam provider: ${defaultModel}`);
    // Async import to avoid circular dependency
    const OpenAiChatCompletionProviderModule = await import('../../providers/openai');
    ret = new OpenAiChatCompletionProviderModule.OpenAiChatCompletionProvider(defaultModel, {
      config: {
        temperature: TEMPERATURE,
        response_format: jsonOnly ? { type: 'json_object' } : undefined,
      },
    });
  }
  return ret;
}

class RedteamProviderManager {
  private provider: ApiProvider | undefined;
  private jsonOnlyProvider: ApiProvider | undefined;

  clearProvider() {
    this.provider = undefined;
    this.jsonOnlyProvider = undefined;
  }

  async setProvider(provider: RedteamFileConfig['provider']) {
    this.provider = await loadRedteamProvider({ provider });
    this.jsonOnlyProvider = await loadRedteamProvider({ provider, jsonOnly: true });
  }

  async getProvider({
    provider,
    jsonOnly = false,
    preferSmallModel = false,
  }: {
    provider?: RedteamFileConfig['provider'];
    jsonOnly?: boolean;
    preferSmallModel?: boolean;
  }): Promise<ApiProvider> {
    if (this.provider && this.jsonOnlyProvider) {
      logger.debug(`[RedteamProviderManager] Using cached redteam provider: ${this.provider.id()}`);
      return jsonOnly ? this.jsonOnlyProvider : this.provider;
    }

    logger.debug(
      `[RedteamProviderManager] Loading redteam provider: ${JSON.stringify({
        providedConfig: typeof provider == 'string' ? provider : (provider?.id ?? 'none'),
        jsonOnly,
        preferSmallModel,
      })}`,
    );
    const redteamProvider = await loadRedteamProvider({ provider, jsonOnly, preferSmallModel });
    logger.debug(`[RedteamProviderManager] Loaded redteam provider: ${redteamProvider.id()}`);
    return redteamProvider;
  }
}

export const redteamProviderManager = new RedteamProviderManager();

export type TargetResponse = {
  output: string;
  error?: string;
  sessionId?: string;
  tokenUsage?: TokenUsage;
};

/**
 * Gets the response from the target provider for a given prompt.
 * @param targetProvider - The API provider to get the response from.
 * @param targetPrompt - The prompt to send to the target provider.
 * @returns A promise that resolves to the target provider's response as an object.
 */
export async function getTargetResponse(
  targetProvider: ApiProvider,
  targetPrompt: string,
  context?: CallApiContextParams,
  options?: CallApiOptionsParams,
): Promise<TargetResponse> {
  let targetRespRaw;

  try {
    targetRespRaw = await targetProvider.callApi(targetPrompt, context, options);
  } catch (error) {
    return { output: '', error: (error as Error).message, tokenUsage: { numRequests: 1 } };
  }

  if (targetRespRaw?.output) {
    return {
      output:
        typeof targetRespRaw.output === 'string'
          ? targetRespRaw.output
          : JSON.stringify(targetRespRaw.output),
      sessionId: targetRespRaw.sessionId,
      tokenUsage: targetRespRaw.tokenUsage || { numRequests: 1 },
    };
  }

  if (targetRespRaw?.error) {
    return {
      output: '',
      error: targetRespRaw.error,
      sessionId: targetRespRaw.sessionId,
      tokenUsage: { numRequests: 1 },
    };
  }

  throw new Error('Expected target output or error to be set');
}
