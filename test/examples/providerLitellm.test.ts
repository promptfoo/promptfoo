import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { OpenAiEmbeddingProvider } from '../../src/providers/openai/embedding';
import { resolveConfigs } from '../../src/util/config/load';

vi.mock('../../src/telemetry');

afterEach(() => {
  vi.restoreAllMocks();
  cliState.config = undefined;
  cliState.selectedProviderConfigs = undefined;
  cliState.basePath = undefined;
});

describe('LiteLLM example', () => {
  it('pairs each rendered prompt with its own assertions for all three providers', async () => {
    const { config, testSuite } = await resolveConfigs(
      { config: [path.resolve(__dirname, '../../examples/provider-litellm/promptfooconfig.yaml')] },
      {},
    );
    const translationPrompt = 'Translate this to French: Hello, world!';
    const haikuPrompt =
      'Write a haiku about artificial intelligence. Return only the three lines of the poem.';
    const outputs = new Map([
      [translationPrompt, 'Bonjour, le monde!'],
      [haikuPrompt, 'Silent circuits hum\nIdeas bloom in silicon\nNew horizons dawn'],
    ]);
    const providers = testSuite.providers;
    expect(providers).toHaveLength(3);
    for (const provider of providers) {
      vi.spyOn(provider, 'callApi').mockImplementation(async (prompt) => {
        expect(outputs.has(prompt)).toBe(true);
        return { output: outputs.get(prompt) };
      });
    }
    const embeddings = vi
      .spyOn(OpenAiEmbeddingProvider.prototype, 'callEmbeddingApi')
      .mockResolvedValue({ embedding: [1, 0] });

    const evaluation = new Eval(config);
    await evaluate(testSuite, evaluation, { cache: false, maxConcurrency: 1 });
    const summary = await evaluation.toEvaluateSummary();

    expect(summary.results).toHaveLength(6);
    expect(summary.stats).toMatchObject({ successes: 6, failures: 0, errors: 0 });
    for (const provider of providers) {
      expect(provider.callApi).toHaveBeenCalledTimes(2);
      const results = summary.results.filter((result) => result.provider.id === provider.id());
      expect(results.map((result) => result.prompt.raw).sort()).toEqual(
        [translationPrompt, haikuPrompt].sort(),
      );
      for (const result of results) {
        const isTranslation = result.prompt.raw === translationPrompt;
        expect(result.testCase.assert?.map((assertion) => assertion.type)).toEqual(
          isTranslation ? ['contains', 'similar'] : ['javascript'],
        );
        expect(result.success).toBe(true);
        expect(result.score).toBe(1);
        expect(result.error).toBeUndefined();
      }
    }
    expect(embeddings).toHaveBeenCalled();
    for (const [text] of embeddings.mock.calls) {
      expect(text).toBe('Bonjour, le monde!');
    }
  });
});
