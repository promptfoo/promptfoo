import dedent from 'dedent';
import { VERSION } from '../constants';
import { getUserEmail } from '../globalConfig/accounts';
import logger from '../logger';
import {
  getRemoteGenerationHeaders,
  getRemoteGenerationUrl,
  getRemoteGenerationUrlForUnaligned,
  neverGenerateRemote,
  neverGenerateRemoteForRegularEvals,
  providerRemoteGenerationContextPayload,
} from '../redteam/remoteGeneration';
import { getRemoteMaterializationContextFromVars } from '../redteam/remoteMaterialization';
import { BaseTokenUsageSchema } from '../types/shared';
import { HttpRateLimitError } from '../util/fetch/errors';
import { fetchWithRetries } from '../util/fetch/index';
import { getRequestTimeoutMs } from './shared';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  EnvOverrides,
  Inputs,
  PluginConfig,
  ProviderResponse,
  RemoteGenerationContext,
  TokenUsage,
} from '../types/index';

interface PromptfooHarmfulCompletionOptions {
  harmCategory: string;
  n: number;
  purpose: string;
  config?: PluginConfig;
  targetId?: string;
  redteamGenerationContext?: RemoteGenerationContext;
}

function getHarmfulGenerationLogMetadata(body: {
  config?: PluginConfig;
  email?: string | null;
  harmCategory: string;
  n: number;
  purpose: string;
  version: string;
}) {
  const remoteGenerationUrl = getRemoteGenerationUrlForUnaligned();

  return {
    ...getRemoteGenerationUrlLogMetadata(remoteGenerationUrl),
    harmCategory: body.harmCategory,
    n: body.n,
    purposeLength: body.purpose.length,
    hasEmail: Boolean(body.email),
    version: body.version,
    hasConfig: Boolean(body.config),
    configKeyCount: body.config ? Object.keys(body.config).length : 0,
  };
}

function getRemoteGenerationUrlLogMetadata(remoteGenerationUrl: string) {
  try {
    const url = new URL(remoteGenerationUrl);
    return {
      remoteGenerationProtocol: url.protocol.replace(':', ''),
      remoteGenerationHost: url.host,
      remoteGenerationPathLength: url.pathname.length,
      hasRemoteGenerationQuery: Boolean(url.search),
    };
  } catch {
    return {
      remoteGenerationUrlConfigured: Boolean(remoteGenerationUrl),
      remoteGenerationUrlParseError: true,
    };
  }
}

function getErrorMetadata(err: unknown) {
  return {
    errorType: err instanceof Error ? err.constructor.name : typeof err,
  };
}

/**
 * Provider for generating harmful/adversarial content using Promptfoo's unaligned models.
 * Used by red team plugins to generate test cases for harmful content categories.
 */
export class PromptfooHarmfulCompletionProvider implements ApiProvider {
  harmCategory: string;
  n: number;
  purpose: string;
  config?: PluginConfig;
  targetId?: string;
  redteamGenerationContext?: RemoteGenerationContext;

  constructor(options: PromptfooHarmfulCompletionOptions) {
    this.harmCategory = options.harmCategory;
    this.n = options.n;
    this.purpose = options.purpose;
    this.config = options.config;
    this.targetId = options.targetId;
    this.redteamGenerationContext =
      options.redteamGenerationContext ??
      (options.targetId ? { providerTargetIds: [], cloudTargetId: options.targetId } : undefined);
  }

  id(): string {
    return `promptfoo:redteam:${this.harmCategory}`;
  }

  toString(): string {
    return `[Promptfoo Harmful Completion Provider ${this.purpose} - ${this.harmCategory}]`;
  }

