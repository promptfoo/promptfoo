import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';

import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/models/eval');
vi.mock('../../../src/node', () => ({ evaluateWithSource: vi.fn() }));
vi.mock('../../../src/globalConfig/accounts');

import Eval from '../../../src/models/eval';
import { evaluateWithSource } from '../../../src/node';
import { createApp } from '../../../src/server/server';

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
    vi.resetAllMocks();
    await fs.rm(directory, { recursive: true, force: true });
  });

  function storedConfig(providers: unknown) {
    vi.mocked(Eval.findById).mockResolvedValue({
      config: {
        providers,
        prompts: [{ raw: 'original', config: { report_file: '/original/report.json' } }],
        tests: [{ options: { report_file: '/original/report.json' } }],
      },
    } as unknown as Eval);
  }

  const replay = (testIndex = 0) =>
    api.post('/api/eval/replay').send({
      evaluationId: 'stored-eval',
      testIndex,
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

  it.each([
    'echo',
    'openai:chat:example-model',
    'openai:codex-security-other',
    { id: 'echo', label: 'openai:codex-security' },
    { echo: { id: 'openai:codex-security', config: {} } },
  ])('preserves an ordinary selected provider in a mixed evaluation: %j', async (provider) => {
    storedConfig(['openai:codex-security', provider]);
    const response = await replay(1);
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
    expect(evaluate.mock.calls[0][0].providers).toEqual([provider]);
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
