import logger from '../logger';
import { DEFAULT_WEB_SEARCH_PROMPT } from '../prompts/grading';
import { DEFAULT_ANTHROPIC_MODEL } from '../providers/anthropic/defaults';
import { getDefaultProviders } from '../providers/defaults';
import { hasWebSearchCapability, loadWebSearchProvider } from '../providers/webSearchUtils';
import { extractFirstJsonObject } from '../util/json';
import { callProviderWithContext, getGradingProvider } from './providers';
import { loadRubricPrompt, renderLlmRubricPrompt } from './rubric';
import { tryParse } from './shared';

import type {
  ApiProvider,
  Assertion,
  CallApiContextParams,
  GradingConfig,
  GradingResult,
  VarValue,
} from '../types/index';

export async function matchesSearchRubric(
  rubric: string,
  llmOutput: string,
  grading?: GradingConfig,
  vars?: Record<string, VarValue>,
  assertion?: Assertion,
  _provider?: ApiProvider,
  providerCallContext?: CallApiContextParams,
): Promise<GradingResult> {
  if (!grading) {
    throw new Error(
      'Cannot grade output without grading config. Specify --grader option or grading config.',
    );
  }

  // Search rubric assertion is like llm-rubric but with web search capabilities
  const defaultProviders = await getDefaultProviders();
  const defaultSearchProviders = [
    defaultProviders.webSearchProvider,
    defaultProviders.llmRubricProvider,
    defaultProviders.gradingProvider,
  ];
  const configuredProvider = grading.provider
    ? await getGradingProvider('text', grading.provider, null)
    : null;

  let searchProvider =
    configuredProvider || defaultSearchProviders.find((provider) => Boolean(provider));

  // Prefer a known web-search default over a configured/default text grader that lacks search.
  if (!hasWebSearchCapability(searchProvider)) {
    const webSearchDefault = defaultSearchProviders.find((provider) =>
      hasWebSearchCapability(provider),
    );
    if (webSearchDefault) {
      searchProvider = webSearchDefault;
    }
  }

  // Check if current provider has web search, if not try to load one
  if (!hasWebSearchCapability(searchProvider)) {
    // Try to load a provider with web search capabilities
    // For search-rubric assertion, prefer Anthropic first (pass true)
    const webSearchProvider = await loadWebSearchProvider(true);
    if (webSearchProvider) {
      searchProvider = webSearchProvider;
    }
  }

  // Ensure we have a provider with web search capabilities
  if (!searchProvider || !hasWebSearchCapability(searchProvider)) {
    throw new Error(
      'search-rubric assertion requires a grading provider with web search capabilities. ' +
        `Use --grader with a web search provider (e.g., anthropic:messages:${DEFAULT_ANTHROPIC_MODEL}, openai:responses:o4-mini with tools configured, perplexity:sonar) or configure one in defaultTest.options.provider`,
    );
  }

  // Load the web search rubric prompt
  const rubricPrompt = await loadRubricPrompt(grading?.rubricPrompt, DEFAULT_WEB_SEARCH_PROMPT);
  const prompt = await renderLlmRubricPrompt(rubricPrompt, {
    output: tryParse(llmOutput),
    rubric,
    ...(vars || {}),
  });

  const resp = await callProviderWithContext(
    searchProvider,
    prompt,
    'search-rubric',
    { output: tryParse(llmOutput), rubric, ...(vars || {}) },
    providerCallContext,
  );

  if (resp.error || !resp.output) {
    return {
      pass: false,
      score: 0,
      reason: `Search rubric evaluation failed: ${resp.error || 'No output'}`,
      tokensUsed: resp.tokenUsage,
      assertion,
    };
  }

  try {
    const result = extractFirstJsonObject(String(resp.output)) as {
      pass?: boolean;
      score?: number;
      reason?: string;
      searchResults?: unknown;
    };

    // Apply threshold if specified
    let pass = result.pass ?? false;
    const score = typeof result.score === 'number' ? result.score : pass ? 1 : 0;

    if (assertion?.threshold !== undefined) {
      pass = pass && score >= assertion.threshold;
    }

    return {
      pass,
      score,
      reason: result.reason || 'No reason provided',
      tokensUsed: resp.tokenUsage,
      assertion,
      metadata: {
        searchResults: result.searchResults || [],
        searchProvider: searchProvider.id(),
      },
    };
  } catch (err) {
    // JSON extraction failed - fall back to naive substring matching
    logger.warn(
      `[search-rubric] Could not parse structured JSON from provider response, falling back to substring matching: ${(err as Error).message}`,
    );
    const outputLower = String(resp.output).toLowerCase();
    const pass = outputLower.includes('"pass":true') || outputLower.includes('"pass": true');

    return {
      pass,
      score: pass ? 1 : 0,
      reason: resp.output as string,
      tokensUsed: resp.tokenUsage,
      assertion,
    };
  }
}