  async callApi(
    _prompt: string,
    _context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse & { output?: string[] }> {
    // Check if remote generation is disabled
    if (neverGenerateRemote()) {
      return {
        error: dedent`
          Remote generation is disabled. Harmful content generation requires Promptfoo's unaligned models.

          To enable:
          - Remove PROMPTFOO_DISABLE_REMOTE_GENERATION (or PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION)
          - Or configure an alternative unaligned model provider

          Learn more: https://www.promptfoo.dev/docs/red-team/configuration#remote-generation
        `,
      };
    }

    const body = {
      email: getUserEmail(),
      harmCategory: this.harmCategory,
      n: this.n,
      purpose: this.purpose,
      version: VERSION,
      config: this.config,
      ...providerRemoteGenerationContextPayload(this.redteamGenerationContext ?? this.targetId),
    };

    try {
      logger.debug(
        '[HarmfulCompletionProvider] Calling generate harmful API',
        getHarmfulGenerationLogMetadata(body),
      );
      // We're using the promptfoo API to avoid having users provide their own unaligned model.
      const response = await fetchWithRetries(
        getRemoteGenerationUrlForUnaligned(),
        {
          method: 'POST',
          headers: { ...getRemoteGenerationHeaders(), 'x-promptfoo-silent': 'true' },
          body: JSON.stringify(body),
          ...(callApiOptions?.abortSignal && { signal: callApiOptions.abortSignal }),
        },
        580000,
        2,
      );

      if (!response.ok) {
        const responseBody = await response.text();
        logger.info('[HarmfulCompletionProvider] Generate harmful API failed', {
          status: response.status,
          statusTextLength: response.statusText.length,
          responseBodyLength: responseBody.length,
        });
        let tokenUsage: TokenUsage | undefined;
        try {
          const parsed = BaseTokenUsageSchema.safeParse(JSON.parse(responseBody)?.tokenUsage);
          if (parsed.success) {
            tokenUsage = parsed.data;
          }
        } catch {
          // Non-JSON responses do not carry structured token usage.
        }
        return {
          error: `[HarmfulCompletionProvider] API call failed with status ${response.status}`,
          ...(tokenUsage ? { tokenUsage } : {}),
        };
      }

      const data = await response.json();

      const validOutputs: string[] = (
        Array.isArray(data.output) ? data.output : [data.output]
      ).filter(
        (item: string | null | undefined): item is string =>
          typeof item === 'string' && item.length > 0,
      );

      return {
        output: validOutputs,
        ...(data.tokenUsage ? { tokenUsage: data.tokenUsage as TokenUsage } : {}),
      };
    } catch (err) {
      // Re-throw abort errors to properly cancel the operation
      if (err instanceof Error && err.name === 'AbortError') {
        throw err;
      }
      logger.info(
        '[HarmfulCompletionProvider] Error generating harmful content',
        getErrorMetadata(err),
      );
      const parsedTokenUsage =
        err && typeof err === 'object' && 'tokenUsage' in err
          ? BaseTokenUsageSchema.safeParse(err.tokenUsage)
          : undefined;
      const tokenUsage = parsedTokenUsage?.success ? parsedTokenUsage.data : undefined;
      return {
        error: '[HarmfulCompletionProvider] Error generating harmful content',
        ...(tokenUsage ? { tokenUsage } : {}),
      };
    }
  }
}

interface PromptfooChatCompletionOptions {
  env?: EnvOverrides;
  id?: string;
  jsonOnly: boolean;
  preferSmallModel: boolean;
  /** Cloud target database ID used to resolve the owning team for remote tasks. */
  targetId?: string;
  redteamGenerationContext?: RemoteGenerationContext;
  task:
    | 'crescendo'
    | 'goat'
    | 'iterative'
    | 'iterative:image'
    | 'iterative:tree'
    | 'judge'
    | 'blocking-question-analysis'
    | 'meta-agent-decision'
    | 'hydra-decision'
    | 'goblin-decision'
    | 'voice-crescendo'
    | 'voice-crescendo-eval';
  /**
   * Multi-input schema for generating multiple vars at each turn.
   */
  inputs?: Inputs;
}

/**
 * Provider for red team adversarial strategies using Promptfoo's task-specific models.
 * Supports multi-turn attack strategies like crescendo, goat, and iterative attacks.
 */
export class PromptfooChatCompletionProvider implements ApiProvider {
  private options: PromptfooChatCompletionOptions;

