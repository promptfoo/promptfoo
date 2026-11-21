import { describe, expect, it, vi } from 'vitest';
import { readPrompts } from '../../src/prompts/index';
import { prepareScript, ScriptCompletionProvider } from '../../src/providers/scriptCompletion';
import { createApp } from '../../src/server/server';
import { withoutExecutableScripts } from '../../src/util/scriptExecution';
import { setupTestServer } from '../util/testServer';

describe('HTTP script execution policy', () => {
  const api = setupTestServer(createApp);

  it('blocks direct provider tests', async () => {
    const res = await api.post('/api/providers/test').send({
      providerOptions: { id: 'exec:inert-fixture' },
      prompt: 'hello',
    });
    expect(res.status).toBe(500);
  });

  it('rejects a locally prepared provider or command inside the request scope', async () => {
    const provider = new ScriptCompletionProvider('node --version');
    const script = prepareScript('node --version');
    await withoutExecutableScripts(async () => {
      const message = 'are disabled over HTTP';
      await expect(provider.callApi('hello')).rejects.toThrow(message);
      await expect(script.run([])).rejects.toThrow(message);
      await expect(readPrompts(`file://${process.execPath}`)).rejects.toThrow(message);
    });
  });

  it.each([
    { providers: ['echo'], prompts: ['exec:inert-fixture'] },
    { providers: ['exec:inert-fixture'], prompts: ['hello'] },
  ])('rejects executable scripts in asynchronous eval jobs (case %#)', async (config) => {
    const res = await api
      .post('/api/eval/job')
      .send({ ...config, tests: [{ vars: { value: 'hello' } }], sharing: false });
    expect(res.status).toBe(200);
    await vi.waitFor(
      async () => {
        const job = await api.get(`/api/eval/job/${res.body.id}`);
        expect(job.body.status).toBe('error');
        expect(job.body.logs.join(' ')).toContain('are disabled over HTTP');
      },
      { timeout: 5000 },
    );
  });
});
