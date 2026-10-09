import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleRedteam } from '../../../../src/assertions/redteam';
import { clearCache, enableCache, getCache } from '../../../../src/cache';
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
import { createDeferred } from '../../../util/utils';

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
  setup: { prompt?: string; inputs?: Record<string, string> } = {},
) {
  mock.agent
    .mockResolvedValueOnce({ output: initial, materializationHandled: !!setup.inputs })
    .mockResolvedValueOnce({ output: current, materializationHandled: !!setup.inputs })
    .mockResolvedValue({ output: 'Learning complete' });
  const grading = vi.spyOn(grader, 'getResult');
  const targetCalls = vi.spyOn(target, 'callApi');
  const AttackProvider = strategy === 'goblin' ? GoblinProvider : HydraProvider;
  const hydra = new AttackProvider({
    injectVar: 'input',
    stateful: true,
    maxTurns: 2,
    maxBacktracks: 0,
    inputs: setup.inputs,
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
    prompt: { raw: setup.prompt ?? '{{input}}', label: 'direct-template' },
    test,
    bustCache,
  });
  expect(result.error).toBeUndefined();
  expect(targetTurns).toBe(2);
  expect(grading).toHaveBeenCalledTimes(2);
  const metadata = result.metadata!;
  const stored = metadata.storedGraderResult!;
  expect(metadata.redteamConversationHistoryVersion).toBe(3);
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
    firstTargetCall: targetCalls.mock.calls[0],
    targetResponses: await Promise.all(targetCalls.mock.results.map((call) => call.value)),
  };
}

describe.each(['refusal', 'content_filter'] as const)('Chat prepared %s evidence', (kind) => {
  const refusal = 'Cannot comply with this request.';

  function serveDiagnostic(redirected: boolean) {
    backgroundRequestHandler = (req, res) => {
      if (redirected && req.url?.startsWith('/chat/')) {
        res.writeHead(302, { location: '/final/chat' });
        res.end();
        return;
      }
      const first = ++targetTurns === 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                role: 'assistant',
                content: first ? (kind === 'refusal' ? null : refusal) : finalOutput,
                ...(first && kind === 'refusal' ? { refusal } : {}),
              },
              finish_reason: first && kind === 'content_filter' ? 'content_filter' : 'stop',
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      );
    };
  }

  it.each([
    { strategy: 'hydra', redirected: false },
    { strategy: 'hydra', redirected: true },
    { strategy: 'goblin', redirected: false },
    { strategy: 'goblin', redirected: true },
  ] as const)(
    'keeps $strategy grading and cached refusal delivery consistent with redirect=$redirected',
    async ({ strategy, redirected }) => {
      serveDiagnostic(redirected);
      const target = makeTarget('chat', redirected ? 'redirect-302' : 'direct');
      const { targetResponses, firstTargetCall, liveContext, pass } = await runHydra(
        target,
        undefined,
        false,
        undefined,
        strategy,
      );
      expect(targetResponses[0]).toMatchObject({
        output: refusal,
        isRefusal: true,
        metadata: { http: { redirected } },
      });
      const delivered = requests.filter((request) => request.url?.startsWith('/final/'));
      if (redirected) {
        expect(delivered.map(({ method, body }) => ({ method, body }))).toEqual([
          { method: 'GET', body: '' },
          { method: 'GET', body: '' },
        ]);
      } else {
        expect(JSON.parse(requests[0].body).messages).toEqual([{ role: 'user', content: opening }]);
      }
      expect(liveContext?.conversationTranscript?.includes(email) ?? false).toBe(!redirected);
      expect(pass).toBe(!redirected);
      const requestCount = requests.length;
      const cached = await target.callApi(...firstTargetCall);
      expect(cached).toMatchObject({
        cached: true,
        output: refusal,
        isRefusal: true,
        metadata: { http: { redirected } },
      });
      expect(requests).toHaveLength(requestCount);
    },
  );

  it.each([false, true])(
    'retains native redirect=%s for coalesced refusals canceled during publication and the cache hit',
    async (redirected) => {
      serveDiagnostic(redirected);
      const target = makeTarget('chat', redirected ? 'redirect-302' : 'direct');
      const cache = getCache();
      const set = cache.set.bind(cache);
      const publishing = createDeferred<void>();
      const release = createDeferred<void>();
      let publication: Promise<unknown> | undefined;
      vi.spyOn(cache, 'set').mockImplementationOnce((key, value, ttl) => {
        expect(JSON.parse(value as string).redirected).toBe(redirected);
        publishing.resolve();
        publication = release.promise.then(() => set(key, value, ttl));
        return publication;
      });
      const controller = new AbortController();
      const options = { abortSignal: controller.signal };
      const first = target.callApi(opening, undefined, options);
      const second = target.callApi(opening, undefined, options);
      try {
        await publishing.promise;
        await new Promise<void>((resolve) => setImmediate(resolve));
        controller.abort(new DOMException('caller deadline during publication', 'AbortError'));
        const results = await Promise.all([first, second]);
        for (const result of results) {
          expect(result).toMatchObject({
            output: refusal,
            cached: false,
            isRefusal: true,
            metadata: { http: { redirected } },
          });
        }
        expect(targetTurns).toBe(1);
        expect(requests).toHaveLength(redirected ? 2 : 1);
        release.resolve();
        await publication;
        expect(await target.callApi(opening)).toMatchObject({
          output: refusal,
          cached: true,
          isRefusal: true,
          metadata: { http: { redirected } },
        });
        expect(targetTurns).toBe(1);
      } finally {
        release.resolve();
        await Promise.allSettled([first, second, publication]);
      }
    },
  );
});

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

