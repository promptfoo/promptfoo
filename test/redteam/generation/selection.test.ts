import { describe, expect, it } from 'vitest';
import { selectPromptPortfolio } from '../../../src/redteam/generation/selection';
import { getPiiLeakTestsForCategory } from '../../../src/redteam/plugins/pii';
import { PromptExtractionPlugin } from '../../../src/redteam/plugins/promptExtraction';
import { createMockProvider } from '../../factories/provider';

describe('local prompt portfolios', () => {
  it('covers distinct topics before filling remaining slots in source order', () => {
    const prompts = ['select', 'join', 'column', 'query', 'column', ''];
    expect(selectPromptPortfolio('sql-injection', {}, prompts, 3)).toEqual([
      { __prompt: 'select', sourcePromptFeatures: ['query'] },
      { __prompt: 'column', sourcePromptFeatures: ['schema'] },
      { __prompt: 'join', sourcePromptFeatures: ['query'] },
    ]);
    expect(selectPromptPortfolio('sql-injection', {}, prompts, 20)).toHaveLength(4);
    expect(selectPromptPortfolio('sql-injection', {}, prompts, 0)).toEqual([]);
    expect(selectPromptPortfolio('other', {}, prompts, 2)).toBeUndefined();
  });

  it.each([
    { language: 'Spanish' },
    { examples: ['custom'] },
    { inputs: { question: 'Input' } },
    { modifiers: { testGenerationInstructions: 'Use my topics' } },
  ])('leaves customized batches unchanged with %o', (config) => {
    expect(selectPromptPortfolio('pii:direct', config, ['home'], 1)).toBeUndefined();
  });

  it('keeps labels attached to the correct prompt when materializing sorted tests', async () => {
    const provider = createMockProvider({
      response: { output: 'Prompt: markdown\nPrompt: JSON\nPrompt: guidelines' },
    });
    const tests = await new PromptExtractionPlugin(provider, 'review', 'text', {}).generateTests(
      2,
      0,
    );
    expect(tests).toMatchObject([
      { vars: { text: 'guidelines' }, metadata: { sourcePromptFeatures: ['instructions'] } },
      { vars: { text: 'markdown' }, metadata: { sourcePromptFeatures: ['format'] } },
    ]);
    expect(provider.callApi).toHaveBeenCalledOnce();
  });

  it('stores only topic labels in local PII diagnostics', async () => {
    const provider = createMockProvider({
      response: { output: 'Prompt: email\nPrompt: phone\nPrompt: bank\nPrompt: note' },
    });
    const tests = await getPiiLeakTestsForCategory(
      { provider, purpose: 'review', injectVar: 'text', n: 2, delayMs: 0, config: {} },
      'pii:direct',
    );
    expect(tests.map((test) => test.metadata)).toEqual([
      { sourcePromptFeatures: ['contact'] },
      { sourcePromptFeatures: ['finance'] },
    ]);
    expect(provider.callApi).toHaveBeenCalledOnce();
  });
});
