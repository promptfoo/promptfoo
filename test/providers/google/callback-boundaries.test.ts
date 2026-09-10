import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCacheEnabled, withCacheNamespace } from '../../../src/cache';
import cliState from '../../../src/cliState';
import { loadApiProvider } from '../../../src/providers';
import { GoogleProvider } from '../../../src/providers/google/provider';
import telemetry from '../../../src/telemetry';
import { mockProcessEnv } from '../../util/utils';

import type { GoogleProviderConfig } from '../../../src/providers/google/types';
import type { ApiProvider } from '../../../src/types';

const functionCall = { functionCall: { name: 'get_weather', args: { location: 'Boston' } } };
const callbacks = { get_weather: 'file://callbacks.mjs:getWeather' };
const tools: GoogleProviderConfig['tools'] = [
  {
    functionDeclarations: [
      {
        name: 'get_weather',
        parameters: { type: 'OBJECT', properties: { location: { type: 'STRING' } } },
      },
    ],
  },
];

describe('Google callback file ownership through the public loader', () => {
  const fetchMock = vi.fn<typeof fetch>();
  let root: string;
  let providerDir: string;
  let promptDir: string;
  let contextDir: string;
  let restoreEnv: () => void;
  let previousBasePath: typeof cliState.basePath;
  let previousConfig: typeof cliState.config;

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
      PROMPTFOO_DISABLE_CALLBACK_PATH_GUARD: undefined,
      HTTP_PROXY: undefined,
      HTTPS_PROXY: undefined,
      ALL_PROXY: undefined,
      http_proxy: undefined,
      https_proxy: undefined,
      all_proxy: undefined,
    });
    root = await mkdtemp(path.join(os.tmpdir(), 'google-callback-owner-'));
    [providerDir, promptDir, contextDir] = ['provider', 'prompt', 'context'].map((name) =>
      path.join(root, name),
    );
    for (const directory of [providerDir, promptDir, contextDir]) {
      await mkdir(directory);
      await writeFile(
        path.join(directory, 'callbacks.mjs'),
        `let calls = 0;
export function getWeather(args) {
  return '${path.basename(directory)}:' + JSON.parse(args).location + ':' + ++calls;
}
`,
      );
      await writeFile(
        path.join(directory, 'default.mjs'),
        "export default () => 'default must not replace a missing named export';\n",
      );
    }
    vi.spyOn(telemetry, 'record').mockImplementation(() => {});
    fetchMock.mockReset();
    // Only the HTTP response is replaced. Provider routing, serialization, path
    // guards, importModule, and the callback module all execute normally.
    fetchMock.mockImplementation(async () =>
      Response.json({ candidates: [{ content: { parts: [functionCall] } }] }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    restoreEnv();
    cliState.basePath = previousBasePath;
    cliState.config = previousConfig;
    await rm(root, { recursive: true, force: true });
  });

  function call(
    provider: ApiProvider,
    config?: Partial<GoogleProviderConfig>,
    cacheEnabled = false,
  ) {
    return withCacheNamespace(cacheEnabled ? root : undefined, () =>
      withCacheEnabled(cacheEnabled, () =>
        provider.callApi('Weather in Boston', {
          vars: {},
          prompt: { raw: 'Weather in Boston', label: 'weather', config },
        }),
      ),
    );
  }

  function useResponseForm(form: string) {
    const parts =
      form === 'native'
        ? [functionCall]
        : [{ text: JSON.stringify(form === 'JSON array' ? [functionCall] : functionCall) }];
    fetchMock.mockImplementation(async () =>
      Response.json({ candidates: [{ content: { parts } }] }),
    );
  }

  function expectRequest(route: string) {
    const [url, options] = fetchMock.mock.calls.at(-1)!;
    expect(String(url)).toContain('models/gemini-2.5-pro:');
    expect(new URL(String(url)).hostname).toBe(
      route === 'google' ? 'generativelanguage.googleapis.com' : 'aiplatform.googleapis.com',
    );
    expect(new Headers(options?.headers).get('x-goog-api-key')).toBe('test-callback-key');
    const body = JSON.parse(options?.body as string);
    expect(body.tools).toEqual(tools);
    expect(body).not.toHaveProperty('functionToolCallbacks');
    expect(body).not.toHaveProperty('basePath');
  }

  describe.each(['google', 'vertex'])('%s', (route) => {
    function load(config: Partial<GoogleProviderConfig> = {}, basePath?: string) {
      return loadApiProvider(`${route}:gemini-2.5-pro`, {
        basePath,
        options: {
          config: {
            apiKey: 'test-callback-key',
            ...(route === 'vertex' && { expressMode: true, region: 'global' }),
            tools,
            functionToolCallbacks: callbacks,
            ...config,
          },
        },
      });
    }

    it('loads a real named callback relative to the loader context', async () => {
      const provider = await load({}, contextDir);
      expect((await call(provider)).output).toBe('context:Boston:1');
      expect(cliState.basePath).toBeUndefined();
      expectRequest(route);
    });

    it('keeps explicit provider basePath ahead of loader context and global state', async () => {
      cliState.basePath = promptDir;
      const provider = await load({ basePath: providerDir }, contextDir);
      expect((await call(provider)).output).toBe('provider:Boston:1');
    });

    it('does not relocate an inherited provider callback for a prompt-only basePath', async () => {
      const provider = await load({ basePath: providerDir });
      expect((await call(provider, { basePath: promptDir })).output).toBe('provider:Boston:1');
    });

    it.each(['native', 'JSON object', 'JSON array'])(
      'uses the owning callback directory for %s and distinguishes identical references',
      async (form) => {
        useResponseForm(form);
        const provider = await load({ basePath: providerDir });
        expect((await call(provider)).output).toBe('provider:Boston:1');
        expect(
          (await call(provider, { basePath: promptDir, functionToolCallbacks: callbacks })).output,
        ).toBe('prompt:Boston:1');
        expect(
          (await call(provider, { basePath: promptDir, functionToolCallbacks: callbacks })).output,
        ).toBe('prompt:Boston:2');
        expect((await call(provider)).output).toBe('provider:Boston:2');
      },
    );

    it.each(['native', 'JSON object', 'JSON array'])(
      'replays cached %s with the current callback mapping and owning directory',
      async (form) => {
        // This explicit cache-replay control uses an isolated in-memory namespace.
        useResponseForm(form);
        const provider = await load({ basePath: providerDir });
        const first = await call(provider, undefined, true);
        expect(first.output).toBe('provider:Boston:1');
        expect(first.cached).not.toBe(true);

        const fromPrompt = await call(
          provider,
          { basePath: promptDir, functionToolCallbacks: callbacks },
          true,
        );
        expect(fromPrompt.output).toBe('prompt:Boston:1');
        expect(fromPrompt.cached).toBe(true);

        const unconfigured = await call(provider, { functionToolCallbacks: {} }, true);
        const original =
          form === 'native'
            ? [functionCall]
            : JSON.stringify(form === 'JSON array' ? [functionCall] : functionCall);
        expect(unconfigured.output).toEqual(original);
        expect(unconfigured.cached).toBe(true);

        const replacement = vi.fn(
          async (args: string) => `replacement:${JSON.parse(args).location}`,
        );
        const replaced = await call(
          provider,
          { functionToolCallbacks: { get_weather: replacement } },
          true,
        );
        expect(replaced.output).toBe('replacement:Boston');
        expect(replaced.cached).toBe(true);
        expect(replacement).toHaveBeenCalledExactlyOnceWith('{"location":"Boston"}');

        const fromProvider = await call(provider, undefined, true);
        expect(fromProvider.output).toBe('provider:Boston:2');
        expect(fromProvider.cached).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expectRequest(route);
      },
    );

    it('uses the provider directory when a prompt-owned callback omits basePath', async () => {
      const provider = await load({ basePath: providerDir });
      expect((await call(provider, { functionToolCallbacks: callbacks })).output).toBe(
        'provider:Boston:1',
      );
    });

    it('retains global fallback and distinguishes a change of fallback directory', async () => {
      const provider = await load();
      cliState.basePath = contextDir;
      expect((await call(provider)).output).toBe('context:Boston:1');
      cliState.basePath = promptDir;
      expect((await call(provider)).output).toBe('prompt:Boston:1');
    });

    it('retains global ownership when only the prompt supplies a basePath', async () => {
      const provider = await load();
      cliState.basePath = contextDir;
      expect((await call(provider, { basePath: promptDir })).output).toBe('context:Boston:1');
    });

    it('retains cwd fallback when no owning or global directory is configured', async () => {
      const provider = await load();
      const previousCwd = process.cwd();
      try {
        process.chdir(contextDir);
        expect((await call(provider)).output).toBe('context:Boston:1');
      } finally {
        process.chdir(previousCwd);
      }
    });

    it('preserves function callbacks and prompt callback replacement', async () => {
      const callback = vi.fn(async (args: string) => `function:${JSON.parse(args).location}`);
      const provider = await load({ basePath: providerDir });
      expect(
        (
          await call(provider, {
            basePath: promptDir,
            functionToolCallbacks: { get_weather: callback },
          })
        ).output,
      ).toBe('function:Boston');
      expect(callback).toHaveBeenCalledExactlyOnceWith('{"location":"Boston"}');
      expect((await call(provider, { functionToolCallbacks: {} })).output).toEqual([functionCall]);
    });

    it('preserves strict named exports and original output after a callback failure', async () => {
      const provider = await load({
        basePath: providerDir,
        functionToolCallbacks: { get_weather: 'file://default.mjs:missing' },
      });
      expect((await call(provider)).output).toEqual([functionCall]);
    });

    it('keeps the path guard when the owning directory is explicit', async () => {
      const provider = await load({
        basePath: providerDir,
        functionToolCallbacks: { get_weather: 'file://../prompt/callbacks.mjs:getWeather' },
      });
      expect((await call(provider)).output).toEqual([functionCall]);
    });
  });

  it.each(['native', 'JSON object', 'JSON array'])(
    'retains standalone callback ownership for %s',
    async (form) => {
      useResponseForm(form);
      const provider = new GoogleProvider('gemini-2.5-pro', {
        config: {
          vertexai: false,
          apiKey: 'test-callback-key',
          basePath: providerDir,
          tools,
          functionToolCallbacks: callbacks,
        },
      });
      expect((await call(provider, { basePath: promptDir })).output).toBe('provider:Boston:1');
      expect(
        (await call(provider, { basePath: promptDir, functionToolCallbacks: callbacks })).output,
      ).toBe('prompt:Boston:1');
    },
  );
});
