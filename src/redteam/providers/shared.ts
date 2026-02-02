import { randomUUID } from 'crypto';

import { extractAndStoreBinaryData, isBlobStorageEnabled } from '../../blobs/extractor';
import { shouldAttemptRemoteBlobUpload } from '../../blobs/remoteUpload';
import cliState from '../../cliState';
import { getEnvBool } from '../../envars';
import logger from '../../logger';
import { OpenAiChatCompletionProvider } from '../../providers/openai/chat';
import { PromptfooChatCompletionProvider } from '../../providers/promptfoo';
import { type RateLimitRegistry, wrapProviderWithRateLimiting } from '../../scheduler';
import {
  type ApiProvider,
  type Assertion,
  type AssertionOrSet,
  type CallApiContextParams,
  type CallApiOptionsParams,
  type EvaluateResult,
  type GuardrailResponse,
  isApiProvider,
  isProviderOptions,
  type ProviderResponse,
  type RedteamFileConfig,
  type TokenUsage,
  type VarValue,
} from '../../types/index';
import invariant from '../../util/invariant';
import { safeJsonStringify } from '../../util/json';
import { sleep } from '../../util/time';
import { TokenUsageTracker } from '../../util/tokenUsage';
import { type TransformContext, TransformInputType, transform } from '../../util/transform';
import { ATTACKER_MODEL, ATTACKER_MODEL_SMALL, TEMPERATURE } from './constants';

