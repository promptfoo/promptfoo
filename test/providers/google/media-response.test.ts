import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleCost } from '../../../src/assertions/cost';
import { handleGuardrails } from '../../../src/assertions/guardrails';
import { fetchWithCache } from '../../../src/cache';
import { loadApiProvider } from '../../../src/providers';
import { createMockFetchResponse } from '../mockProviderResponses';

import type { AssertionParams } from '../../../src/types/index';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
}));
const id = 'google:gemini-nano-banana-2.1';
const parts = [
  { text: 'A circle', thoughtSignature: 'text-signature' },
  { inlineData: { mimeType: 'image/png', data: 'aW1hZ2U=' }, thoughtSignature: 'image-signature' },
];
const groundingMetadata = {
  groundingChunks: [{ web: { uri: 'https://example.com/source', title: 'Source' } }],
};
const data = {
  candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP', groundingMetadata }],
  usageMetadata: {
    promptTokenCount: 10,
    toolUsePromptTokenCount: 5,
    candidatesTokenCount: 1120,
    thoughtsTokenCount: 7,
    totalTokenCount: 1142,
  },
};
let scratch: string;
beforeEach(() => {
  vi.resetAllMocks();
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'google-media-response-'));
  vi.mocked(fetchWithCache).mockResolvedValue(createMockFetchResponse(data));
});
afterEach(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('Nano Banana response contracts', () => {
  it.each(['prompt', 'candidate'])(
    'preserves %s safety signals for actual guardrails assertions',
    async (scope) => {
      const ratings = [{ category: 'HARM_CATEGORY_HARASSMENT', probability: 'HIGH' }];
      vi.mocked(fetchWithCache).mockResolvedValue(
        createMockFetchResponse({
          ...data,
          ...(scope === 'prompt'
            ? { promptFeedback: { safetyRatings: ratings } }
            : { candidates: [{ ...data.candidates[0], safetyRatings: ratings }] }),
        }),
      );
      const provider = await loadApiProvider(id, {
        options: { config: { apiKey: 'key', vertexai: false } },
      });
      const result = await provider.callApi('Draw');
      expect(result.error).toBeUndefined();
      expect(
        (
          await handleGuardrails({
            assertion: { type: 'guardrails' },
            inverse: false,
            providerResponse: result,
          } as AssertionParams)
        ).pass,
      ).toBe(false);
    },
  );

  it('preserves signed native parts, grounding and reported usage through cache replay', async () => {
    const original = structuredClone(data);
    const provider = await loadApiProvider(id, {
      options: { config: { apiKey: 'key', vertexai: false } },
    });
    vi.mocked(fetchWithCache)
      .mockResolvedValueOnce(createMockFetchResponse(data))
      .mockResolvedValueOnce(createMockFetchResponse(data, { cached: true }));
    const fresh = await provider.callApi('Draw');
    const cached = await provider.callApi('Draw');
    for (const result of [fresh, cached]) {
      expect(result.output).toBe('A circle');
      expect(result.images).toHaveLength(1);
      expect(result.conversationOutput).toEqual(parts);
      expect(result.metadata?.thoughtSignatures).toEqual(['text-signature', 'image-signature']);
      expect(result.metadata?.groundingMetadata).toEqual(groundingMetadata);
      expect(result.tokenUsage).toMatchObject({
        prompt: 15,
        completion: 1120,
        completionDetails: { reasoning: 7 },
      });
      expect(result.cost).toBeCloseTo(0.0336675, 12);
      expect(
        handleCost({
          cost: result.cost,
          assertion: { type: 'cost', threshold: 1 },
          inverse: false,
        } as AssertionParams).pass,
      ).toBe(true);
    }
    expect(cached.tokenUsage).toMatchObject({
      numRequests: 0,
      cached: 1142,
      incurredTokenUsage: {},
    });
    expect(fresh.tokenUsage?.numRequests).toBe(1);
    expect(data).toEqual(original);
  });

  it.each(
    [
      { model: 'gemini-3.1-flash-image', cost: 0.06705, threshold: 0.068 },
      { model: 'gemini-nano-banana-2.1', cost: 0.03375, threshold: 0.034 },
    ].flatMap((entry) => [false, true].map((vertexai) => ({ ...entry, vertexai }))),
  )(
    'excludes Search context from $model input charges (Vertex: $vertexai)',
    async ({ model, cost, threshold, vertexai }) => {
      const grounded = {
        ...data,
        usageMetadata: {
          promptTokenCount: 100,
          toolUsePromptTokenCount: 5000,
          candidatesTokenCount: 1120,
          totalTokenCount: 6220,
        },
      };
      vi.mocked(fetchWithCache)
        .mockResolvedValueOnce(createMockFetchResponse(grounded))
        .mockResolvedValueOnce(createMockFetchResponse(grounded, { cached: true }));
      const provider = await loadApiProvider(`google:${model}`, {
        options: { config: { apiKey: 'key', vertexai, tools: [{ googleSearch: {} }] } },
      });
      const fresh = await provider.callApi('Draw with Google Search');
      const cached = await provider.callApi('Draw with Google Search');
      for (const result of [fresh, cached]) {
        expect(result.error).toBeUndefined();
        expect(result.tokenUsage?.prompt).toBe(5100);
        expect(result.cost).toBeCloseTo(cost, 12);
        expect(
          handleCost({
            cost: result.cost,
            assertion: { type: 'cost', threshold },
            inverse: false,
          } as AssertionParams).pass,
        ).toBe(true);
      }
      expect(fresh.tokenUsage?.numRequests).toBe(1);
      expect(cached.tokenUsage?.numRequests).toBe(0);
    },
  );

  it('keeps unknown cached token counts unknown', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue(
      createMockFetchResponse({ candidates: data.candidates }, { cached: true }),
    );
    const provider = await loadApiProvider(id, {
      options: { config: { apiKey: 'key', vertexai: false } },
    });
    const result = await provider.callApi('Draw');
    expect(result.tokenUsage?.prompt).toBeUndefined();
    expect(result.tokenUsage?.completion).toBeUndefined();
    expect(result.tokenUsage?.total).toBeUndefined();
    expect(result.tokenUsage?.numRequests).toBe(0);
  });

  it.each(['google', 'palm'])(
    'retains strict explicit credential validation through %s',
    async (prefix) => {
      await expect(
        loadApiProvider(`${prefix}:gemini-nano-banana-2.1`, {
          options: {
            config: { apiKey: 'key', projectId: 'project', strictMutualExclusivity: true },
          },
        }),
      ).rejects.toThrow('mutually exclusive');
      expect(fetchWithCache).not.toHaveBeenCalled();
      await expect(
        loadApiProvider(`${prefix}:gemini-nano-banana-2.1`, {
          options: {
            config: { apiKey: 'key', projectId: 'project', strictMutualExclusivity: false },
          },
        }),
      ).resolves.toBeDefined();
    },
  );

  it('rejects missing native credentials before executing a tool file', async () => {
    const executable = path.join(scratch, 'unauthenticated.mjs');
    const marker = path.join(scratch, 'executed');
    fs.writeFileSync(
      executable,
      `import fs from 'node:fs'; export function getTools() { fs.writeFileSync(new URL('./executed', import.meta.url), 'executed'); return []; }`,
    );
    const provider = await loadApiProvider(id, {
      options: {
        config: { vertexai: false, tools: `file://${executable}:getTools` },
        env: {
          GOOGLE_API_KEY: '',
          GOOGLE_GENERATIVE_AI_API_KEY: '',
          GEMINI_API_KEY: '',
          PALM_API_KEY: '',
        },
      },
    });
    expect((await provider.callApi('Draw')).error).toContain('require either');
    expect(fs.existsSync(marker)).toBe(false);
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it.each([
    { tool_choice: 'none' },
    { toolConfig: { functionCallingConfig: { mode: 'NONE' } } },
  ] as const)(
    'does not re-evaluate a deferred executable reference with %j',
    async (toolConfig) => {
      const executable = path.join(scratch, 'deferred.mjs');
      const marker = path.join(scratch, 'executed');
      fs.writeFileSync(
        executable,
        `import fs from 'node:fs'; export function getTools() { fs.writeFileSync(new URL('./executed', import.meta.url), 'executed'); return []; }`,
      );
      const provider = await loadApiProvider(id, {
        options: {
          config: {
            apiKey: 'key',
            vertexai: false,
            ...toolConfig,
            tools: '{{toolRef}}' as never,
          },
        },
      });
      await expect(
        provider.callApi('Draw', {
          prompt: { raw: 'Draw', label: 'Draw' },
          vars: { toolRef: `{{ "file://${executable}:getTools" }}` },
        }),
      ).rejects.toThrow('expected an array or object, but got a string');
      expect(fs.existsSync(marker)).toBe(false);
      expect(fetchWithCache).not.toHaveBeenCalled();
    },
  );

  it('loads variable-backed data tools and skips executable files when functions are disabled', async () => {
    const toolsPath = path.join(scratch, 'tools.json');
    const executable = path.join(scratch, 'tools.mjs');
    const marker = path.join(scratch, 'executed');
    fs.writeFileSync(toolsPath, JSON.stringify([{ googleSearch: {} }]));
    fs.writeFileSync(
      executable,
      `import fs from 'node:fs'; export function getTools() { fs.writeFileSync(new URL('./executed', import.meta.url), 'executed'); return []; }`,
    );
    const provider = await loadApiProvider(id, {
      options: {
        config: {
          apiKey: 'key',
          vertexai: false,
          tool_choice: 'none',
          tools: ['file://{{toolfile}}', `file://${executable}:getTools`] as never,
        },
      },
    });
    const result = await provider.callApi('Draw', {
      prompt: { raw: 'Draw', label: 'Draw' },
      vars: { toolfile: toolsPath },
    });
    expect(result.error).toBeUndefined();
    const body = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string);
    expect(body.tools).toEqual([{ googleSearch: {} }]);
    expect(fs.existsSync(marker)).toBe(false);
  });
});
