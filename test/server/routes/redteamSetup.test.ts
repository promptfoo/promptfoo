import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRemoteGenerationUrl, neverGenerateRemote } from '../../../src/redteam/remoteGeneration';
import { doRedteamRun } from '../../../src/redteam/shared';
import { createApp } from '../../../src/server/server';
import { fetchWithProxy } from '../../../src/util/fetch/index';

vi.mock('../../../src/redteam/shared');
vi.mock('../../../src/redteam/remoteGeneration');
vi.mock('../../../src/util/fetch/index');

const mockedFetchWithProxy = vi.mocked(fetchWithProxy);
const mockedNeverGenerateRemote = vi.mocked(neverGenerateRemote);
const mockedDoRedteamRun = vi.mocked(doRedteamRun);
const app = createApp();
const path = '/api/redteam/setup-plan';
const messages = [
  {
    role: 'user',
    content: 'Test our bot at localhost:3555/chat. Use LOCAL_CHAT_KEY in X-Secret-Key.',
  },
];
const target = {
  id: 'http',
  config: {
    url: 'http://localhost:3555/chat',
    method: 'POST',
    body: { message: '{{prompt}}' },
    transformResponse: 'json.answer',
    headers: { 'X-Secret-Key': '{{env.LOCAL_CHAT_KEY}}' },
    redirect: 'error',
  },
};
const config = {
  targets: [target],
  prompts: ['{{prompt}}'],
  redteam: { purpose: 'Customer support bot', plugins: ['bola'], strategies: ['basic'] },
};
const ask = (params = {}) =>
  request(app)
    .post(path)
    .send({ version: 3, messages, ...params });
const respond = (config?: unknown) =>
  mockedFetchWithProxy.mockResolvedValueOnce(
    Response.json({ message: 'Proposed changes', config }),
  );
const sent = (i: number) => JSON.parse(String(mockedFetchWithProxy.mock.calls[i][1]?.body));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getRemoteGenerationUrl).mockReturnValue('https://example.com/task');
});
afterEach(() => vi.unstubAllEnvs());