import type { TraceContextData } from '../../tracing/traceContext';
import type { RedteamHistoryEntry } from '../types';

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
    logger.debug('Loading redteam provider', { provider: redteamProvider });
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
  private multilingualProvider: ApiProvider | undefined;
  private gradingProvider: ApiProvider | undefined;
  private gradingJsonOnlyProvider: ApiProvider | undefined;
  private rateLimitRegistry: RateLimitRegistry | undefined;

  /**
   * Set the rate limit registry to use for wrapping providers.
   * When set, all providers returned by this manager will be wrapped
   * with rate limiting.
   */
  setRateLimitRegistry(registry: RateLimitRegistry | undefined) {
    this.rateLimitRegistry = registry;
  }

  /**
   * Wrap a provider with rate limiting if a registry is configured.
   */
  private wrapProvider(provider: ApiProvider): ApiProvider {
    if (this.rateLimitRegistry) {
      return wrapProviderWithRateLimiting(provider, this.rateLimitRegistry);
    }
    return provider;
  }

  clearProvider() {
    this.provider = undefined;
    this.jsonOnlyProvider = undefined;
    this.multilingualProvider = undefined;
    this.gradingProvider = undefined;
    this.gradingJsonOnlyProvider = undefined;
    // Note: rateLimitRegistry is intentionally NOT cleared here
    // as it's managed by the evaluator lifecycle
  }

  async setProvider(provider: RedteamFileConfig['provider']) {
    this.provider = await loadRedteamProvider({ provider });
    this.jsonOnlyProvider = await loadRedteamProvider({ provider, jsonOnly: true });
  }

  async setMultilingualProvider(provider: RedteamFileConfig['provider']) {
    // For multilingual, prefer a provider configured for structured JSON output
    this.multilingualProvider = await loadRedteamProvider({ provider, jsonOnly: true });
  }

  async setGradingProvider(provider: RedteamFileConfig['provider']) {
    this.gradingProvider = await loadRedteamProvider({ provider });
    this.gradingJsonOnlyProvider = await loadRedteamProvider({ provider, jsonOnly: true });
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
      return this.wrapProvider(jsonOnly ? this.jsonOnlyProvider : this.provider);
    }

    // Check if we have an explicit provider argument or redteam.provider configured
    const hasExplicitProvider = provider || cliState.config?.redteam?.provider;

    // If no explicit redteam provider, try defaultTest config chain as fallback
    // This ensures users who configure defaultTest.options.provider get consistent behavior
    if (!hasExplicitProvider) {
      const defaultTestProvider =
        (typeof cliState.config?.defaultTest === 'object' &&
          (cliState.config?.defaultTest as any)?.provider) ||
        (typeof cliState.config?.defaultTest === 'object' &&
          (cliState.config?.defaultTest as any)?.options?.provider?.text) ||
        (typeof cliState.config?.defaultTest === 'object' &&
          (cliState.config?.defaultTest as any)?.options?.provider) ||
        undefined;

      if (defaultTestProvider) {
        logger.debug(
          '[RedteamProviderManager] Loading redteam provider from defaultTest fallback',
          {
            providedConfig:
              typeof defaultTestProvider === 'string'
                ? defaultTestProvider
                : (defaultTestProvider?.id ?? 'object'),
            jsonOnly,
            preferSmallModel,
          },
        );
        const redteamProvider = await loadRedteamProvider({
          provider: defaultTestProvider,
          jsonOnly,
          preferSmallModel,
        });
        logger.debug(
          `[RedteamProviderManager] Using redteam provider from defaultTest: ${redteamProvider.id()}`,
        );
        return redteamProvider;
      }
    }

    logger.debug('[RedteamProviderManager] Loading redteam provider', {
      providedConfig: typeof provider == 'string' ? provider : (provider?.id ?? 'none'),
      jsonOnly,
      preferSmallModel,
    });
    const redteamProvider = await loadRedteamProvider({ provider, jsonOnly, preferSmallModel });
    logger.debug(`[RedteamProviderManager] Loaded redteam provider: ${redteamProvider.id()}`);
    return this.wrapProvider(redteamProvider);
  }

  async getGradingProvider({
    provider,
    jsonOnly = false,
  }: {
    provider?: RedteamFileConfig['provider'];
    jsonOnly?: boolean;
  } = {}): Promise<ApiProvider> {
    // 1) Explicit provider argument
    if (provider) {
      const loaded = await loadRedteamProvider({ provider, jsonOnly });
      return this.wrapProvider(loaded);
    }

    // 2) Cached grading provider
    if (this.gradingProvider && this.gradingJsonOnlyProvider) {
      logger.debug(
        `[RedteamProviderManager] Using cached grading provider: ${this.gradingProvider.id()}`,
      );
      return this.wrapProvider(jsonOnly ? this.gradingJsonOnlyProvider : this.gradingProvider);
    }

    // 3) Try defaultTest config chain (grading-first)
    const cfg =
      (typeof cliState.config?.defaultTest === 'object' &&
        (cliState.config?.defaultTest as any)?.provider) ||
      (typeof cliState.config?.defaultTest === 'object' &&
        (cliState.config?.defaultTest as any)?.options?.provider?.text) ||
      (typeof cliState.config?.defaultTest === 'object' &&
        (cliState.config?.defaultTest as any)?.options?.provider) ||
      undefined;

    if (cfg) {
      const loaded = await loadRedteamProvider({ provider: cfg, jsonOnly });
      logger.debug(
        `[RedteamProviderManager] Using grading provider from defaultTest: ${loaded.id()}`,
      );
      return this.wrapProvider(loaded);
    }

    // 4) Fallback to redteam provider (already wraps)
    return this.getProvider({ jsonOnly });
  }

  async getMultilingualProvider(): Promise<ApiProvider | undefined> {
    if (this.multilingualProvider) {
      logger.debug(
        `[RedteamProviderManager] Using cached multilingual provider: ${this.multilingualProvider.id()}`,
      );
      return this.wrapProvider(this.multilingualProvider);
    }
    logger.debug('[RedteamProviderManager] No multilingual provider configured');
    return undefined;
  }
}

export const redteamProviderManager = new RedteamProviderManager();

