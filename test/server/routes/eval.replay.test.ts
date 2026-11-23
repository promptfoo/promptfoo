import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/models/eval');
vi.mock('../../../src/node', () => ({ evaluateWithSource: vi.fn() }));
vi.mock('../../../src/globalConfig/accounts');

import { cloudConfig } from '../../../src/globalConfig/cloud';
import Eval, { EvalQueries } from '../../../src/models/eval';
import { evaluateWithSource } from '../../../src/node';
import { loadApiProviders } from '../../../src/providers/index';
import { createApp } from '../../../src/server/server';
import * as fetchUtils from '../../../src/util/fetch/index';
import * as fileUtils from '../../../src/util/file';
import * as providerRefs from '../../../src/util/providerRef';
import { normalizeProviderRef } from '../../../src/util/providerRef';
import * as templates from '../../../src/util/templates';
import { setupTestServer } from '../../util/testServer';

const evaluate = vi.mocked(evaluateWithSource);

describe('POST /api/eval/replay provider boundary', () => {
  const api = setupTestServer(createApp);
  let directory: string;

  beforeEach(async () => {
    vi.resetAllMocks();
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-replay-provider-'));
    evaluate.mockResolvedValue({
      toEvaluateSummary: vi
        .fn()
        .mockResolvedValue({ results: [{ response: { output: 'replayed' } }] }),
    } as unknown as Eval);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
    await fs.rm(directory, { recursive: true, force: true });
  });

  function mockCloudProvider(config: object) {
    vi.spyOn(cloudConfig, 'isEnabled').mockReturnValue(true);
    vi.spyOn(cloudConfig, 'getAuthHeaders').mockReturnValue({ Authorization: 'Bearer fixture' });
    return vi
      .spyOn(fetchUtils, 'fetchWithProxy')
      .mockImplementation(async () => Response.json({ config }));
  }

  function recordedTarget(
    id: string,
    scanner = 0,
    linkedTargetId: string | null = null,
    config?: object,
  ) {
    vi.mocked(EvalQueries.getReplayTarget).mockResolvedValue({
      id,
      scanner,
      linkedTargetId,
      config: config ? JSON.stringify(config) : null,
    });
  }

  function storedConfig(
    providers: unknown,
    basePath?: string,
    columnProviders?: string[],
    env?: Record<string, string>,
    providerFilter?: string,
  ) {
    vi.mocked(Eval.findById).mockResolvedValue({
      runtimeOptions: { providerFilter },
      getPrompts: () =>
        (
          columnProviders ??
          (Array.isArray(providers) ? providers : [providers]).map((provider) => {
            const ref = normalizeProviderRef(provider);
            return ref.label || ref.id;
          })
        ).map((provider) => ({ provider, label: 'original' })),
      config: {
        basePath,
        env,
        providers,
        prompts: [{ raw: 'original', config: { report_file: '/original/report.json' } }],
        tests: [{ options: { report_file: '/original/report.json' } }],
      },
    } as unknown as Eval);
  }

  const replay = (testIndex = 0, promptIndex?: number) =>
    api.post('/api/eval/replay').send({
      evaluationId: 'stored-eval',
      testIndex,
      promptIndex,
      prompt: 'edited prompt',
      variables: { name: 'example' },
    });

  it.each([
    'openai:codex-security',
    'openai:codex-security:model',
    { id: 'openai:codex-security', label: 'Custom label' },
    { id: 'openai:codex-security:model', config: { report_file: '/report.json' } },
    { 'openai:codex-security:model': { id: 'custom-alias', config: {} } },
  ])('rejects Codex Security before evaluation: %j', async (provider) => {
    storedConfig([provider]);
    const response = await replay();
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Codex Security does not support prompt-only replay');
    expect(response.body.error).toContain('Rerun using the eval configuration');
    expect(evaluate).not.toHaveBeenCalled();
  });

  it.each(['openai:codex-security', { id: 'openai:codex-security' }])(
    'guards non-array provider configuration: %j',
    async (provider) => {
      storedConfig(provider);
      expect((await replay()).status).toBe(400);
      expect(evaluate).not.toHaveBeenCalled();
    },
  );

  it.each(['echo', 'openai:gpt-4.1', 'openai:codex-security-other'])(
    'preserves an ordinary selected provider in a mixed evaluation: %j',
    async (provider) => {
      storedConfig(['openai:codex-security', provider]);
      const response = await replay(0, 1);
      expect(response.status).toBe(200);
      expect(response.body.output).toBe('replayed');
      expect(evaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          providers: [provider],
          prompts: [{ raw: 'edited prompt', label: 'Replay' }],
          tests: [{ vars: { name: 'example' } }],
        }),
        expect.objectContaining({ cache: false }),
      );
    },
  );

  it.each(['openai:chat:gpt-4.1', 'openai:responses:gpt-4.1', 'openai:chat', 'openai:responses'])(
    'preserves the native column ID and endpoint for %s',
    async (provider) => {
      const [named, explicit] = await loadApiProviders([provider, { id: provider }]);
      expect(named.id()).not.toBe(explicit.id());
      storedConfig([provider, { id: provider }], undefined, [named.id(), explicit.id()]);
      expect((await replay(0, 0)).status).toBe(200);
      expect(evaluate.mock.calls[0][0].providers).toEqual([provider]);
      expect((await replay(0, 1)).status).toBe(200);
      expect(evaluate.mock.calls[1][0].providers).toEqual([{ id: provider, prompts: ['Replay'] }]);
    },
  );

  it('rejects overlapping named OpenAI endpoints and shorthand IDs', async () => {
    storedConfig(['openai:responses:gpt-4.1', 'openai:gpt-4.1'], undefined, ['openai:gpt-4.1']);
    expect((await replay(0, 0)).status).toBe(400);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it.each(['anthropic:messages:claude-sonnet-4-5', 'ollama:llama3'])(
    'rejects a collision with the native ID of %s without evaluating either source',
    async (selector) => {
      const [native] = await loadApiProviders([selector], {
        env: { ANTHROPIC_API_KEY: 'fixture' },
      });
      const identity = native.id();
      expect(identity).not.toBe(selector);
      const other = selector.startsWith('ollama:')
        ? { id: identity, env: { OLLAMA_BASE_URL: 'https://other.invalid' } }
        : { id: 'https://other.invalid', label: identity, config: { body: '{{prompt}}' } };
      const providers = [selector, other];
      storedConfig(providers, undefined, [identity, identity]);
      expect((await replay(0, 0)).status).toBe(400);
      expect((await replay(0, 1)).status).toBe(400);
      // Prompt filters can hide a source, so even a unique name can be ambiguous.
      storedConfig(providers, undefined, [identity]);
      expect((await replay(0, 0)).status).toBe(400);
      expect(evaluate).not.toHaveBeenCalled();
    },
  );

  it('keeps a native selector that matches its repeated prompt columns', async () => {
    const provider = 'ollama:completion:llama3';
    const [native] = await loadApiProviders([provider]);
    storedConfig([provider], undefined, [native.id(), native.id()]);
    expect((await replay(0, 1)).status).toBe(200);
    expect(evaluate.mock.calls[0][0].providers).toEqual([provider]);
  });

  it('does not load a script to discover an unknown column identity', async () => {
    const file = path.join(directory, 'provider.cjs');
    const marker = path.join(directory, 'loaded');
    await fs.writeFile(file, `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "")`);
    const selector = `file://${file}`;
    storedConfig([selector], undefined, ['stale']);
    expect((await replay(0, 0)).status).toBe(400);
    storedConfig([selector, 'echo'], undefined, ['echo', 'echo']);
    expect((await replay(0, 1)).status).toBe(400);
    expect(evaluate).not.toHaveBeenCalled();
    await expect(fs.access(marker)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps a distinct target next to a native selector across multiple prompts', async () => {
    const selector = 'ollama:llama3';
    const [native] = await loadApiProviders([selector]);
    storedConfig([selector, 'echo'], undefined, [native.id(), native.id(), 'echo', 'echo']);
    expect((await replay(0, 3)).status).toBe(200);
    expect(evaluate.mock.calls[0][0].providers).toEqual(['echo']);
  });

  it.each([0, 1, 7])('selects by prompt column independently of test row %s', async (testIndex) => {
    storedConfig(['openai:codex-security', 'echo'], undefined, [
      'openai:codex-security',
      'openai:codex-security',
      'echo',
    ]);
    expect((await replay(testIndex, 2)).status).toBe(200);
    expect(evaluate.mock.calls[0][0].providers).toEqual(['echo']);
    expect((await replay(testIndex, 1)).status).toBe(400);
  });

  it('resolves a mapped provider in its saved env scope and preserves its display ID', async () => {
    const options = { id: 'saved-label', env: { REPLAY_FIXTURE_PROVIDER: 'echo' } };
    storedConfig([{ '{{ env.REPLAY_FIXTURE_PROVIDER }}': options }], undefined, ['saved-label']);
    expect((await replay(0, 0)).status).toBe(200);
    const providers = evaluate.mock.calls[0][0].providers;
    expect(providers).toEqual([{ echo: { id: 'saved-label', prompts: ['Replay'] } }]);
    const [loaded] = await loadApiProviders(providers);
    expect(loaded.id()).toBe('saved-label');
    await expect(loaded.callApi('local echo fixture')).resolves.toMatchObject({
      output: 'local echo fixture',
      cost: 0,
    });
  });

  it.each(['benchmark', 'echo'])(
    'requires a saved binding when ID %s hides the original provider',
    async (id) => {
      const providers = [{ '{{ env.TARGET }}': { id } }];
      const [original] = await loadApiProviders(providers, {
        env: { TARGET: 'openai:chat:gpt-4o' },
      });
      expect(original.id()).toBe(id);
      vi.stubEnv('TARGET', 'echo');
      try {
        storedConfig(providers, undefined, [id]);
        expect((await replay()).status).toBe(400);
        recordedTarget(original.id());
        expect((await replay(0, 0)).status).toBe(400);
        expect(evaluate).not.toHaveBeenCalled();

        storedConfig(providers, undefined, [id], { TARGET: 'echo' });
        expect((await replay(0, 0)).status).toBe(200);
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );

  it('requires an unmasked saved ID for an ambient selector behind a display label', async () => {
    vi.stubEnv('TARGET', 'echo');
    try {
      storedConfig([{ id: '{{ env.TARGET }}', label: 'Saved' }]);
      expect((await replay(0, 0)).status).toBe(400);
      recordedTarget('openai:codex-security');
      expect((await replay(0, 0)).status).toBe(400);
      expect(evaluate).not.toHaveBeenCalled();
      recordedTarget('echo');
      expect((await replay(0, 0)).status).toBe(200);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('accepts an empty config and binds a templated label to the saved column', async () => {
    vi.stubEnv('REPLAY_LABEL', 'Local echo');
    try {
      const echo = {
        id: '{{ env.NAME }}',
        env: { NAME: 'echo' },
        config: {},
        label: '{{ env.REPLAY_LABEL }}',
      };
      storedConfig([echo], undefined, ['Local echo']);
      expect((await replay(0, 0)).status).toBe(200);
      expect(evaluate.mock.calls[0][0].providers).toEqual([
        { id: 'echo', label: 'Local echo', prompts: ['Replay'] },
      ]);

      vi.stubEnv('REPLAY_LABEL', 'changed');
      expect((await replay(0, 0)).status).toBe(400);
      expect((await replay()).status).toBe(400);
      expect(evaluate).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('skips a different labelled selector without making that selector replayable', async () => {
    const selected = { id: 'echo', label: 'Local echo' };
    storedConfig([
      selected,
      { id: '{{ env.NAME }}', label: 'Scanner', env: { NAME: 'openai:codex-security' } },
    ]);
    expect((await replay(0, 0)).status).toBe(200);
    expect(evaluate.mock.calls[0][0].providers).toEqual([{ ...selected, prompts: ['Replay'] }]);
    expect((await replay(0, 1)).status).toBe(400);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it('uses saved suite labels and refuses to infer provider order from mutable labels', async () => {
    const providers = [
      { id: 'echo', label: '{{ env.FIRST }}' },
      { id: 'https://remote.invalid', label: '{{ env.SECOND }}', config: { body: {} } },
    ];
    const env = { FIRST: 'Local', SECOND: 'Remote' };
    const loaded = await loadApiProviders(providers, { env });
    const columns = loaded.map((provider) => provider.label || provider.id());
    vi.stubEnv('FIRST', env.SECOND);
    vi.stubEnv('SECOND', env.FIRST);
    try {
      storedConfig(providers, undefined, columns, env);
      expect((await replay(0, 0)).status).toBe(200);
      expect(evaluate.mock.calls[0][0].providers).toEqual([
        { id: 'echo', label: 'Local', prompts: ['Replay'] },
      ]);
      storedConfig(providers, undefined, columns);
      expect((await replay(0, 0)).status).toBe(400);
      expect(evaluate).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('does not let an ambient echo selector replace a saved scanner', async () => {
    vi.stubEnv('TARGET', 'echo');
    try {
      storedConfig([{ id: '{{ env.TARGET }}', label: 'Saved' }], undefined, ['Saved'], {
        TARGET: 'openai:codex-security',
      });
      expect((await replay(0, 0)).status).toBe(400);
      expect(evaluate).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each([
    { '{{ env.NAME | lower }}': { env: { NAME: 'echo' } } },
    { '{{ env.NAME }}': { id: '{{ env.DISPLAY }}', env: { NAME: 'echo' } } },
    { '{{ env.NAME }}': { label: '{{ env.DISPLAY }}', env: { NAME: 'echo' } } },
    { 'openai:codex-security{#suffix#}': {} },
    { 'echo{{ env.EMPTY }}': { env: { EMPTY: '' } } },
  ])(
    'rejects template expressions and dynamic display metadata before evaluation',
    async (provider) => {
      const renderer = vi.spyOn(templates, 'getNunjucksEngine');
      const fileLoader = vi.spyOn(providerRefs, 'readProviderConfigFile');
      const fetch = vi.spyOn(fetchUtils, 'fetchWithProxy');
      storedConfig([provider]);
      expect((await replay()).status).toBe(400);
      expect(renderer).not.toHaveBeenCalled();
      expect(fileLoader).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
      expect(evaluate).not.toHaveBeenCalled();
    },
  );

  it.each([{ config: { linkedTargetId: 'remote' } }, { transform: 'synthetic' }, { delay: 5 }])(
    'rejects loader options on templated echo before evaluation: %j',
    async (extraOptions) => {
      storedConfig([{ '{{ env.NAME }}': { env: { NAME: 'echo' }, ...extraOptions } }]);
      expect((await replay()).status).toBe(400);
      expect(evaluate).not.toHaveBeenCalled();
    },
  );

  it.each([
    'openai:gpt-6-luna',
    'openai:codex-security',
    'openai:codex-security:scan',
    'file://providers.yaml',
    'promptfoo://provider/12345678-1234-1234-1234-123456789abc',
    'provider.js',
    'ruby:provider.rb',
    '',
  ])(
    'blocks ambiguous or operation-sensitive env-templated targets before replay: %s',
    async (value) => {
      vi.stubEnv('REPLAY_FIXTURE_PROVIDER', value);
      try {
        storedConfig([{ id: '{{ env.REPLAY_FIXTURE_PROVIDER }}' }]);
        expect((await replay()).status).toBe(400);
        expect(evaluate).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );

  it('resolves relative provider files from the saved config base path', async () => {
    recordedTarget('echo');
    await fs.writeFile(path.join(directory, 'target.json'), JSON.stringify({ id: 'echo' }));
    storedConfig(['file://target.json'], directory);
    expect((await replay()).status).toBe(200);
    expect(evaluate.mock.calls[0][0].providers).toEqual([{ id: 'echo', prompts: ['Replay'] }]);
  });

  it.each([
    [
      { id: 'echo', label: 'openai:codex-security' },
      { id: 'echo', label: 'openai:codex-security', prompts: ['Replay'] },
    ],
    [
      { echo: { id: 'openai:codex-security', config: {} } },
      { echo: { id: 'openai:codex-security', config: {}, prompts: ['Replay'] } },
    ],
  ])(
    'permits ordinary provider aliases when selection is unambiguous: %j',
    async (provider, expected) => {
      recordedTarget(normalizeProviderRef(provider).id);
      storedConfig([provider]);
      expect((await replay()).status).toBe(200);
      expect(evaluate.mock.calls[0][0].providers).toEqual([expected]);
    },
  );

  it('does not replay multiple providers for legacy requests', async () => {
    storedConfig(['echo', 'openai:chat:example-model']);
    expect((await replay()).status).toBe(400);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('matches the effective HTTP URL instead of a different target with that loader path', async () => {
    const selected = { id: 'http', config: { url: 'https://a.invalid' } };
    storedConfig(
      [selected, { id: 'https://a.invalid', config: { url: 'https://b.invalid' } }],
      undefined,
      ['https://a.invalid'],
    );
    expect((await replay(0, 0)).status).toBe(200);
    expect(evaluate.mock.calls[0][0].providers).toEqual([{ ...selected, prompts: ['Replay'] }]);
  });

  it('matches each WebSocket column by its effective URL, including URL overrides', async () => {
    const url = 'ws://a.invalid';
    const config = { url, messageTemplate: '{{prompt}}' };
    const providers = [
      { id: 'websocket', config },
      { id: url, config: { ...config, url: 'wss://b.invalid' } },
    ];
    const loaded = await loadApiProviders(providers);
    storedConfig(
      providers,
      undefined,
      loaded.map((provider) => provider.id()),
    );
    for (const [index, provider] of providers.entries()) {
      expect((await replay(0, index)).status).toBe(200);
      expect(evaluate.mock.calls[index][0].providers).toEqual([
        { ...provider, prompts: ['Replay'] },
      ]);
    }
  });

  it('rejects WebSocket targets whose credentials produce the same saved identity', async () => {
    const providers = ['first', 'second'].map((token) => ({
      id: 'wss',
      config: { url: `wss://a.invalid/?token=${token}`, messageTemplate: '{{prompt}}' },
    }));
    const [first, second] = await loadApiProviders(providers);
    expect(first.id()).toBe(second.id());
    storedConfig([providers[0]], undefined, [first.id()]);
    expect((await replay(0, 0)).status).toBe(200);
    storedConfig(providers, undefined, [first.id(), second.id()]);
    expect((await replay(0, 1)).status).toBe(400);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it.each(['http', 'websocket'])('binds scoped %s URLs before checking collisions', async (id) => {
    const http = id === 'http';
    const url = http ? 'https://a.invalid' : 'wss://a.invalid/?token=first';
    const suiteEnv = { URL: http ? url : 'wss://other.invalid' };
    const providers = [
      {
        id,
        ...(!http && { env: { URL: url } }),
        config: { url: '{{ env.URL }}', body: {}, messageTemplate: '{{prompt}}' },
      },
      {
        id,
        config: {
          url: http ? url : 'wss://a.invalid/?token=second',
          body: { different: true },
          messageTemplate: 'different',
        },
      },
    ];
    const [a, b] = await loadApiProviders(providers, { env: suiteEnv });
    expect(a.id()).toBe(b.id());
    storedConfig([providers[0]], undefined, [a.id()], suiteEnv);
    expect((await replay(0, 0)).status).toBe(200);
    expect(evaluate.mock.calls[0][0].providers).toMatchObject([{ config: { url } }]);
    storedConfig(providers, undefined, [a.id(), b.id()], suiteEnv);
    expect((await replay(0, 0)).status).toBe(400);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it.each(['{{ env.URL }}', '{{ env.URL | lower }}'])(
    'does not treat an unbound URL template as an unrelated literal: %s',
    async (url) => {
      storedConfig(
        [
          { id: 'http', config: { url, body: {} } },
          { id: 'echo', label: 'https://a.invalid' },
        ],
        undefined,
        ['https://a.invalid', 'https://a.invalid'],
      );
      const renderer = vi.spyOn(templates, 'getNunjucksEngine');
      expect((await replay(0, 0)).status).toBe(400);
      expect(renderer).not.toHaveBeenCalled();
      expect(evaluate).not.toHaveBeenCalled();
    },
  );

  it('does not confuse a URL provider with another target using it as an alias', async () => {
    const a = 'https://a.invalid';
    const b = 'https://b.invalid';
    storedConfig(
      [{ [a]: { id: b, config: { body: {} } } }, { [b]: { id: a, config: { body: {} } } }],
      undefined,
      [a],
    );
    expect((await replay(0, 0)).status).toBe(200);
    expect(evaluate.mock.calls[0][0].providers).toMatchObject([{ [a]: { id: b } }]);
  });

  it('does not redirect a disappeared scanner file to another source with the same label', async () => {
    const file = path.join(directory, 'providers.json');
    await fs.writeFile(file, JSON.stringify({ id: 'openai:codex-security', label: 'Saved' }));
    const other = { id: 'https://other.invalid', label: 'Saved', config: { body: '{{prompt}}' } };
    storedConfig(
      [`file://${file}`, other],
      undefined,
      ['Saved'],
      undefined,
      '^openai:codex-security$',
    );
    await fs.unlink(file);
    expect((await replay(0, 0)).status).toBe(400);
    storedConfig([`file://${file}`, { ...other, prompts: [] }], undefined, ['Saved']);
    expect((await replay(0, 0)).status).toBe(400);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('checks the original prompt selectors and stored provider filter before replay', async () => {
    const provider = { id: 'echo', label: 'Saved' };
    for (const prompts of [[], ['unrelated']]) {
      storedConfig([{ ...provider, prompts }]);
      expect((await replay(0, 0)).status).toBe(400);
    }
    storedConfig([provider], undefined, ['Saved'], undefined, '^other$');
    expect((await replay(0, 0)).status).toBe(400);
    expect(evaluate).not.toHaveBeenCalled();
    storedConfig([{ ...provider, prompts: ['orig*'] }], undefined, ['Saved'], undefined, '^echo$');
    expect((await replay(0, 0)).status).toBe(200);
  });

  it('rejects ambiguous provider identities instead of guessing a target', async () => {
    storedConfig([
      { id: 'echo', label: 'same' },
      { id: 'openai:codex-security', label: 'same' },
    ]);
    expect((await replay(0, 0)).status).toBe(400);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('rejects a file-backed Codex Security configuration without evaluating it', async () => {
    const file = path.join(directory, 'provider.json');
    await fs.writeFile(file, JSON.stringify({ id: 'openai:codex-security:model', config: {} }));
    storedConfig([`file://${file}`]);
    const response = await replay();
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Codex Security');
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('passes the inspected ordinary file config to evaluation instead of rereading its path', async () => {
    recordedTarget('echo');
    const provider = { id: 'echo', config: { prefix: 'example' } };
    const file = path.join(directory, 'provider.json');
    await fs.writeFile(file, JSON.stringify(provider));
    storedConfig([`file://${file}`]);
    expect((await replay()).status).toBe(200);
    expect(evaluate.mock.calls[0][0].providers).toEqual([{ ...provider, prompts: ['Replay'] }]);
  });

  it.each(['json', 'yaml'])(
    'never expands nested references in a %s provider file',
    async (ext) => {
      const nested = 'file://{{ env.REPORT | lower }}';
      const filename = `providers.${ext}`;
      await fs.writeFile(
        path.join(directory, filename),
        ext === 'json'
          ? JSON.stringify({ id: 'openai:codex-security', config: { report_file: nested } })
          : `- id: http\n  config:\n    url: "${nested}"\n`,
      );
      const expand = vi.spyOn(fileUtils, 'maybeLoadConfigFromExternalFile');
      const source = `file://${filename}`;
      storedConfig([source], directory);
      expect((await replay()).status).toBe(400);
      storedConfig([source, 'echo'], directory, ['other', 'echo']);
      expect((await replay(0, 1)).status).toBe(400);
      expect(expand).not.toHaveBeenCalled();
      expect(evaluate).not.toHaveBeenCalled();
    },
  );

  it('refuses to redirect a saved column when file-backed labels change', async () => {
    recordedTarget('https://other.invalid');
    const file = path.join(directory, 'targets.json');
    await fs.writeFile(
      file,
      JSON.stringify([
        { id: 'echo', label: 'Second' },
        { id: 'https://other.invalid', label: 'First', config: { body: '{{prompt}}' } },
      ]),
    );
    storedConfig([`file://${file}`], directory, ['First', 'Second']);
    expect((await replay(0, 0)).status).toBe(400);
    // Shrinking to one entry must not turn a mixed evaluation into a sole source.
    await fs.writeFile(file, JSON.stringify({ id: 'https://other.invalid', label: 'First' }));
    expect((await replay(0, 0)).status).toBe(400);
    expect((await replay()).status).toBe(400);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('supports plain YAML provider arrays with saved environment labels', async () => {
    recordedTarget('echo');
    await fs.writeFile(
      path.join(directory, 'providers.yml'),
      '- id: echo\n  label: "{{ env.NAME }}"\n- id: openai:codex-security\n  config:\n    settings: file://private.json\n',
    );
    const readFile = vi.spyOn(providerRefs, 'readRawProviderConfigFile');
    storedConfig(['file://providers.yml'], directory, ['Local', 'openai:codex-security'], {
      NAME: 'Local',
    });
    expect((await replay(0, 0)).status).toBe(200);
    expect(evaluate.mock.calls[0][0].providers).toEqual([
      { id: 'echo', label: 'Local', prompts: ['Replay'] },
    ]);
    expect((await replay(0, 1)).status).toBe(400);
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(readFile.mock.calls.map(([path]) => path)).toEqual([
      'file://providers.yml',
      'file://providers.yml',
    ]);
  });

  it.each([
    { id: 'file:///unresolved-provider.yaml' },
    '{{ env.PROVIDER }}',
    'promptfoo://provider/opaque-target',
    { label: 'unknown-provider' },
  ])('fails closed when the selected provider cannot be identified: %j', async (provider) => {
    storedConfig([provider]);
    const response = await replay();
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Rerun using the eval configuration');
    expect(evaluate).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'replays a saved cloud target with local overrides: %s',
    async (localOverride) => {
      recordedTarget('echo', 0, 'promptfoo://provider/target');
      const cloudFetch = mockCloudProvider({
        id: 'echo',
        label: 'Cloud target',
        prompts: ['original'],
        transform: 'output + " cloud"',
      });
      const provider = localOverride
        ? {
            'promptfoo://provider/target': {
              id: 'local-alias',
              label: 'Local target',
              prompts: ['original'],
              transform: 'output + " local"',
            },
          }
        : 'promptfoo://provider/target';
      storedConfig(['echo', provider], undefined, [
        'echo',
        localOverride ? 'Local target' : 'Cloud target',
      ]);
      evaluate.mockImplementation(async (suite) => {
        const [loaded] = await loadApiProviders(suite.providers);
        expect(loaded.label).toBe(localOverride ? 'Local target' : 'Cloud target');
        expect(loaded.transform).toBe(localOverride ? 'output + " local"' : 'output + " cloud"');
        const response = await loaded.callApi('edited prompt');
        return { toEvaluateSummary: async () => ({ results: [{ response }] }) } as unknown as Eval;
      });
      const response = await replay(0, 1);
      expect(response.status).toBe(200);
      expect(response.body.output).toBe('edited prompt');
      expect(cloudFetch).toHaveBeenCalledTimes(1);
      expect(evaluate.mock.calls[0][0].providers).toHaveLength(1);
    },
  );

  it.each(['https://local.invalid', ''])(
    'matches the effective cloud HTTP URL with override %j',
    async (url) => {
      const id = 'https://fallback.invalid';
      const original = 'https://original.invalid';
      mockCloudProvider({ id, label: 'Remote label', config: { url: original, body: {} } });
      const providers = [{ id: 'promptfoo://provider/target', label: '', config: { url } }];
      recordedTarget(url || id, 0, null, { url, body: {} });
      storedConfig(providers, undefined, [url || id]);
      evaluate.mockImplementationOnce(async (suite) => {
        const [loaded] = await loadApiProviders(suite.providers);
        expect(loaded.label || loaded.id()).toBe(url || id);
        return { toEvaluateSummary: async () => ({ results: [] }) } as unknown as Eval;
      });
      expect((await replay(0, 0)).status).toBe(200);
      for (const wrong of [original, 'Remote label']) {
        storedConfig(providers, undefined, [wrong]);
        expect((await replay(0, 0)).status).toBe(400);
      }
      expect(evaluate).toHaveBeenCalledTimes(1);
    },
  );

  it('uses the pinned Cloud environment for local labels without swapping targets', async () => {
    const providers = [
      { id: 'promptfoo://provider/a', label: '{{ env.AWS_REGION }}' },
      { id: 'promptfoo://provider/b', label: '{{ env.VERTEX_REGION }}' },
    ];
    const env = { AWS_REGION: 'east', VERTEX_REGION: 'west' };
    let regions = { AWS_REGION: 'west', VERTEX_REGION: 'east' };
    const lookup = mockCloudProvider({}).mockImplementation(async (url) =>
      Response.json({
        config: {
          id: String(url).endsWith('/a') ? 'echo' : 'https://other.invalid',
          env: regions,
          config: { body: '{{prompt}}' },
        },
      }),
    );
    const loaded = await loadApiProviders(providers, { env });
    const columns = loaded.map((provider) => provider.label || provider.id());
    expect(columns).toEqual(['west', 'east']);
    recordedTarget(loaded[0].id());
    storedConfig(providers, undefined, columns, env);
    lookup.mockClear();
    evaluate.mockImplementationOnce(async (suite) => {
      const [selected] = await loadApiProviders(suite.providers, { env: suite.env });
      const response = { output: selected.id() };
      return { toEvaluateSummary: async () => ({ results: [{ response }] }) } as unknown as Eval;
    });
    const result = await replay(0, 0);
    expect(result.status).toBe(200);
    expect(result.body.output).toBe('echo');
    expect(lookup).toHaveBeenCalledTimes(2);
    // A later change to Cloud must not redirect the same saved column.
    regions = env;
    expect((await replay(0, 0)).status).toBe(400);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it.each([
    { id: '{{ env.TARGET }}', label: 'Saved' },
    { id: 'echo', label: '{{ env.NAME | lower }}' },
    { id: 'file://provider.yaml', label: 'Saved' },
  ])('never renders or expands an indirect Cloud target: %j', async (target) => {
    mockCloudProvider(target);
    storedConfig(['promptfoo://provider/target'], undefined, ['Saved'], {
      TARGET: 'openai:codex-security',
      NAME: 'Saved',
    });
    const renderer = vi.spyOn(templates, 'getNunjucksEngine');
    const expand = vi.spyOn(fileUtils, 'maybeLoadConfigFromExternalFile');
    expect((await replay(0, 0)).status).toBe(400);
    expect(renderer).not.toHaveBeenCalled();
    expect(expand).not.toHaveBeenCalled();
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('honors entry overrides for an inherited Cloud label and HTTP URL', async () => {
    recordedTarget('https://local.invalid', 0, null, {
      url: 'https://local.invalid',
      body: '{{prompt}}',
    });
    const label = '{{ env.AWS_REGION }}';
    const url = '{{ env.OPENAI_BASE_URL }}';
    const env = { AWS_REGION: 'suite', OPENAI_BASE_URL: 'https://suite.invalid' };
    const provider = {
      id: 'promptfoo://provider/test',
      env: { AWS_REGION: 'local', OPENAI_BASE_URL: 'https://local.invalid' },
    };
    const lookup = mockCloudProvider({
      id: 'http',
      label,
      env: { AWS_REGION: 'cloud', OPENAI_BASE_URL: 'https://cloud.invalid' },
      config: { url, body: '{{prompt}}' },
    });
    storedConfig([provider], undefined, ['local'], env);
    evaluate.mockImplementationOnce(async (suite) => {
      const [selected] = await loadApiProviders(suite.providers, { env: suite.env });
      expect(selected.label).toBe('local');
      expect(selected.id()).toBe('https://local.invalid');
      return { toEvaluateSummary: async () => ({ results: [] }) } as unknown as Eval;
    });
    expect((await replay(0, 0)).status).toBe(200);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('checks all mutable Cloud settings against the saved options before using credentials', async () => {
    const id = 'openai:chat:gpt-4o';
    const source = 'promptfoo://provider/target';
    const config = { apiHost: 'saved.invalid', apiKey: 'fixture' };
    const remote = { id, label: 'Saved', config, env: {} };
    mockCloudProvider(remote);
    storedConfig([source], undefined, ['Saved']);
    recordedTarget(id, 0, source);
    expect((await replay(0, 0)).status).toBe(400);
    recordedTarget(id, 0, source, { ...config, apiKey: '[REDACTED]', linkedTargetId: source });
    remote.config.apiHost = 'other.invalid';
    expect((await replay(0, 0)).status).toBe(400);
    remote.config.apiHost = 'saved.invalid';
    remote.env = { OPENAI_API_HOST: 'other.invalid' };
    expect((await replay(0, 0)).status).toBe(400);
    expect(evaluate).not.toHaveBeenCalled();
    remote.env = {};
    expect((await replay(0, 0)).status).toBe(200);
  });

  it.each([
    { id: 'openai:chat:gpt-4o', config: {} },
    { id: 'openai:chat:gpt-4o', config: { apiBaseUrl: 'https://saved.invalid/%5BREDACTED%5D' } },
    { id: 'http', config: { request: 'POST /ask HTTP/1.1\nHost: {{host}}\n\n{{prompt}}' } },
  ])('requires a verifiable static destination for mutable $id targets', async ({ id, config }) => {
    mockCloudProvider({ id, label: 'Saved', config });
    storedConfig(['promptfoo://provider/target'], undefined, ['Saved']);
    recordedTarget(id, 0, null, config);
    expect((await replay(0, 0)).status).toBe(400);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('does not treat a redacted object as proof of an unchanged auxiliary endpoint', async () => {
    const id = 'https://saved.invalid';
    const config = { body: '{{prompt}}', session: { url: 'https://other.invalid' } };
    mockCloudProvider({ id, config });
    recordedTarget(id, 0, null, { ...config, session: '[REDACTED]' });
    storedConfig(['promptfoo://provider/target'], undefined, [id]);
    expect((await replay(0, 0)).status).toBe(400);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('rejects a changed Cloud identity, including scanner results under ordinary aliases', async () => {
    mockCloudProvider({ id: 'echo', label: 'Saved' });
    storedConfig(['promptfoo://provider/target'], undefined, ['Saved']);
    recordedTarget('openai:codex-security');
    expect((await replay(0, 0)).status).toBe(400);
    recordedTarget('echo', 1);
    expect((await replay(0, 0)).status).toBe(400);
    recordedTarget('echo', 0, 'promptfoo://provider/other');
    expect((await replay(0, 0)).status).toBe(400);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('preserves an ordinary provider’s explicit Cloud link but rejects a removed one', async () => {
    const linkedTargetId = 'promptfoo://provider/target';
    recordedTarget('echo', 0, linkedTargetId);
    storedConfig(['echo']);
    expect((await replay(0, 0)).status).toBe(400);
    expect(evaluate).not.toHaveBeenCalled();
    storedConfig([{ id: 'echo', config: { linkedTargetId } }]);
    expect((await replay(0, 0)).status).toBe(200);
  });

  it('skips an unavailable cloud target only for an identifiable, unrelated column', async () => {
    vi.spyOn(cloudConfig, 'isEnabled').mockReturnValue(false);
    const missing = 'promptfoo://provider/unavailable';
    storedConfig(['echo', missing], undefined, ['echo', 'Cloud target']);
    expect((await replay(0, 0)).status).toBe(200);
    expect(evaluate.mock.calls[0][0].providers).toEqual(['echo']);
    expect((await replay(0, 1)).status).toBe(400);

    storedConfig(['echo', { id: missing, label: 'echo' }]);
    expect((await replay(0, 1)).status).toBe(400);
    storedConfig(['echo', missing], undefined, ['echo', 'echo']);
    expect((await replay(0, 1)).status).toBe(400);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it('does not look up a cloud target whose local label rules it out', async () => {
    const auth = vi.spyOn(cloudConfig, 'isEnabled').mockReturnValue(false);
    storedConfig(['echo', { id: 'promptfoo://provider/other', label: 'Other' }]);
    expect((await replay(0, 0)).status).toBe(200);
    expect(auth).not.toHaveBeenCalled();
  });

  it('rejects a cloud Codex Security target before evaluation', async () => {
    mockCloudProvider({ id: 'openai:codex-security', label: 'Saved scanner' });
    storedConfig(['promptfoo://provider/scanner'], undefined, ['Saved scanner']);
    const response = await replay(0, 0);
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Codex Security does not support prompt-only replay');
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('rejects an unresolved cloud URL even when its label matches', async () => {
    mockCloudProvider({ id: 'http', label: 'Cloud', config: { url: '{{ env.URL }}', body: {} } });
    storedConfig(['echo', 'promptfoo://provider/target'], undefined, ['echo', 'Cloud']);
    expect((await replay(0, 1)).status).toBe(400);
    expect(evaluate).not.toHaveBeenCalled();
    expect((await replay(0, 0)).status).toBe(200);
    expect(evaluate.mock.calls[0][0].providers).toEqual(['echo']);
  });

  it('returns a bounded request error for an unavailable provider file', async () => {
    storedConfig([`file://${path.join(directory, 'missing.json')}`]);
    const response = await replay();
    expect(response.status).toBe(400);
    expect(response.body.error).toBe(
      'Cannot resolve the replay provider. Rerun using the eval configuration.',
    );
    expect(evaluate).not.toHaveBeenCalled();
  });
});
