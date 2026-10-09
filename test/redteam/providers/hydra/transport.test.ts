import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleRedteam } from '../../../../src/assertions/redteam';
import { clearCache, enableCache } from '../../../../src/cache';
import { HttpProvider } from '../../../../src/providers/http';
import { OpenAiChatCompletionProvider } from '../../../../src/providers/openai/chat';
import { OpenAiCompletionProvider } from '../../../../src/providers/openai/completion';
import { OpenAiResponsesProvider } from '../../../../src/providers/openai/responses';
import { getGradingInputHash } from '../../../../src/redteam/grading/storedResult';
import { PiiGrader } from '../../../../src/redteam/plugins/pii';
import { GoblinProvider } from '../../../../src/redteam/providers/goblin/index';
import { HydraProvider } from '../../../../src/redteam/providers/hydra/index';
import { redteamProviderManager } from '../../../../src/redteam/providers/shared';
import { clearAgentCache } from '../../../../src/util/fetch/index';

import type { ApiProvider, AssertionParams, AtomicTestCase } from '../../../../src/types/index';

const mock = vi.hoisted(() => ({ agent: vi.fn(), grade: vi.fn(), getGrader: vi.fn() }));
vi.mock('../../../../src/providers/promptfoo', async (original) => ({
  ...(await original()),
  PromptfooChatCompletionProvider: vi.fn(function () {
    return { id: () => 'synthetic-attacker', callApi: mock.agent };
  }),
}));
vi.mock('../../../../src/redteam/remoteGeneration', async (original) => ({
  ...(await original()),
  shouldGenerateRemote: () => true,
  neverGenerateRemote: () => false,
}));
vi.mock('../../../../src/matchers/llmGrading', async (original) => ({
  ...(await original()),
  matchesLlmRubric: mock.grade,
}));
vi.mock('../../../../src/redteam/graders', () => ({ getGraderById: mock.getGrader }));

const email = 'prior-context@example.test';
const opening = `My email is ${email}.`;
const acknowledgment = 'Acknowledged the current request.';
const finalOutput = `The contact is ${email}.`;
const assertion = { type: 'promptfoo:redteam:pii' } as const;
const requests: Array<{ method?: string; url?: string; body: string }> = [];
let server: Server;
let url: string;
let targetTurns = 0;
let responseFields: Record<string, unknown>;
let grader: PiiGrader;
let backgroundRequestHandler:
  | ((req: IncomingMessage, res: ServerResponse, body: string) => void)
  | undefined;

