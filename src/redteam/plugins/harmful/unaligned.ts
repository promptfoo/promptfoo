import { getEnvInt } from '../../../envars';
import logger from '../../../logger';
import { PromptfooHarmfulCompletionProvider } from '../../../providers/promptfoo';
import { retryWithDeduplication, sampleArray } from '../../../util/generation';
import { sleep } from '../../../util/time';
import { accumulateResponseTokenUsage, createEmptyTokenUsage } from '../../../util/tokenUsageUtils';
import { mergeProviderTokenUsage } from '../../strategies/util';
import {
  extractMaterializedVariablesFromJsonWithMetadata,
  extractPromptFromTags,
} from '../../util';
import { createTestCase } from './common';

import type { PluginActionParams, TestCase } from '../../../types/index';
import type { Inputs, TokenUsage } from '../../../types/shared';
import type { UNALIGNED_PROVIDER_HARM_PLUGINS } from '../../constants';

/**
 * Extract content from <Prompt> tags and parse JSON if inputs are defined.
 * Returns the processed prompt and any additional vars extracted from JSON.
 */
async function processPromptForInputs(
  prompt: string,
  inputs: Inputs | undefined,
  plugin: keyof typeof UNALIGNED_PROVIDER_HARM_PLUGINS,
  provider: PromptfooHarmfulCompletionProvider,
  purpose: string,
  materializationIndex: number,
): Promise<{
  additionalMetadata?: Record<string, unknown>;
  additionalProviderTokenUsage?: TokenUsage;
  additionalVars: Record<string, string>;
  processedPrompt: string;
}> {
  let processedPrompt = prompt.trim();
  const additionalVars: Record<string, string> = {};
  let additionalMetadata: Record<string, unknown> | undefined;
  let additionalProviderTokenUsage: TokenUsage | undefined;

  // Extract content from <Prompt> tags if present
  const extractedPrompt = extractPromptFromTags(processedPrompt);
  if (extractedPrompt) {
    processedPrompt = extractedPrompt;
  }

  // If inputs are defined, try to parse JSON and extract individual keys
  if (inputs && Object.keys(inputs).length > 0) {
    let parsed: Record<string, unknown> | undefined;
    try {
      parsed = JSON.parse(processedPrompt);
    } catch (error) {
      // If parsing fails, processedPrompt is plain text - keep it as is
      logger.debug('[Harmful] Could not parse prompt as JSON for multi-input mode', { error });
    }

    if (parsed) {
      try {
        const materializedVars = await extractMaterializedVariablesFromJsonWithMetadata(
          parsed,
          inputs,
          {
            materializationIndex,
            pluginId: plugin,
            provider,
            purpose,
          },
        );
        Object.assign(additionalVars, materializedVars.vars);
        additionalMetadata = materializedVars.metadata;
        additionalProviderTokenUsage = materializedVars.tokenUsage;
      } catch (error) {
        logger.debug('[Harmful] Failed to materialize prompt inputs', { error });
        throw error;
      }
    }
  }

  return { processedPrompt, additionalVars, additionalMetadata, additionalProviderTokenUsage };
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
  const generationTokenUsage = createEmptyTokenUsage();
  let hasGenerationTokenUsage = false;

  const generatePrompts = async (): Promise<string[]> => {
    const result = await unalignedProvider.callApi('');
    accumulateResponseTokenUsage(generationTokenUsage, result);
    hasGenerationTokenUsage = true;
    if (result.output) {
      if (delayMs > 0) {
        await sleep(delayMs);
      }
      return result.output;
    }
    return [];
  };
  const allPrompts = await retryWithDeduplication(generatePrompts, n);
  const inputs = config?.inputs as Inputs | undefined;
  const sampledPrompts = sampleArray(allPrompts, n);
  const oneRowGenerationTokenUsage =
    sampledPrompts.length === 1 && hasGenerationTokenUsage ? generationTokenUsage : undefined;

  return Promise.all(
    sampledPrompts.map(async (prompt, materializationIndex) => {
      const { processedPrompt, additionalVars, additionalMetadata, additionalProviderTokenUsage } =
        await processPromptForInputs(
          prompt,
          inputs,
          plugin,
          unalignedProvider,
          purpose,
          materializationIndex,
        );
      const testCase = createTestCase(injectVar, processedPrompt, plugin);

      // Merge additional vars from JSON parsing
      if (Object.keys(additionalVars).length > 0) {
        testCase.vars = {
          ...testCase.vars,
          ...additionalVars,
        };
      }

      if (additionalMetadata) {
        testCase.metadata = {
          ...testCase.metadata,
          inputMaterialization: additionalMetadata,
        };
      }
      if (additionalProviderTokenUsage) {
        testCase.metadata = {
          ...testCase.metadata,
          providerTokenUsage: mergeProviderTokenUsage(
            oneRowGenerationTokenUsage,
            additionalProviderTokenUsage,
          ),
        };
      } else if (oneRowGenerationTokenUsage) {
        testCase.metadata = {
          ...testCase.metadata,
          providerTokenUsage: oneRowGenerationTokenUsage,
        };
      }

      return testCase;
    }),
  );
}
