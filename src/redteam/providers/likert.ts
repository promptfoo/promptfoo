import logger from '../../logger';
import type { CallApiContextParams, CallApiOptionsParams } from '../../types';
import type { ApiProvider, ProviderResponse } from '../../types/providers';
import { getRemoteGenerationUrl } from '../remoteGeneration';
import { isBasicRefusal } from '../util';

interface LikertProviderOptions {
  redteamProvider: ApiProvider;
  numIterations?: number;
  config?: Record<string, unknown>;
  plugin?: string;
}

export default class LikertProvider implements ApiProvider {
  private readonly redteamProvider: ApiProvider;
  private readonly numIterations: number;
  readonly config: Record<string, unknown>;
  private readonly plugin?: string;

  constructor(options: LikertProviderOptions) {
    this.redteamProvider = options.redteamProvider;
    this.numIterations = options.numIterations || 5;
    this.config = options.config || {};
    this.plugin = options.plugin;
  }

  id() {
    return 'promptfoo:redteam:likert';
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const totalTokenUsage = {
      total: 0,
      prompt: 0,
      completion: 0,
      cached: 0,
    };

    let bestPrompt = prompt;
    let bestResponse = '';
    let bestPassed = false;

    for (let i = 0; i < this.numIterations; i++) {
      try {
        const payload = {
          task: 'jailbreak:likert',
          prompt,
          index: Number(i),
          n: 1,
          plugin: this.plugin,
          ...this.config,
        };

        logger.debug(`Sending likert request with payload: ${JSON.stringify(payload)}`);

        const response = await fetch(getRemoteGenerationUrl(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorText = await response.text();
          logger.error(`Remote generation failed: ${response.statusText}. Error: ${errorText}`);
          continue;
        }

        const data = await response.json();
        logger.debug(`Server response: ${JSON.stringify(data)}`);

        if (!data.modifiedPrompts?.length) {
          logger.error(
            `No modified prompts returned from server. Response: ${JSON.stringify(data)}`,
          );
          continue;
        }

        const modifiedPrompt = data.modifiedPrompts[0];
        logger.debug(`Using modified prompt: ${modifiedPrompt}`);

        // Skip if this is a refusal
        if (isBasicRefusal(modifiedPrompt)) {
          logger.debug('Skipping refusal response');
          continue;
        }

        // Run grader if we have a test case
        if (context?.test) {
          const assertToUse = (context.test as { assert?: Array<{ type: string }> }).assert?.find(
            (a) => a.type,
          );
          if (assertToUse) {
            const grader = await import(`../plugins/${assertToUse.type}`);
            if (grader) {
              const result = await grader.default.grade(modifiedPrompt);

              // Add token usage from grader
              if (result.tokenUsage) {
                totalTokenUsage.total += result.tokenUsage.total || 0;
                totalTokenUsage.prompt += result.tokenUsage.prompt || 0;
                totalTokenUsage.completion += result.tokenUsage.completion || 0;
                totalTokenUsage.cached += result.tokenUsage.cached || 0;
              }

              // If this attempt passed, use it
              if (result.pass) {
                bestPrompt = modifiedPrompt;
                bestResponse = data.response || '';
                bestPassed = true;
                break;
              }
            }
          }
        }
      } catch (error) {
        logger.error(`Error in iteration ${i}: ${error}`);
        continue;
      }
    }

    return {
      output: bestPrompt,
      tokenUsage: totalTokenUsage,
      metadata: {
        passed: bestPassed,
        response: bestResponse,
      },
    };
  }
}
