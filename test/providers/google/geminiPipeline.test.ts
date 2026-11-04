import { describe, expect, it, vi } from 'vitest';
import {
  getGeminiTokenUsage,
  parseGeminiContent,
  prepareGeminiRequest,
} from '../../../src/providers/google/gemini';
import { withResponseCacheMetadata } from '../../../src/providers/shared';

import type { GoogleProviderConfig } from '../../../src/providers/google/types';
import type { GeminiApiResponse } from '../../../src/providers/google/util';

const facades = ['ai-studio', 'vertex'] as const;

it.each([
  { data: [] },
  { data: [{ usageMetadata: { totalTokenCount: 3 } }] },
  { data: [{ promptFeedback: { safetyRatings: [{ probability: 'NEGLIGIBLE' }] } }] },
])('preserves the Vertex error for candidate-free stream %j', ({ data }) => {
  expect(parseGeminiContent(data as GeminiApiResponse, 'vertex')).toEqual({
    kind: 'response',
    response: { error: `No output found in response: ${JSON.stringify(data)}` },
  });
});

it('rejects malformed Vertex candidates but preserves finish-only frames', () => {
  const data = [
    { candidates: [{ content: { parts: [{ text: 'partial' }] } }] },
    { candidates: [{}] },
  ] as GeminiApiResponse;
  expect(parseGeminiContent(data, 'vertex')).toMatchObject({
    kind: 'response',
    response: { error: expect.stringContaining('No output found in response') },
  });
  expect(
    parseGeminiContent(
      [data[0], { candidates: [{ finishReason: 'MAX_TOKENS' }] }] as GeminiApiResponse,
      'vertex',
    ),
  ).toMatchObject({ kind: 'content', output: 'partial' });
});

it('retains terminal AI Studio safety ratings without dropping streamed output', () => {
  const parsed = parseGeminiContent(
    [
      { candidates: [{ content: { parts: [{ text: 'partial' }] } }] },
      {
        candidates: [
          {
            finishReason: 'MAX_TOKENS',
            safetyRatings: [
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', probability: 'HIGH', blocked: false },
            ],
          },
        ],
      },
    ] as GeminiApiResponse,
    'ai-studio',
  );
  expect(parsed).toMatchObject({
    kind: 'content',
    output: 'partial',
    candidate: {
      safetyRatings: [{ probability: 'HIGH' }],
      content: { parts: [{ text: 'partial' }] },
    },
  });
});

describe.each(facades)('%s shared Gemini pipeline', (facade) => {
  it('retains content when streaming ends with an empty STOP and usage-only frame', () => {
    const data = [
      { candidates: [{ content: { parts: [{ text: 'Hello ' }] } }] },
      { candidates: [{ content: { parts: [{ text: 'world' }] } }] },
      { candidates: [{ finishReason: 'STOP' }] },
      { usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 3, totalTokenCount: 5 } },
    ] as GeminiApiResponse;
    const parsed = parseGeminiContent(data, facade);
    expect(parsed.kind).toBe('content');
    if (parsed.kind === 'content') {
      expect(parsed.output).toBe('Hello world');
      expect(parsed.lastData.usageMetadata?.totalTokenCount).toBe(5);
      expect(parsed.candidate.content?.parts).toEqual([{ text: 'world' }]);
    }
  });

  it('keeps terminal candidate state bounded while retaining content and safety', () => {
    const content = { parts: [{ text: 'partial' }] };
    const safetyRatings = [
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', probability: 'HIGH', blocked: false },
    ];
    const data = [
      { candidates: [{ content, safetyRatings }] },
      ...Array.from({ length: 200 }, (_, i) => ({
        candidates: [{ finishReason: 'STOP', [`extra${i}`]: i }],
      })),
    ] as GeminiApiResponse;
    const parsed = parseGeminiContent(data, facade);

    expect(parsed).toMatchObject({
      kind: 'content',
      output: 'partial',
      candidate: { content, safetyRatings, finishReason: 'STOP' },
    });
    if (parsed.kind === 'content') {
      expect(Object.keys(parsed.candidate)).toHaveLength(4);
      expect(parsed.candidate).not.toHaveProperty('extra0');
    }
  });
});

it('preserves unknown usage and vendor prompt-cache accounting', () => {
  expect(getGeminiTokenUsage(undefined, 'ai-studio')).toMatchObject({
    total: undefined,
    prompt: undefined,
    completion: undefined,
  });
  expect(getGeminiTokenUsage(undefined, 'vertex')).toMatchObject({
    total: 0,
    prompt: 0,
    completion: 0,
  });
  expect(
    getGeminiTokenUsage(
      {
        promptTokenCount: 5,
        totalTokenCount: 7,
        cachedContentTokenCount: 3,
        thoughtsTokenCount: 1,
      },
      'ai-studio',
    ),
  ).toMatchObject({ total: 7, cached: 3, completionDetails: { reasoning: 1 } });
  const vendorUsage = getGeminiTokenUsage(
    { promptTokenCount: 5, totalTokenCount: 7, cachedContentTokenCount: 3 },
    'ai-studio',
  );
  const localHit = withResponseCacheMetadata({ tokenUsage: vendorUsage }, true);
  expect(localHit.tokenUsage).toMatchObject({
    total: 7,
    cached: 7,
    numRequests: 0,
    completionDetails: { cacheReadInputTokens: 3 },
  });
});

it('merges prompt overrides and built-in tools without mutating defaults', async () => {
  const config = Object.freeze({
    temperature: 0.5,
    generationConfig: Object.freeze({ topK: 2 }),
    passthrough: Object.freeze({ tools: { googleSearch: {} }, service_tier: 'priority' }),
  }) as GoogleProviderConfig;
  const getTools = vi.fn().mockResolvedValue([{ functionDeclarations: [{ name: 'fixture' }] }]);
  const prepared = await prepareGeminiRequest(
    config,
    'Hello',
    {
      prompt: { raw: 'Hello', label: 'fixture', config: { temperature: 0 } },
      vars: {},
    },
    getTools,
  );
  expect(prepared.config.temperature).toBe(0);
  expect(prepared.config.generationConfig?.topK).toBe(2);
  expect(prepared.serviceTier).toBe('priority');
  expect(prepared.mergedTools).toHaveLength(2);
  expect(config.temperature).toBe(0.5);
});

it('disables executable tools consistently while retaining built-in tools', async () => {
  const getTools = vi
    .fn()
    .mockResolvedValue([{ functionDeclarations: [{ name: 'fixture' }] }, { googleSearch: {} }]);
  const { mergedTools, toolsDisabled } = await prepareGeminiRequest(
    {
      toolConfig: { functionCallingConfig: { mode: 'NONE' } },
    },
    'Hello',
    undefined,
    getTools,
  );
  expect(toolsDisabled).toBe(true);
  expect(getTools).toHaveBeenCalledWith({ skipExecutableToolFiles: true });
  expect(mergedTools).toEqual([{ googleSearch: {} }]);
});
