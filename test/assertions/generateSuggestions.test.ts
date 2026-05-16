import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateAssertionSuggestions } from '../../src/assertions/generateSuggestions';
import { getDefaultProviders } from '../../src/providers/defaults';
import { loadApiProvider } from '../../src/providers/index';
import { createMockProvider } from '../factories/provider';

import type { DefaultProviders } from '../../src/types/index';

vi.mock('../../src/providers/defaults', () => ({
  getDefaultProviders: vi.fn(),
}));

vi.mock('../../src/providers/index', () => ({
  loadApiProvider: vi.fn(),
}));

const createDefaultProviders = (
  provider: ReturnType<typeof createMockProvider>,
): DefaultProviders => ({
  embeddingProvider: provider,
  gradingJsonProvider: provider,
  gradingProvider: provider,
  moderationProvider: provider,
  suggestionsProvider: provider,
  synthesizeProvider: provider,
});

describe('generateAssertionSuggestions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('uses the default synthesize provider and converts generated questions into assertions', async () => {
    const provider = createMockProvider({
      response: {
        output: JSON.stringify({
          questions: [
            {
              label: 'Instruction Coverage',
              question: 'Does the response address every requested step?',
              question_source: 'implied_in_instructions',
              question_type: 'core_for_application',
            },
          ],
        }),
      },
    });
    vi.mocked(getDefaultProviders).mockResolvedValue(createDefaultProviders(provider));

    const assertions = await generateAssertionSuggestions({
      prompts: ['Summarize the release notes faithfully.'],
      outputs: ['The release adds retry support and post-hoc assertions.'],
      existingAssertions: [{ type: 'contains', value: 'retry support' }],
      numAssertions: 1,
    });

    expect(getDefaultProviders).toHaveBeenCalledTimes(1);
    expect(loadApiProvider).not.toHaveBeenCalled();
    expect(provider.callApi).toHaveBeenCalledTimes(1);
    expect(provider.callApi).toHaveBeenCalledWith(
      expect.stringContaining('Summarize the release notes faithfully.'),
    );
    expect(provider.callApi).toHaveBeenCalledWith(
      expect.stringContaining('The release adds retry support and post-hoc assertions.'),
    );
    expect(provider.callApi).toHaveBeenCalledWith(
      expect.stringContaining('"value": "retry support"'),
    );
    expect(assertions).toEqual([
      {
        type: 'llm-rubric',
        metric: 'Instruction Coverage',
        value: 'Does the response address every requested step?',
      },
    ]);
  });

  it('loads an explicit provider, appends instructions, truncates long outputs, and keeps the requested assertion type', async () => {
    const provider = createMockProvider({
      response: {
        output: {
          questions: [
            {
              label: 'Grounding',
              question: 'Does the response avoid unsupported claims?',
              question_source: 'fully_newly_generated',
              question_type: 'horizontal',
            },
            {
              label: 'Format',
              question: 'Does the response use the requested JSON structure?',
              question_source: 'implied_in_instructions',
              question_type: 'format_check',
            },
          ],
        },
      },
    });
    vi.mocked(loadApiProvider).mockResolvedValue(provider);

    const assertions = await generateAssertionSuggestions({
      prompts: ['Return a compact JSON report.'],
      outputs: ['x'.repeat(1001)],
      instructions: 'Prefer safety-focused evaluation questions.',
      numAssertions: 2,
      provider: 'openai:chat:gpt-5.4',
      type: 'g-eval',
    });

    expect(getDefaultProviders).not.toHaveBeenCalled();
    expect(loadApiProvider).toHaveBeenCalledWith('openai:chat:gpt-5.4');
    expect(provider.callApi).toHaveBeenCalledWith(
      expect.stringContaining(
        'Additional instructions: Prefer safety-focused evaluation questions.',
      ),
    );
    expect(provider.callApi).toHaveBeenCalledWith(
      expect.stringContaining(`${'x'.repeat(1000)}...`),
    );
    expect(assertions).toHaveLength(2);
    expect(assertions).toEqual(
      expect.arrayContaining([
        {
          type: 'g-eval',
          metric: 'Grounding',
          value: 'Does the response avoid unsupported claims?',
        },
        {
          type: 'g-eval',
          metric: 'Format',
          value: 'Does the response use the requested JSON structure?',
        },
      ]),
    );
  });

  it('rejects missing prompts or outputs before calling a provider', async () => {
    await expect(
      generateAssertionSuggestions({
        prompts: [],
        outputs: ['Observed output'],
      }),
    ).rejects.toThrow('At least one prompt is required for assertion generation.');

    await expect(
      generateAssertionSuggestions({
        prompts: ['Observed prompt'],
        outputs: [],
      }),
    ).rejects.toThrow('At least one output is required for assertion generation.');

    expect(getDefaultProviders).not.toHaveBeenCalled();
    expect(loadApiProvider).not.toHaveBeenCalled();
  });

  it('rejects provider responses without parseable suggestion payloads', async () => {
    const missingOutputProvider = createMockProvider({
      response: {
        output: undefined,
      },
    });
    vi.mocked(getDefaultProviders).mockResolvedValue(createDefaultProviders(missingOutputProvider));

    await expect(
      generateAssertionSuggestions({
        prompts: ['Prompt'],
        outputs: ['Output'],
      }),
    ).rejects.toThrow('Provider response must have output');

    const invalidJsonProvider = createMockProvider({
      response: {
        output: 'not valid JSON',
      },
    });
    vi.mocked(loadApiProvider).mockResolvedValue(invalidJsonProvider);

    await expect(
      generateAssertionSuggestions({
        prompts: ['Prompt'],
        outputs: ['Output'],
        provider: 'custom-provider',
      }),
    ).rejects.toThrow('Expected at least one JSON object in the response, got 0');
  });
});
