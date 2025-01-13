import logger from '../../logger';
import type { CallApiContextParams, CallApiOptionsParams } from '../../types';
import type { AssertionValue } from '../../types';
import type { ApiProvider, ProviderResponse } from '../../types/providers';
import { getRemoteGenerationUrl, neverGenerateRemote } from '../remoteGeneration';
import { isBasicRefusal } from '../util';

interface LikertProviderOptions {
  redteamProvider: ApiProvider;
  numIterations?: number;
  config?: Record<string, unknown>;
  plugin?: string;
}

interface IterationOutput {
  prompt: string;
  output: string;
  wasRefusal: boolean;
  graderPassed: boolean | undefined;
}

export default class LikertProvider implements ApiProvider {
  private readonly redteamProvider: ApiProvider;
  private readonly numIterations: number;
  readonly config: Record<string, unknown>;
  private readonly plugin?: string;

  constructor(options: LikertProviderOptions) {
    if (neverGenerateRemote()) {
      throw new Error('Likert provider requires remote generation');
    }
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
    const iterationOutputs: IterationOutput[] = [];

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

        // Check for refusal
        const wasRefusal = isBasicRefusal(modifiedPrompt);
        if (wasRefusal) {
          logger.debug('Skipping refusal response');
          iterationOutputs.push({
            prompt: modifiedPrompt,
            output: data.response || '',
            wasRefusal: true,
            graderPassed: false,
          });
          continue;
        }

        // Run grader if we have a test case
        let graderPassed: boolean | undefined;
        if (context?.test) {
          const assertToUse = (context.test as { assert?: Array<{ type: string }> }).assert?.find(
            (a) => a.type,
          );
          if (assertToUse) {
            const { getGraderById } = await import('../graders');
            const grader = getGraderById(assertToUse.type);
            if (grader) {
              const result = await grader.getResult(
                prompt,
                data.response || '',
                context.test,
                this.redteamProvider,
                assertToUse && 'value' in assertToUse
                  ? (assertToUse.value as AssertionValue)
                  : undefined,
              );

              // Add token usage from grader
              if (result.grade.tokensUsed) {
                totalTokenUsage.total += result.grade.tokensUsed.total || 0;
                totalTokenUsage.prompt += result.grade.tokensUsed.prompt || 0;
                totalTokenUsage.completion += result.grade.tokensUsed.completion || 0;
                totalTokenUsage.cached += result.grade.tokensUsed.cached || 0;
              }

              graderPassed = result.grade.pass;
              // If this attempt passed, use it
              if (result.grade.pass) {
                bestPrompt = modifiedPrompt;
                bestResponse = data.response || '';
                bestPassed = true;
                break;
              }
            }
          }
        }

        iterationOutputs.push({
          prompt: modifiedPrompt,
          output: data.response || '',
          wasRefusal: false,
          graderPassed,
        });
      } catch (error: unknown) {
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
        iterations: iterationOutputs,
      },
    };
  }
}
