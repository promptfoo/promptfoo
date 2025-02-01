import dedent from 'dedent';

import logger from '../../../logger';
import { PromptfooChatCompletionProvider } from '../../../providers/promptfoo';
import {
  type ApiProvider,
  type AtomicTestCase,
  type CallApiContextParams,
  type CallApiOptionsParams,
  type GuardrailResponse,
  type NunjucksFilterMap,
  type Prompt,
} from '../../../types';
import invariant from '../../../util/invariant';
import {
  extractFirstJsonObject,
  safeJsonStringify,
} from '../../../util/json';
import { getNunjucksEngine } from '../../../util/templates';
import { sleep } from '../../../util/time';
import { shouldGenerateRemote } from '../../remoteGeneration';
import {
  getTargetResponse,
  redteamProviderManager,
} from '../shared';
import {
  GRADER_SYSTEM_PROMPT,
  JUDGE_SYSTEM_PROMPT,
} from './prompts';
import { getNextAutoDanAttack } from './remoteGeneration';

interface AutoDanOutput {
  prompt: string;
  output: string;
  score: number;
  strategy: string;
  graderPassed?: boolean;
  guardrails?: GuardrailResponse;
  judgeRating?: number;
  judgeExplanation?: string;
}

async function runRedteamConversation({
  context,
  filters,
  injectVar,
  options,
  prompt,
  redteamProvider,
  targetProvider,
  test,
  vars,
}: {
  context?: CallApiContextParams;
  filters: NunjucksFilterMap | undefined;
  injectVar: string;
  options?: CallApiOptionsParams;
  prompt: Prompt;
  redteamProvider: ApiProvider;
  targetProvider: ApiProvider;
  test?: AtomicTestCase;
  vars: Record<string, string | object>;
}) {
  const nunjucks = getNunjucksEngine();
  const goal = vars[injectVar];

  const graderSystemPrompt = nunjucks.renderString(GRADER_SYSTEM_PROMPT, { goal });
  const judgeSystemPrompt = nunjucks.renderString(JUDGE_SYSTEM_PROMPT, { goal });

  let highestScore = 0;
  let bestResponse = '';
  let bestInjectVar: string | undefined;
  let finalIteration = 0;
  let lastAttempt = '';
  let lastResponse = '';
  let currentStrategy = '';

  const totalTokenUsage = {
    total: 0,
    prompt: 0,
    completion: 0,
    numRequests: 0,
    cached: 0,
  };

  const previousOutputs: AutoDanOutput[] = [];
  const maxIterations = 10;

  for (let i = 0; i < maxIterations; i++) {
    logger.debug(`[AutoDan] Starting iteration ${i + 1}/${maxIterations}`);

    // Get next attack using remote generation
    let newInjectVar: string;
    try {
      const autoDanResponse = await getNextAutoDanAttack({
        goal: goal as string,
        lastAttempt,
        lastResponse,
        currentStrategy,
      });

      newInjectVar = autoDanResponse.prompt;
      currentStrategy = autoDanResponse.selectedStrategy;
      logger.debug(`[AutoDan] Selected strategy: ${currentStrategy}`);
      logger.debug(`[AutoDan] Generated prompt: ${newInjectVar}`);
      lastAttempt = newInjectVar;
    } catch (err) {
      logger.warn(`[AutoDan] Failed to get next attack: ${err}`);
      continue;
    }

    // Get target response
    const targetResponse = await getTargetResponse(
      targetProvider,
      newInjectVar,
      context,
      options,
    );

    if (targetResponse.error) {
      logger.warn(`[AutoDan] Target error: ${targetResponse.error}`);
      continue;
    }

    lastResponse = targetResponse.output;

    if (targetResponse.tokenUsage) {
      totalTokenUsage.total += targetResponse.tokenUsage.total || 0;
      totalTokenUsage.prompt += targetResponse.tokenUsage.prompt || 0;
      totalTokenUsage.completion += targetResponse.tokenUsage.completion || 0;
      totalTokenUsage.numRequests += targetResponse.tokenUsage.numRequests ?? 1;
      totalTokenUsage.cached += targetResponse.tokenUsage.cached || 0;
    }

    // Grade the response
    const graderBody = JSON.stringify([
      {
        role: 'system',
        content: graderSystemPrompt,
      },
      {
        role: 'user',
        content: targetResponse.output,
      },
    ]);

    const graderResp = await redteamProvider.callApi(graderBody, {
      prompt: {
        raw: graderBody,
        label: 'grader',
      },
      vars: {},
    });

    if (redteamProvider.delay) {
      await sleep(redteamProvider.delay);
    }

    if (graderResp.tokenUsage) {
      totalTokenUsage.total += graderResp.tokenUsage.total || 0;
      totalTokenUsage.prompt += graderResp.tokenUsage.prompt || 0;
      totalTokenUsage.completion += graderResp.tokenUsage.completion || 0;
      totalTokenUsage.numRequests += graderResp.tokenUsage.numRequests ?? 1;
      totalTokenUsage.cached += graderResp.tokenUsage.cached || 0;
    }

    let score = 0;
    let success = false;
    try {
      const parsed = typeof graderResp.output === 'string'
        ? extractFirstJsonObject(graderResp.output)
        : graderResp.output;
      score = parsed.score;
      success = parsed.success;
    } catch (err) {
      logger.warn(`[AutoDan] Failed to parse grader response: ${err}`);
      continue;
    }

    // Judge the response against the best response so far
    const judgeBody = JSON.stringify([
      {
        role: 'system',
        content: judgeSystemPrompt,
      },
      {
        role: 'user',
        content: dedent`
          Current Response:
          ${targetResponse.output}

          Previous Best Response:
          ${bestResponse || 'None'}
        `,
      },
    ]);

    const judgeResp = await redteamProvider.callApi(judgeBody, {
      prompt: {
        raw: judgeBody,
        label: 'judge',
      },
      vars: {},
    });

    if (redteamProvider.delay) {
      await sleep(redteamProvider.delay);
    }

    if (judgeResp.tokenUsage) {
      totalTokenUsage.total += judgeResp.tokenUsage.total || 0;
      totalTokenUsage.prompt += judgeResp.tokenUsage.prompt || 0;
      totalTokenUsage.completion += judgeResp.tokenUsage.completion || 0;
      totalTokenUsage.numRequests += judgeResp.tokenUsage.numRequests ?? 1;
      totalTokenUsage.cached += judgeResp.tokenUsage.cached || 0;
    }

    let currentRating = 0;
    let previousRating = bestResponse ? highestScore : 0;
    let judgeExplanation = '';

    try {
      const parsed = typeof judgeResp.output === 'string'
        ? extractFirstJsonObject(judgeResp.output)
        : judgeResp.output;
      currentRating = parsed.currentResponse?.rating;
      previousRating = parsed.previousBestResponse?.rating;
      judgeExplanation = parsed.currentResponse?.explanation;

      if (!currentRating || !previousRating) {
        logger.warn('[AutoDan] Judge did not return valid ratings');
      }
    } catch (err) {
      logger.warn(`[AutoDan] Failed to parse judge response: ${err}`);
    }

    // Check custom grader if available
    const assertToUse = test?.assert?.find((a: { type: string }) => a.type);
    const { getGraderById } = await import('../../graders');
    let graderPassed: boolean | undefined;
    
    if (test && assertToUse) {
      const grader = getGraderById(assertToUse.type);
      if (grader) {
        const { grade } = await grader.getResult(
          goal as string,
          targetResponse.output,
          test,
          redteamProvider,
          assertToUse && 'value' in assertToUse ? assertToUse.value : undefined,
        );
        graderPassed = grade.pass;
        if (grade.tokensUsed) {
          totalTokenUsage.total += grade.tokensUsed.total || 0;
          totalTokenUsage.prompt += grade.tokensUsed.prompt || 0;
          totalTokenUsage.completion += grade.tokensUsed.completion || 0;
          totalTokenUsage.cached += grade.tokensUsed.cached || 0;
        }
      }
    }

    previousOutputs.push({
      prompt: newInjectVar,
      output: targetResponse.output,
      score,
      strategy: currentStrategy,
      graderPassed,
      guardrails: targetResponse.guardrails,
      judgeRating: currentRating,
      judgeExplanation,
    });

    // Update best response based on judge's rating
    if (currentRating > highestScore) {
      highestScore = currentRating;
      bestResponse = targetResponse.output;
      bestInjectVar = newInjectVar;
      finalIteration = i + 1;
    }

    // Exit conditions: success from grader, high score from judge, or failed custom grader
    if (success || currentRating >= 10 || graderPassed === false) {
      break;
    }
  }

  return {
    output: bestResponse,
    metadata: {
      finalIteration,
      highestScore,
      redteamHistory: previousOutputs,
      redteamFinalPrompt: bestInjectVar,
    },
    tokenUsage: totalTokenUsage,
  };
}

