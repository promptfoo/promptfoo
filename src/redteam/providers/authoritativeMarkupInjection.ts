import { VERSION } from '../../constants';
import { renderPrompt } from '../../evaluatorHelpers';
import { getUserEmail } from '../../globalConfig/accounts';
import logger from '../../logger';
import { fetchWithProxy } from '../../util/fetch/index';
import invariant from '../../util/invariant';
import { safeJsonStringify } from '../../util/json';
import {
  accumulateAttackerTokenUsage,
  accumulateResponseTokenUsage,
  createEmptyTokenUsage,
} from '../../util/tokenUsageUtils';
import {
  getRemoteGenerationHeaders,
  getRemoteGenerationUrl,
  neverGenerateRemote,
} from '../remoteGeneration';
import { remoteGenerationContextPayload } from '../remoteGenerationContext';
import { TargetPromptLengthError } from '../shared/promptLength';
import { callTargetProvider, preserveSelectedError } from './shared';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../../types/providers';

interface AuthoritativeMarkupInjectionConfig {
  injectVar: string;
  targetId?: string;
  maxCharsPerMessage?: number;
}

export default class AuthoritativeMarkupInjectionProvider implements ApiProvider {
  readonly config: AuthoritativeMarkupInjectionConfig;

  id() {
    return 'promptfoo:redteam:authoritative-markup-injection';
  }

  constructor(
    options: ProviderOptions & {
      injectVar?: string;
      maxCharsPerMessage?: number;
      targetId?: string;
    } = {},
  ) {
    if (neverGenerateRemote()) {
      throw new Error(
        `Authoritative Markup Injection strategy requires remote grading to be enabled`,
      );
    }
    invariant(typeof options.injectVar === 'string', 'Expected injectVar to be set');
    this.config = {
      injectVar: options.injectVar,
      // Keep the layer step cap on the loaded instance so the target-call
      // boundary can read it from test.provider.config after readTest
      // replaces the provider descriptor.
      ...(options.maxCharsPerMessage ? { maxCharsPerMessage: options.maxCharsPerMessage } : {}),
      targetId: options.targetId,
    };
    logger.debug('[AuthoritativeMarkupInjection] Constructor options', {
      injectVar: options.injectVar,
    });
  }

  async callApi(
    _prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    logger.debug('[AuthoritativeMarkupInjection] callApi context', { context });
    invariant(context?.originalProvider, 'Expected originalProvider to be set');
    invariant(context?.vars, 'Expected vars to be set');

    const targetProvider: ApiProvider = context.originalProvider;
    const originalText =
      context?.test?.metadata?.originalText || context?.vars[this.config.injectVar];

    // Generate attack with authoritative markup injection
    const body = JSON.stringify({
      originalText,
      i: 0,
      prompt: context?.prompt?.raw,
      task: 'authoritative-markup-injection',
      ...remoteGenerationContextPayload(this.config.targetId),
      version: VERSION,
      email: getUserEmail(),
      purpose: context?.test?.metadata?.purpose,
    });

    logger.debug(
      `[AuthoritativeMarkupInjection] Sending request to ${getRemoteGenerationUrl()}: ${body}`,
    );

    const response = await fetchWithProxy(
      getRemoteGenerationUrl(),
      {
        body,
        headers: getRemoteGenerationHeaders(),
        method: 'POST',
      },
      options?.abortSignal,
    );

    const data = await response.json();
    const totalTokenUsage = createEmptyTokenUsage();
    if (data?.tokenUsage) {
      accumulateAttackerTokenUsage(totalTokenUsage, { tokenUsage: data.tokenUsage });
    }
    if (typeof data?.message !== 'object' || !data.message?.content || !data.message?.role) {
      throw new Error(
        `[AuthoritativeMarkupInjection] Invalid response from server: ${safeJsonStringify(data)}`,
      );
    }

    const attackerMessage = data.message;

    // Inject the attack into the target prompt
    const targetVars = {
      ...context.vars,
      [this.config.injectVar]: attackerMessage.content,
    };

    const renderedAttackerPrompt = await renderPrompt(
      context.prompt,
      targetVars,
      context.filters,
      targetProvider,
      [this.config.injectVar], // Skip template rendering for injection variable to prevent double-evaluation
    );

    logger.debug(`[AuthoritativeMarkupInjection] Rendered attack prompt`, {
      prompt: renderedAttackerPrompt,
    });

    let targetResponse: ProviderResponse;
    try {
      targetResponse = await callTargetProvider(
        targetProvider,
        renderedAttackerPrompt,
        context,
        options,
      );
    } catch (error) {
      if (error instanceof TargetPromptLengthError) {
        return { output: '', error: error.message, tokenUsage: totalTokenUsage };
      }
      throw error;
    }
    accumulateResponseTokenUsage(totalTokenUsage, targetResponse);

    logger.debug('[AuthoritativeMarkupInjection] Target response', {
      response: targetResponse,
    });

    if (targetResponse.error) {
      return preserveSelectedError(
        {
          ...targetResponse,
          tokenUsage: totalTokenUsage,
        },
        targetResponse,
      );
    }

    return {
      ...targetResponse,
      prompt: renderedAttackerPrompt,
      metadata: {
        ...targetResponse.metadata,
        redteamFinalPrompt: renderedAttackerPrompt,
      },
      tokenUsage: totalTokenUsage,
    };
  }
}
