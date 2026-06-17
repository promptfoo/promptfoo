import { describe, expect, it } from 'vitest';
import { AZURE_MODELS } from '../../../src/providers/azure/defaults';
import { calculateAzureCost, throwConfigurationError } from '../../../src/providers/azure/util';

describe('throwConfigurationError', () => {
  it('throws error with formatted message and docs link', () => {
    const message = 'Test error message';
    expect(() => throwConfigurationError(message)).toThrow(
      `${message}\n\nSee https://www.promptfoo.dev/docs/providers/azure/ to learn more about Azure configuration.`,
    );
  });
});

describe('calculateAzureCost', () => {
  it('calculates cost for valid model and tokens', () => {
    const cost = calculateAzureCost(
      'gpt-5.4',
      {},
      100, // prompt tokens
      50, // completion tokens
    );
    expect(cost).toBeDefined();
    expect(typeof cost).toBe('number');
  });

  it('calculates cost for dated GPT-5.4 mini snapshots', () => {
    const cost = calculateAzureCost('gpt-5.4-mini-2026-03-17', {}, 100, 50);
    expect(cost).toBeDefined();
    expect(typeof cost).toBe('number');
  });

  it('calculates cost for dated GPT-5.4 nano snapshots', () => {
    const cost = calculateAzureCost('gpt-5.4-nano-2026-03-17', {}, 100, 50);
    expect(cost).toBeDefined();
    expect(typeof cost).toBe('number');
  });

  it('calculates cost for Claude Fable 5', () => {
    expect(calculateAzureCost('claude-fable-5', {}, 1000, 500)).toBeCloseTo(0.035, 6);
  });

  it('returns undefined for unknown model', () => {
    const cost = calculateAzureCost('unknown-model', {}, 100, 50);
    expect(cost).toBeUndefined();
  });

  it('calculates cost for Microsoft MAI image models from output tokens', () => {
    // MAI-Image-2.5 bills image output at $33/1M tokens; input is unused here.
    const cost = calculateAzureCost('MAI-Image-2.5', {}, 0, 1000);
    expect(cost).toBeCloseTo(0.033, 6);
  });

  it('calculates cost for the MAI-DS-R1 reasoning model', () => {
    const cost = calculateAzureCost('MAI-DS-R1', {}, 100, 50);
    expect(cost).toBeDefined();
    expect(typeof cost).toBe('number');
  });

  it('returns undefined when tokens are undefined', () => {
    const cost = calculateAzureCost('gpt-4', {}, undefined, undefined);
    expect(cost).toBeUndefined();
  });

  it('returns zero cost with zero tokens', () => {
    const cost = calculateAzureCost('gpt-4', {}, 0, 0);
    expect(cost).toBe(0);
  });

  it('handles empty config object', () => {
    const cost = calculateAzureCost('gpt-4', {}, 100, 50);
    expect(cost).toBeDefined();
    expect(typeof cost).toBe('number');
  });

  it('handles undefined completion tokens', () => {
    const cost = calculateAzureCost('gpt-4', {}, 100, undefined);
    expect(cost).toBeUndefined();
  });

  it('handles undefined prompt tokens', () => {
    const cost = calculateAzureCost('gpt-4', {}, undefined, 50);
    expect(cost).toBeUndefined();
  });
});

describe('AZURE_MODELS cost coverage', () => {
  // Guards against the cost=0 / undefined-cost class: every supported model in the pricing
  // table must compute a positive, finite cost for non-zero token usage.
  it('every AZURE_MODELS entry computes a positive, finite cost', () => {
    const broken: string[] = [];
    for (const { id } of AZURE_MODELS) {
      const cost = calculateAzureCost(id, {}, 1000, 1000);
      if (typeof cost !== 'number' || !Number.isFinite(cost) || cost <= 0) {
        broken.push(`${id} => ${cost}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('has no duplicate model ids', () => {
    const ids = AZURE_MODELS.map((m) => m.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });

  // Spot-check that a representative of each supported family is priced (documents coverage and
  // fails loudly if a whole family is dropped from the table).
  it.each([
    ['gpt-5.4', 'GPT-5.x'],
    ['gpt-4.1', 'GPT-4.1'],
    ['gpt-4o', 'GPT-4o'],
    ['o3', 'o-series reasoning'],
    ['gpt-4o-mini-transcribe', 'audio/transcribe'],
    ['text-embedding-3-large', 'embeddings'],
    ['gpt-image-1', 'image'],
    ['claude-opus-4-7', 'Anthropic Claude'],
    ['Llama-3.3-70B-Instruct', 'Meta Llama'],
    ['DeepSeek-R1', 'DeepSeek'],
    ['grok-4', 'xAI Grok'],
    ['Phi-4', 'Microsoft Phi'],
    ['Mistral-Large-3', 'Mistral'],
    ['Cohere-command-r', 'Cohere'],
    ['AI21-Jamba-1.5-Large', 'AI21'],
    ['MAI-DS-R1', 'Microsoft MAI'],
  ])('prices the %s family (%s)', (id) => {
    expect(calculateAzureCost(id, {}, 1000, 1000)).toBeGreaterThan(0);
  });
});