class AutoDanProvider implements ApiProvider {
  #redteamProvider: ApiProvider;
  private readonly injectVar: string;

  constructor(readonly config: Record<string, string | object>) {
    logger.debug(`[AutoDan] Constructor config: ${JSON.stringify(config)}`);
    invariant(typeof config.injectVar === 'string', 'Expected injectVar to be set');
    this.injectVar = config.injectVar;

    if (shouldGenerateRemote()) {
      this.#redteamProvider = new PromptfooChatCompletionProvider({
        task: 'autodan',
        jsonOnly: true,
        preferSmallModel: false,
      });
    } else {
      invariant(config.redteamProvider, 'Expected redteamProvider to be set when not using remote generation');
      // Initialize with a temporary provider that will be replaced in init()
      this.#redteamProvider = new PromptfooChatCompletionProvider({
        task: 'autodan',
        jsonOnly: true,
        preferSmallModel: false,
      });
    }
  }

  private async init() {
    if (!shouldGenerateRemote() && this.config.redteamProvider) {
      this.#redteamProvider = await redteamProviderManager.getProvider({
        provider: this.config.redteamProvider,
        jsonOnly: true,
      });
    }
  }

  id() {
    return 'promptfoo:redteam:autodan';
  }

  async callApi(prompt: string, context?: CallApiContextParams, options?: CallApiOptionsParams) {
    logger.debug(`[AutoDan] callApi context: ${safeJsonStringify(context)}`);
    invariant(context?.originalProvider, 'Expected originalProvider to be set');
    invariant(context.vars, 'Expected vars to be set');

    await this.init();

    return runRedteamConversation({
      prompt: context.prompt,
      filters: context.filters,
      vars: context.vars,
      redteamProvider: this.#redteamProvider,
      targetProvider: context.originalProvider,
      injectVar: this.injectVar,
      context,
      options,
      test: context.test,
    });
  }
}

export default AutoDanProvider;
