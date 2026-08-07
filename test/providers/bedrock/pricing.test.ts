import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  calculateBedrockCost,
  calculateBedrockInvokeModelCost,
} from '../../../src/providers/bedrock/pricing';

const INPUT_TOKENS = 10_000;
const OUTPUT_TOKENS = 5_000;
const costAtRates = (input: number, output: number) =>
  (INPUT_TOKENS / 1e6) * input + (OUTPUT_TOKENS / 1e6) * output;

describe('calculateBedrockCost', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    // Z.AI GLM — distinct per variant; -flash must not be priced as -4.7.
    { id: 'zai.glm-5', input: 1.0, output: 3.2 },
    { id: 'us.zai.glm-5', input: 1.0, output: 3.2 },
    { id: 'zai.glm-4.7', input: 0.6, output: 2.2 },
    { id: 'zai.glm-4.7-flash', input: 0.07, output: 0.4 },
    // MiniMax — M2 / M2.1 / M2.5 share base rates.
    { id: 'minimax.minimax-m2', input: 0.3, output: 1.2 },
    { id: 'minimax.minimax-m2.5', input: 0.3, output: 1.2 },
    // Moonshot Kimi — K2.5 and K2 Thinking differ on output rate.
    { id: 'moonshotai.kimi-k2.5', input: 0.6, output: 3.0 },
    { id: 'moonshot.kimi-k2-thinking', input: 0.6, output: 2.5 },
    // NVIDIA Nemotron — nano variants and super differ.
    { id: 'nvidia.nemotron-nano-9b-v2', input: 0.06, output: 0.23 },
    { id: 'nvidia.nemotron-nano-12b-v2', input: 0.2, output: 0.6 },
    { id: 'nvidia.nemotron-nano-3-30b', input: 0.06, output: 0.24 },
    { id: 'nvidia.nemotron-super-3-120b', input: 0.15, output: 0.65 },
    // Google Gemma 3 — per size.
    { id: 'google.gemma-3-4b-it', input: 0.04, output: 0.08 },
    { id: 'google.gemma-3-12b-it', input: 0.09, output: 0.29 },
    { id: 'google.gemma-3-27b-it', input: 0.23, output: 0.38 },
    { id: 'amazon.nova-2-lite-v1:0', input: 0.3, output: 2.5 },
    { id: 'writer.palmyra-vision-7b', input: 0.15, output: 0.6 },
    { id: 'us.writer.palmyra-x5-v1:0', input: 0.6, output: 6 },
  ])('uses the base rate for $id', ({ id, input, output }) => {
    expect(calculateBedrockCost(id, INPUT_TOKENS, OUTPUT_TOKENS, 0, 0, 'us-east-1')).toBeCloseTo(
      costAtRates(input, output),
      6,
    );
  });

  it.each([
    { id: 'google.gemma-3-12b-it', region: 'eu-west-2', input: 0.14, output: 0.45 },
    { id: 'minimax.minimax-m2.1', region: 'eu-west-1', input: 0.36, output: 1.44 },
    { id: 'minimax.minimax-m2.5', region: 'eu-south-1', input: 0.36, output: 1.44 },
    { id: 'minimax.minimax-m2', region: 'eu-central-1', input: 0.36, output: 1.44 },
    { id: 'google.gemma-3-12b-it', region: 'eu-central-1', input: 0.108, output: 0.348 },
    { id: 'openai.gpt-oss-120b-1:0', region: 'eu-west-2', input: 0.23, output: 0.93 },
    {
      id: 'nvidia.nemotron-super-3-120b',
      region: 'us-gov-west-1',
      input: 0.18,
      output: 0.78,
    },
    {
      id: 'us-gov.anthropic.claude-opus-4-8',
      region: 'us-gov-west-1',
      input: 6,
      output: 30,
    },
  ])('uses the published regional rate for $id in $region', ({ id, region, input, output }) => {
    expect(calculateBedrockCost(id, INPUT_TOKENS, OUTPUT_TOKENS, 0, 0, region)).toBeCloseTo(
      costAtRates(input, output),
      6,
    );
  });

  it('infers GovCloud pricing from the Claude inference profile ID', () => {
    expect(
      calculateBedrockCost('us-gov.anthropic.claude-opus-4-8', INPUT_TOKENS, OUTPUT_TOKENS),
    ).toBeCloseTo(costAtRates(6, 30), 6);
  });

  it('applies service tier pricing multipliers', () => {
    expect(
      calculateBedrockCost('minimax.minimax-m2', INPUT_TOKENS, OUTPUT_TOKENS, 0, 0, 'us-east-1', {
        type: 'priority',
      }),
    ).toBeCloseTo(costAtRates(0.3, 1.2) * 1.75, 6);
  });

  it('does not report on-demand token cost for reserved throughput', () => {
    expect(
      calculateBedrockCost('minimax.minimax-m2', INPUT_TOKENS, OUTPUT_TOKENS, 0, 0, 'us-east-1', {
        type: 'reserved',
      }),
    ).toBeUndefined();
  });

  it('uses newly published London pricing for GLM 4.7', () => {
    expect(
      calculateBedrockCost('zai.glm-4.7', INPUT_TOKENS, OUTPUT_TOKENS, 0, 0, 'eu-west-2'),
    ).toBeCloseTo(costAtRates(0.93, 3.41), 6);
  });

  it('does not invent GPT-OSS pricing in an unlisted region', () => {
    expect(
      calculateBedrockCost('openai.gpt-oss-120b-1:0', 1e6, 1e6, 0, 0, 'ca-central-1'),
    ).toBeUndefined();
  });

  it('matches Command R+ before the broader Command R key', () => {
    expect(calculateBedrockCost('cohere.command-r-plus-v1:0', 1e6, 1e6)).toBeCloseTo(18, 6);
  });

  it('bills Claude Sonnet 4.6 at standard rates above 200k effective input tokens', () => {
    // The full 1M context bills at the flat $3/$15 — no surcharge above 200K tokens.
    expect(calculateBedrockCost('global.anthropic.claude-sonnet-4-6', 200_001, 1_000)).toBeCloseTo(
      (200_001 / 1e6) * 3 + (1_000 / 1e6) * 15,
      6,
    );
  });

  it('prices Claude Opus 5 at $5/$25 on the global endpoint (base rate)', () => {
    expect(calculateBedrockCost('global.anthropic.claude-opus-5', 100_000, 1_000)).toBeCloseTo(
      (100_000 / 1e6) * 5 + (1_000 / 1e6) * 25,
      6,
    );
  });

  it('bills Claude Opus 5 at the standard rate above 200k tokens (no long-context tier)', () => {
    expect(calculateBedrockCost('global.anthropic.claude-opus-5', 300_000, 20_000)).toBeCloseTo(
      (300_000 / 1e6) * 5 + (20_000 / 1e6) * 25,
      6,
    );
  });

  it('does not price Claude Opus 5 at the Opus 4.x rate (prefix-collision guard)', () => {
    // BEDROCK_PRICING is matched with `includes()` in insertion order, so a new
    // `anthropic.claude-opus-5` key must not fall through to `anthropic.claude-opus-4`
    // ($15/$75) and must not steal Opus 4.5's lookup either.
    expect(calculateBedrockCost('global.anthropic.claude-opus-5', 1_000_000, 0)).toBeCloseTo(5, 6);
    expect(
      calculateBedrockCost('global.anthropic.claude-opus-4-5-20251101-v1:0', 1_000_000, 0),
    ).toBeCloseTo(5, 6);
    expect(
      calculateBedrockCost('global.anthropic.claude-opus-4-1-20250805-v1:0', 1_000_000, 0),
    ).toBeCloseTo(15, 6);
  });

  it('switches Claude Sonnet 5 pricing at the September 1 boundary', () => {
    const now = vi.spyOn(Date, 'now');

    now.mockReturnValue(Date.parse('2026-08-31T23:59:59.999Z'));
    expect(calculateBedrockCost('global.anthropic.claude-sonnet-5', 1_000_000, 1_000_000)).toBe(12);
    expect(
      calculateBedrockInvokeModelCost('global.anthropic.claude-sonnet-5', 1_000_000, 1_000_000),
    ).toBe(12);

    now.mockReturnValue(Date.parse('2026-09-01T00:00:00.000Z'));
    expect(calculateBedrockCost('global.anthropic.claude-sonnet-5', 1_000_000, 1_000_000)).toBe(18);
    expect(
      calculateBedrockInvokeModelCost('global.anthropic.claude-sonnet-5', 1_000_000, 1_000_000),
    ).toBe(18);
  });

  it('bills one-hour Claude cache writes at 2x the input rate', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-08-31T23:59:59.999Z'));

    const expectedCost =
      (100 / 1e6) * 2 + (500 / 1e6) * 0.2 + (60 / 1e6) * 2.5 + (40 / 1e6) * 4 + (50 / 1e6) * 10;

    expect(
      calculateBedrockCost(
        'global.anthropic.claude-sonnet-5',
        100,
        50,
        500,
        100,
        'us-east-1',
        undefined,
        40,
      ),
    ).toBeCloseTo(expectedCost, 10);
    expect(
      calculateBedrockInvokeModelCost(
        'global.anthropic.claude-sonnet-5',
        100,
        50,
        500,
        100,
        'us-east-1',
        40,
      ),
    ).toBeCloseTo(expectedCost, 10);
  });

  it('bills Claude Sonnet 5 at its promotional rate above 200k tokens', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-08-31T23:59:59.999Z'));
    // Sonnet 5 bills its full 1M context at the same rate. Use the global endpoint to
    // isolate this from the regional premium.
    expect(calculateBedrockCost('global.anthropic.claude-sonnet-5', 300_000, 20_000)).toBeCloseTo(
      (300_000 / 1e6) * 2 + (20_000 / 1e6) * 10,
      6,
    );
  });

  it('applies the 10% regional premium to non-global Claude 4.5+ profiles (Sonnet 5, Opus 4.8, Sonnet 4.6)', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-08-31T23:59:59.999Z'));
    // Per Anthropic pricing, Claude 4.5+ models carry a 10% premium on regional/geo endpoints;
    // only the `global.` endpoint bills at the base rate.
    const sonnet5Base = (100_000 / 1e6) * 2 + (1_000 / 1e6) * 10;
    expect(calculateBedrockCost('us.anthropic.claude-sonnet-5', 100_000, 1_000)).toBeCloseTo(
      sonnet5Base * 1.1,
      6,
    );
    expect(calculateBedrockCost('eu.anthropic.claude-sonnet-5', 100_000, 1_000)).toBeCloseTo(
      sonnet5Base * 1.1,
      6,
    );
    expect(calculateBedrockCost('au.anthropic.claude-sonnet-5', 100_000, 1_000)).toBeCloseTo(
      sonnet5Base * 1.1,
      6,
    );
    expect(calculateBedrockCost('global.anthropic.claude-sonnet-5', 100_000, 1_000)).toBeCloseTo(
      sonnet5Base,
      6,
    );
    // The premium also applies to the other Claude 4.5+ models (previously Fable/Mythos only).
    const opus48Base = (100 / 1e6) * 5 + (50 / 1e6) * 25;
    expect(calculateBedrockCost('us.anthropic.claude-opus-4-8', 100, 50)).toBeCloseTo(
      opus48Base * 1.1,
      8,
    );
    const sonnet46Base = (100 / 1e6) * 3 + (50 / 1e6) * 15;
    expect(calculateBedrockCost('eu.anthropic.claude-sonnet-4-6', 100, 50)).toBeCloseTo(
      sonnet46Base * 1.1,
      8,
    );
  });

  it.each([
    'mistral.mistral-large-3-675b-instruct',
    'qwen.qwen3-coder-480b-a35b-v1:0',
    'cohere.command-r-plus-v1:0',
    'anthropic.claude-sonnet-4-6',
  ])('does not apply unverified Converse pricing to InvokeModel model %s', (modelId) => {
    expect(calculateBedrockInvokeModelCost(modelId, 1e6, 1e6, 0, 0, 'us-east-1')).toBeUndefined();
  });

  it('retains verified InvokeModel pricing for the new Runtime families', () => {
    expect(
      calculateBedrockInvokeModelCost('zai.glm-5', INPUT_TOKENS, OUTPUT_TOKENS, 0, 0, 'us-east-1'),
    ).toBeCloseTo(costAtRates(1, 3.2), 6);
  });

  it('reports InvokeModel cost for Claude Opus 5 but not legacy Opus 4.x', () => {
    // Opus 5 is a Claude 5 model with a verified Runtime rate, so the default `bedrock:`
    // (InvokeModel) path reports cost instead of `cost: 0`. Opus 4.8 stays fail-closed.
    const base = (100 / 1e6) * 5 + (200 / 1e6) * 25;
    expect(
      calculateBedrockInvokeModelCost(
        'global.anthropic.claude-opus-5',
        100,
        200,
        0,
        0,
        'us-east-2',
      ),
    ).toBeCloseTo(base, 10);
    expect(
      calculateBedrockInvokeModelCost('us.anthropic.claude-opus-5', 100, 200, 0, 0, 'us-east-2'),
    ).toBeCloseTo(base * 1.1, 10);
    expect(
      calculateBedrockInvokeModelCost('anthropic.claude-opus-4-8', 100, 200, 0, 0, 'us-east-2'),
    ).toBeUndefined();
  });

  it('reports InvokeModel cost for Claude Sonnet 5 (a Claude 5 model) but not legacy Sonnet 4.x', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-08-31T23:59:59.999Z'));
    // Live QA found the default `bedrock:` (InvokeModel) path reported `cost: 0` for Sonnet 5
    // because the allowlist only covered Fable/Mythos. Sonnet 5 is a Claude 5 model with a
    // verified rate, so it reports cost — the global endpoint at base and regional/geo profiles
    // with the 10% premium. Sonnet 4.6 (legacy Claude 4.x) stays fail-closed.
    const base = (100 / 1e6) * 2 + (200 / 1e6) * 10;
    expect(
      calculateBedrockInvokeModelCost(
        'global.anthropic.claude-sonnet-5',
        100,
        200,
        0,
        0,
        'us-east-2',
      ),
    ).toBeCloseTo(base, 10);
    expect(
      calculateBedrockInvokeModelCost('us.anthropic.claude-sonnet-5', 100, 200, 0, 0, 'us-east-2'),
    ).toBeCloseTo(base * 1.1, 10);
    expect(
      calculateBedrockInvokeModelCost('anthropic.claude-sonnet-4-6', 100, 200, 0, 0, 'us-east-2'),
    ).toBeUndefined();
  });
});