  constructor(options: PromptfooChatCompletionOptions) {
    this.options = options;
  }

  id(): string {
    return this.options.id || 'promptfoo:chatcompletion';
  }

  toString(): string {
    return `[Promptfoo Chat Completion Provider]`;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // Check if remote generation is disabled
    if (neverGenerateRemote()) {
      return {
        error: dedent`
          Remote generation is disabled. This red team strategy requires Promptfoo's task-specific models.

          To enable:
          - Remove PROMPTFOO_DISABLE_REMOTE_GENERATION (or PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION)
          - Or provide OPENAI_API_KEY for local generation (may have lower quality)

          Learn more: https://www.promptfoo.dev/docs/red-team/configuration#remote-generation
        `,
      };
    }

    const materializationContext = getRemoteMaterializationContextFromVars(context?.vars);
    const body = {
      jsonOnly: this.options.jsonOnly,
      preferSmallModel: this.options.preferSmallModel,
      prompt,
      step: context?.prompt.label,
      task: this.options.task,
      email: getUserEmail(),
      ...providerRemoteGenerationContextPayload(
        this.options.redteamGenerationContext ?? this.options.targetId,
      ),
      // Pass inputs schema for multi-input mode
      ...(this.options.inputs && { inputs: this.options.inputs }),
      ...(materializationContext ? { materializationContext } : {}),
    };

    try {
      const response = await fetchWithRetries(
        getRemoteGenerationUrl(),
        {
          method: 'POST',
          headers: getRemoteGenerationHeaders(),
          body: JSON.stringify(body),
          ...(callApiOptions?.abortSignal && { signal: callApiOptions.abortSignal }),
        },
        getRequestTimeoutMs(),
      );

      const data = await response.json();

      // Only Cloud's explicit upstream request classification can stop Meta iterations.
      // Missing results and unstructured error text may be refusals or transient failures.
      if (
        this.options.task === 'meta-agent-decision' &&
        response.status === 400 &&
        data.providerError?.status === 400 &&
        data.providerError?.type === 'invalid_request_error' &&
        data.providerError?.code === 'invalid_json'
      ) {
        return {
          error:
            'Meta-agent request failed: the upstream provider rejected the coordination request as invalid JSON (invalid_json).',
          metadata: {
            remoteGenerationError: {
              status: 400,
              type: 'invalid_request_error',
              code: 'invalid_json',
            },
          },
          ...(data.tokenUsage ? { tokenUsage: data.tokenUsage } : {}),
        };
      }

      // Remote provider failures can use HTTP 200; an error takes precedence over stale output.
      if (typeof data.error === 'string' && data.error) {
        return {
          error: data.error,
          ...(data.isRefusal === true ? { isRefusal: true } : {}),
          ...(data.tokenUsage ? { tokenUsage: data.tokenUsage } : {}),
        };
      }

      if (!response.ok) {
        return {
          error: `API call failed with status ${response.status}`,
          ...(data.isRefusal === true ? { isRefusal: true } : {}),
          ...(data.tokenUsage ? { tokenUsage: data.tokenUsage } : {}),
        };
      }

      if (!data.result) {
        logger.debug(
          `Error from promptfoo completion provider. Status: ${response.status} ${response.statusText} ${JSON.stringify(data)} `,
        );
        return {
          error: 'LLM did not return a result, likely refusal',
          ...(data.isRefusal === true ? { isRefusal: true } : {}),
          ...(data.tokenUsage ? { tokenUsage: data.tokenUsage } : {}),
        };
      }

      return {
        inputMaterialization: data.inputMaterialization,
        materializationHandled: data.materializationHandled,
        materializedVars: data.materializedVars,
        output: data.result,
        ...(data.isRefusal === true ? { isRefusal: true } : {}),
        tokenUsage: data.tokenUsage,
      };
    } catch (err) {
      // Re-throw abort errors to properly cancel the operation
      if (err instanceof Error && err.name === 'AbortError') {
        throw err;
      }
      if (err instanceof HttpRateLimitError) {
        const data =
          err.body && typeof err.body === 'object'
            ? (err.body as Record<string, unknown>)
            : undefined;
        const parsedTokenUsage = BaseTokenUsageSchema.safeParse(data?.tokenUsage);
        return {
          error:
            typeof data?.error === 'string' && data.error
              ? data.error
              : `API call error: ${String(err)}`,
          metadata: { rateLimitKind: err.kind },
          ...(data?.isRefusal === true ? { isRefusal: true } : {}),
          ...(parsedTokenUsage.success ? { tokenUsage: parsedTokenUsage.data } : {}),
        };
      }
      return {
        error: `API call error: ${String(err)}`,
      };
    }
  }
}

interface PromptfooAgentOptions {
  env?: EnvOverrides;
  id?: string;
  instructions?: string;
  /** Cloud target database ID used to resolve the owning team for remote tasks. */
  targetId?: string;
  redteamGenerationContext?: RemoteGenerationContext;
}

// Task ID constants for simulated user provider
export const REDTEAM_SIMULATED_USER_TASK_ID = 'mischievous-user-redteam';

/**
 * Provider for simulating realistic user conversations using Promptfoo's conversation models.
 * Supports both regular simulated users and adversarial red team users.
 */
export class PromptfooSimulatedUserProvider implements ApiProvider {
  private options: PromptfooAgentOptions;
  private taskId: string;

