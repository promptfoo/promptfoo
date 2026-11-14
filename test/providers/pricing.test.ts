import { describe, expect, it } from 'vitest';
import { getModelPricing } from '../../src/providers/pricing';

describe('getModelPricing', () => {
  it('lets custom providers estimate text-token cost from the Anthropic catalog', () => {
    const pricing = getModelPricing('anthropic', 'claude-3-haiku-20240307');
    expect(pricing).toEqual({ input: 0.00025 / 1000, output: 0.00125 / 1000 });
    expect(pricing!.input * 1000 + pricing!.output * 1000).toBeCloseTo(0.0015);
  });

  it('recognizes cataloged OpenAI aliases and snapshots', () => {
    const pricing = getModelPricing('openai', 'gpt-4o-mini');
    expect(pricing).toEqual({ input: 0.15 / 1e6, output: 0.6 / 1e6 });
    expect(getModelPricing('openai', 'gpt-4o-mini-2024-07-18')).toEqual(pricing);
  });

  it.each([
    ['openai', 'not-a-model'],
    ['openai', 'gpt-5.3-codex-spark'],
    ['anthropic', 'gpt-4o-mini'],
    ['azure', 'gpt-4o-mini'],
    ['constructor', 'gpt-4o-mini'],
    ['', ''],
  ])('returns undefined instead of guessing rates for %s/%s', (provider, model) => {
    expect(getModelPricing(provider, model)).toBeUndefined();
  });

  it('copies nested long-context rates without exposing the shared billing table', () => {
    const original = getModelPricing('openai', 'gpt-5.4');
    const copy = getModelPricing('openai', 'gpt-5.4');
    expect(copy?.longContext).toEqual({
      threshold: 272_000,
      input: 5 / 1e6,
      output: 22.5 / 1e6,
    });
    copy!.input = 0;
    copy!.longContext!.input = 0;
    copy!.longContext!.threshold = 0;

    expect(getModelPricing('openai', 'gpt-5.4')).toEqual(original);
  });

  it('returns only text-token rates for a model with audio pricing', () => {
    expect(getModelPricing('openai', 'gpt-4o-mini-tts')).toEqual({
      input: 0.6 / 1e6,
      output: 0,
    });
  });
});
