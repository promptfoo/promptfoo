import { PromptfooHarmfulCompletionProvider } from '../../../providers/promptfoo';
import type { PluginActionParams, TestCase } from '../../../types';
import { sampleArray } from '../../../util/generation';
import { sleep } from '../../../util/time';
import type { UNALIGNED_PROVIDER_HARM_PLUGINS } from '../../constants';
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
  const tests: TestCase[] = [];
  for (let i = 0; i < n; i++) {
    const result = await unalignedProvider.callApi('');
    if (result.output) {
      tests.push(createTestCase(injectVar, result.output, plugin));
    }
    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }
  return sampleArray<TestCase>(tests, n);
}
