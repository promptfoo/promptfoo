import async from 'async';
import chalk from 'chalk';
import dedent from 'dedent';
import { VERSION } from '../../constants';
import { renderPrompt } from '../../evaluatorHelpers';
import { getUserEmail } from '../../globalConfig/accounts';
import logger from '../../logger';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../../types/providers';
import invariant from '../../util/invariant';
import { safeJsonStringify } from '../../util/json';
import { getRemoteGenerationUrl, neverGenerateRemote } from '../remoteGeneration';

interface BestOfNResponse {
  modifiedPrompts: string[];
  task: 'jailbreak:best-of-n';
}

export default class BestOfNProvider implements ApiProvider {
  private readonly injectVar: string;
  private readonly maxConcurrency: number;
  private readonly nSteps?: number;
  private readonly maxCandidatesPerStep?: number;

  id() {
    return 'promptfoo:redteam:best-of-n';
  }

  constructor(
    options: ProviderOptions & {
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
    this.injectVar = options.injectVar;
    this.maxConcurrency = options.maxConcurrency || 3;
    this.nSteps = options.nSteps;
    this.maxCandidatesPerStep = options.maxCandidatesPerStep;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    logger.debug(`[Best-of-N] callApi context: ${safeJsonStringify(context)}`);
    invariant(context?.originalProvider, 'Expected originalProvider to be set');
    invariant(context?.vars, 'Expected vars to be set');

    const targetProvider: ApiProvider = context.originalProvider;

    try {
      // Get candidate prompts from the server
      const response = await fetch(getRemoteGenerationUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task: 'jailbreak:best-of-n',
          prompt: context.vars[this.injectVar],
          nSteps: this.nSteps,
          maxCandidatesPerStep: this.maxCandidatesPerStep,
          version: VERSION,
          email: getUserEmail(),
        }),
      });

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

      await async.eachLimit(data.modifiedPrompts, this.maxConcurrency, async (candidatePrompt) => {
        if (successfulResponse) {
          return;
        }

        const targetVars = {
          ...context.vars,
          [this.injectVar]: candidatePrompt,
        };

        const renderedPrompt = await renderPrompt(
          context.prompt,
          targetVars,
          context.filters,
          targetProvider,
        );

        try {
          const response = await targetProvider.callApi(renderedPrompt, context, options);
          lastResponse = response;
          currentStep++;
          if (!response.error) {
            successfulResponse = response;
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
      });

      if (successfulResponse) {
        return successfulResponse;
      }

      return (
        lastResponse || {
          error: 'All candidates failed',
        }
      );
    } catch (err) {
      logger.error(`[Best-of-N] Error: ${err}`);
      return {
        error: String(err),
      };
    }
  }
}
