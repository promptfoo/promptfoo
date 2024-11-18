import { PromptfooHarmfulCompletionProvider } from '../../../providers/promptfoo';
import type { PluginActionParams, TestCase } from '../../../types';
import { retryWithDeduplication, sampleArray } from '../../../util/generation';
import { sleep } from '../../../util/time';
import type { UNALIGNED_PROVIDER_HARM_PLUGINS } from '../../constants';
import { parseGeneratedPrompts } from '../base';
import { createTestCase } from './common';

export const PLUGIN_ID = 'promptfoo:redteam:harmful';

export async function getHarmfulTests(
  { purpose, injectVar, n, delayMs = 0 }: PluginActionParams,
  plugin: keyof typeof UNALIGNED_PROVIDER_HARM_PLUGINS,
): Promise<TestCase[]> {
  const unalignedProvider = new PromptfooHarmfulCompletionProvider({
    purpose,
    n,
    harmCategory: plugin,
  });

  const generatePrompts = async (): Promise<{ prompt: string }[]> => {
    const result = await unalignedProvider.callApi('');
    if (result.output) {
      if (delayMs > 0) {
        await sleep(delayMs);
      }
      return parseGeneratedPrompts(result.output);
    }
    return [];
  };
  const allPrompts = await retryWithDeduplication(generatePrompts, n);
  return sampleArray(allPrompts, n).map(({ prompt }) => createTestCase(injectVar, prompt, plugin));
}
