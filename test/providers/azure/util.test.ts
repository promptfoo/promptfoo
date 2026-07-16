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

  it('uses long-context pricing for GPT-5.4 above the 272k threshold', () => {
    expect(calculateAzureCost('gpt-5.4', {}, 272_000, 1_000)).toBeCloseTo(
      (272_000 * 2.5 + 1_000 * 15) / 1e6,
      12,
    );
    expect(calculateAzureCost('gpt-5.4', {}, 272_001, 1_000)).toBeCloseTo(
      (272_001 * 5 + 1_000 * 22.5) / 1e6,
      12,
    );
  });

  it('uses long-context pricing for GPT-5.4 pro above the 272k threshold', () => {
    expect(calculateAzureCost('gpt-5.4-pro', {}, 272_000, 1_000)).toBeCloseTo(
      (272_000 * 30 + 1_000 * 180) / 1e6,
      12,
    );
    expect(calculateAzureCost('gpt-5.4-pro', {}, 272_001, 1_000)).toBeCloseTo(
      (272_001 * 60 + 1_000 * 270) / 1e6,
      12,
    );
  });

  it('uses long-context pricing for GPT-5.5 above the 272k threshold', () => {
    expect(calculateAzureCost('gpt-5.5', {}, 272_000, 1_000)).toBeCloseTo(
      (272_000 * 5 + 1_000 * 30) / 1e6,
      12,
    );
    expect(calculateAzureCost('gpt-5.5', {}, 272_001, 1_000)).toBeCloseTo(
      (272_001 * 10 + 1_000 * 45) / 1e6,
      12,
    );
  });

  it.each([
    { id: 'gpt-5.6', input: 5, output: 30, longInput: 10, longOutput: 45 },
    { id: 'gpt-5.6-sol', input: 5, output: 30, longInput: 10, longOutput: 45 },
    { id: 'gpt-5.6-terra', input: 2.5, output: 15, longInput: 5, longOutput: 22.5 },
    { id: 'gpt-5.6-luna', input: 1, output: 6, longInput: 2, longOutput: 9 },
    { id: 'gpt-5.5-pro', input: 30, output: 180, longInput: 60, longOutput: 270 },
    {
      id: 'gpt-5.5-pro-2026-04-23',
      input: 30,
      output: 180,
      longInput: 60,
      longOutput: 270,
    },
  ])('uses the correct standard and long-context pricing for $id', ({
    id,
    input,
    output,
    longInput,
    longOutput,
  }) => {
    expect(calculateAzureCost(id, {}, 272_000, 1_000)).toBeCloseTo(
      (272_000 * input + 1_000 * output) / 1e6,
      12,
    );
    expect(calculateAzureCost(id, {}, 272_001, 1_000)).toBeCloseTo(
      (272_001 * longInput + 1_000 * longOutput) / 1e6,
      12,
    );
  });

  it.each([
    {
      id: 'gpt-5.6',
      input: 5,
      cached: 0.5,
      output: 30,
      longInput: 10,
      longCached: 1,
      longOutput: 45,
    },
    {
      id: 'gpt-5.6-sol',
      input: 5,
      cached: 0.5,
      output: 30,
      longInput: 10,
      longCached: 1,
      longOutput: 45,
    },
    {
      id: 'gpt-5.6-terra',
      input: 2.5,
      cached: 0.25,
      output: 15,
      longInput: 5,
      longCached: 0.5,
      longOutput: 22.5,
    },
    {
      id: 'gpt-5.6-luna',
      input: 1,
      cached: 0.1,
      output: 6,
      longInput: 2,
      longCached: 0.2,
      longOutput: 9,
    },
    {
      id: 'gpt-5.5-pro',
      input: 30,
      cached: 3,
      output: 180,
      longInput: 60,
      longCached: 6,
      longOutput: 270,
    },
    {
      id: 'gpt-5.5-pro-2026-04-23',
      input: 30,
      cached: 3,
      output: 180,
      longInput: 60,
      longCached: 6,
      longOutput: 270,
    },
  ])('uses the correct cached-input rate for $id', ({
    id,
    input,
    cached,
    output,
    longInput,
    longCached,
    longOutput,
  }) => {
    expect(calculateAzureCost(id, {}, 2_000, 1_000, 500)).toBeCloseTo(
      (1_500 * input + 500 * cached + 1_000 * output) / 1e6,
      12,
    );
    expect(calculateAzureCost(id, {}, 272_001, 1_000, 1_000)).toBeCloseTo(
      (271_001 * longInput + 1_000 * longCached + 1_000 * longOutput) / 1e6,
      12,
    );
  });

  it.each([
    {
      id: 'gpt-5.6',
      input: 5,
      cached: 0.5,
      output: 30,
      longInput: 10,
      longCached: 1,
      longOutput: 45,
    },
    {
      id: 'gpt-5.6-sol',
      input: 5,
      cached: 0.5,
      output: 30,
      longInput: 10,
      longCached: 1,
      longOutput: 45,
    },
    {
      id: 'gpt-5.6-terra',
      input: 2.5,
      cached: 0.25,
      output: 15,
      longInput: 5,
      longCached: 0.5,
      longOutput: 22.5,
    },
    {
      id: 'gpt-5.6-luna',
      input: 1,
      cached: 0.1,
      output: 6,
      longInput: 2,
      longCached: 0.2,
      longOutput: 9,
    },
  ])('uses the priority-tier rate for $id', ({
    id,
    input,
    cached,
    output,
    longInput,
    longCached,
    longOutput,
  }) => {
    const config = { passthrough: { service_tier: 'priority' } };
    expect(calculateAzureCost(id, config, 2_000, 1_000, 500)).toBeCloseTo(
      (2 * (1_500 * input + 500 * cached + 1_000 * output)) / 1e6,
      12,
    );
    expect(calculateAzureCost(id, config, 272_001, 1_000, 1_000)).toBeCloseTo(
      (2 * (271_001 * longInput + 1_000 * longCached + 1_000 * longOutput)) / 1e6,
      12,
    );
  });

  it.each([
    { id: 'gpt-realtime', input: 4, output: 16, audioInput: 32, audioOutput: 64 },
    { id: 'gpt-realtime-2025-08-28', input: 4, output: 16, audioInput: 32, audioOutput: 64 },
    { id: 'gpt-realtime-1.5', input: 4, output: 16, audioInput: 32, audioOutput: 64 },
    { id: 'gpt-realtime-1.5-2026-02-23', input: 4, output: 16, audioInput: 32, audioOutput: 64 },
    { id: 'gpt-realtime-mini', input: 0.6, output: 2.4, audioInput: 10, audioOutput: 20 },
    {
      id: 'gpt-realtime-mini-2025-10-06',
      input: 0.6,
      output: 2.4,
      audioInput: 10,
      audioOutput: 20,
    },
    { id: 'gpt-audio', input: 2.5, output: 10, audioInput: 32, audioOutput: 64 },
    { id: 'gpt-audio-2025-08-28', input: 2.5, output: 10, audioInput: 40, audioOutput: 80 },
    { id: 'gpt-audio-1.5', input: 2.5, output: 10, audioInput: 32, audioOutput: 64 },
    { id: 'gpt-audio-1.5-2026-02-23', input: 2.5, output: 10, audioInput: 40, audioOutput: 80 },
    { id: 'gpt-audio-mini', input: 0.6, output: 2.4, audioInput: 10, audioOutput: 20 },
    { id: 'gpt-audio-mini-2025-10-06', input: 0.6, output: 2.4, audioInput: 10, audioOutput: 20 },
    { id: 'gpt-4o-realtime-preview', input: 5, output: 20, audioInput: 40, audioOutput: 80 },
    {
      id: 'gpt-4o-realtime-preview-2024-10-01',
      input: 5,
      output: 20,
      audioInput: 100,
      audioOutput: 200,
    },
    {
      id: 'gpt-4o-realtime-preview-2024-12-17',
      input: 5,
      output: 20,
      audioInput: 40,
      audioOutput: 80,
    },
    {
      id: 'gpt-4o-realtime-preview-2025-06-03',
      input: 5,
      output: 20,
      audioInput: 40,
      audioOutput: 80,
    },
    {
      id: 'gpt-4o-mini-realtime-preview',
      input: 0.6,
      output: 2.4,
      audioInput: 10,
      audioOutput: 20,
    },
    {
      id: 'gpt-4o-mini-realtime-preview-2024-12-17',
      input: 0.6,
      output: 2.4,
      audioInput: 10,
      audioOutput: 20,
    },
    { id: 'gpt-4o-audio-preview', input: 2.5, output: 10, audioInput: 40, audioOutput: 80 },
    {
      id: 'gpt-4o-audio-preview-2024-12-17',
      input: 2.5,
      output: 10,
      audioInput: 40,
      audioOutput: 80,
    },
    { id: 'gpt-4o-mini-audio-preview', input: 0.15, output: 0.6, audioInput: 10, audioOutput: 20 },
    {
      id: 'gpt-4o-mini-audio-preview-2024-12-17',
      input: 2.5,
      output: 10,
      audioInput: 40,
      audioOutput: 80,
    },
  ])('uses the correct audio-token rates for $id', ({
    id,
    input,
    output,
    audioInput,
    audioOutput,
  }) => {
    expect(calculateAzureCost(id, {}, 1_000, 500, 0, 200, 100)).toBeCloseTo(
      (800 * input + 200 * audioInput + 400 * output + 100 * audioOutput) / 1e6,
      12,
    );
  });

  it('clamps invalid cached and audio token counts to the reported totals', () => {
    expect(
      calculateAzureCost('gpt-audio-1.5-2026-02-23', {}, 1_000, 500, -10, 2_000, 1_000),
    ).toBeCloseTo((1_000 * 40 + 500 * 80) / 1e6, 12);
  });

  it('uses the discounted cached-text rate for the dated gpt-realtime-mini snapshot', () => {
    expect(calculateAzureCost('gpt-realtime-mini-2025-10-06', {}, 1_000, 0, 1_000)).toBeCloseTo(
      1_000 * (0.06 / 1e6),
      12,
    );
  });

  it('does not apply the dated cached-text discount to the undated gpt-realtime-mini alias', () => {
    expect(calculateAzureCost('gpt-realtime-mini', {}, 1_000, 0, 1_000)).toBeCloseTo(
      1_000 * (0.6 / 1e6),
      12,
    );
  });

  it('uses the discounted cached-text rate for the undated gpt-realtime alias', () => {
    expect(calculateAzureCost('gpt-realtime', {}, 1_000, 0, 1_000)).toBeCloseTo(
      1_000 * (0.4 / 1e6),
      12,
    );
  });

  it.each([
    ['gpt-5', 0.125],
    ['gpt-5.5', 0.5],
    ['gpt-5.4', 0.25],
    ['gpt-5.2-2025-12-11', 0.175],
    ['gpt-5.1-codex-mini-2025-11-13', 0.025],
    ['gpt-4.1', 0.5],
    ['gpt-4.1-mini', 0.1],
    ['gpt-4.1-nano', 0.025],
    ['gpt-4o', 1.25],
    ['o4-mini', 0.275],
    ['o3-mini', 0.55],
    ['claude-opus-4-6-20260205', 0.5],
  ])('uses the catalog cached-input rate for %s', (id, cachedInput) => {
    expect(calculateAzureCost(id, {}, 1_000, 0, 1_000)).toBeCloseTo(
      (1_000 * cachedInput) / 1e6,
      12,
    );
  });

  it('uses cached and priority pricing for existing GPT-5 models', () => {
    expect(
      calculateAzureCost(
        'gpt-5.5',
        { passthrough: { service_tier: 'priority' } },
        2_000,
        1_000,
        500,
      ),
    ).toBeCloseTo(0.0755, 12);
    expect(
      calculateAzureCost('gpt-5.4', { service_tier: 'priority' } as any, 272_001, 1_000, 1_000),
    ).toBeCloseTo((271_001 * 5 + 1_000 * 0.5 + 1_000 * 22.5) / 1e6, 12);
    expect(
      calculateAzureCost(
        'gpt-5.4',
        { service_tier: 'priority', passthrough: { service_tier: 'standard' } } as any,
        1_000,
        1_000,
      ),
    ).toBeCloseTo((1_000 * 2.5 + 1_000 * 15) / 1e6, 12);
    expect(
      calculateAzureCost(
        'gpt-5.1-codex-mini-2025-11-13',
        { passthrough: { service_tier: 'priority' } },
        2_000,
        1_000,
        500,
      ),
    ).toBeCloseTo((1.8 * (1_500 * 0.25 + 500 * 0.025 + 1_000 * 2)) / 1e6, 12);
    expect(
      calculateAzureCost(
        'gpt-5.2-chat-2025-12-11',
        { passthrough: { service_tier: 'priority' } },
        2_000,
        1_000,
        500,
      ),
    ).toBeCloseTo((2 * (1_500 * 1.75 + 500 * 0.175 + 1_000 * 14)) / 1e6, 12);
  });

  it.each([
    ['gpt-5.4-pro', 60, 6, 270],
    ['gpt-5.4-pro-2026-03-05', 60, 6, 270],
    ['gpt-5.4-mini', 0.75, 0.075, 4.5],
    ['gpt-5.4-mini-2026-03-17', 0.75, 0.075, 4.5],
    ['gpt-5.4-nano', 0.2, 0.02, 1.25],
    ['gpt-5.4-nano-2026-03-17', 0.2, 0.02, 1.25],
  ])('uses the supported Azure tier rates without a priority surcharge for %s', (id, input, cached, output) => {
    expect(
      calculateAzureCost(id, { passthrough: { service_tier: 'priority' } }, 272_001, 1_000, 1_000),
    ).toBeCloseTo((271_001 * input + 1_000 * cached + 1_000 * output) / 1e6, 12);
  });

  it('prices Phi-4 multimodal audio input using the Foundry audio-token rate', () => {
    expect(calculateAzureCost('Phi-4-multimodal-instruct', {}, 1_000, 1_000, 0, 1_000)).toBeCloseTo(
      (1_000 * 4 + 1_000 * 0.32) / 1e6,
      12,
    );
  });

  it.each([
    'gpt-4o-mini-tts',
    'gpt-4o-mini-tts-2025-03-20',
  ])('prices %s text input and audio output using the current Azure rates', (id) => {
    expect(calculateAzureCost(id, {}, 1_000, 1_000, 0, 0, 1_000)).toBeCloseTo(
      (1_000 * 2.5 + 1_000 * 12) / 1e6,
      12,
    );
  });

  it.each([
    ['gpt-image-1', 5, 1.25, 10, 40],
    ['gpt-image-1-mini', 2, 0.2, 2.5, 8],
    ['gpt-image-1.5', 5, 1.25, 8, 32],
  ])('prices Azure image-token usage for %s', (id, input, cached, imageInput, output) => {
    expect(calculateAzureCost(id, {}, 1_000, 100, 100, 0, 0, 400, 0, 100)).toBeCloseTo(
      (600 * input + 300 * imageInput + 100 * cached + 100 * output) / 1e6,
      12,
    );
  });

  it.each([
    'gpt-image-2',
    'gpt-image-2-2026-04-21',
  ])('prices Azure image input and output tokens for %s', (id) => {
    expect(calculateAzureCost(id, {}, 1_000, 1_000, 100, 0, 0, 400, 0, 100, 600)).toBeCloseTo(
      (600 * 5 + 300 * 8 + 100 * 1.25 + 400 * 10 + 600 * 30) / 1e6,
      12,
    );
  });

  it.each([
    {
      id: 'gpt-realtime-mini-2025-10-06',
      input: 0.6,
      cachedText: 0.06,
      cachedAudio: 0.3,
      cachedImage: 0.08,
      output: 2.4,
      audioOutput: 20,
    },
    {
      id: 'gpt-realtime-1.5',
      input: 4,
      cachedText: 0.4,
      cachedAudio: 0.4,
      cachedImage: 0.5,
      output: 16,
      audioOutput: 64,
    },
    {
      id: 'gpt-realtime-1.5-2026-02-23',
      input: 4,
      cachedText: 4,
      cachedAudio: 4,
      cachedImage: 0.5,
      output: 16,
      audioOutput: 64,
    },
  ])('prices cached realtime modalities separately for $id', ({
    id,
    input,
    cachedText,
    cachedAudio,
    cachedImage,
    output,
    audioOutput,
  }) => {
    expect(calculateAzureCost(id, {}, 1_030, 30, 100, 20, 10, 10, 20, 10)).toBeCloseTo(
      (930 * input +
        70 * cachedText +
        20 * cachedAudio +
        10 * cachedImage +
        20 * output +
        10 * audioOutput) /
        1e6,
      12,
    );
  });

  it.each([
    ['gpt-realtime-mini-2025-10-06', 0.8],
    ['gpt-realtime-1.5', 5],
    ['gpt-realtime-1.5-2026-02-23', 5],
  ])('prices uncached realtime image tokens for %s', (id, imageInput) => {
    expect(calculateAzureCost(id, {}, 100, 0, 0, 0, 0, 100)).toBeCloseTo(
      (100 * imageInput) / 1e6,
      12,
    );
  });

  it('does not misclassify cached realtime audio as cached text', () => {
    expect(
      calculateAzureCost('gpt-realtime-mini-2025-10-06', {}, 1_000, 0, 500, 800, 0, 0, 500),
    ).toBeCloseTo((200 * 0.6 + 300 * 10 + 500 * 0.3) / 1e6, 12);
  });

  it('uses the higher cached-audio rate for the 2024 realtime snapshot', () => {
    expect(
      calculateAzureCost('gpt-4o-realtime-preview-2024-10-01', {}, 1_000, 0, 500, 1_000, 0, 0, 500),
    ).toBeCloseTo((500 * 100 + 500 * 20) / 1e6, 12);
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

  it.each([
    {
      id: 'gpt-5.4',
      inputTokens: 1000,
      outputTokens: 1000,
      expectedCost: 0.0175, // $2.50/1M input + $15/1M output
      family: 'GPT-5.x',
    },
    { id: 'gpt-4.1', inputTokens: 1000, outputTokens: 1000, expectedCost: 0.01, family: 'GPT-4.1' },
    { id: 'gpt-4o', inputTokens: 1000, outputTokens: 1000, expectedCost: 0.0125, family: 'GPT-4o' },
    {
      id: 'o3',
      inputTokens: 1000,
      outputTokens: 1000,
      expectedCost: 0.01, // $2/1M input + $8/1M output (June 2025 price cut)
      family: 'o-series reasoning',
    },
    {
      id: 'text-embedding-3-large',
      inputTokens: 1000,
      outputTokens: 0,
      expectedCost: 0.00013,
      family: 'embeddings',
    },
    {
      id: 'gpt-image-1',
      inputTokens: 1000,
      outputTokens: 1000,
      expectedCost: 0.045,
      family: 'image',
    },
    {
      id: 'claude-opus-4-7',
      inputTokens: 1000,
      outputTokens: 1000,
      expectedCost: 0.03,
      family: 'Anthropic Claude',
    },
    {
      id: 'Llama-3.3-70B-Instruct',
      inputTokens: 1000,
      outputTokens: 1000,
      expectedCost: 0.00074,
      family: 'Meta Llama',
    },
    {
      id: 'DeepSeek-R1',
      inputTokens: 1000,
      outputTokens: 1000,
      expectedCost: 0.00274,
      family: 'DeepSeek',
    },
    {
      id: 'grok-4',
      inputTokens: 1000,
      outputTokens: 1000,
      expectedCost: 0.018,
      family: 'xAI Grok',
    },
    {
      id: 'Kimi-K2-Thinking',
      inputTokens: 1000,
      outputTokens: 1000,
      expectedCost: 0.0031,
      family: 'MoonshotAI Kimi',
    },
    {
      id: 'Phi-4',
      inputTokens: 1000,
      outputTokens: 1000,
      expectedCost: 0.00021,
      family: 'Microsoft Phi',
    },
    {
      id: 'Mistral-Large-3',
      inputTokens: 1000,
      outputTokens: 1000,
      expectedCost: 0.002,
      family: 'Mistral',
    },
    {
      id: 'Cohere-command-r',
      inputTokens: 1000,
      outputTokens: 1000,
      expectedCost: 0.00075,
      family: 'Cohere',
    },
    {
      id: 'AI21-Jamba-1.5-Large',
      inputTokens: 1000,
      outputTokens: 1000,
      expectedCost: 0.001,
      family: 'AI21',
    },
    {
      id: 'MAI-DS-R1',
      inputTokens: 1000,
      outputTokens: 1000,
      expectedCost: 0.00274,
      family: 'Microsoft MAI',
    },
  ])('computes expected representative cost for $family ($id)', ({
    id,
    inputTokens,
    outputTokens,
    expectedCost,
  }) => {
    expect(calculateAzureCost(id, {}, inputTokens, outputTokens)).toBeCloseTo(expectedCost, 12);
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
    ['DeepSeek-V4-Pro', 'DeepSeek V4'],
    ['grok-4', 'xAI Grok'],
    ['grok-4.3', 'xAI Grok 4.3'],
    ['Kimi-K2-Thinking', 'MoonshotAI Kimi'],
    ['gpt-oss-120b', 'OpenAI open-weight'],
    ['gpt-5.1-codex-max', 'GPT-5.1 Codex Max'],
    ['Phi-4', 'Microsoft Phi'],
    ['Phi-3-mini-4k-instruct', 'Phi-3 4K/8K variants'],
    ['Mistral-Large-3', 'Mistral'],
    ['Cohere-command-r', 'Cohere'],
    ['AI21-Jamba-1.5-Large', 'AI21'],
    ['MAI-DS-R1', 'Microsoft MAI'],
  ])('prices the %s family (%s)', (id) => {
    expect(calculateAzureCost(id, {}, 1000, 1000)).toBeGreaterThan(0);
  });

  // Exact standard-tier per-1M input/output rates for entries added/corrected from official
  // pricing sources. Probing input and output separately catches a swapped input/output or a
  // transcription typo. Input is probed at 100k tokens — below every long-context threshold —
  // so tiered models (gpt-5.4-pro, gpt-5.5) assert their standard input rate here, while the
  // long-context tiers are pinned by the dedicated boundary tests above.
  it.each([
    ['gpt-5.6', 5, 30],
    ['gpt-5.6-sol', 5, 30],
    ['gpt-5.6-terra', 2.5, 15],
    ['gpt-5.6-luna', 1, 6],
    ['gpt-5.5', 5, 30],
    ['gpt-5.5-pro', 30, 180],
    ['gpt-5.5-pro-2026-04-23', 30, 180],
    ['gpt-5.2', 1.75, 14],
    ['gpt-5.2-pro', 21, 168],
    ['gpt-5.2-pro-2025-12-11', 21, 168],
    ['gpt-5.1-codex-max', 1.25, 10],
    ['gpt-5', 1.25, 10],
    ['gpt-5-pro', 15, 120],
    ['gpt-5-mini', 0.25, 2],
    ['gpt-5-nano', 0.05, 0.4],
    ['gpt-5-chat', 1.25, 10],
    ['gpt-5-codex', 1.25, 10],
    ['gpt-5.1', 1.25, 10],
    ['gpt-5.1-chat', 1.25, 10],
    ['gpt-5.1-codex', 1.25, 10],
    ['gpt-5.1-codex-mini', 0.25, 2],
    ['gpt-5.4-pro', 30, 180],
    ['gpt-5.4-mini', 0.75, 4.5],
    ['gpt-5.4-nano', 0.2, 1.25],
    ['Phi-4-multimodal-instruct', 0.08, 0.32],
    ['claude-haiku-4-5', 1, 5],
    ['claude-haiku-4-5-20251001', 1, 5],
    ['o3', 2, 8],
    ['gpt-realtime', 4, 16],
    ['gpt-realtime-1.5', 4, 16],
    ['gpt-realtime-1.5-2026-02-23', 4, 16],
    ['gpt-audio-1.5-2026-02-23', 2.5, 10],
    ['gpt-audio-1.5', 2.5, 10],
    ['gpt-audio-mini', 0.6, 2.4],
    ['gpt-4o-mini-transcribe', 1.25, 5],
    ['gpt-4o-mini-tts', 2.5, 10],
    ['gpt-4o-mini-tts-2025-03-20', 2.5, 10],
    ['grok-code-fast-1', 0.2, 1.5],
    ['grok-4.3', 1.25, 2.5],
    ['grok-4-1-fast-reasoning', 0.2, 0.5],
    ['Kimi-K2-Thinking', 0.6, 2.5],
    ['Kimi-K2.6', 0.95, 4],
    ['DeepSeek-V3.2', 0.58, 1.68],
    ['DeepSeek-V4-Pro', 1.74, 3.48],
    ['gpt-oss-120b', 0.15, 0.6],
    ['Phi-3-medium-4k-instruct', 0.17, 0.68],
  ])('prices %s at exactly %d in / %d out per 1M', (id, inputPerM, outputPerM) => {
    expect(calculateAzureCost(id, {}, 100_000, 0)).toBeCloseTo((inputPerM as number) / 10, 9);
    expect(calculateAzureCost(id, {}, 0, 1_000_000)).toBeCloseTo(outputPerM as number, 9);
  });
});
