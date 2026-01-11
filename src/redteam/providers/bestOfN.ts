import async from 'async';
import chalk from 'chalk';
import dedent from 'dedent';
import { VERSION } from '../../constants';
import { renderPrompt } from '../../evaluatorHelpers';
import { getUserEmail } from '../../globalConfig/accounts';
import logger from '../../logger';
import { fetchWithProxy } from '../../util/fetch/index';
import invariant from '../../util/invariant';
import { accumulateResponseTokenUsage, createEmptyTokenUsage } from '../../util/tokenUsageUtils';
import { getRemoteGenerationUrl, neverGenerateRemote } from '../remoteGeneration';
import { getSessionId } from '../util';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/providers';

interface BestOfNResponse {
  modifiedPrompts: string[];
  task: 'jailbreak:best-of-n';
}

interface BestOfNConfig {
  injectVar: string;
  maxConcurrency: number;
  nSteps?: number;
  maxCandidatesPerStep?: number;
}

export default class BestOfNProvider implements ApiProvider {
  readonly config: BestOfNConfig;

  id() {
    return 'promptfoo:redteam:best-of-n';
  }

  constructor(
    options: {
      injectVar?: string;
      maxConcurrency?: number;
      nSteps?: number;
      maxCandidatesPerStep?: number;
    } = {},
  ) {
    if (neverGenerateRemote()) {
      throw new Error(`Best-of-N strategy requires remote generation to be enabled`);
    }

    invariant(typeof options.injectVar === 'string', 'Expected injectVar to be set');
    this.config = {
      injectVar: options.injectVar,
      maxConcurrency: options.maxConcurrency || 3,
      nSteps: options.nSteps,
      maxCandidatesPerStep: options.maxCandidatesPerStep,
    };
  }

  async callApi(
    _prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    logger.debug('[Best-of-N] callApi context', { context });
    invariant(context?.originalProvider, 'Expected originalProvider to be set');
    invariant(context?.vars, 'Expected vars to be set');

    const targetProvider: ApiProvider = context.originalProvider;
    const targetTokenUsage = createEmptyTokenUsage();
    const sessionIds: string[] = [];
    try {
      // Get candidate prompts from the server
      const response = await fetchWithProxy(
        getRemoteGenerationUrl(),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            task: 'jailbreak:best-of-n',
            prompt: context.vars[this.config.injectVar],
            nSteps: this.config.nSteps,
            maxCandidatesPerStep: this.config.maxCandidatesPerStep,
            version: VERSION,
            email: getUserEmail(),
          }),
        },
        options?.abortSignal,
      );

      const data = (await response.json()) as BestOfNResponse;
      invariant(Array.isArray(data.modifiedPrompts), 'Expected modifiedPrompts array in response');

      logger.debug(
        dedent`
          ${chalk.bold.green('Best-of-N candidates:')}
          ${chalk.cyan(JSON.stringify(data.modifiedPrompts, null, 2))}
        `,
      );

      // Try candidates concurrently until one succeeds
      let successfulResponse: ProviderResponse | null = null;
      let lastResponse: ProviderResponse | null = null;
      let currentStep = 0;

      await async.eachLimit(
        data.modifiedPrompts,
        this.config.maxConcurrency,
        async (candidatePrompt) => {
          if (successfulResponse) {
            return;
          }

          const targetVars = {
            ...context.vars,
            [this.config.injectVar]: candidatePrompt,
          };

          const renderedPrompt = await renderPrompt(
            context.prompt,
            targetVars,
            context.filters,
            targetProvider,
            [this.config.injectVar], // Skip template rendering for injection variable to prevent double-evaluation
          );

          try {
            const response = await targetProvider.callApi(renderedPrompt, context, options);
            const sessionId = getSessionId(response, context);
            if (sessionId) {
              sessionIds.push(sessionId);
            }
            lastResponse = response;
            accumulateResponseTokenUsage(targetTokenUsage, response);
            currentStep++;
            if (!response.error) {
              successfulResponse = response;
              successfulResponse.prompt = candidatePrompt;
              successfulResponse.metadata = {
                ...successfulResponse.metadata,
                redteamFinalPrompt: candidatePrompt,
                step: currentStep,
              };
              return false; // Stop processing more candidates
            }
          } catch (err) {
            logger.debug(`[Best-of-N] Candidate failed: ${err}`);
            currentStep++;
          }
        },
      );

      if (successfulResponse) {
        (successfulResponse as ProviderResponse).tokenUsage = targetTokenUsage;
        return successfulResponse;
      }
      if (lastResponse) {
        (lastResponse as ProviderResponse).tokenUsage = targetTokenUsage;
        (lastResponse as ProviderResponse).metadata = {
          ...((lastResponse as ProviderResponse).metadata ?? {}),
          sessionIds,
        };
      }
      return (
        lastResponse || {
          error: 'All candidates failed',
          metadata: {
            sessionIds,
          },
        }
      );
    } catch (err) {
      // Re-throw abort errors to properly cancel the operation
      if (err instanceof Error && err.name === 'AbortError') {
        throw err;
      }
      logger.error(`[Best-of-N] Error: ${err}`);
      return {
        error: String(err),
        metadata: {
          sessionIds,
        },
      };
    }
  }
}