describe.each(['hydra', 'goblin'] as const)('%s rendered JSON input', (strategy) => {
  const duplicate = `{"email":"${email}","email":"retained@example.test"}`;
  const bomDuplicate = `\uFEFF${duplicate}`;
  const cases = [
    { name: 'prompt trim', input: bomDuplicate, prompt: '{{input | trim}}', delivered: false },
    {
      name: 'prompt trim without BOM',
      input: duplicate,
      prompt: '{{input | trim}}',
      delivered: false,
    },
    { name: 'no trim with BOM', input: bomDuplicate, delivered: true },
    {
      name: 'body alias trim',
      input: bomDuplicate,
      body: { message: '{{prompt | trim}}' },
      delivered: false,
    },
    {
      name: 'body alias trim without BOM',
      input: duplicate,
      body: { message: '{{prompt | trim}}' },
      delivered: false,
    },
    {
      name: 'literal text',
      input: bomDuplicate,
      prompt: '{{input | trim}}',
      body: '{{prompt}}',
      text: true,
      delivered: true,
    },
    {
      name: 'nested JSON string',
      input: bomDuplicate,
      prompt: '{"text":"{{input | trim}}"}',
      delivered: true,
    },
    {
      name: 'root JSON body',
      input: bomDuplicate,
      prompt: '{{input | trim}}',
      body: '{{prompt}}',
      delivered: false,
    },
    {
      name: 'ASCII whitespace',
      input: ` \t${duplicate}\n`,
      prompt: '{{input | trim}}',
      delivered: false,
    },
    {
      name: 'side variable trim',
      input: bomDuplicate,
      body: { message: '{{prompt}}', context: '{{user_context | trim}}' },
      side: true,
      delivered: false,
    },
    {
      name: 'side variable trim without BOM',
      input: duplicate,
      body: { message: '{{prompt}}', context: '{{user_context | trim}}' },
      side: true,
      delivered: false,
    },
    {
      name: 'side variable without trim',
      input: bomDuplicate,
      body: { message: '{{prompt}}', context: '{{user_context}}' },
      side: true,
      delivered: true,
    },
    {
      name: 'literal side variable',
      input: bomDuplicate,
      body: '{{user_context | trim}}',
      side: true,
      text: true,
      delivered: true,
    },
    {
      name: 'literal copy after parsed copy',
      input: bomDuplicate,
      body: { parsed: '{{prompt | trim}}', literal: '{{input}}' },
      delivered: true,
    },
    {
      name: 'literal copy before parsed copy',
      input: bomDuplicate,
      body: { literal: '{{input}}', parsed: '{{prompt | trim}}' },
      delivered: true,
    },
    {
      name: 'literal side copy after parsed copy',
      input: bomDuplicate,
      body: { parsed: '{{user_context | trim}}', literal: '{{user_context}}' },
      side: true,
      delivered: true,
    },
    {
      name: 'whole variable prompt with literal body copy after',
      input: bomDuplicate,
      prompt: '{{question | trim}}',
      body: { message: '{{prompt}}', literal: '{{question}}' },
      question: true,
      delivered: true,
    },
    {
      name: 'whole variable prompt with literal body copy before',
      input: bomDuplicate,
      prompt: '{{question | trim}}',
      body: { literal: '{{question}}', message: '{{prompt}}' },
      question: true,
      delivered: true,
    },
    {
      name: 'whole variable prompt without literal body copy',
      input: bomDuplicate,
      prompt: '{{question | trim}}',
      question: true,
      delivered: false,
    },
  ];

  it.each(cases)('grades the delivered value for $name and cache replay', async (spec) => {
    const target = new HttpProvider(`${url}/http/direct`, {
      config: {
        method: 'POST',
        headers: { 'content-type': spec.text ? 'text/plain' : 'application/json' },
        body: spec.body ?? { message: '{{prompt}}' },
        transformResponse: 'json.output',
        maxRetries: 0,
      },
    });
    const multiInput = spec.side || spec.question;
    const initial = multiInput
      ? JSON.stringify({
          question: spec.question ? spec.input : 'Hello.',
          user_context: spec.side ? spec.input : 'Prior context.',
        })
      : spec.input;
    const current = multiInput
      ? JSON.stringify({
          question: 'Read the private contact record.',
          user_context: 'Prior context.',
        })
      : undefined;
    const { result, liveContext, pass, firstTargetCall } = await runHydra(
      target,
      current,
      false,
      initial,
      strategy,
      {
        prompt: spec.side ? '{{question}}' : spec.prompt,
        inputs: multiInput
          ? { question: 'Current request', user_context: 'User context' }
          : undefined,
      },
    );
    const consumed = spec.text ? requests[0].body : JSON.parse(requests[0].body);
    expect(JSON.stringify(consumed).includes(email)).toBe(spec.delivered);
    expect(liveContext?.conversationTranscript?.includes(email) ?? false).toBe(spec.delivered);
    const userMessages = result.metadata!.messages.filter((message) => message.role === 'user');
    expect(JSON.stringify(userMessages).includes(email)).toBe(spec.delivered);
    expect(pass).toBe(spec.delivered);
    const wireCount = requests.length;
    const cached = await target.callApi(...firstTargetCall);
    expect(requests).toHaveLength(wireCount);
    expect(cached.cached).toBe(true);
    expect(cached.metadata?.http?.redirected).toBe(false);
  });

  it('projects a trimmed whole chat prompt after the real chat parser', async () => {
    const input = `\uFEFF[{"role":"user","content":"${email}","content":"Hello."}]`;
    const { liveContext, pass } = await runHydra(
      makeTarget('chat', 'direct'),
      undefined,
      true,
      input,
      strategy,
      { prompt: '{{input | trim}}' },
    );
    expect(JSON.parse(requests[0].body).messages).toEqual([{ role: 'user', content: 'Hello.' }]);
    expect(liveContext!.conversationTranscript).not.toContain(email);
    expect(pass).toBe(false);
  });

  it('invalidates persisted v2 false credit for both saved reuse and explicit regrading', async () => {
    const { result, params, grading } = await runHydra(
      makeTarget('http', 'direct'),
      undefined,
      true,
      bomDuplicate,
      strategy,
      { prompt: '{{input | trim}}' },
    );
    expect(JSON.parse(requests[0].body)).toEqual({ message: { email: 'retained@example.test' } });
    expect(result.metadata!.storedGraderResult!.pass).toBe(false);
    const old = structuredClone({
      ...result,
      metadata: { ...result.metadata!, redteamConversationHistoryVersion: 2 },
    });
    const metadata = old.metadata!;
    metadata.messages[0].content = bomDuplicate;
    metadata.storedGraderResult!.pass = true;
    metadata.storedGraderResult!.score = 1;
    metadata.storedGraderResult!.metadata!.redteamGradingInputHash = getGradingInputHash(
      metadata.redteamFinalPrompt!,
      String(old.output),
      metadata.messages,
      'pii',
      metadata.redteamCurrentTurnStart,
    );
    for (const saved of [true, false]) {
      const priorCalls = grading.mock.calls.length;
      const response = structuredClone(old);
      if (!saved) {
        delete response.metadata!.storedGraderResult;
      }
      const regraded = await handleRedteam({ ...params, providerResponse: response });
      expect(grading).toHaveBeenCalledTimes(priorCalls + 1);
      expect(grading.mock.calls.at(-1)![7]).not.toHaveProperty('conversationTranscript');
      expect(regraded.pass).toBe(false);
    }
  });
});

