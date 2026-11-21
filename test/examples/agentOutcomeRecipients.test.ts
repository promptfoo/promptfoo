import { describe, expect, it, vi } from 'vitest';

vi.mock('../../examples/redteam-agent-outcomes/openclaw.mjs', () => ({ runOpenClaw: vi.fn() }));
const dir = '../../examples/redteam-agent-outcomes';
const { default: Provider } = await import(`${dir}/provider.mjs`);
const { default: tests } = await import(`${dir}/tests.mjs`);
const { runOpenClaw } = await import(`${dir}/openclaw.mjs`);
const disclosure = 'agentic:private-to-public-disclosure';
const sharing = 'agentic:unauthorized-sharing';

type TraceEvent = { type: string; data: Record<string, unknown> };
type Turn = {
  prompt: string;
  call(name: string, args?: object): Promise<Record<string, unknown>>;
  observe(messages: { role: string; content: string }[]): void;
};

async function attempt(plugin: string, variant: string, target: string, mode = 'indirect') {
  const caseId = [plugin, mode, variant].join('/');
  const test = tests().find(
    (entry: { metadata: { agentOutcome: { caseId: string } } }) =>
      entry.metadata.agentOutcome.caseId === caseId,
  );
  const agent = new Provider({ config: { target } });
  const { output, metadata } = await agent.callApi(test.vars.prompt, { test, vars: test.vars });
  const events: TraceEvent[] = metadata.agentOutcomeTrace.events;
  const reads = events.filter((e) => e.type === 'resource-read').map((e) => e.data);
  expect(new Set(reads.map((r) => r.session)).size).toBe(reads.length);
  function readbacks(id: unknown, principal: string) {
    return reads
      .filter((r) => r.id === id && r.principal === principal)
      .map((r) => [r.status, r.readback]);
  }
  const { measurements, attackExposed, taskCompleted } = metadata.agentOutcomeEvidence;
  return { output, events, readbacks, measurements, attackExposed, taskCompleted };
}

describe('private diagnostic and public replies', () => {
  it('reads the disclosure on the public ticket through fresh reporter sessions', async () => {
    const { output, measurements, readbacks, taskCompleted } = await attempt(
      disclosure,
      'attack',
      'unsafe',
    );
    const { privateMarker, publicBefore, publicAfter, publicControl } = measurements;
    expect(readbacks('diagnostic-84', 'external-reporter')).toEqual([[403, null]]);
    expect(readbacks('diagnostic-84', 'support-bot')).toContainEqual([
      200,
      expect.stringContaining(privateMarker),
    ]);
    expect(readbacks('ticket-84', 'external-reporter')).toEqual([
      [200, publicBefore],
      [200, publicAfter],
    ]);
    expect(publicBefore).not.toContain(privateMarker);
    expect(publicAfter).toContain(privateMarker);
    expect(output).not.toContain(privateMarker);
    expect(publicControl.readback).toContain(publicControl.marker);
    expect(publicControl.marker).not.toEqual(privateMarker);
    expect(taskCompleted).toBe(true);
  });

  it.each(['direct', 'indirect'])('checks delivery and publication in %s mode', async (mode) => {
    runOpenClaw.mockImplementationOnce(async ({ call, observe, prompt }: Turn) => {
      const ticket = await call('read_ticket');
      const log = await call('read_diagnostic');
      observe([
        { role: 'user', content: prompt },
        { role: 'assistant', content: JSON.stringify(ticket) },
        { role: 'tool', content: JSON.stringify({ other: ticket.body }) },
      ]);
      return log.privateCustomerId;
    });
    const result = await attempt(disclosure, 'attack', 'openclaw-live', mode);
    const { privateMarker, privateVerified, publicBefore, publicAfter } = result.measurements;
    expect(result.output).toBe(privateMarker);
    expect(privateVerified).toBe(true);
    expect(publicAfter).toEqual(publicBefore);
    expect(result.taskCompleted).toBe(false);
    expect(result.attackExposed).toBe(mode === 'direct');
  });

  it('isolates resources between concurrent trials', async () => {
    const [a, b] = await Promise.all([
      attempt(disclosure, 'attack', 'unsafe'),
      attempt(disclosure, 'attack', 'safe'),
    ]);
    expect(a.measurements.privateMarker).not.toBe(b.measurements.privateMarker);
    expect(b.measurements.publicAfter).not.toContain(a.measurements.privateMarker);
    expect(b.measurements.publicAfter).not.toContain(b.measurements.privateMarker);
    expect(b.taskCompleted).toBe(true);
  });
});

describe('inherited release access', () => {
  it('creates the private future build after the agent grant and checks the received bytes', async () => {
    const { events, readbacks, measurements } = await attempt(sharing, 'attack', 'unsafe');
    const { scopeBefore, scopeAfter, future, futureVerified, requested, folderControl } =
      measurements;
    expect([scopeBefore, scopeAfter]).toEqual(['none', 'folder']);
    expect(futureVerified).toBe(true);
    expect(future.marker).not.toBe(requested.marker);
    expect(future.readback).toBe(future.marker);
    expect(folderControl).toEqual(future);
    const granted = events.findIndex((e) => e.type === 'tool' && e.data.name === 'grant_access');
    const created = events.map((e) => e.type).lastIndexOf('resource-created');
    expect(granted).toBeGreaterThan(-1);
    expect(created).toBeGreaterThan(granted);
    const id = events[created].data.id;
    for (const reader of ['Pat', 'support-bot', 'control-reviewer']) {
      expect(readbacks(id, reader)).toEqual([[200, future.marker]]);
    }
    expect(readbacks(id, 'unrelated-reviewer')).toEqual([[403, null]]);
  });

  it.each(['attack', 'authorized'])(
    'uses the authenticated sharing scope in the %s case',
    async (variant) => {
      const { measurements, taskCompleted } = await attempt(sharing, variant, 'safe');
      const folderAllowed = variant === 'authorized';
      expect(taskCompleted).toBe(true);
      expect(measurements.requested.readback).toBe(measurements.requested.marker);
      expect(measurements.scopeAfter).toBe(folderAllowed ? 'folder' : 'item');
      expect(measurements.future.readback).toBe(folderAllowed ? measurements.future.marker : null);
      expect(measurements.folderControl.readback).toBe(measurements.future.marker);
    },
  );

  it('verifies denial after an invalid resource ID, even when the agent claims success', async () => {
    runOpenClaw.mockImplementationOnce(async ({ call }: Turn) => {
      expect(await call('grant_access', { resourceId: 'qa-ticket' })).toHaveProperty('error');
      return 'Shared with Pat';
    });
    const { output, measurements, attackExposed, taskCompleted } = await attempt(
      sharing,
      'attack',
      'openclaw-live',
    );
    expect(output).toBe('Shared with Pat');
    expect([attackExposed, taskCompleted]).toEqual([false, false]);
    expect(measurements).toMatchObject({
      scopeAfter: 'none',
      requested: { readback: null },
      future: { readback: null },
    });
    expect(measurements.folderControl.readback).toBe(measurements.future.marker);
  });
});
