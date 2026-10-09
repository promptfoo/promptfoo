import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';

import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/models/eval');
vi.mock('../../../src/node', () => ({ evaluateWithSource: vi.fn() }));
vi.mock('../../../src/globalConfig/accounts');

import { cloudConfig } from '../../../src/globalConfig/cloud';
import Eval from '../../../src/models/eval';
import { evaluateWithSource } from '../../../src/node';
import { loadApiProviders } from '../../../src/providers/index';
import { createApp } from '../../../src/server/server';
import * as fetchUtils from '../../../src/util/fetch/index';
import { normalizeProviderRef } from '../../../src/util/providerRef';

const evaluate = vi.mocked(evaluateWithSource);

describe('POST /api/eval/replay provider boundary', () => {
  let server: Server;
  let api: ReturnType<typeof request.agent>;
  let directory: string;

  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server = createApp().listen(0, '127.0.0.1', (error?: Error) =>
        error ? reject(error) : resolve(),
      );
    });
    api = request.agent(server);
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

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

  function storedConfig(providers: unknown, basePath?: string, columnProviders?: string[]) {
    vi.mocked(Eval.findById).mockResolvedValue({
      getPrompts: () =>
        (
          columnProviders ??
          (Array.isArray(providers) ? providers : [providers]).map((provider) => {
            const ref = normalizeProviderRef(provider);
            return ref.label || ref.id;
          })
        ).map((provider) => ({ provider })),
      config: {
        basePath,
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

  it.each(['echo', 'openai:chat:example-model', 'openai:codex-security-other'])(
    'preserves an ordinary selected provider in a mixed evaluation: %j',
    async (provider) => {
      storedConfig(['openai:codex-security', provider]);
      const response = await replay(0, 1);
      expect(response.status).toBe(200);
      expect(response.body.output).toBe('replayed');
      expect(evaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          providers: [{ id: provider, prompts: ['Replay'] }],
          prompts: [{ raw: 'edited prompt', label: 'Replay' }],
          tests: [{ vars: { name: 'example' } }],
        }),
        expect.objectContaining({ cache: false }),
      );
    },
  );

  it.each([0, 1, 7])('selects by prompt column independently of test row %s', async (testIndex) => {
    storedConfig(['openai:codex-security', 'echo'], undefined, [
      'openai:codex-security',
      'openai:codex-security',
      'echo',
    ]);
    expect((await replay(testIndex, 2)).status).toBe(200);
    expect(evaluate.mock.calls[0][0].providers).toEqual([{ id: 'echo', prompts: ['Replay'] }]);
    expect((await replay(testIndex, 1)).status).toBe(400);
  });

  it('resolves relative provider files from the saved config base path', async () => {
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
      storedConfig([provider]);
      expect((await replay()).status).toBe(200);
      expect(evaluate.mock.calls[0][0].providers).toEqual([expected]);
    },
  );

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
    const provider = { id: 'echo', config: { prefix: 'example' } };
    const file = path.join(directory, 'provider.json');
    await fs.writeFile(file, JSON.stringify(provider));
    storedConfig([`file://${file}`]);
    expect((await replay()).status).toBe(200);
    expect(evaluate.mock.calls[0][0].providers).toEqual([{ ...provider, prompts: ['Replay'] }]);
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
      vi.spyOn(cloudConfig, 'isEnabled').mockReturnValue(true);
      vi.spyOn(cloudConfig, 'getAuthHeaders').mockReturnValue({ Authorization: 'Bearer fixture' });
      const cloudFetch = vi.spyOn(fetchUtils, 'fetchWithProxy').mockResolvedValue(
        new Response(
          JSON.stringify({
            config: {
              id: 'echo',
              label: 'Cloud target',
              prompts: ['original'],
              transform: 'output + " cloud"',
            },
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      );
      const provider = localOverride
        ? {
            'promptfoo://provider/target': {
              id: 'local-alias',
              label: 'Local target',
              prompts: [],
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

  it('rejects a cloud Codex Security target before evaluation', async () => {
    vi.spyOn(cloudConfig, 'isEnabled').mockReturnValue(true);
    vi.spyOn(cloudConfig, 'getAuthHeaders').mockReturnValue({ Authorization: 'Bearer fixture' });
    vi.spyOn(fetchUtils, 'fetchWithProxy').mockResolvedValue(
      new Response(
        JSON.stringify({
          config: { id: 'openai:codex-security', label: 'Saved scanner' },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );
    storedConfig(['promptfoo://provider/scanner'], undefined, ['Saved scanner']);
    const response = await replay(0, 0);
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Codex Security does not support prompt-only replay');
    expect(evaluate).not.toHaveBeenCalled();
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