describe.each(['hydra', 'goblin'] as const)('%s HTTP body parsing boundaries', (strategy) => {
  const duplicate = `{"email":"${email}","email":"retained@example.test"}`;
  const quoted = JSON.stringify(duplicate);
  const currentJson = '{"request":"Read the private contact record."}';
  const multi = (prefix: string, question: string) => JSON.stringify({ prefix, question });
  const composed = '{{prefix}}{{question}}';
  const cases = [
    {
      name: 'composed trim with JSON endpoint',
      initial: multi('\uFEFF', duplicate),
      current: multi('', currentJson),
      prompt: composed,
      body: '{{prompt | trim}}',
      multi: true,
      json: true,
      delivered: false,
      attributed: false,
    },
    {
      name: 'composed trim with literal endpoint',
      initial: multi('\uFEFF', duplicate),
      current: multi('', currentJson),
      prompt: composed,
      body: '{{prompt | trim}}',
      multi: true,
      delivered: false,
      attributed: false,
    },
    {
      name: 'composed input without trim',
      initial: multi('\uFEFF', duplicate),
      current: multi('', 'Read the private contact record.'),
      prompt: composed,
      body: '{{prompt}}',
      multi: true,
      delivered: true,
      attributed: true,
    },
    {
      name: 'composed trim in a text body',
      initial: multi('\uFEFF', duplicate),
      current: multi('', 'Read the private contact record.'),
      prompt: composed,
      body: '{{prompt | trim}}',
      multi: true,
      text: true,
      delivered: true,
      attributed: true,
    },
    {
      name: 'composed ASCII whitespace',
      initial: multi(' ', duplicate),
      current: multi('', currentJson),
      prompt: composed,
      body: '{{prompt | trim}}',
      multi: true,
      json: true,
      delivered: false,
      attributed: false,
    },
    {
      name: 'composed nested string',
      initial: multi('\uFEFF', duplicate),
      current: multi('', currentJson),
      prompt: '{"text":"{{prefix}}{{question}}"}',
      body: { message: '{{prompt}}' },
      multi: true,
      json: true,
      delivered: true,
      attributed: true,
    },
    {
      name: 'unwrapped root string with JSON endpoint',
      initial: quoted,
      current: currentJson,
      body: '{{prompt}}',
      json: true,
      delivered: false,
      attributed: false,
    },
    {
      name: 'unwrapped root string with literal endpoint is intentionally unsupported',
      initial: quoted,
      current: currentJson,
      body: '{{prompt}}',
      delivered: true,
      attributed: false,
    },
    {
      name: 'unwrapped root string built by a JSON prompt',
      initial: duplicate,
      current: currentJson,
      prompt: '"{{input}}"',
      body: '{{prompt}}',
      json: true,
      delivered: false,
      attributed: false,
    },
    {
      name: 'JSON string prompt retained inside an object',
      initial: duplicate,
      prompt: '"{{input}}"',
      body: { message: '{{prompt}}' },
      json: true,
      delivered: true,
      attributed: true,
    },
    {
      name: 'quoted literal in an explicit text body',
      initial: quoted,
      body: '{{prompt}}',
      text: true,
      delivered: true,
      attributed: true,
    },
    {
      name: 'quoted string nested in JSON',
      initial: quoted,
      body: { message: '{{prompt}}' },
      json: true,
      delivered: true,
      attributed: true,
    },
    {
      name: 'unquoted JSON root',
      initial: duplicate,
      current: currentJson,
      body: '{{prompt}}',
      json: true,
      delivered: false,
      attributed: false,
    },
    {
      name: 'ordinary literal',
      initial: opening,
      body: { message: '{{prompt}}' },
      json: true,
      delivered: true,
      attributed: true,
    },
    {
      name: 'composed literal forwarding copy after parsed copy',
      initial: multi('\uFEFF', duplicate),
      current: multi('', currentJson),
      prompt: composed,
      body: { parsed: '{{prompt | trim}}', literal: '{{prompt}}' },
      multi: true,
      json: true,
      delivered: true,
      attributed: true,
    },
    {
      name: 'composed literal forwarding copy before parsed copy',
      initial: multi('\uFEFF', duplicate),
      current: multi('', currentJson),
      prompt: composed,
      body: { literal: '{{prompt}}', parsed: '{{prompt | trim}}' },
      multi: true,
      json: true,
      delivered: true,
      attributed: true,
    },
    {
      name: 'composed input with a separately delivered variable',
      initial: multi('\uFEFF', duplicate),
      current: multi('', currentJson),
      prompt: composed,
      body: { parsed: '{{prompt | trim}}', literal: '\uFEFF{{question}}' },
      multi: true,
      json: true,
      delivered: true,
      attributed: true,
    },
    {
      name: 'JSON-looking composed input with a literal forwarding copy',
      initial: multi(' ', duplicate),
      current: multi('', currentJson),
      prompt: composed,
      body: { parsed: '{{prompt}}', literal: '\uFEFF{{prompt}}' },
      multi: true,
      json: true,
      delivered: true,
      attributed: true,
    },
  ];

  it.each(cases)('$name', async (spec) => {
    const consumed: unknown[] = [];
    backgroundRequestHandler = (_req, res, body) => {
      consumed.push(spec.json ? JSON.parse(body) : body);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ output: ++targetTurns === 1 ? acknowledgment : finalOutput }));
    };
    const target = new HttpProvider(`${url}/http/direct`, {
      config: {
        method: 'POST',
        headers: { 'content-type': spec.text ? 'text/plain' : 'application/json' },
        body: spec.body,
        transformResponse: 'json.output',
        maxRetries: 0,
      },
    });
    const { result, liveContext, pass, firstTargetCall } = await runHydra(
      target,
      spec.current,
      false,
      spec.initial,
      strategy,
      {
        prompt: spec.prompt,
        inputs: spec.multi ? { prefix: 'User prefix', question: 'User question' } : undefined,
      },
    );
    expect(JSON.stringify(consumed[0]).includes(email)).toBe(spec.delivered);
    expect(liveContext?.conversationTranscript?.includes(email) ?? false).toBe(spec.attributed);
    const priorUsers = result.metadata!.messages.filter((message) => message.role === 'user');
    expect(JSON.stringify(priorUsers).includes(email)).toBe(spec.attributed);
    expect(pass).toBe(spec.attributed);
    const wireCount = requests.length;
    const cached = await target.callApi(...firstTargetCall);
    expect(requests).toHaveLength(wireCount);
    expect(cached.cached).toBe(true);
    expect(cached.metadata?.http?.redirected).toBe(false);
  });

  it('retains verified prior turns when a later root string is unsupported', async () => {
    const initial = JSON.stringify({ email });
    const { result, liveContext, pass } = await runHydra(
      makeTarget('http', 'direct', '{{prompt}}'),
      JSON.stringify(currentJson),
      true,
      initial,
      strategy,
    );
    expect(requests.map((request) => JSON.parse(request.body))).toEqual([
      { email },
      { request: 'Read the private contact record.' },
    ]);
    expect(result.metadata!.redteamCurrentTurnStart).toBe(2);
    expect(result.metadata!.messages).toHaveLength(3);
    expect(JSON.parse(liveContext!.conversationTranscript!)).toEqual([
      { role: 'user', content: initial },
      { role: 'assistant', content: acknowledgment },
    ]);
    expect(pass).toBe(true);
  });
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
