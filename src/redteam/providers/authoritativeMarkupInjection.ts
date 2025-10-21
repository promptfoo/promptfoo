import { VERSION } from '../../constants';
import { renderPrompt } from '../../evaluatorHelpers';
import { getUserEmail } from '../../globalConfig/accounts';
import logger from '../../logger';
import { fetchWithProxy } from '../../util/fetch/index';
import invariant from '../../util/invariant';
import { safeJsonStringify } from '../../util/json';
import { getRemoteGenerationUrl, neverGenerateRemote } from '../remoteGeneration';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../../types/providers';

interface AuthoritativeMarkupInjectionConfig {
  injectVar: string;
}

export default class AuthoritativeMarkupInjectionProvider implements ApiProvider {
  readonly config: AuthoritativeMarkupInjectionConfig;

  id() {
    return 'promptfoo:redteam:authoritative-markup-injection';
  }

  constructor(
    options: ProviderOptions & {
      injectVar?: string;
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
      version: VERSION,
      email: getUserEmail(),
      purpose: context?.test?.metadata?.purpose,
    });

    logger.debug(
      `[AuthoritativeMarkupInjection] Sending request to ${getRemoteGenerationUrl()}: ${body}`,
    );

    const response = await fetchWithProxy(getRemoteGenerationUrl(), {
      body,
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    const data = await response.json();
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
    );

    logger.debug(`[AuthoritativeMarkupInjection] Rendered attack prompt`, {
      prompt: renderedAttackerPrompt,
    });

    // Call the target provider with the injected attack
    const targetResponse = await targetProvider.callApi(renderedAttackerPrompt, context, options);

    logger.debug('[AuthoritativeMarkupInjection] Target response', {
      response: targetResponse,
    });

    if (targetResponse.error) {
      return targetResponse;
    }

    return {
      ...targetResponse,
      metadata: {
        ...targetResponse.metadata,
        redteamFinalPrompt: renderedAttackerPrompt,
      },
    };
  }
}