export type TargetResponse = {
  traceContext?: TraceContextData | null;
  traceSummary?: string;
  image?: {
    data?: string;
    format?: string;
  };
} & Omit<ProviderResponse, 'output'> & { output: string };

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
    // Re-throw abort errors to properly cancel the operation
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }
    return { output: '', error: (error as Error).message, tokenUsage: { numRequests: 1 } };
  }
  if (!targetRespRaw.cached && targetProvider.delay && targetProvider.delay > 0) {
    logger.debug(`Sleeping for ${targetProvider.delay}ms`);
    await sleep(targetProvider.delay);
  }
  const tokenUsage = { numRequests: 1, ...targetRespRaw.tokenUsage };
  const hasOutput = targetRespRaw && Object.prototype.hasOwnProperty.call(targetRespRaw, 'output');
  const hasError = targetRespRaw && Object.prototype.hasOwnProperty.call(targetRespRaw, 'error');

  if (hasError) {
    const output = hasOutput
      ? ((typeof targetRespRaw.output === 'string'
          ? targetRespRaw.output
          : safeJsonStringify(targetRespRaw.output)) as string)
      : '';
    return {
      ...(targetRespRaw as ProviderResponse),
      output,
      error: targetRespRaw.error,
      tokenUsage,
    };
  }

  if (hasOutput) {
    const output = (
      typeof targetRespRaw.output === 'string'
        ? targetRespRaw.output
        : safeJsonStringify(targetRespRaw.output)
    ) as string;
    return {
      ...(targetRespRaw as ProviderResponse),
      output,
      tokenUsage,
    };
  }

  if (targetRespRaw?.error) {
    return {
      ...(targetRespRaw as ProviderResponse),
      output: '',
      error: targetRespRaw.error,
      tokenUsage,
    };
  }

  throw new Error(
    `
    Target returned malformed response: expected either \`output\` or \`error\` property to be set.

    Instead got: ${safeJsonStringify(targetRespRaw)}

    Note: Empty strings are valid output values.
    `,
  );
}

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'developer';
  content: string;
}

/**
 * Validates if a parsed JSON object is a valid chat message array
 */
export function isValidChatMessageArray(parsed: unknown): parsed is Message[] {
  return (
    Array.isArray(parsed) &&
    parsed.every(
      (msg) =>
        msg &&
        typeof msg === 'object' &&
        'role' in msg &&
        'content' in msg &&
        typeof msg.role === 'string' &&
        typeof msg.content === 'string' &&
        ['user', 'assistant', 'system', 'developer'].includes(msg.role),
    )
  );
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
  originalVars: Record<string, VarValue>;
  transformVarsConfig?: string;
  context?: CallApiContextParams;
  iterationNumber: number;
  loggerTag?: string;
}): Promise<CallApiContextParams | undefined> {
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
      logger.debug(`${loggerTag} Transformed vars for iteration ${iterationNumber}`, {
        transformedVars,
      });
    } catch (error) {
      logger.error(`${loggerTag} Error transforming vars`, { error });
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

  return iterationContext;
}

/**
 * Base metadata interface shared by all redteam providers
 */
export interface BaseRedteamMetadata {
  redteamFinalPrompt?: string;
  messages: Record<string, any>[];
  stopReason: string;
  redteamHistory?: RedteamHistoryEntry[];
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
 * Externalize large blob payloads in provider responses before they are copied into
 * redteam conversation/history (prevents meta prompts from exploding with base64).
 */
export async function externalizeResponseForRedteamHistory<T extends ProviderResponse>(
  response: T,
  context?: { evalId?: string; testIdx?: number; promptIdx?: number },
): Promise<T> {
  if (!isBlobStorageEnabled() && !shouldAttemptRemoteBlobUpload()) {
    return response;
  }
  const blobbed = await extractAndStoreBinaryData(response, context);
  return (blobbed as T) || response;
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

    // Unblocking is disabled by default, enable via environment variable
    if (!getEnvBool('PROMPTFOO_ENABLE_UNBLOCKING')) {
      logger.debug(
        '[Unblocking] Disabled by default (set PROMPTFOO_ENABLE_UNBLOCKING=true to enable)',
      );
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
      jsonOnly: true,
      preferSmallModel: false,
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
    logger.debug('[Unblocking] Unblocking analysis', { analysis: parsed });

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
    // Re-throw abort errors to properly cancel the operation
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }
    logger.error(`[Unblocking] Error in unblocking flow: ${error}`);
    return { success: false };
  }
}

/**
 * Builds the assertion object for storedGraderResult with the rubric value.
 * This ensures the grading template is preserved for display in the UI.
 */
export function buildGraderResultAssertion(
  gradeAssertion: Assertion | undefined,
  assertToUse: AssertionOrSet | undefined,
  rubric: string | undefined,
): Assertion | undefined {
  if (gradeAssertion) {
    return { ...gradeAssertion, value: rubric };
  }
  if (
    assertToUse &&
    'type' in assertToUse &&
    assertToUse.type !== 'assert-set' &&
    assertToUse.type !== 'and' &&
    assertToUse.type !== 'or'
  ) {
    return { ...(assertToUse as Assertion), value: rubric };
  }
  return undefined;
}
