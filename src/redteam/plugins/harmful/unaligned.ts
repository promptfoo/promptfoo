import { getEnvInt } from '../../../envars';
import { PromptfooHarmfulCompletionProvider } from '../../../providers/promptfoo';
import { retryWithDeduplication, sampleArray } from '../../../util/generation';
import { sleep } from '../../../util/time';
import { getShortPluginId, parseGeneratedPromptsWithInputs } from '../../util';
import { createTestCase } from './common';

import type { PluginActionParams, TestCase } from '../../../types/index';
import type { UNALIGNED_PROVIDER_HARM_PLUGINS } from '../../constants';

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

  // Get input keys from config if inputs are specified
  const inputKeys = config?.inputs ? Object.keys(config.inputs) : [];

  return sampleArray(allPrompts, n).map((prompt) => {
    // If inputs are configured and the prompt contains XML format, parse it
    if (inputKeys.length > 0 && /<TestCase>/i.test(prompt)) {
      const parsed = parseGeneratedPromptsWithInputs(prompt, inputKeys);
      if (parsed.length > 0 && parsed[0].prompt) {
        const testCase = createTestCase(injectVar, parsed[0].prompt, plugin);
        // Merge parsed inputs into vars
        if (parsed[0].inputs && Object.keys(parsed[0].inputs).length > 0) {
          testCase.vars = {
            ...testCase.vars,
            ...parsed[0].inputs,
          };
          testCase.metadata = {
            ...testCase.metadata,
            pluginId: getShortPluginId(plugin),
            generatedInputs: Object.keys(parsed[0].inputs),
          };
        }
        return testCase;
      }
    }
    // Fall back to original behavior for prompts without inputs
    return createTestCase(injectVar, prompt, plugin);
  });
}
