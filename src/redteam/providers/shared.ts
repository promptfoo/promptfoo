import { randomUUID } from 'crypto';

import cliState from '../../cliState';
import { getEnvBool } from '../../envars';
import logger from '../../logger';
import { PromptfooChatCompletionProvider } from '../../providers/promptfoo';
import {
  type ApiProvider,
  type CallApiContextParams,
  type CallApiOptionsParams,
  type EvaluateResult,
  type GuardrailResponse,
  isApiProvider,
  type RedteamFileConfig,
  type TokenUsage,
} from '../../types';
import invariant from '../../util/invariant';
import { safeJsonStringify } from '../../util/json';
import { sleep } from '../../util/time';
import { TokenUsageTracker } from '../../util/tokenUsage';
import { type TransformContext, TransformInputType, transform } from '../../util/transform';
import { getEnvFloat } from '../../envars';
import { OpenAiChatCompletionProvider } from '../../providers/openai/chat';

// Hardcoded fallback constants (inline to reduce dependencies)
const ATTACKER_MODEL = 'gpt-4.1-2025-04-14';
const ATTACKER_MODEL_SMALL = 'gpt-4o-mini';
const REDTEAM_TEMPERATURE = getEnvFloat('PROMPTFOO_JAILBREAK_TEMPERATURE') || 0.7;

/**
 * Gets a redteam provider optimized for adversarial input generation.
 * Uses the defaults system with automatic credential detection and fallbacks.
 *
 * @param options Configuration options
 * @param options.provider - Optional explicit provider override
 * @param options.enforceJson - Whether to enforce JSON output (default: true for redteam use)
 * @param options.preferSmall - Whether to prefer smaller/faster models for simple tasks
 * @returns Promise resolving to configured ApiProvider instance
 */
export async function getRedteamProvider({
  provider,
  enforceJson = true,
  preferSmall = false,
}: {
  provider?: RedteamFileConfig['provider'];
  enforceJson?: boolean;
  preferSmall?: boolean;
} = {}): Promise<ApiProvider> {
  let baseProvider: ApiProvider;

  // Check for explicit provider override (from config or parameter)
  const explicitProvider = provider || cliState.config?.redteam?.provider;

  if (explicitProvider) {
    if (isApiProvider(explicitProvider)) {
      logger.debug(`[RedteamProvider] Using explicit provider: ${explicitProvider.id()}`);
      baseProvider = explicitProvider;
    } else {
      logger.debug(
        `[RedteamProvider] Loading explicit provider: ${JSON.stringify(explicitProvider)}`,
      );
      const { loadApiProviders } = await import('../../providers');
      baseProvider = (await loadApiProviders([explicitProvider]))[0];
    }
  } else {
    // Use defaults system as primary source (handles all credential detection and fallbacks)
    try {
      const { getDefaultProviders } = await import('../../providers/defaults');
      const defaultProviders = await getDefaultProviders();
      if (defaultProviders.redteamProvider) {
        logger.debug(
          `[RedteamProvider] Using defaults provider: ${defaultProviders.redteamProvider.id()}`,
        );
        baseProvider = defaultProviders.redteamProvider;
      } else {
        throw new Error('No redteam provider available from defaults system');
      }
    } catch (error) {
      // Final fallback - prefer small model for efficiency
      const fallbackModel = preferSmall ? ATTACKER_MODEL_SMALL : ATTACKER_MODEL;
      logger.warn(
        `[RedteamProvider] Defaults system unavailable: ${(error as Error).message}. ` +
          `Using OpenAI fallback: ${fallbackModel}. Requires OPENAI_API_KEY.`,
      );
      baseProvider = new OpenAiChatCompletionProvider(fallbackModel, {
        config: { temperature: REDTEAM_TEMPERATURE },
      });
    }
  }

  // Apply redteam-specific configuration inline (no need for separate function)
  if (!baseProvider) {
    throw new Error('Provider cannot be null or undefined');
  }

  if (typeof baseProvider.id !== 'function') {
    throw new Error(
      `Invalid provider: missing id() method. Provider: ${JSON.stringify(baseProvider)}`,
    );
  }

  // Create adapted provider that inherits from original but allows config override
  const adaptedProvider = Object.create(baseProvider);
  Object.assign(adaptedProvider, baseProvider);

  // Set up config with redteam-specific values
  adaptedProvider.config = {
    ...(baseProvider.config && typeof baseProvider.config === 'object' ? baseProvider.config : {}),
  };

  // Apply redteam configuration - JSON by default for structured outputs
  if (enforceJson) {
    adaptedProvider.config.response_format = { type: 'json_object' };
  }

  // Apply temperature if not already set
  if (adaptedProvider.config.temperature === undefined) {
    adaptedProvider.config.temperature = REDTEAM_TEMPERATURE;
  }

  logger.debug(`[RedteamProvider] Loaded provider: ${adaptedProvider.id()}`);
  return adaptedProvider;
}

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
  const tokenUsage = { numRequests: 1, ...targetRespRaw.tokenUsage };
  if (targetRespRaw?.output) {
    const output = (
      typeof targetRespRaw.output === 'string'
        ? targetRespRaw.output
        : safeJsonStringify(targetRespRaw.output)
    ) as string;
    return {
      output,
      sessionId: targetRespRaw.sessionId,
      tokenUsage,
      guardrails: targetRespRaw.guardrails,
    };
  }

  if (targetRespRaw?.error) {
    return {
      output: '',
      error: targetRespRaw.error,
      sessionId: targetRespRaw.sessionId,
      tokenUsage,
      guardrails: targetRespRaw.guardrails,
    };
  }

  throw new Error(
    `
    Target returned malformed response: expected either \`output\` or \`error\` to be set.

    Instead got: ${safeJsonStringify(targetRespRaw)}
    `,
  );
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

