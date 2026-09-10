import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCacheEnabled } from '../../../src/cache';
import cliState from '../../../src/cliState';
import { renderPrompt } from '../../../src/evaluatorHelpers';
import { loadApiProvider } from '../../../src/providers';
import { GoogleProvider } from '../../../src/providers/google/provider';
import { geminiFormatAndSystemInstructions } from '../../../src/providers/google/util';
import telemetry from '../../../src/telemetry';
import { mockProcessEnv } from '../../util/utils';

import type { GoogleProviderConfig } from '../../../src/providers/google/types';

const fixtures = fileURLToPath(new URL('../../fixtures/google-media/', import.meta.url));
const model = 'gemini-2.5-pro';
const functionCall = { functionCall: { name: 'get_weather', args: { location: 'Boston' } } };
const declarations = [{ name: 'get_weather' }];
type Route = 'Studio' | 'Vertex Express' | 'standalone';

describe('Google media and tool-policy input boundaries', () => {
  const fetchMock = vi.fn<typeof fetch>();
  let restoreEnv: () => void;
  let previousBasePath: typeof cliState.basePath;
  let previousConfig: typeof cliState.config;
  let temporaryDirectory: string;

  beforeEach(async () => {
    previousBasePath = cliState.basePath;
    previousConfig = cliState.config;
    cliState.basePath = undefined;
    cliState.config = undefined;
    restoreEnv = mockProcessEnv({
      GOOGLE_API_KEY: undefined,
      GEMINI_API_KEY: undefined,
      GOOGLE_GENERATIVE_AI_API_KEY: undefined,
      PALM_API_KEY: undefined,
      VERTEX_API_KEY: undefined,
      GOOGLE_API_HOST: undefined,
      GOOGLE_API_BASE_URL: undefined,
      VERTEX_API_HOST: undefined,
      GOOGLE_GENAI_API_HOST: undefined,
      GOOGLE_GENAI_USE_VERTEXAI: undefined,
      PROMPTFOO_DISABLE_MULTIMEDIA_AS_BASE64: undefined,
      PROMPTFOO_DISABLE_TELEMETRY: 'true',
      HTTP_PROXY: undefined,
      HTTPS_PROXY: undefined,
      ALL_PROXY: undefined,
      http_proxy: undefined,
      https_proxy: undefined,
      all_proxy: undefined,
    });
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'google-input-boundary-'));
    // Keep the telemetry-disabled event outside the provider transport oracle.
    vi.spyOn(telemetry, 'record').mockImplementation(() => {});
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () =>
      Response.json({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    restoreEnv();
    cliState.basePath = previousBasePath;
    cliState.config = previousConfig;
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  async function load(route: Route, config: GoogleProviderConfig = {}) {
    const options = {
      config: {
        apiKey: 'test-input-key',
        ...(route === 'Vertex Express'
          ? { expressMode: true, region: 'global' }
          : { vertexai: false }),
        ...config,
      },
    };
    return route === 'standalone'
      ? new GoogleProvider(model, options)
      : loadApiProvider(`${route === 'Studio' ? 'google' : 'vertex'}:${model}`, { options });
  }

  function requestBody(route: Route, streaming = false) {
    const action =
      streaming && route === 'Vertex Express' ? 'streamGenerateContent' : 'generateContent';
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      route === 'Vertex Express'
        ? `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:${action}`
        : `https://generativelanguage.googleapis.com/v1beta/models/${model}:${action}`,
    );
    expect(options?.method).toBe('POST');
    const headers = new Headers(options?.headers);
    expect(headers.get('x-goog-api-key')).toBe('test-input-key');
    expect(headers.get('content-type')).toBe('application/json');
    expect(typeof options?.body).toBe('string');
    return JSON.parse(options?.body as string);
  }

  describe.each<Route>(['Studio', 'Vertex Express', 'standalone'])('%s', (route) => {
    it.each([
      ['vorbis-theora.ogg', 'audio/ogg'],
      ['opus-theora.ogg', 'audio/ogg'],
      ['vorbis-ordinary.ogg', 'audio/ogg'],
      ['opus-ordinary.ogg', 'audio/ogg'],
      ['webm-4004.webm', 'video/webm'],
      ['webm-84.webm', 'video/webm'],
      ['theora.ogg', undefined],
      ['matroska.mkv', undefined],
    ])('renders real file %s into the exact request part', async (name, mimeType) => {
      const file = path.join(fixtures, name!);
      const encoded = readFileSync(file).toString('base64');
      const originalVars = { media: `file://${file}` };
      const vars = { ...originalVars };
      const prompt = { raw: '{{media}}', label: 'media' };
      const provider = await load(route);
      const rendered = await renderPrompt(prompt, vars, {}, provider);
      expect(rendered).toBe(encoded);
      expect(vars.media).toBe(encoded);
      expect(originalVars.media).toBe(`file://${file}`);

      const response = await withCacheEnabled(false, () =>
        provider.callApi(rendered, { vars, prompt, test: { vars: originalVars } }),
      );
      expect(response.error).toBeUndefined();
      expect(response.output).toBe('ok');
      const parts = mimeType ? [{ inlineData: { mimeType, data: encoded } }] : [{ text: encoded }];
      expect(requestBody(route)).toEqual({
        contents: [{ role: 'user', parts }],
        generationConfig: {},
      });
    });

    it.each([
      ['ANY', 'NONE', true, 'native'],
      ['NONE', 'ANY', false, 'native'],
      ['ANY', 'NONE', true, 'JSON object'],
      ['NONE', 'ANY', false, 'JSON object'],
      ['ANY', 'NONE', true, 'JSON array'],
      ['NONE', 'ANY', false, 'JSON array'],
    ] as const)(
      'uses winning passthrough %s over explicit %s (enabled: %s, form: %s)',
      async (mode, explicitMode, enabled, form) => {
        const marker = path.join(temporaryDirectory, 'loaded.txt');
        await writeFile(
          path.join(temporaryDirectory, 'tools.mjs'),
          `import { writeFileSync } from 'node:fs';
writeFileSync(${JSON.stringify(marker)}, 'loaded');
export function getTools() { return { functionDeclarations: ${JSON.stringify(declarations)} }; }
`,
        );
        const callback = vi.fn(async () => 'callback:Boston');
        const provider = await load(route, {
          basePath: temporaryDirectory,
          tools: [
            { googleSearch: {} },
            `file://${path.join(temporaryDirectory, 'tools.mjs')}:getTools`,
          ] as GoogleProviderConfig['tools'],
          functionToolCallbacks: { get_weather: callback },
          toolConfig: { functionCallingConfig: { mode: explicitMode } },
          passthrough: { toolConfig: { functionCallingConfig: { mode } } },
        });
        const originalOutput =
          form === 'native'
            ? [functionCall]
            : JSON.stringify(form === 'JSON array' ? [functionCall] : functionCall);
        fetchMock.mockImplementation(async () =>
          Response.json({
            candidates: [
              {
                content: {
                  parts:
                    typeof originalOutput === 'string'
                      ? [{ text: originalOutput }]
                      : originalOutput,
                },
              },
            ],
          }),
        );
        const response = await withCacheEnabled(false, () => provider.callApi('Weather'));
        expect(response.error).toBeUndefined();
        const body = requestBody(route);
        expect(body.toolConfig).toEqual({ functionCallingConfig: { mode } });
        expect(body.tools).toEqual(
          enabled
            ? [{ googleSearch: {} }, { functionDeclarations: declarations }]
            : [{ googleSearch: {} }],
        );
        expect(body).not.toHaveProperty('tool_config');
        expect(body).not.toHaveProperty('functionToolCallbacks');
        if (enabled) {
          expect(readFileSync(marker, 'utf8')).toBe('loaded');
          expect(callback).toHaveBeenCalledExactlyOnceWith('{"location":"Boston"}');
          expect(response.output).toBe('callback:Boston');
        } else {
          expect(() => readFileSync(marker)).toThrow();
          expect(callback).not.toHaveBeenCalled();
          expect(response.output).toEqual(originalOutput);
        }
      },
    );
    it.each([
      [
        'valid partial argument',
        { partialArgs: [{ jsonPath: '$.location', stringValue: 'Boston' }] },
        true,
      ],
      [
        'out-of-bounds array index',
        { partialArgs: [{ jsonPath: '$.items[10001]', stringValue: 'Boston' }] },
        false,
      ],
      ['incomplete argument JSON', { args: '{' }, false],
    ] as const)('validates streamed JSON envelopes: %s', async (_name, fragment, executes) => {
      const callback = vi.fn(async () => 'streamed:Boston');
      const provider = await load(route, {
        streaming: true,
        toolConfig: { functionCallingConfig: { streamFunctionCallArguments: true } },
        functionToolCallbacks: { get_weather: callback },
      });
      const output = JSON.stringify([{ functionCall: { name: 'get_weather', ...fragment } }]);
      fetchMock.mockImplementation(async () =>
        Response.json([{ candidates: [{ content: { parts: [{ text: output }] } }] }]),
      );
      const response = await withCacheEnabled(false, () => provider.callApi('Weather'));
      expect(response.error).toBeUndefined();
      expect(response.output).toBe(executes ? 'streamed:Boston' : output);
      if (executes) {
        expect(callback).toHaveBeenCalledExactlyOnceWith('{"location":"Boston"}');
      } else {
        expect(callback).not.toHaveBeenCalled();
      }
      expect(requestBody(route, true).toolConfig).toEqual({
        functionCallingConfig: { streamFunctionCallArguments: true },
      });
    });

    it.each([
      ['plain text', 'Weather is sunny', false],
      ['malformed JSON', '{"functionCall":', false],
      ['unknown name', JSON.stringify({ functionCall: { name: 'unknown', args: {} } }), false],
      ['non-string name', JSON.stringify({ functionCall: { name: 42, args: {} } }), false],
      [
        'malformed arguments',
        JSON.stringify({ functionCall: { name: 'get_weather', args: '{' } }),
        false,
      ],
      [
        'unconfigured argument stream',
        JSON.stringify({
          functionCall: {
            name: 'get_weather',
            partialArgs: [{ jsonPath: '$.location', stringValue: 'Boston' }],
          },
        }),
        true,
      ],
    ] as const)(
      'preserves %s without executing a JSON callback',
      async (_name, output, hasError) => {
        const callback = vi.fn(async () => 'must not execute');
        const provider = await load(route, { functionToolCallbacks: { get_weather: callback } });
        fetchMock.mockImplementation(async () =>
          Response.json({ candidates: [{ content: { parts: [{ text: output }] } }] }),
        );
        const response = await withCacheEnabled(false, () => provider.callApi('Weather'));
        if (hasError) {
          expect(response.error).toContain('Streamed function-call arguments require');
        } else {
          expect(response.error).toBeUndefined();
          expect(response.output).toBe(output);
        }
        expect(callback).not.toHaveBeenCalled();
        requestBody(route);
      },
    );
  });

  it('preserves explicit MIME and unregistered raw-text behavior', () => {
    const encoded = readFileSync(path.join(fixtures, 'opus-theora.ogg')).toString('base64');
    const dataUrl = `data:audio/ogg;base64,${encoded}`;
    expect(
      geminiFormatAndSystemInstructions(dataUrl, { media: dataUrl }).contents[0].parts,
    ).toEqual([{ inlineData: { mimeType: 'audio/ogg', data: encoded } }]);
    expect(geminiFormatAndSystemInstructions(encoded).contents[0].parts).toEqual([
      { text: encoded },
    ]);
  });

  it.each([20, 27, 28])(
    'leaves an incomplete Ogg identification page of %i bytes as text',
    (length) => {
      const encoded = readFileSync(path.join(fixtures, 'vorbis-ordinary.ogg'))
        .subarray(0, length)
        .toString('base64');
      expect(
        geminiFormatAndSystemInstructions(encoded, { media: encoded }).contents[0].parts,
      ).toEqual([{ text: encoded }]);
    },
  );

  it.each([
    '1a45dfa3a34286810142f28101428240',
    '1a45dfa3a34286810142f2810142824004',
    '1a45dfa3a34286810142f281014282ff7765626d',
  ])('safely leaves an incomplete or unknown EBML size as text: %s', (hex) => {
    const encoded = Buffer.from(hex, 'hex').toString('base64');
    expect(
      geminiFormatAndSystemInstructions(encoded, { media: encoded }).contents[0].parts,
    ).toEqual([{ text: encoded }]);
  });
});