  constructor(options: PromptfooAgentOptions = {}, taskId: string) {
    this.options = options;
    this.taskId = taskId;
  }

  id(): string {
    return this.options.id || 'promptfoo:agent';
  }

  toString(): string {
    return '[Promptfoo Agent Provider]';
  }

  async callApi(
    prompt: string,
    _context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // Check if this is a redteam task
    const isRedteamTask = this.taskId === REDTEAM_SIMULATED_USER_TASK_ID;

    // For redteam tasks, check the redteam-specific flag
    // For regular tasks, only check the general flag
    const shouldDisable = isRedteamTask
      ? neverGenerateRemote() // Checks both flags
      : neverGenerateRemoteForRegularEvals(); // Only checks general flag

    if (shouldDisable) {
      const relevantFlag = isRedteamTask
        ? 'PROMPTFOO_DISABLE_REMOTE_GENERATION or PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION'
        : 'PROMPTFOO_DISABLE_REMOTE_GENERATION';
      const docsUrl = isRedteamTask
        ? 'https://www.promptfoo.dev/docs/red-team/configuration#remote-generation'
        : 'https://www.promptfoo.dev/docs/providers/simulated-user#remote-generation';

      return {
        error: dedent`
          Remote generation is disabled.

          SimulatedUser requires Promptfoo's conversation simulation models.

          To enable, remove ${relevantFlag}

          Learn more: ${docsUrl}
        `,
        tokenUsage: { numRequests: 0 },
      };
    }

    try {
      const messages = JSON.parse(prompt);
      const body = {
        task: this.taskId,
        instructions: this.options.instructions,
        history: messages,
        email: getUserEmail(),
        version: VERSION,
        ...providerRemoteGenerationContextPayload(
          this.options.redteamGenerationContext ?? this.options.targetId,
        ),
      };

      const response = await fetchWithRetries(
        getRemoteGenerationUrl(),
        {
          method: 'POST',
          headers: getRemoteGenerationHeaders(),
          body: JSON.stringify(body),
          ...(callApiOptions?.abortSignal && { signal: callApiOptions.abortSignal }),
        },
        getRequestTimeoutMs(),
      );

      if (!response.ok) {
        throw new Error(`API call failed with status ${response.status}: ${await response.text()}`);
      }

      const data = (await response.json()) as {
        result: string;
        task: string;
        tokenUsage: TokenUsage;
      };
      return {
        output: data.result,
        tokenUsage: data.tokenUsage,
      };
    } catch (err) {
      // Re-throw abort errors to properly cancel the operation
      if (err instanceof Error && err.name === 'AbortError') {
        throw err;
      }
      return {
        error: `API call error: ${String(err)}`,
      };
    }
  }
}
