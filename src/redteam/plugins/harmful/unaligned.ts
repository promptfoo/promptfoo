import { getEnvInt } from '../../../envars';
import logger from '../../../logger';
import { PromptfooHarmfulCompletionProvider } from '../../../providers/promptfoo';
import { retryWithDeduplication, sampleArray } from '../../../util/generation';
import { sleep } from '../../../util/time';
import { extractPromptFromTags, extractVariablesFromJson } from '../../util';
import { createTestCase } from './common';

import type { PluginActionParams, TestCase } from '../../../types/index';
import type { UNALIGNED_PROVIDER_HARM_PLUGINS } from '../../constants';

/**
 * Extract content from <Prompt> tags and parse JSON if inputs are defined.
 * Returns the processed prompt and any additional vars extracted from JSON.
 */
function processPromptForInputs(
  prompt: string,
  _injectVar: string,
  inputs: Record<string, string> | undefined,
): { processedPrompt: string; additionalVars: Record<string, string> } {
  let processedPrompt = prompt.trim();
  const additionalVars: Record<string, string> = {};

  // Extract content from <Prompt> tags if present
  const extractedPrompt = extractPromptFromTags(processedPrompt);
  if (extractedPrompt) {
    processedPrompt = extractedPrompt;
  }

  // If inputs are defined, try to parse JSON and extract individual keys
  if (inputs && Object.keys(inputs).length > 0) {
    try {
      const parsed = JSON.parse(processedPrompt);
      Object.assign(additionalVars, extractVariablesFromJson(parsed, inputs));
    } catch {
      // If parsing fails, processedPrompt is plain text - keep it as is
      logger.debug('[Harmful] Could not parse prompt as JSON for multi-input mode');
    }
  }

  return { processedPrompt, additionalVars };
}

export async function getHarmfulTests(
  { purpose, injectVar, n, delayMs = 0, config }: PluginActionParams,
  plugin: keyof typeof UNALIGNED_PROVIDER_HARM_PLUGINS,
): Promise<TestCase[]> {
  const maxHarmfulTests = getEnvInt('PROMPTFOO_MAX_HARMFUL_TESTS_PER_REQUEST', 5);
  const unalignedProvider = new PromptfooHarmfulCompletionProvider({
    purpose,
    n: Math.min(n, maxHarmfulTests),
    harmCategory: plugin,
    config,
  });

  const generatePrompts = async (): Promise<string[]> => {
    const result = await unalignedProvider.callApi('');
    if (result.output) {
      if (delayMs > 0) {
        await sleep(delayMs);
      }
      return result.output;
    }
    return [];
  };
  const allPrompts = await retryWithDeduplication(generatePrompts, n);
  const inputs = config?.inputs as Record<string, string> | undefined;

  return sampleArray(allPrompts, n).map((prompt) => {
    const { processedPrompt, additionalVars } = processPromptForInputs(prompt, injectVar, inputs);
    const testCase = createTestCase(injectVar, processedPrompt, plugin);

    // Merge additional vars from JSON parsing
    if (Object.keys(additionalVars).length > 0) {
      testCase.vars = {
        ...testCase.vars,
        ...additionalVars,
      };
    }

    return testCase;
  });
}
