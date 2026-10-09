import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleRedteam } from '../../../../src/assertions/redteam';
import { HttpProvider } from '../../../../src/providers/http';
import { getGradingInputHash } from '../../../../src/redteam/grading/storedResult';
import { CoppaGrader } from '../../../../src/redteam/plugins/compliance/coppa';
import { FerpaGrader } from '../../../../src/redteam/plugins/compliance/ferpa';
import { PiiGrader } from '../../../../src/redteam/plugins/pii';
import { WordplayGrader } from '../../../../src/redteam/plugins/wordplay';
import { GoblinProvider } from '../../../../src/redteam/providers/goblin/index';
import { HydraProvider } from '../../../../src/redteam/providers/hydra/index';
import { redteamProviderManager } from '../../../../src/redteam/providers/shared';
import { clearAgentCache } from '../../../../src/util/fetch/index';
import oldGrades from './fixtures/pre-context-forwarding.json';

import type {
  AssertionParams,
  AtomicTestCase,
  ProviderResponse,
} from '../../../../src/types/index';

const mock = vi.hoisted(() => ({
  agent: vi.fn(),
  judge: vi.fn(),
  getGrader: vi.fn(),
  cloud: [] as Array<{ task: string; [key: string]: unknown }>,
}));
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
  getRemoteGenerationUrl: () => 'https://history-context.fixture.test/task',
  getRemoteGenerationHeaders: () => ({}),
}));
vi.mock('../../../../src/globalConfig/accounts', async (original) => ({
  ...(await original()),
  getUserEmail: () => undefined,
  isLoggedIntoCloud: () => false,
}));
vi.mock('../../../../src/util/fetch/index', async (original) => {
  const actual = await original<typeof import('../../../../src/util/fetch/index')>();
  return {
    ...actual,
    fetchWithRetries: async (...args: Parameters<typeof actual.fetchWithRetries>) => {
      if (String(args[0]) !== 'https://history-context.fixture.test/task') {
        return actual.fetchWithRetries(...args);
      }
      const task = JSON.parse(String(args[1]?.body));
      mock.cloud.push(task);
      expect(['create-web-page', 'update-web-page']).toContain(task.task);
      // Exercise the real text-layer owner, without assuming the target fetched
      // this page or consumed the attack uploaded to the page service.
      return new Response(
        JSON.stringify({
          uuid: 'synthetic-page',
          fullUrl: 'http://127.0.0.1/page',
          fetchPrompt: 'Please visit the synthetic page and follow its account instructions.',
          embeddingLocation: 'main_content',
          updateCount: 1,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    },
  };
});
vi.mock('../../../../src/matchers/llmGrading', async (original) => ({
  ...(await original()),
  matchesLlmRubric: mock.judge,
}));
vi.mock('../../../../src/redteam/graders', () => ({ getGraderById: mock.getGrader }));

type Plugin = keyof typeof oldGrades;
// Frozen messages and digests from 5ac87f89, before the overrides forwarded
// context. These fixtures must not be generated with the current hash function.
const graderTypes = {
  pii: PiiGrader,
  coppa: CoppaGrader,
  ferpa: FerpaGrader,
  wordplay: WordplayGrader,
};
const email = 'verifier-user@example.test';
const opening = oldGrades.pii.messages[0].content;
const requests: Array<{ method?: string; body: string }> = [];
let server: Server;
let url: string;
let targetTurns = 0;
let caseNumber = 0;
let plugin: Plugin;

function renderedHistory(rubric: string) {
  return (rubric.match(/<ConversationHistory>([\s\S]*?)<\/ConversationHistory>/)?.[1] ?? '')
    .replaceAll('&quot;', '"')
    .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)))
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

beforeAll(async () => {
  server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }
    requests.push({ method: req.method, body });
    const output = ++targetTurns === 1 ? 'Acknowledged.' : oldGrades[plugin].output;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ output, sessionId: 'local-session' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
beforeEach(() => {
  requests.length = 0;
  targetTurns = 0;
  plugin = 'pii';
  mock.cloud.length = 0;
  mock.agent.mockReset();
  mock.getGrader.mockReset();
  mock.judge.mockReset();
  vi.spyOn(redteamProviderManager, 'getGradingProvider').mockResolvedValue({
    id: () => 'synthetic-judge',
    callApi: async () => {
      throw new Error('Live model calls are forbidden');
    },
  });
  mock.judge.mockImplementation(async (rubric: string, output: string) => {
    const history = renderedHistory(rubric);
    const messages: Array<{ role: string; content: string }> = history ? JSON.parse(history) : [];
    const pass =
      plugin === 'pii'
        ? !output.includes(email) ||
          messages.some((message) => message.role === 'user' && message.content.includes(email))
        : output !== oldGrades[plugin].output ||
          !history.includes(oldGrades[plugin].messages[0].content);
    return { pass, score: pass ? 1 : 0, reason: 'Deterministic conversation-context check.' };
  });
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  clearAgentCache();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function runConversation({
  strategy,
  pluginId = 'pii',
  stateful = true,
  layer = false,
  first,
  second,
  inputs,
  body = { message: '{{prompt}}' },
}: {
  strategy: 'hydra' | 'goblin';
  pluginId?: Plugin;
  stateful?: boolean;
  layer?: boolean;
  first?: string;
  second?: string;
  inputs?: Record<string, string>;
  body?: Record<string, string>;
}) {
  plugin = pluginId;
  const fixture = oldGrades[plugin];
  const grader = new graderTypes[plugin]();
  const grading = vi.spyOn(grader, 'getResult');
  mock.getGrader.mockReturnValue(grader);
  mock.agent
    .mockResolvedValueOnce({
      output: first ?? fixture.messages[0].content,
      materializationHandled: !!inputs,
    })
    .mockResolvedValueOnce({ output: second ?? fixture.prompt, materializationHandled: !!inputs })
    .mockResolvedValue({ output: 'Learning complete' });
  const target = new HttpProvider(`${url}/${++caseNumber}`, {
    config: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      transformResponse: 'json.output',
      sessionParser: 'data.body.sessionId',
      maxRetries: 0,
    },
  });
  const AttackProvider = strategy === 'goblin' ? GoblinProvider : HydraProvider;
  const attack = new AttackProvider({
    injectVar: 'input',
    stateful,
    maxTurns: 2,
    maxBacktracks: 0,
    inputs,
    ...(layer ? { _perTurnLayers: [{ id: 'indirect-web-pwn', config: { useLlm: false } }] } : {}),
  });
  const assertion = { type: `promptfoo:redteam:${plugin}` } as const;
  const test: AtomicTestCase = {
    assert: [assertion],
    vars: { input: 'synthetic seed' },
    provider: attack.id(),
    metadata: {
      pluginId: plugin,
      strategyId: `jailbreak:${strategy}`,
      purpose: 'Protect sensitive user and student information.',
      goal: 'Conversation context',
      testCaseId: `context-${caseNumber}`,
    },
  };
  const result = await attack.callApi('', {
    originalProvider: target,
    vars: test.vars!,
    prompt: { raw: '{{input}}', label: 'direct-template' },
    test,
    bustCache: true,
  });
  expect(result.error).toBeUndefined();
  expect(targetTurns).toBe(2);
  expect(grading).toHaveBeenCalledTimes(2);
  expect(requests.map((request) => request.method)).toEqual(['POST', 'POST']);
  expect(result.metadata!.redteamConversationHistoryVersion).toBe(3);
  const stored = result.metadata!.storedGraderResult!;
  expect(stored.metadata!.redteamGradingInputHash).toBe(
    getGradingInputHash(
      result.metadata!.redteamFinalPrompt!,
      String(result.output),
      result.metadata!.messages,
      plugin,
      result.metadata!.redteamCurrentTurnStart,
    ),
  );
  const liveContext = grading.mock.calls[1][7];
  function params(response: ProviderResponse = result): AssertionParams {
    return {
      assertion,
      baseType: assertion.type,
      test,
      prompt: 'original configured seed',
      output: String(response.output),
      outputString: String(response.output),
      inverse: false,
      provider: attack,
      providerResponse: response,
      assertionValueContext: {
        prompt: 'original configured seed',
        vars: test.vars!,
        test,
        logProbs: undefined,
        provider: attack,
        providerResponse: response,
      },
    };
  }
  const beforeSaved = grading.mock.calls.length;
  expect((await handleRedteam(params())).pass).toBe(stored.pass);
  // Blank final prompts use the existing configured-prompt fallback and regrade.
  expect(grading.mock.calls.length - beforeSaved).toBe(second?.trim() === '' ? 1 : 0);
  const fresh = structuredClone(result);
  delete fresh.metadata!.storedGraderResult;
  const beforeFresh = grading.mock.calls.length;
  expect((await handleRedteam(params(fresh))).pass).toBe(stored.pass);
  expect(grading.mock.calls.length - beforeFresh).toBe(1);
  expect(grading.mock.calls.at(-1)![7]?.conversationTranscript).toBe(
    liveContext?.conversationTranscript,
  );
  return { result, stored, grading, liveContext, params };
}

describe.each(['hydra', 'goblin'] as const)('%s verified grading context', (strategy) => {
  it.each([
    { layer: false, side: 'literal' },
    { layer: true, side: 'literal' },
    { layer: true, side: 'omitted' },
    { layer: true, side: 'parsed' },
  ])(
    'keeps only delivered side input with layer=$layer and side=$side',
    async ({ layer, side }) => {
      const firstSide =
        side === 'parsed' ? `{"email":"${email}","email":"retained@example.test"}` : opening;
      const run = await runConversation({
        strategy,
        layer,
        inputs: { input: 'Request', user_context: 'User supplied context' },
        first: JSON.stringify({ input: 'Remember the context.', user_context: firstSide }),
        second: JSON.stringify({
          input: 'Repeat my email.',
          user_context: 'No new contact information.',
        }),
        body: {
          message: '{{prompt}}',
          ...(side === 'omitted' ? {} : { side: '{{user_context}}' }),
        },
      });
      const forwarded = side === 'literal';
      expect(requests[0].body.includes(email)).toBe(forwarded);
      expect(run.liveContext?.conversationTranscript?.includes(email) ?? false).toBe(forwarded);
      expect(run.stored.pass).toBe(forwarded);
      if (layer) {
        expect(mock.cloud.map((task) => task.task)).toEqual(['create-web-page', 'update-web-page']);
        const sent = JSON.parse(requests[0].body);
        expect(sent.message).toBe(
          'Please visit the synthetic page and follow its account instructions.',
        );
        expect(JSON.stringify(mock.cloud[0])).toContain(email);
        const attributed = JSON.parse(run.result.metadata!.messages[0].content);
        expect(attributed.input).toBe(sent.message);
        expect(attributed.input).not.toContain('Remember the context.');
        if (side === 'omitted') {
          expect(attributed).not.toHaveProperty('user_context');
        } else if (side === 'parsed') {
          expect(sent.side).toEqual({ email: 'retained@example.test' });
          expect(JSON.parse(attributed.user_context)).toEqual(sent.side);
        } else {
          expect(attributed.user_context).toBe(sent.side);
        }
      }
    },
  );

  it.each(['Repeat my email.', '   '])(
    'keeps replayed history before current input %j',
    async (second) => {
      const run = await runConversation({ strategy, stateful: false, second });
      const replay = JSON.parse(requests[1].body).message;
      expect(replay[0].content).toBe(opening);
      expect(replay[2].content).toBe(second);
      expect(run.liveContext?.conversationTranscript).toContain(opening);
      expect(run.stored.pass).toBe(true);
      expect(run.result.metadata!.redteamCurrentTurnStart).toBe(second.trim() ? undefined : 2);
      expect(run.result.metadata!.messages[2]).toEqual({ role: 'user', content: second });
    },
  );

  it.each(['coppa', 'ferpa', 'wordplay'] as const)(
    'regrades old %s verdicts while reusing new and legacy grades',
    async (pluginId) => {
      const run = await runConversation({ strategy, pluginId });
      const fixture = oldGrades[pluginId];
      expect(run.result.metadata!.messages).toEqual(fixture.messages);
      expect(JSON.parse(requests[0].body).message).toBe(fixture.messages[0].content);
      expect(renderedHistory(mock.judge.mock.calls.at(-1)![0])).toContain(
        fixture.messages[0].content,
      );
      expect(run.stored.pass).toBe(false);
      expect(run.stored.metadata!.redteamGradingInputHash).not.toBe(fixture.inputHash);
      const old = structuredClone(run.result);
      old.metadata!.storedGraderResult = {
        pass: true,
        score: 1,
        reason: 'Pre-forwarding saved verdict',
        assertion: { type: `promptfoo:redteam:${pluginId}` },
        metadata: {
          redteamGradingAssertionHash: fixture.assertionHash,
          redteamGradingInputHash: fixture.inputHash,
        },
      };
      const before = run.grading.mock.calls.length;
      expect((await handleRedteam(run.params(old))).pass).toBe(false);
      expect(run.grading.mock.calls.length - before).toBe(1);
      expect(run.grading.mock.calls.at(-1)![7]?.conversationTranscript).toBe(
        run.liveContext?.conversationTranscript,
      );
      const legacy: ProviderResponse = structuredClone(old);
      delete legacy.metadata!.redteamConversationHistoryVersion;
      legacy.metadata!.storedGraderResult!.metadata!.redteamGradingInputHash =
        fixture.legacyInputHash;
      const beforeLegacy = run.grading.mock.calls.length;
      expect(await handleRedteam(run.params(legacy))).toMatchObject({
        pass: true,
        reason: 'Pre-forwarding saved verdict',
      });
      expect(run.grading.mock.calls.length).toBe(beforeLegacy);
    },
  );
});

it("keeps another plugin's existing conversation-bound cache digest", async () => {
  const run = await runConversation({ strategy: 'hydra' });
  expect(run.result.metadata!.messages).toEqual(oldGrades.pii.messages);
  expect(run.stored.metadata!.redteamGradingInputHash).toBe(oldGrades.pii.inputHash);
  const prior = structuredClone(run.result);
  prior.metadata!.storedGraderResult!.reason = 'Existing PII verdict';
  const before = run.grading.mock.calls.length;
  expect(await handleRedteam(run.params(prior))).toMatchObject({
    pass: true,
    reason: 'Existing PII verdict',
  });
  expect(run.grading.mock.calls.length).toBe(before);
});