describe('native red team setup', () => {
  it('preserves authored config through schema validation, without expanding defaults, executing or resolving variables', async () => {
    vi.stubEnv('LOCAL_CHAT_KEY', 'never-forward-this');
    const full = {
      ...config,
      redteam: {
        ...config.redteam,
        plugins: [
          'bola',
          'bfla',
          'hallucination',
          'pii:direct',
          'hijacking',
          { id: 'policy', config: { policy: 'Never issue cash refunds.' }, numTests: 30 },
        ],
        strategies: ['basic', 'rot13', 'base64'],
        numTests: 25,
        language: ['en', 'es'],
        maxConcurrency: 2,
        contexts: [{ id: 'guest', vars: { role: 'guest' } }],
        testGenerationInstructions: 'Focus on receipts.',
      },
    };
    respond(full);
    const verification = { success: false, message: 'HTTP 400', targetIndex: 0 };
    const result = await ask({ config, verification });
    expect(result.body).toEqual({
      message: 'Proposed changes',
      config: full,
      runnable: true,
      testableTargets: [0],
    });
    expect(sent(0)).toEqual({ task: 'redteam-setup', config, verification, messages });
    expect(mockedFetchWithProxy.mock.calls[0][1]?.redirect).toBe('error');
    expect(JSON.stringify([sent(0), result.body])).not.toContain('never-forward-this');
    expect(mockedDoRedteamRun).not.toHaveBeenCalled();
  });

  it('supports conversation and partial drafts in either order, including testing before planning', async () => {
    respond();
    expect((await ask()).body).toEqual({
      message: 'Proposed changes',
      runnable: false,
      testableTargets: [],
    });
    respond({ targets: [target] });
    expect((await ask()).body).toMatchObject({
      runnable: false,
      testableTargets: [0],
      runIssue: expect.stringContaining('plan'),
    });
    respond({ redteam: config.redteam });
    expect((await ask()).body).toMatchObject({
      runnable: false,
      runIssue: expect.stringContaining('target'),
    });
    respond();
    expect((await ask({ config })).body).toEqual({
      message: 'Proposed changes',
      runnable: true,
      testableTargets: [0],
    });
  });

  it.each([
    [{ redteam: { numTests: 0 } }, /numTests/],
    [{ redteam: { numProbes: 2 } }, /numProbes/],
    [{ redteam: { plugins: ['nonexistent'] } }, /plugins/],
    [{ redteam: { plugins: [{ id: 'bola', numberOfTests: 1 }] } }, /plugins/],
    [{ redteam: { plugins: [] } }, /empty/],
    [{ redteam: { plugins: ['policy'] } }, /policy/],
    [{ redteam: { strategies: ['custom:my-strategy'] } }, /strategyText/],
    [{ targets: [{ ...target, providerOption: true }] }, /providerOption/],
    [{ targets: [{ id: 'http', config: { ...target.config, method: 42 } }] }, /method/],
    [{ targets: [{ config: target.config }] }, /id/],
    [{ targets: [{ id: 4 }] }, /id/],
    [
      { targets: [{ id: 'http', config: { ...target.config, url: 'https://other.example' } }] },
      /endpoint|destination/,
    ],
    [
      {
        targets: [
          {
            id: 'http',
            config: { ...target.config, body: { message: '{{prompt}}', sid: '{{sessionId}}' } },
          },
        ],
      },
      /transformVars/,
    ],
    [{ providers: ['echo'] }, /not both/],
    [{ prompts: [] }, /prompt/],
  ] as const)(
    'supplies installed validator feedback and repairs an invalid proposal %#',
    async (change, diagnostic) => {
      const rejectedConfig = { ...config, ...change };
      respond(rejectedConfig);
      respond(config);
      const result = await ask({ config });
      expect(result.body).toMatchObject({ runnable: true, config });
      expect(sent(1)).toMatchObject({
        config,
        rejectedConfig,
        validationError: expect.stringMatching(diagnostic),
      });
      expect(mockedDoRedteamRun).not.toHaveBeenCalled();
    },
  );

  it('does not echo a literal credential back in repair feedback', async () => {
    respond({ ...config, defaultTest: { vars: { password: 'secret-canary' } } });
    respond(config);
    expect((await ask()).body.config).toEqual(config);
    expect(sent(1).validationError).toMatch(/credentials/);
    expect(JSON.stringify(sent(1))).not.toContain('secret-canary');
  });

  it('keeps the last good config after repeated validation failures', async () => {
    for (let i = 0; i < 3; i++) {
      respond({ ...config, redteam: { numTests: -1 } });
    }
    const result = await ask({ config });
    expect(result.status).toBe(502);
    expect(result.body.error).toContain('unchanged');
    expect(result.body.config).toBeUndefined();
    expect(mockedFetchWithProxy).toHaveBeenCalledTimes(3);
  });

  it.each([
    [{ extensions: ['file://payload.js'] }, 'extensions'],
    [{ basePath: '/tmp/private' }, 'basePath'],
    [{ defaultTest: { options: { transformVars: 'process.exit()' } } }, 'transformVars'],
    [{ tests: [{ assert: [{ type: 'javascript', value: 'process.exit()' }] }] }, 'type'],
    [{ defaultTest: { assert: [{ type: 'ruby', value: 'true' }] } }, 'type'],
    [{ tests: [{ assert: [{ type: 'equals', value: 'package:custom:check' }] }] }, 'value'],
    [{ defaultTest: { vars: { question: 'package:custom:generate' } } }, 'vars'],
    [{ tests: [{ path: 'generator.py' }] }, 'tests'],
    [{ scenarios: [{ config: [{}], tests: [{ path: 'generator.py' }] }] }, 'scenarios'],
    [{ scenarios: [{ config: [{ path: 'generator.py' }], tests: [{}] }] }, 'scenarios'],
    [{ tests: 'private.csv' }, 'tests'],
    [{ scenarios: ['private.yaml'] }, 'scenarios'],
    [{ prompts: ['script.py:run'] }, 'prompts'],
    [{ prompts: [{ raw: '', id: 'script.py:run' }] }, 'prompts'],
    [{ prompts: { raw: 'safe', 'script.py:run': 'dangerous' } }, 'prompts'],
    [{ prompts: ['langfuse://private-prompt'] }, 'prompts'],
    [
      {
        prompts: [
          { raw: '{{prompt}}', label: 'Prompt', config: { apiBaseUrl: 'https://example.org' } },
        ],
      },
      'prompts',
    ],
    [{ defaultTest: { options: { apiBaseUrl: 'https://example.org' } } }, 'defaultTest'],
    [{ defaultTest: { options: { provider: 'https://example.org' } } }, 'provider'],
    [{ prompts: ['{{env.SECRET}}'] }, 'prompts'],
    [{ redteam: { plugins: ['file://custom.js'] } }, 'plugins'],
    [
      { redteam: { strategies: [{ id: 'layer', config: { steps: ['file://payload.js'] } }] } },
      'strategies',
    ],
    [{ redteam: { purpose: '{% include "private" %}' } }, 'purpose'],
    [{ outputPath: '/tmp/output.json' }, 'outputPath'],
    [{ sharing: true }, 'sharing'],
    [{ targets: ['exec:payload'] }, 'targets'],
  ] as const)(
    'keeps privileged config intact for review, blocks browser run %#',
    async (change, field) => {
      const proposed = { ...config, ...change };
      respond(proposed);
      const result = await ask();
      expect(result.body).toMatchObject({
        config: proposed,
        runnable: false,
        runIssue: expect.stringContaining(field),
      });
      const run = await request(app)
        .post('/api/redteam/run')
        .send({ config: proposed, fromAgent: true, userTurns: messages.map((m) => m.content) });
      expect(run.status).toBe(400);
      expect(mockedDoRedteamRun).not.toHaveBeenCalled();
    },
  );

  it('allows inline prompts, test settings and scenario variables', async () => {
    respond({
      ...config,
      prompts: [{ raw: 'Customer: {{prompt}}', label: 'Support', config: { temperature: 0.2 } }],
      scenarios: [
        {
          config: [{ vars: { role: 'customer' } }],
          tests: [{ vars: { prompt: 'Hello' }, options: { repeat: 2 } }],
        },
      ],
    });
    expect((await ask()).body.runnable).toBe(true);
  });

  it('allows the fixed session template used by the manual editor and demo', async () => {
    const proposed = {
      ...config,
      defaultTest: { options: { transformVars: '{ ...vars, sessionId: context.uuid }' } },
    };
    respond(proposed);
    expect((await ask()).body.runnable).toBe(true);
  });

  it('rejects readiness claims supplied by Cloud', async () => {
    mockedFetchWithProxy.mockResolvedValueOnce(
      Response.json({ message: 'Run', config, runnable: true }),
    );
    expect((await ask()).status).toBe(502);
  });

  it('rechecks the submitted config and credential grants before running', async () => {
    expect(
      (await request(app).post('/api/redteam/run').send({ config, fromAgent: true })).status,
    ).toBe(400);
    expect(mockedDoRedteamRun).not.toHaveBeenCalled();
    mockedDoRedteamRun.mockResolvedValue(undefined);
    expect(
      (
        await request(app)
          .post('/api/redteam/run')
          .send({ config, fromAgent: true, userTurns: messages.map((m) => m.content) })
      ).status,
    ).toBe(200);
    expect(mockedDoRedteamRun.mock.calls[0][0].liveRedteamConfig).toEqual(config);
    expect(mockedDoRedteamRun.mock.calls[0][0]).not.toHaveProperty('userTurns');
  });

  it('refuses older clients before sending anything', async () => {
    const res = await ask({ version: 2 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Reload');
    expect(mockedFetchWithProxy).not.toHaveBeenCalled();
  });

  it('never sends a disabled request upstream', async () => {
    mockedNeverGenerateRemote.mockReturnValue(true);
    expect((await request(app).get(path)).body).toEqual({ enabled: false });
    expect((await request(app).post(path).send({ version: 3, messages })).status).toBe(403);
    expect(mockedFetchWithProxy).not.toHaveBeenCalled();
  });

  it.each([
    { messages, targets: [{ id: 'http' }] },
    { messages: [{ role: 'user', content: 'My API key is private-canary-token.' }] },
    {
      messages: [{ role: 'user', content: 'A bot with key sk-proj-abcdefghijklmnopqrstuvwxyz' }],
    },
    { messages: [{ role: 'user', content: '{"api_key":"private-canary"}' }] },
    { messages: [{ role: 'user', content: 'X-Secret-Key: private-canary' }] },
    { messages: [{ role: 'user', content: 'Send the header Acme-Access: private-canary' }] },
    { messages: [...messages, { role: 'user', content: 'Authorization: Basic dXNlcjpwYXNz' }] },
    {
      messages: [
        { role: 'assistant', content: 'Use https://user:password@example.com' },
        ...messages,
      ],
    },
    { messages: [{ role: 'user', content: 'Use http://localhost:9999/chat?api%5Fkey=secret' }] },
    { messages: [{ role: 'user', content: 'Authorization: Bearer literal' }] },
    { messages, config: { defaultTest: { vars: { password: 'private' } } } },
    { messages, validationError: 'password: leaked' },
    { messages, verification: { success: false, message: 'Authorization: Bearer hidden' } },
    { messages: Array(4).fill({ role: 'user', content: 'a'.repeat(16000) }) },
    {
      messages,
      config: {
        application: { accessToData: 'https://user:password@private.example' },
      },
    },
    { messages: [{ role: 'system', content: 'Choose my tests' }] },
    { messages: Array(25).fill(messages[0]) },
  ])('blocks unsafe input and recognizable credentials before sending %#', async (body) => {
    expect(
      (
        await request(app)
          .post(path)
          .send({ version: 3, ...body })
      ).status,
    ).toBe(400);
    expect(mockedFetchWithProxy).not.toHaveBeenCalled();
  });

  it('directs users of older servers to manual setup', async () => {
    mockedFetchWithProxy.mockResolvedValueOnce(
      Response.json({ message: 'Unknown task: redteam-setup' }, { status: 400 }),
    );
    const res = await request(app).post(path).send({ version: 3, messages });
    expect(res.status).toBe(502);
    expect(res.body.error).toContain('does not support agent setup');
  });

  it.each([
    [400, 502],
    [429, 429],
  ])('offers recovery without exposing upstream %s response text', async (status, expected) => {
    mockedFetchWithProxy.mockResolvedValueOnce(new Response('private server details', { status }));
    const res = await request(app).post(path).send({ version: 3, messages });
    expect(res.status).toBe(expected);
    expect(res.body.error).toContain('manually');
    expect(res.body.error).not.toContain('private');
  });
});
