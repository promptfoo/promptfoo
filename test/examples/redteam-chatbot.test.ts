import fs from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import type { Server } from 'node:http';

import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const appPath = path.resolve(__dirname, '../../examples/redteam-chatbot/app.js');
const appSource = fs.readFileSync(appPath, 'utf8');

// Run the actual CommonJS example with an inert provider and no startup listener.
function loadExample(loadApiProvider: ReturnType<typeof vi.fn>) {
  const app = express();
  const listen = vi.spyOn(app, 'listen').mockReturnValue({} as Server);
  try {
    runInNewContext(
      appSource,
      {
        require(name: string) {
          if (name === 'express') {
            return Object.assign(() => app, { json: express.json });
          }
          if (name === 'promptfoo') {
            return { loadApiProvider };
          }
          throw new Error(`Unexpected example dependency: ${name}`);
        },
        process: { env: {} },
        console: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      },
      { filename: appPath },
    );
  } finally {
    listen.mockRestore();
  }
  return app;
}

describe('redteam chatbot provider selection', () => {
  let app: express.Express;
  let loadApiProvider: ReturnType<typeof vi.fn>;
  let callApi: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    callApi = vi.fn().mockResolvedValue({ output: 'The showroom opens at 9 AM.' });
    loadApiProvider = vi.fn().mockResolvedValue({ callApi });
    app = loadExample(loadApiProvider);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  it('keeps the documented OpenAI alias and conversation format', async () => {
    const history = [{ role: 'user', content: 'When does the showroom open?' }];
    const response = await request(app).post('/chat').set('Authorization', 'Bearer fixture').send({
      api_provider: 'openai',
      chat_history: history,
    });

    expect(response.status).toBe(200);
    expect(loadApiProvider).toHaveBeenCalledExactlyOnceWith('openai:chat:gpt-6-sol');
    const messages = JSON.parse(callApi.mock.calls[0][0]);
    expect(messages[0]).toMatchObject({ role: 'system' });
    expect(messages.slice(1)).toEqual(history);
    expect(response.body.chat_history).toEqual([
      ...messages,
      { role: 'assistant', content: 'The showroom opens at 9 AM.' },
    ]);
  });

  it('resolves the public alias through the real provider registry', async () => {
    const { loadApiProvider: realLoadApiProvider } = await import('../../src/providers');
    const { OpenAiChatCompletionProvider } = await import('../../src/providers/openai/chat');
    const call = vi
      .spyOn(OpenAiChatCompletionProvider.prototype, 'callApi')
      .mockResolvedValue({ output: 'The showroom opens at 9 AM.' });
    loadApiProvider.mockImplementation(realLoadApiProvider);

    const response = await request(app)
      .post('/chat')
      .set('Authorization', 'Bearer fixture')
      .send({
        api_provider: 'openai',
        chat_history: [{ role: 'user', content: 'When does the showroom open?' }],
      });

    expect(response.status).toBe(200);
    expect(call).toHaveBeenCalledOnce();
    expect(response.body.chat_history.at(-1)).toEqual({
      role: 'assistant',
      content: 'The showroom opens at 9 AM.',
    });
  });

  it.each([
    'https://provider.example',
    'file://fixture-provider.js',
    './fixture-provider.js',
    'promptfoo://fixture-provider',
    'openai:chat:another-model',
    'constructor',
    ['openai'],
    { id: 'openai' },
    42,
  ])('rejects unsupported provider input before loading: %j', async (api_provider) => {
    const response = await request(app)
      .post('/chat')
      .set('Authorization', 'Bearer fixture')
      .send({
        api_provider,
        chat_history: [{ role: 'user', content: 'When does the showroom open?' }],
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Unsupported api_provider. Use openai.' });
    expect(loadApiProvider).not.toHaveBeenCalled();
    expect(callApi).not.toHaveBeenCalled();
  });

  it('preserves missing-field validation without loading a provider', async () => {
    const response = await request(app).post('/chat').set('Authorization', 'Bearer fixture').send({
      chat_history: [],
    });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Missing required field: api_provider' });
    expect(loadApiProvider).not.toHaveBeenCalled();
  });
});
