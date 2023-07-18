import fs from 'fs';

import nunjucks from 'nunjucks';

import { DefaultGradingProvider } from './providers/openai';

import { loadApiProvider } from './providers';
import { DEFAULT_GRADING_PROMPT } from './prompts';

import type {
  GradingConfig,
  GradingResult,
} from './types';

export async function matchesLlmRubric(
  expected: string,
  output: string,
  options?: GradingConfig,
): Promise<GradingResult> {
  if (!options) {
    throw new Error(
      'Cannot grade output without grading config. Specify --grader option or grading config.',
    );
  }

  let promptText = DEFAULT_GRADING_PROMPT;
  if (options.promptPath) {
    promptText = fs.readFileSync(options.promptPath, 'utf-8');
  } else if (options.prompt) {
    promptText = options.prompt;
  }

  const prompt = nunjucks.renderString(promptText, {
    output,
    rubric: expected,
  });

  let provider = options.provider || DefaultGradingProvider;
  if (typeof provider === 'string') {
    provider = await loadApiProvider(provider);
  }
  const resp = await provider.callApi(prompt);
  if (resp.error || !resp.output) {
    return {
      pass: false,
      score: 0,
      reason: resp.error || 'No output',
      tokensUsed: {
        total: resp.tokenUsage?.total || 0,
        prompt: resp.tokenUsage?.prompt || 0,
        completion: resp.tokenUsage?.completion || 0,
      },
    };
  }

  try {
    const parsed = JSON.parse(resp.output) as Omit<GradingResult, 'score'>;
    parsed.tokensUsed = {
      total: resp.tokenUsage?.total || 0,
      prompt: resp.tokenUsage?.prompt || 0,
      completion: resp.tokenUsage?.completion || 0,
    };
    return { ...parsed, score: parsed.pass ? 1 : 0 };
  } catch (err) {
    return {
      pass: false,
      score: 0,
      reason: `Output is not valid JSON: ${resp.output}`,
      tokensUsed: {
        total: resp.tokenUsage?.total || 0,
        prompt: resp.tokenUsage?.prompt || 0,
        completion: resp.tokenUsage?.completion || 0,
      },
    };
  }
}

