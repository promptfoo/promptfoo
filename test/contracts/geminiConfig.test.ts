import Ajv from 'ajv';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  GeminiProviderOptionsInputJsonSchema,
  GeminiProviderOptionsInputSchema,
  GoogleAiStudioConfigInputSchema,
  VertexGeminiConfigInputSchema,
} from '../../src/contracts';

import type { GoogleAiStudioConfigInput } from '../../src/contracts';
import type { CompletionOptions } from '../../src/providers/google/types';

const validate = new Ajv({ strict: false }).compile(GeminiProviderOptionsInputJsonSchema);

describe('portable Gemini configuration', () => {
  const cases: [unknown, boolean][] = [
    [
      {
        id: 'google:gemini-2.5-flash',
        config: { mcp: { enabled: true, server: { command: 'fixture' } } },
      },
      true,
    ],
    [
      {
        id: 'google:gemini-2.5-flash',
        config: { mcp: { server: { command: 'fixture' }, defaultArgs: { session: 'ignored' } } },
      },
      false,
    ],
    [
      {
        id: 'google:gemini-2.5-flash',
        config: { mcp: { server: { command: 'fixture' }, transform: 'output' } },
      },
      false,
    ],
    [{ id: 'google:gemini-2.5-flash' }, true],
    [
      {
        id: 'palm:gemini-2.5-pro',
        config: { apiKey: '{{ env.KEY }}', temperature: 0, streaming: false },
      },
      true,
    ],
    [
      {
        id: 'vertex:chat:gemini-2.5-pro',
        config: {
          credentials: 'file://key.json',
          projectId: '{{ project }}',
          expressMode: false,
          scopes: ['scope'],
          modelArmor: { promptTemplate: 'template' },
        },
      },
      true,
    ],
    [
      {
        id: 'vertex:gemini-2.5-flash',
        config: { googleAuthOptions: { credentials: { client_email: 'test@example.com' } } },
      },
      true,
    ],
    [
      {
        id: 'google:gemini-2.5-flash',
        config: {
          responseSchema: { type: 'object', properties: { answer: { type: 'string' } } },
          generationConfig: { thinkingConfig: { thinkingBudget: -1 } },
          passthrough: { cachedContent: 'cache-id' },
        },
      },
      true,
    ],
    [
      {
        id: 'google:gemini-2.5-flash',
        config: {
          responseSchema: 'file://schema.json',
          functionToolCallbacks: { lookup: 'file://lookup.js:run' },
          tools: [{ functionDeclarations: [{ name: 'lookup', parameters: { type: 'OBJECT' } }] }],
        },
      },
      true,
    ],
    ...[
      'google:live:gemini-2.5-flash',
      'google:chat:gemini-2.5-flash',
      'google:gemini-2.5-flash-image',
      'google:gemini-omni-flash-preview',
      'vertex:gemini-omni-1.1-flash-preview',
      'vertex:gemini-robotics-er-2-preview',
      'google:gemini-3.5-live-translate-preview',
      'google:gemini-robotics-er-2-streaming-preview',
      'google:embedding:gemini-embedding-001',
      'vertex:video:veo',
      'vertex:claude-sonnet',
      'google:gemini-',
      'Google:gemini-2.5-flash',
    ].map((id): [unknown, boolean] => [{ id }, false]),
    ...[
      { temperature: 'hot' },
      { maxOutputToken: 10 },
      { projectId: 'wrong-service' },
      { generationConfig: { thinkingConfig: { thinkingLevel: 'invalid' } } },
      { tools: [{ functionDeclarations: [{ name: 4 }] }] },
    ].map((config): [unknown, boolean] => [{ id: 'google:gemini-2.5-flash', config }, false]),
    [{ id: 'vertex:gemini-2.5-flash', config: { apiBaseUrl: 'unsupported' } }, false],
  ];
  it.each(cases)('preserves Zod/Ajv parity for %j', (input, accepted) => {
    expect(GeminiProviderOptionsInputSchema.safeParse(input).success).toBe(accepted);
    expect(validate(input)).toBe(accepted);
  });
  it('applies no defaults or stripping and rejects executable values', () => {
    expect(GoogleAiStudioConfigInputSchema.parse({})).toEqual({});
    expect(VertexGeminiConfigInputSchema.parse({})).toEqual({});
    expect(
      GoogleAiStudioConfigInputSchema.safeParse({
        functionToolCallbacks: { lookup: () => 'answer' },
      }).success,
    ).toBe(false);
    expect(
      GoogleAiStudioConfigInputSchema.safeParse({ passthrough: { callback: () => 'answer' } })
        .success,
    ).toBe(false);
  });
  it('shares runtime sampling types', () => {
    expectTypeOf<
      Pick<
        GoogleAiStudioConfigInput,
        'temperature' | 'maxOutputTokens' | 'topP' | 'topK' | 'stopSequences'
      >
    >().toEqualTypeOf<
      Pick<CompletionOptions, 'temperature' | 'maxOutputTokens' | 'topP' | 'topK' | 'stopSequences'>
    >();
  });
});