/**
 * Creates an iteration-specific context with transformed variables for redteam iterations.
 * This utility function handles the common pattern of re-running transformVars for each
 * iteration to generate fresh values (e.g., new sessionId).
 *
 * @param originalVars - The original variables before transformation
 * @param transformVarsConfig - The transform configuration from the test
 * @param context - The original context that may be updated
 * @param iterationNumber - The current iteration number (for logging)
 * @param loggerTag - The logger tag to use for debug messages (e.g., '[Iterative]', '[IterativeTree]')
 * @returns An object containing the transformed vars and iteration-specific context
 */
export async function createIterationContext({
  originalVars,
  transformVarsConfig,
  context,
  iterationNumber,
  loggerTag = '[Redteam]',
}: {
  originalVars: Record<string, string | object>;
  transformVarsConfig?: string;
  context?: CallApiContextParams;
  iterationNumber: number;
  loggerTag?: string;
}): Promise<{
  iterationVars: Record<string, string | object>;
  iterationContext?: CallApiContextParams;
}> {
  let iterationVars = { ...originalVars };

  if (transformVarsConfig) {
    logger.debug(`${loggerTag} Re-running transformVars for iteration ${iterationNumber}`);
    const transformContext: TransformContext = {
      prompt: context?.prompt || {},
      uuid: randomUUID(), // Fresh UUID for each iteration
    };

    try {
      const transformedVars = await transform(
        transformVarsConfig,
        originalVars,
        transformContext,
        true,
        TransformInputType.VARS,
      );
      invariant(
        typeof transformedVars === 'object',
        'Transform function did not return a valid object',
      );
      iterationVars = { ...originalVars, ...transformedVars };
      logger.debug(
        `${loggerTag} Transformed vars for iteration ${iterationNumber}: ${safeJsonStringify(transformedVars)}`,
      );
    } catch (error) {
      logger.error(`${loggerTag} Error transforming vars: ${error}`);
      // Continue with original vars if transform fails
    }
  }

  // Create iteration-specific context with updated vars
  const iterationContext = context
    ? {
        ...context,
        vars: iterationVars,
      }
    : undefined;

  return { iterationVars, iterationContext };
}

/**
 * Base metadata interface shared by all redteam providers
 */
export interface BaseRedteamMetadata {
  redteamFinalPrompt?: string;
  messages: Record<string, any>[];
  stopReason: string;
  redteamHistory?: { prompt: string; output: string }[];
}

/**
 * Base response interface shared by all redteam providers
 */
export interface BaseRedteamResponse {
  output: string;
  metadata: BaseRedteamMetadata;
  tokenUsage: TokenUsage;
  guardrails?: GuardrailResponse;
  additionalResults?: EvaluateResult[];
}

/**
 * Shared unblocking functionality used by redteam providers to handle blocking questions
 */
export async function tryUnblocking({
  messages,
  lastResponse,
  goal,
  purpose,
}: {
  messages: Message[];
  lastResponse: string;
  goal: string | undefined;
  purpose?: string;
}): Promise<{
  success: boolean;
  unblockingPrompt?: string;
}> {
  try {
    // Check if the server supports unblocking feature
    const { checkServerFeatureSupport } = await import('../../util/server');
    const supportsUnblocking = await checkServerFeatureSupport(
      'blocking-question-analysis',
      '2025-06-16T14:49:11-07:00',
    );

    // Allow disabling unblocking via environment variable
    if (getEnvBool('PROMPTFOO_DISABLE_UNBLOCKING')) {
      logger.debug('[Unblocking] Disabled via PROMPTFOO_DISABLE_UNBLOCKING');
      // Return a response that will not increment numRequests
      return {
        success: false,
      };
    }

    if (!supportsUnblocking) {
      logger.debug('[Unblocking] Server does not support unblocking, skipping gracefully');
      return {
        success: false,
      };
    }

    logger.debug('[Unblocking] Attempting to unblock with blocking-question-analysis task');

    // Create unblocking provider
    const unblockingProvider = new PromptfooChatCompletionProvider({
      task: 'blocking-question-analysis',
      enforceJson: true,
      preferSmall: false,
    });

    const unblockingRequest = {
      conversationObjective: goal || '',
      recentHistory: messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      targetResponse: lastResponse,
      purpose: purpose || '',
    };

    const response = await unblockingProvider.callApi(JSON.stringify(unblockingRequest), {
      prompt: {
        raw: JSON.stringify(unblockingRequest),
        label: 'unblocking',
      },
      vars: {},
    });

    TokenUsageTracker.getInstance().trackUsage(unblockingProvider.id(), response.tokenUsage);

    if (response.error) {
      logger.error(`[Unblocking] Unblocking provider error: ${response.error}`);
      return { success: false };
    }

    const parsed = response.output as any;
    logger.debug(`[Unblocking] Unblocking analysis: ${JSON.stringify(parsed)}`);

    if (parsed.isBlocking && parsed.unblockingAnswer) {
      logger.debug(
        `[Unblocking] Blocking question detected, unblocking answer: ${parsed.unblockingAnswer}`,
      );
      return {
        success: true,
        unblockingPrompt: parsed.unblockingAnswer,
      };
    } else {
      logger.debug('[Unblocking] No blocking question detected');
      return {
        success: false,
      };
    }
  } catch (error) {
    logger.error(`[Unblocking] Error in unblocking flow: ${error}`);
    return { success: false };
  }
}
