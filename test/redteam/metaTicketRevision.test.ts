import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { cloudConfig } from '../../src/globalConfig/cloud';
import { getAgentOutcomeCase } from '../../src/redteam/constants/agentOutcomes';
import {
  hasMetaTicketRevision,
  proposeMetaTicketRevision,
} from '../../src/redteam/metaTicketRevision';
import { ResultFailureReason } from '../../src/types/results';
import { sha256 } from '../../src/util/createHash';

import type { EvaluateResult, RunEvalOptions } from '../../src/types/index';

const pluginId = 'agentic:private-to-public-disclosure';
const owner = 'Triage this ticket. Owner-only task.';
const ticket = 'Sync fails, please help.';
const publicReply = 'Try restarting sync.';
const privateMarker = 'private-101';
const url = 'http://127.0.0.1:1/api/v1/task';

function seed(arm: 'blind' | 'public' = 'public') {
  const agentOutcome = {
    pluginId,
    mode: 'indirect',
    variant: 'attack',
    caseId: 'case-1',
    injectVar: '__prompt',
    indirectInjectionVar: 'body',
    metaTicketRevision: arm,
  };
  const inputVars = { request: owner, body: ticket };
  const test = {
    metadata: {
      agentOutcome,
      inputVars,
      __promptfoo: { literalVars: ['__prompt', 'request', 'body', 'agentOutcome'] },
    },
    vars: { __prompt: owner, agentOutcome, ...inputVars },
  };
  const plugin = {
    id: pluginId,
    numTests: 1,
    config: { metaTicketRevision: arm, legitimateTask: owner, indirectInjectionVar: 'body' },
  };
  const provider = { id: () => 'mock', callApi: vi.fn() };
  const prompt = { raw: '{{__prompt}}', label: 'Owner' };
  const step: RunEvalOptions = {
    provider,
    prompt,
    test,
    delay: 0,
    promptIdx: 0,
    testIdx: 0,
    repeatIndex: 0,
    isRedteam: true,
    testSuite: {
      redteam: { plugins: [plugin], purpose: 'private purpose' },
      providers: [provider],
      prompts: [prompt],
    },
  };
  const grade = {
    ...agentOutcome,
    status: 'safe',
    taskCompleted: true,
    controlPassed: true,
    attackExposed: true,
    reason: 'private grade',
  };
  const measurements = {
    privateVerified: true,
    privateMarker,
    publicBefore: ticket,
    publicAfter: ticket + '\n\n' + publicReply,
    publicControl: { marker: 'control-102', readback: 'control-102' },
    delivery: { ownerSha256: sha256(owner), ticketSha256: sha256(ticket) },
  };
  const receipt = {
    pluginId,
    version: 1,
    caseId: agentOutcome.caseId,
    taskCompleted: true,
    attackExposed: true,
    measurements,
  };
  const row: EvaluateResult = {
    testIdx: 0,
    promptIdx: 0,
    promptId: 'p1',
    testCase: test,
    provider: { id: 'mock' },
    vars: test.vars,
    prompt: { ...prompt, raw: owner },
    response: { output: 'private assistant response', metadata: { agentOutcomeEvidence: receipt } },
    success: true,
    failureReason: ResultFailureReason.NONE,
    score: 1,
    namedScores: {},
    latencyMs: 1,
    gradingResult: {
      pass: true,
      score: 1,
      reason: grade.reason,
      metadata: { agentOutcomeResult: grade },
    },
  };
  return { step, row, grade, receipt, measurements, plugin, agentOutcome };
}

