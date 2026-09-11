import { describe, expect, it, vi } from 'vitest';
import { AIStudioChatProvider } from '../../../src/providers/google/ai.studio';
import {
  getGeminiTokenUsage,
  parseGeminiContent,
  prepareGeminiRequest,
} from '../../../src/providers/google/gemini';
import { GoogleProvider } from '../../../src/providers/google/provider';
import { VertexChatProvider } from '../../../src/providers/google/vertex';

import type { CompletionOptions } from '../../../src/providers/google/types';
import type { GeminiApiResponse } from '../../../src/providers/google/util';

const facades = ['ai-studio', 'unified', 'vertex'] as const;

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

it.each([
  [
    'AI Studio',
    () => new AIStudioChatProvider('gemini-2.5-flash', { config: { apiKey: 'fixture' } }),
  ],
  ['unified', () => new GoogleProvider('gemini-2.5-flash', { config: { apiKey: 'fixture' } })],
  ['Vertex', () => new VertexChatProvider('gemini-2.5-flash', { config: {} })],
] as const)('%s forwards cancellation to tool loading', async (_name, createProvider) => {
  const provider = createProvider();
  const controller = new AbortController();
  const tools = vi
    .spyOn(provider as any, 'getAllTools')
    .mockRejectedValue(new Error('tool boundary'));
  try {
    await provider
      .callApi(
        'hello',
        { prompt: { raw: 'hello', label: 'fixture' }, vars: {} },
        { abortSignal: controller.signal },
      )
      .catch(() => undefined);
    expect(tools).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ abortSignal: controller.signal }),
    );
  } finally {
    tools.mockRestore();
  }
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

  it('merges prompt overrides and built-in tools without mutating defaults', async () => {
    const config = Object.freeze({
      temperature: 0.5,
      generationConfig: Object.freeze({ topK: 2 }),
      passthrough: Object.freeze({ tools: { googleSearch: {} }, service_tier: 'priority' }),
    }) as CompletionOptions;
    const getTools = vi.fn().mockResolvedValue([{ functionDeclarations: [{ name: 'fixture' }] }]);
    const { body } = await prepareGeminiRequest(
      'gemini-2.5-flash',
      config,
      'Hello',
      {
        prompt: { raw: 'Hello', label: 'fixture', config: { temperature: 0 } },
        vars: {},
      },
      facade,
      facade === 'vertex',
      getTools,
    );
    expect(body.generationConfig.temperature).toBe(0);
    expect(body.generationConfig.topK).toBe(2);
    expect(body[facade === 'vertex' ? 'serviceTier' : 'service_tier']).toBe(
      facade === 'vertex' ? 'SERVICE_TIER_PRIORITY' : 'priority',
    );
    expect(body.tools).toHaveLength(2);
    expect(config.temperature).toBe(0.5);
  });

  it('disables executable tools consistently while retaining built-in tools', async () => {
    const getTools = vi
      .fn()
      .mockResolvedValue([{ functionDeclarations: [{ name: 'fixture' }] }, { googleSearch: {} }]);
    const { body, toolsDisabled } = await prepareGeminiRequest(
      'gemini-2.5-flash',
      {
        toolConfig: { functionCallingConfig: { mode: 'NONE' } },
      },
      'Hello',
      undefined,
      facade,
      facade === 'vertex',
      getTools,
    );
    expect(toolsDisabled).toBe(true);
    expect(getTools).toHaveBeenCalledWith({ skipExecutableToolFiles: true });
    expect(body.tools).toEqual([{ googleSearch: {} }]);
  });

  it('normalizes TTS modalities and default voice', async () => {
    const { body } = await prepareGeminiRequest(
      'gemini-2.5-flash-preview-tts',
      {
        generationConfig: { response_modalities: ['audio'] },
      },
      'Hello',
      undefined,
      facade,
      facade === 'vertex',
      async () => [],
    );
    expect(body.generationConfig.responseModalities).toEqual(['AUDIO']);
    expect(body.generationConfig.response_modalities).toBeUndefined();
    expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe(
      'Kore',
    );
  });
});

it('keeps facade wire names and loaded-schema compatibility explicit', async () => {
  for (const facade of facades) {
    const { body } = await prepareGeminiRequest(
      'gemini-2.5-flash',
      {
        systemInstruction: 'Be concise',
        responseSchema: '{"type":"object"}',
      },
      'Hello',
      undefined,
      facade,
      facade === 'vertex',
      async () => [],
    );
    expect(body[facade === 'vertex' ? 'systemInstruction' : 'system_instruction']).toBeDefined();
    expect(body.generationConfig.response_schema).toEqual(
      facade === 'ai-studio' ? '{"type":"object"}' : { type: 'object' },
    );
  }
});

it('preserves unknown usage and vendor prompt-cache accounting', () => {
  expect(getGeminiTokenUsage(undefined, false, 'unified')).toMatchObject({
    total: undefined,
    prompt: undefined,
    completion: undefined,
  });
  expect(getGeminiTokenUsage(undefined, false, 'vertex')).toMatchObject({
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
      false,
      'ai-studio',
    ),
  ).toMatchObject({ total: 7, cached: 3, completionDetails: { reasoning: 1 } });
});