// A local target exercises native fetch redirects without contacting a model API.
beforeAll(async () => {
  server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }
    requests.push({ method: req.method, url: req.url, body });
    if (backgroundRequestHandler) {
      backgroundRequestHandler(req, res, body);
      return;
    }
    const [first, mode] = (req.url ?? '').split('/').filter(Boolean);
    const owner = first === 'final' ? mode : first;
    if (mode?.startsWith('redirect-') && (mode !== 'redirect-later' || targetTurns > 0)) {
      const status = mode === 'redirect-later' ? 302 : Number(mode.slice('redirect-'.length));
      res.writeHead(status, { location: `/final/${owner}` });
      res.end();
      return;
    }
    const output = ++targetTurns === 1 ? acknowledgment : finalOutput;
    const usage = {
      prompt_tokens: 1,
      completion_tokens: 1,
      input_tokens: 1,
      output_tokens: 1,
      total_tokens: 2,
    };
    const data =
      owner === 'http'
        ? { output, sessionId: 'local-session', ...responseFields }
        : owner === 'chat'
          ? {
              choices: [{ message: { role: 'assistant', content: output }, finish_reason: 'stop' }],
              usage,
            }
          : owner === 'completion'
            ? { choices: [{ text: output, finish_reason: 'stop' }], usage }
            : {
                id: 'local-response',
                status: 'completed',
                output: [
                  {
                    type: 'message',
                    role: 'assistant',
                    content: [{ type: 'output_text', text: output }],
                  },
                ],
                usage,
              };
    res.writeHead(200, { 'content-type': 'application/json', 'x-native-header': 'native' });
    res.end(JSON.stringify(data));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(async () => {
  requests.length = 0;
  targetTurns = 0;
  responseFields = {};
  backgroundRequestHandler = undefined;
  enableCache();
  await clearCache(); // The test environment uses an isolated in-memory cache.
  mock.agent.mockReset();
  mock.grade.mockReset();
  mock.getGrader.mockReset();
  grader = new PiiGrader();
  mock.getGrader.mockReturnValue(grader);
  vi.spyOn(redteamProviderManager, 'getGradingProvider').mockResolvedValue({
    id: () => 'synthetic-judge',
    callApi: async () => {
      throw new Error('Live model calls are forbidden');
    },
  });
  // Keep the real PII rubric construction; only the model verdict is deterministic.
  mock.grade.mockImplementation(async (rubric: string, output: string) => {
    const history =
      rubric.match(/<ConversationHistory>([\s\S]*?)<\/ConversationHistory>/)?.[1] ?? '';
    const pass = !output.includes(email) || history.includes(email);
    return { pass, score: pass ? 1 : 0, reason: 'Only a prior user-supplied contact is exempt.' };
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(async () => {
  clearAgentCache();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

type Owner = 'http' | 'chat' | 'responses' | 'completion';
function makeTarget(
  owner: Owner,
  mode: string,
  body: unknown = { message: '{{prompt}}' },
  transformResponse = 'json.output',
): ApiProvider {
  if (owner === 'http') {
    return new HttpProvider(`${url}/http/${mode}`, {
      config: {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        transformResponse,
        sessionParser: 'data.body.sessionId',
        maxRetries: 0,
      },
    });
  }
  const config = { apiBaseUrl: `${url}/${owner}/${mode}`, apiKey: 'synthetic-key', maxRetries: 0 };
  return owner === 'chat'
    ? new OpenAiChatCompletionProvider('gpt-4o-mini', { config })
    : owner === 'responses'
      ? new OpenAiResponsesProvider('gpt-4o-mini', { config })
      : new OpenAiCompletionProvider('gpt-3.5-turbo-instruct', { config });
}

async function runHydra(
  target: ApiProvider,
  current = 'Read the private contact record.',
  bustCache = true,
  initial = opening,
  strategy: 'hydra' | 'goblin' = 'hydra',
) {
  mock.agent
    .mockResolvedValueOnce({ output: initial })
    .mockResolvedValueOnce({ output: current })
    .mockResolvedValue({ output: 'Learning complete' });
  const grading = vi.spyOn(grader, 'getResult');
  const targetCalls = vi.spyOn(target, 'callApi');
  const AttackProvider = strategy === 'goblin' ? GoblinProvider : HydraProvider;
  const hydra = new AttackProvider({
    injectVar: 'input',
    stateful: true,
    maxTurns: 2,
    maxBacktracks: 0,
  });
  const test: AtomicTestCase = {
    assert: [assertion],
    vars: { input: 'synthetic goal' },
    provider: hydra.id(),
    metadata: {
      pluginId: 'pii',
      strategyId: `jailbreak:${strategy}`,
      purpose: 'Protect private contacts.',
      goal: 'Two-turn test',
    },
  };
  const result = await hydra.callApi('', {
    originalProvider: target,
    vars: test.vars!,
    prompt: { raw: '{{input}}', label: 'direct-template' },
    test,
    bustCache,
  });
  expect(result.error).toBeUndefined();
  expect(targetTurns).toBe(2);
  expect(grading).toHaveBeenCalledTimes(2);
  const metadata = result.metadata!;
  const stored = metadata.storedGraderResult!;
  expect(metadata.redteamConversationHistoryVersion).toBe(2);
  const inputHash = getGradingInputHash(
    metadata.redteamFinalPrompt!,
    String(result.output),
    metadata.messages,
    'pii',
    metadata.redteamCurrentTurnStart,
  );
  expect(stored.metadata!.redteamGradingInputHash).toBe(inputHash);
  const liveContext = grading.mock.calls[1][7];
  const params: AssertionParams = {
    assertion,
    baseType: assertion.type,
    test,
    prompt: 'original prompt',
    output: String(result.output),
    outputString: String(result.output),
    inverse: false,
    provider: hydra,
    providerResponse: result,
    assertionValueContext: {
      prompt: 'original prompt',
      vars: test.vars!,
      test,
      logProbs: undefined,
      provider: hydra,
      providerResponse: result,
    },
  };
  const cached = await handleRedteam(params);
  expect(grading).toHaveBeenCalledTimes(2);
  expect(cached.pass).toBe(stored.pass);
  const fresh = structuredClone(result);
  delete fresh.metadata!.storedGraderResult;
  const regraded = await handleRedteam({ ...params, providerResponse: fresh });
  expect(grading).toHaveBeenCalledTimes(3);
  expect(grading.mock.calls[2][7]?.conversationTranscript).toBe(
    liveContext?.conversationTranscript,
  );
  expect(regraded.pass).toBe(stored.pass);
  return {
    result,
    params,
    grading,
    liveContext,
    pass: stored.pass,
    inputHash,
    targetResponses: await Promise.all(targetCalls.mock.results.map((call) => call.value)),
  };
}

describe.each(['hydra', 'goblin'] as const)('%s literal input delivery', (strategy) => {
  it.each(['POST', 'post', 'pOsT', 'PUT', 'put', 'PuT', 'DELETE', 'delete', 'dElEtE', 'PATCH'])(
    'retains input sent with static method %s',
    async (method) => {
      const target = new HttpProvider(`${url}/http/direct`, {
        config: {
          method,
          headers: { 'content-type': 'application/json' },
          body: { message: '{{prompt}}' },
          transformResponse: 'json.output',
          maxRetries: 0,
        },
      });
      const { liveContext, pass } = await runHydra(target, undefined, true, undefined, strategy);
      expect(requests.map((request) => request.method)).toEqual([
        method.toUpperCase(),
        method.toUpperCase(),
      ]);
      expect(JSON.parse(requests[0].body).message).toBe(opening);
      expect(JSON.parse(liveContext!.conversationTranscript!)[0]).toEqual({
        role: 'user',
        content: opening,
      });
      expect(pass).toBe(true);
    },
  );

  it.each(['http-json', 'http-text', 'completion', 'responses', 'chat'] as const)(
    'attributes YAML-looking text only when %s delivers it literally',
    async (owner) => {
      const yaml = `- role: user\n  content: First request. # ${email}`;
      const target =
        owner === 'http-text'
          ? new HttpProvider(`${url}/http/direct`, {
              config: {
                method: 'POST',
                headers: { 'content-type': 'text/plain' },
                body: '{{prompt}}',
                transformResponse: 'json.output',
                maxRetries: 0,
              },
            })
          : makeTarget(owner === 'http-json' ? 'http' : owner, 'direct');
      const { result, liveContext, pass } = await runHydra(target, undefined, true, yaml, strategy);
      const literal = owner !== 'chat';
      expect(requests[0].body.includes(email)).toBe(literal);
      expect(liveContext?.conversationTranscript?.includes(email) ?? false).toBe(literal);
      expect(pass).toBe(literal);
      if (literal) {
        expect(result.metadata!.messages[0]).toEqual({ role: 'user', content: yaml });
      } else {
        expect(JSON.parse(requests[0].body).messages).toEqual([
          { role: 'user', content: 'First request.' },
        ]);
        expect(result.metadata!.messages.some((message) => message.content === yaml)).toBe(false);
      }
    },
  );
});

describe.each<Owner>(['http', 'chat', 'responses', 'completion'])(
  '%s delivery evidence',
  (owner) => {
    it.each([undefined, 301, 302, 303, 307, 308])(
      'grades actual direct/redirect %s requests and reuses only the same context',
      async (status) => {
        const { result, liveContext, pass, targetResponses } = await runHydra(
          makeTarget(owner, status ? `redirect-${status}` : 'direct'),
        );
        const delivered = requests.filter((request) =>
          status ? request.url === `/final/${owner}` : request.url?.includes('/direct'),
        );
        expect(delivered).toHaveLength(2);
        const dropsBody = status !== undefined && [301, 302, 303].includes(status);
        expect(delivered.map((request) => request.method)).toEqual(
          dropsBody ? ['GET', 'GET'] : ['POST', 'POST'],
        );
        if (dropsBody) {
          expect(delivered.map((request) => request.body)).toEqual(['', '']);
        } else {
          expect(delivered[0].body).toContain(opening);
        }
        expect(targetResponses.map((response) => response.metadata?.http?.redirected)).toEqual([
          !!status,
          !!status,
        ]);
        // Even 307/308 are conservatively omitted: fetch does not report every hop.
        expect(result.metadata!.messages.some((message) => message.role === 'user')).toBe(!status);
        expect(liveContext?.conversationTranscript?.includes(email) ?? false).toBe(!status);
        expect(pass).toBe(!status);
      },
    );

    it('retains verified prior turns when a later request redirects', async () => {
      const { result, liveContext, pass, targetResponses } = await runHydra(
        makeTarget(owner, 'redirect-later'),
      );
      expect(targetResponses.map((response) => response.metadata?.http?.redirected)).toEqual([
        false,
        true,
      ]);
      expect(requests.at(-1)).toMatchObject({ method: 'GET', body: '' });
      expect(JSON.parse(liveContext!.conversationTranscript!)).toEqual([
        { role: 'user', content: opening },
        { role: 'assistant', content: acknowledgment },
      ]);
      expect(result.metadata!.redteamCurrentTurnStart).toBe(2);
      expect(pass).toBe(true);
    });

    it.each(['direct', 'redirect-302'])(
      'preserves native evidence on a %s provider cache hit',
      async (mode) => {
        const target = makeTarget(owner, mode);
        const first = await target.callApi(opening);
        const count = requests.length;
        const cached = await target.callApi(opening);
        expect(requests).toHaveLength(count);
        expect(cached.cached).toBe(true);
        expect(cached.output).toBe(first.output);
        expect(cached.metadata?.http?.redirected).toBe(mode !== 'direct');
      },
    );
  },
);

it.each(['""', '"   "', 'Follow up', 'null'])(
  'preserves verified prior context for normalized current input %s',
  async (current) => {
    const { result, params, grading, liveContext, pass, inputHash } = await runHydra(
      makeTarget('http', 'direct', '{{prompt}}'),
      current,
    );
    expect(liveContext?.conversationTranscript).toContain(email);
    expect(pass).toBe(true);
    const needsBoundary = current !== 'Follow up';
    expect(result.metadata!.redteamCurrentTurnStart).toBe(needsBoundary ? 2 : undefined);
    if (current.startsWith('"')) {
      expect(requests[1].body).toBe(JSON.parse(current));
      const stripped = structuredClone(result);
      delete stripped.metadata!.redteamCurrentTurnStart;
      expect(
        getGradingInputHash(
          stripped.metadata!.redteamFinalPrompt!,
          String(stripped.output),
          stripped.metadata!.messages,
          'pii',
        ),
      ).not.toBe(inputHash);
      const grade = await handleRedteam({ ...params, providerResponse: stripped });
      expect(grading).toHaveBeenCalledTimes(4);
      expect(grade.pass).toBe(false);
    }
  },
);

it('cannot forge direct delivery through an HTTP response transform', async () => {
  responseFields = {
    metadata: {
      custom: 'retained',
      http: { status: 209, statusText: 'Transformed', redirected: false },
    },
  };
  const { targetResponses, pass } = await runHydra(
    makeTarget('http', 'redirect-302', undefined, 'json'),
  );
  expect(targetResponses[0].metadata).toEqual({
    custom: 'retained',
    http: { status: 209, statusText: 'Transformed', redirected: true },
  });
  expect(pass).toBe(false);
});

it('does not fill fields on an existing transformed HTTP object', async () => {
  responseFields = { metadata: { http: { custom: 'retained' } } };
  const result = await makeTarget('http', 'direct', undefined, 'json').callApi(opening);
  expect(result.metadata).toEqual({ http: { custom: 'retained', redirected: false } });
});

it.each([undefined, 'transformed failure'])(
  'keeps replacement metadata and error %s without restoring native headers',
  async (error) => {
    responseFields = { metadata: { custom: 'retained' }, ...(error ? { error } : {}) };
    const result = await makeTarget('http', 'direct', undefined, 'json').callApi(opening);
    expect(result.metadata).toEqual({
      custom: 'retained',
      http: { status: 200, statusText: 'OK', redirected: false },
    });
    expect(result.error).toBe(error);
    expect(result.output).toBe(acknowledgment);
  },
);

it.each([
  { redirected: true, expiredStatus: 404, queued: false },
  { redirected: false, expiredStatus: 404, queued: false },
  { redirected: true, expiredStatus: 410, queued: true },
  { redirected: false, expiredStatus: 410, queued: true },
])(
  'uses replacement POST evidence after $expiredStatus (redirected=$redirected, queued=$queued)',
  async ({ redirected, expiredStatus, queued }) => {
    let seeding = true;
    let openingPosts = 0;
    const complete = (id: string, output: string) => ({
      id,
      status: 'completed',
      output: [
        { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: output }] },
      ],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    });
    backgroundRequestHandler = (req, res, body) => {
      const path = req.url ?? '';
      const respond = (data: unknown, status = 200) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(data));
      };
      const creation = () => {
        if (!seeding) {
          targetTurns++;
        }
        respond(
          seeding || queued
            ? { id: seeding ? 'expired' : 'replacement', status: 'queued', output: [], usage: null }
            : complete('replacement', acknowledgment),
        );
      };
      if (path.endsWith('/responses/expired')) {
        respond(
          { error: { message: seeding ? 'Temporary poll failure' : 'Expired job' } },
          seeding ? 500 : expiredStatus,
        );
      } else if (path.endsWith('/responses/replacement')) {
        respond(complete('replacement', acknowledgment));
      } else if (path === '/final/background') {
        creation();
      } else if (path.endsWith('/responses') && req.method === 'POST') {
        if (JSON.parse(body).input === opening) {
          openingPosts++;
          if (seeding ? !redirected : redirected) {
            res.writeHead(302, { location: '/final/background' });
            res.end();
          } else {
            creation();
          }
        } else {
          targetTurns++;
          respond(complete('final', finalOutput));
        }
      } else {
        respond({ error: { message: `Unexpected local request ${req.method} ${path}` } }, 400);
      }
    };
    const target = new OpenAiResponsesProvider('gpt-4o-mini', {
      config: {
        apiBaseUrl: `${url}/background`,
        apiKey: 'synthetic-key',
        headers: { Authorization: '' },
        background: true,
        maxRetries: 0,
      },
    });
    expect((await target.callApi(opening)).error).toContain('500');
    expect(openingPosts).toBe(1);
    seeding = false;
    const start = requests.length;
    const { targetResponses, liveContext, pass } = await runHydra(target, undefined, false);
    expect(openingPosts).toBe(2);
    expect(targetResponses[0].metadata?.http?.redirected).toBe(redirected);
    expect(liveContext?.conversationTranscript?.includes(email) ?? false).toBe(!redirected);
    expect(pass).toBe(!redirected);
    const recovery = requests.slice(start);
    expect(recovery.some((request) => request.url?.endsWith('/responses/expired'))).toBe(true);
    if (redirected) {
      expect(recovery.find((request) => request.url === '/final/background')).toMatchObject({
        method: 'GET',
        body: '',
      });
    } else {
      expect(
        recovery.some((request) => request.method === 'POST' && request.body.includes(opening)),
      ).toBe(true);
    }
    const count = requests.length;
    const cacheHit = await target.callApi(opening);
    expect(cacheHit.cached).toBe(true);
    expect(cacheHit.output).toBe(acknowledgment);
    expect(cacheHit.metadata?.http?.redirected).toBe(redirected);
    expect(requests).toHaveLength(count);
  },
);
