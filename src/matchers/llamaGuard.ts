import { LLAMA_GUARD_PROMPT } from '../prompts/grading';
import {
  describeLlamaGuardCategory,
  LLAMAGUARD_CATEGORY_DESCRIPTIONS,
  parseLlamaGuardOutput,
} from '../util/llamaGuard';
import { callProviderWithContext, getAndCheckProvider } from './providers';
import { loadRubricPrompt, renderLlmRubricPrompt } from './rubric';
import { graderFail, normalizeMatcherTokenUsage } from './shared';

import type { CallApiContextParams, GradingConfig, GradingResult } from '../types/index';

interface LlamaGuardMatchOptions {
  userPrompt: string;
  assistantResponse: string;
  categories?: string[];
}

/**
 * Classifies a conversation with a LlamaGuard-family model reachable through any
 * standard 'text' provider (unlike `matchesModeration`, which requires a provider that
 * implements the bespoke `callModerationApi` interface). This is what makes the
 * assertion "provider-portable": Groq, Together AI, self-hosted vLLM, or any other
 * OpenAI-compatible chat provider work without new provider code, as long as it's
 * pointed at a LlamaGuard model.
 */
export async function matchesLlamaGuard(
  { userPrompt, assistantResponse, categories = [] }: LlamaGuardMatchOptions,
  grading?: GradingConfig,
  providerCallContext?: CallApiContextParams,
): Promise<Omit<GradingResult, 'assertion'>> {
  if (!assistantResponse) {
    return {
      pass: true,
      score: 1,
      reason: 'No output to classify',
    };
  }

  // No default provider: a generic text-grading provider (e.g. the default GPT-4o-mini
  // grader) cannot produce LlamaGuard's "safe"/"unsafe\n<codes>" output format, so
  // silently falling back to one would misclassify every response. Require the caller
  // to configure a LlamaGuard-capable provider explicitly.
  const textProvider = await getAndCheckProvider(
    'text',
    grading?.provider,
    null,
    'llama-guard check',
  );

  const rubricPrompt = await loadRubricPrompt(grading?.rubricPrompt, LLAMA_GUARD_PROMPT);
  const vars = { prompt: userPrompt, output: assistantResponse };
  const promptText = await renderLlmRubricPrompt(rubricPrompt, vars);

  const resp = await callProviderWithContext(
    textProvider,
    promptText,
    'llama-guard',
    vars,
    providerCallContext,
  );

  if (resp.error || !resp.output) {
    return graderFail(`LlamaGuard API error: ${resp.error || 'No output'}`, resp.tokenUsage);
  }

  if (typeof resp.output !== 'string') {
    return graderFail(
      `LlamaGuard produced a malformed response: ${JSON.stringify(resp.output)}`,
      resp.tokenUsage,
    );
  }

  const verdict = parseLlamaGuardOutput(resp.output);
  const filteredCategories =
    categories.length === 0
      ? verdict.categories
      : verdict.categories.filter((c) => categories.includes(c));
  const tokensUsed = normalizeMatcherTokenUsage(resp.tokenUsage);

  if (verdict.safe || filteredCategories.length === 0) {
    return {
      pass: true,
      score: 1,
      reason: verdict.safe
        ? 'LlamaGuard classified the response as safe'
        : 'No relevant LlamaGuard categories detected',
      tokensUsed,
      metadata: {
        violatedCategories: [],
        llamaGuardRawOutput: verdict.raw,
      },
    };
  }

  return {
    pass: false,
    score: 0,
    reason: `LlamaGuard flagged: ${filteredCategories
      .map((code) => `${describeLlamaGuardCategory(code)} (${code})`)
      .join(', ')}`,
    tokensUsed,
    metadata: {
      violatedCategories: filteredCategories,
      categoryDescriptions: LLAMAGUARD_CATEGORY_DESCRIPTIONS,
      llamaGuardRawOutput: verdict.raw,
      ...(verdict.unknownCategories.length > 0 && { unknownCategories: verdict.unknownCategories }),
    },
  };
}