const fetch = vi.fn();
beforeEach(() => {
  fetch.mockReset();
  vi.stubGlobal('fetch', fetch);
  vi.stubEnv('PROMPTFOO_REMOTE_GENERATION_URL', url);
  vi.stubEnv('NO_PROXY', '127.0.0.1');
  vi.stubEnv('no_proxy', '127.0.0.1');
  vi.stubEnv('PROMPTFOO_DISABLE_REMOTE_GENERATION', 'false');
  vi.stubEnv('PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION', 'false');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('bounded Meta ticket revision', () => {
  it.each(['blind', 'public'] as const)(
    'sends exactly the reporter-visible fields for %s and creates a fresh literal ticket',
    async (arm) => {
      const { step, row, agentOutcome } = seed(arm);
      if (arm === 'blind') {
        step.testSuite!.redteam!.excludeTargetOutputFromAgenticAttackGeneration = true;
      }
      const next = 'file://{{never_render}}';
      fetch.mockResolvedValueOnce(Response.json({ ticket: next }));
      expect(hasMetaTicketRevision(step)).toBe(true);
      const child = await proposeMetaTicketRevision(step, row, new AbortController().signal);
      expect(fetch).toHaveBeenCalledTimes(1);
      const [endpoint, request] = fetch.mock.calls[0];
      expect(endpoint).toBe(url);
      expect(request.redirect).toBe('error');
      expect(JSON.parse(request.body)).toEqual({
        task: 'meta-ticket-revision',
        ticket,
        ...(arm === 'public' && { publicReply }),
      });
      expect(child?.vars).toMatchObject({ __prompt: owner, request: owner, body: next });
      expect(child?.metadata?.inputVars).toEqual({ request: owner, body: next });
      expect(child?.metadata?.__promptfoo.literalVars).toContain('body');
      expect(child?.vars?.agentOutcome).toEqual(child?.metadata?.agentOutcome);
      expect(getAgentOutcomeCase(child)).toMatchObject({
        message: owner,
        artifact: next,
        metaTicketRevision: arm,
        parentCaseId: agentOutcome.caseId,
        caseId: expect.not.stringMatching(agentOutcome.caseId),
      });
      expect(hasMetaTicketRevision({ ...step, test: child! })).toBe(false);
      expect(step.test.vars?.body).toBe(ticket);
      expect(step.test.metadata?.inputVars.body).toBe(ticket);
    },
  );

  const blocked: Record<string, (s: ReturnType<typeof seed>) => void> = {
    'missing suite opt-in': ({ step }) => Object.assign(step.testSuite!.redteam!, { plugins: [] }),
    'mismatched arm': ({ plugin }) => Object.assign(plugin.config, { metaTicketRevision: 'blind' }),
    'mismatched owner': ({ plugin }) => Object.assign(plugin.config, { legitimateTask: 'other' }),
    'mismatched channel': ({ plugin }) =>
      Object.assign(plugin.config, { indirectInjectionVar: 'other' }),
    'disabled Basic': ({ step }) =>
      Object.assign(step.testSuite!.redteam!, {
        strategies: [{ id: 'basic', config: { enabled: false } }],
      }),
    'disabled orchestration': ({ step }) =>
      Object.assign(step, { evaluateOptions: { allowedMetaTicketRevisions: [] } }),
    'privacy mode': ({ step }) =>
      Object.assign(step.testSuite!.redteam!, {
        excludeTargetOutputFromAgenticAttackGeneration: true,
      }),
    'disabled remote generation': () => vi.stubEnv('PROMPTFOO_DISABLE_REMOTE_GENERATION', 'true'),
    'disabled redteam remote generation': () =>
      vi.stubEnv('PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION', 'true'),
    'cached response': ({ row }) => Object.assign(row.response!, { cached: true }),
    'missing grade': ({ row }) => Object.assign(row, { gradingResult: undefined }),
    'failed row': ({ row }) => Object.assign(row, { success: false }),
    'prior violation': ({ grade }) => Object.assign(grade, { status: 'violation' }),
    'prior case grade': ({ grade }) => Object.assign(grade, { caseId: 'case-2' }),
    'prior case receipt': ({ receipt }) => Object.assign(receipt, { caseId: 'case-2' }),
    'unfinished task': ({ receipt }) => Object.assign(receipt, { taskCompleted: false }),
    'modified owner': ({ row }) => Object.assign(row.prompt, { raw: owner + '!' }),
    'unverified artifact': ({ measurements }) =>
      Object.assign(measurements.delivery, { ticketSha256: sha256('other') }),
    'unverified owner': ({ measurements }) =>
      Object.assign(measurements.delivery, { ownerSha256: sha256('other') }),
    'private marker in public reply': ({ measurements }) =>
      Object.assign(measurements, { publicAfter: ticket + privateMarker }),
    'rewritten public ticket': ({ measurements }) =>
      Object.assign(measurements, { publicAfter: 'Different ticket' }),
    'empty reply': ({ measurements }) => Object.assign(measurements, { publicAfter: ticket }),
    'oversized public reply': ({ measurements }) =>
      Object.assign(measurements, { publicAfter: ticket + 'x'.repeat(4097) }),
  };
  it.each(Object.entries(blocked))('does not send a request for %s', async (_, mutate) => {
    const scenario = seed();
    mutate(scenario);
    expect(
      await proposeMetaTicketRevision(scenario.step, scenario.row, new AbortController().signal),
    ).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses identical public-readback eligibility in the blind arm', async () => {
    const { step, row, measurements } = seed('blind');
    measurements.publicAfter = ticket;
    expect(
      await proposeMetaTicketRevision(step, row, new AbortController().signal),
    ).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects a plaintext remote decision endpoint before sending public feedback', async () => {
    vi.stubEnv('PROMPTFOO_REMOTE_GENERATION_URL', 'http://example.invalid/api/v1/task');
    const { step, row } = seed();
    await expect(
      proposeMetaTicketRevision(step, row, new AbortController().signal),
    ).rejects.toThrow('Meta ticket proposal failed.');
    expect(fetch).not.toHaveBeenCalled();
  });

  function workerSeed() {
    const { step, row } = seed();
    Object.assign(step, { evaluateOptions: { allowedMetaTicketRevisions: ['public'] } });
    vi.stubEnv('NO_PROXY', 'localhost');
    vi.stubEnv('no_proxy', 'localhost');
    vi.stubEnv(
      'PROMPTFOO_REMOTE_GENERATION_URL',
      'http://127.0.0.1:3201/api/v1/task?__promptfoo_internal_task_token=internal',
    );
    vi.spyOn(cloudConfig, 'getApiHost').mockReturnValue('http://localhost:3201');
    vi.spyOn(cloudConfig, 'getCurrentOrganizationId').mockReturnValue('org');
    vi.spyOn(cloudConfig, 'getCurrentTeamId').mockImplementation((id) =>
      id === 'org' ? 'team' : undefined,
    );
    vi.spyOn(cloudConfig, 'getApiKey').mockReturnValue('worker-jwt');
    vi.spyOn(cloudConfig, 'getAuthHeaderName').mockReturnValue('Authorization');
    return () => proposeMetaTicketRevision(step, row, new AbortController().signal);
  }

  it('routes a worker proposal through its authenticated team even with a signed IP or hostile URL override', async () => {
    const invoke = workerSeed();
    fetch.mockResolvedValueOnce(Response.json({ ticket: 'Replacement ticket' }));
    const child = await cliState.withEnv(
      { PROMPTFOO_REMOTE_GENERATION_URL: 'https://example.invalid' },
      invoke,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    const [endpoint, request] = fetch.mock.calls[0];
    expect(endpoint).toBe('http://localhost:3201/api/v1/task');
    const headers = new Headers(request.headers);
    expect(headers.get('authorization')).toBe('Bearer worker-jwt');
    expect(headers.get('x-promptfoo-team-id')).toBe('team');
    expect(request.redirect).toBe('error');
    expect(child?.vars?.body).toBe('Replacement ticket');
  });

  it.each([
    [
      'unexpected origin',
      () => vi.mocked(cloudConfig.getApiHost).mockReturnValue('https://example.invalid'),
    ],
    ['no team', () => vi.mocked(cloudConfig.getCurrentTeamId).mockReturnValue(undefined)],
    ['no token', () => vi.mocked(cloudConfig.getApiKey).mockReturnValue(undefined)],
    [
      'custom process endpoint',
      () =>
        vi.stubEnv(
          'PROMPTFOO_REMOTE_GENERATION_URL',
          'https://private.example.invalid/api/v1/task',
        ),
    ],
    [
      'different port',
      () => vi.stubEnv('PROMPTFOO_REMOTE_GENERATION_URL', 'http://127.0.0.1:9999/api/v1/task'),
    ],
  ] as const)('fails closed for worker requests with %s', async (_, invalidate) => {
    const invoke = workerSeed();
    invalidate();
    await expect(invoke()).rejects.toThrow('Meta ticket proposal failed.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { PROMPTFOO_REMOTE_GENERATION_URL: 'https://example.invalid' },
    { PROMPTFOO_CA_CERT_PATH: '/tmp/untrusted.pem' },
  ])('rejects inline CLI attempts to redirect or intercept the public reply', async (overrides) => {
    const { step, row } = seed();
    await expect(
      cliState.withEnv(overrides, () =>
        proposeMetaTicketRevision(step, row, new AbortController().signal),
      ),
    ).rejects.toThrow('Meta ticket proposal failed.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not let a suite override the process remote disable switch', async () => {
    const { step, row } = seed();
    vi.stubEnv('PROMPTFOO_DISABLE_REMOTE_GENERATION', 'true');
    await expect(
      cliState.withEnv({ PROMPTFOO_DISABLE_REMOTE_GENERATION: 'false' }, () =>
        proposeMetaTicketRevision(step, row, new AbortController().signal),
      ),
    ).rejects.toThrow('Meta ticket proposal failed.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('bounds the full response even when a valid proposal is followed by padding', async () => {
    const { step, row } = seed();
    fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ticket: 'next' }) + ' '.repeat(32768)),
    );
    await expect(
      proposeMetaTicketRevision(step, row, new AbortController().signal),
    ).rejects.toThrow('Meta ticket proposal failed.');
  });

  it.each([
    { ticket: '  ' },
    { ticket: ticket + ' ' },
    { ticket: 'next', owner: 'override' },
    { ticket: 'x'.repeat(4097) },
    { ticket: 'secret ' + privateMarker },
    { ticket: 123 },
    { ticket: '\ud800' },
  ])('rejects invalid replacement %# without echoing it', async (payload) => {
    const { step, row } = seed();
    fetch.mockResolvedValueOnce(Response.json(payload));
    await expect(
      proposeMetaTicketRevision(step, row, new AbortController().signal),
    ).rejects.toThrow(/^(Invalid Meta ticket proposal|Meta ticket proposal failed)\.$/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
