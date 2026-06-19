import { describe, expect, it } from 'vitest';
import { calculateBedrockCost } from '../../../src/providers/bedrock/pricing';

const INPUT_TOKENS = 10_000;
const OUTPUT_TOKENS = 5_000;
const costAtRates = (input: number, output: number) =>
  (INPUT_TOKENS / 1e6) * input + (OUTPUT_TOKENS / 1e6) * output;

describe('calculateBedrockCost', () => {
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
    {
      id: 'nvidia.nemotron-super-3-120b',
      region: 'us-gov-west-1',
      input: 0.18,
      output: 0.78,
    },
  ])('uses the published regional rate for $id in $region', ({ id, region, input, output }) => {
    expect(calculateBedrockCost(id, INPUT_TOKENS, OUTPUT_TOKENS, 0, 0, region)).toBeCloseTo(
      costAtRates(input, output),
      6,
    );
  });

  it('applies service tier pricing multipliers', () => {
    expect(
      calculateBedrockCost('minimax.minimax-m2', INPUT_TOKENS, OUTPUT_TOKENS, 0, 0, 'us-east-1', {
        type: 'priority',
      }),
    ).toBeCloseTo(costAtRates(0.3, 1.2) * 1.75, 6);
  });

  it('does not invent regional rates where AWS does not list a model', () => {
    expect(
      calculateBedrockCost('zai.glm-4.7', INPUT_TOKENS, OUTPUT_TOKENS, 0, 0, 'eu-west-2'),
    ).toBeUndefined();
  });

  it('matches Command R+ before the broader Command R key', () => {
    expect(calculateBedrockCost('cohere.command-r-plus-v1:0', 1e6, 1e6)).toBeCloseTo(18, 6);
  });

  it('uses Claude Sonnet long-context rates above 200k effective input tokens', () => {
    expect(calculateBedrockCost('anthropic.claude-sonnet-4-6', 200_001, 1_000)).toBeCloseTo(
      (200_001 / 1e6) * 6 + (1_000 / 1e6) * 22.5,
      6,
    );
  });
});
