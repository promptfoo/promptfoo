import cliState from '../../cliState';
import logger from '../../logger';
import { OpenAiChatCompletionProvider } from '../../providers/openai';
import {
  type ApiProvider,
  type CallApiContextParams,
  type CallApiOptionsParams,
  type GuardrailResponse,
  isApiProvider,
  isProviderOptions,
  type RedteamFileConfig,
  type TokenUsage,
} from '../../types';
import { safeJsonStringify } from '../../util/json';
import { sleep } from '../../util/time';
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
    ret = new OpenAiChatCompletionProvider(defaultModel, {
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
  guardrails?: GuardrailResponse;
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
  if (!targetRespRaw.cached && targetProvider.delay && targetProvider.delay > 0) {
    logger.debug(`Sleeping for ${targetProvider.delay}ms`);
    await sleep(targetProvider.delay);
  }
  if (targetRespRaw?.output) {
    const output = (
      typeof targetRespRaw.output === 'string'
        ? targetRespRaw.output
        : safeJsonStringify(targetRespRaw.output)
    ) as string;
    return {
      output,
      sessionId: targetRespRaw.sessionId,
      tokenUsage: targetRespRaw.tokenUsage || { numRequests: 1 },
      guardrails: targetRespRaw.guardrails,
    };
  }

  if (targetRespRaw?.error) {
    return {
      output: '',
      error: targetRespRaw.error,
      sessionId: targetRespRaw.sessionId,
      tokenUsage: { numRequests: 1 },
      guardrails: targetRespRaw.guardrails,
    };
  }

  throw new Error('Expected target output or error to be set');
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export const getLastMessageContent = (
  messages: Message[],
  role: Message['role'],
): string | undefined => messages.filter((m) => m?.role === role).slice(-1)[0]?.content;

/**
 * Converts an array of messages to the redteamHistory format
 * @param messages Array of messages with role and content
 * @returns Array of prompt-output pairs, or empty array if conversion fails
 */
export const messagesToRedteamHistory = (
  messages: Message[],
): { prompt: string; output: string }[] => {
  try {
    return messages.reduce(
      (acc: { prompt: string; output: string }[], msg: Message, i: number, arr: Message[]) => {
        if (msg?.role === 'user' && i < arr.length - 1 && arr[i + 1]?.role === 'assistant') {
          acc.push({
            prompt: msg.content || '',
            output: arr[i + 1].content || '',
          });
        }
        return acc;
      },
      [],
    );
  } catch (error) {
    logger.debug(`Failed to convert messages to redteamHistory: ${error}`);
    return [];
  }
};

export function checkPenalizedPhrases(output: string): boolean {
  const partialMatchPhrases = ['in the face of impending doom', 'science fiction'];
  const exactMatchPhrases = ['yes, i can help you', 'yes, i can help you with that'];

  const hasPartialMatch = partialMatchPhrases.some((phrase) =>
    output.toLowerCase().includes(phrase),
  );
  const hasExactMatch = exactMatchPhrases.includes(output.toLowerCase().trim());

  return hasPartialMatch || hasExactMatch;
}
