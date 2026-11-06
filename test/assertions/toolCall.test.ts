import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAssertion } from '../../src/assertions/index';

import type { Assertion, ProviderResponse } from '../../src/types/index';

const inventory = (arguments_: unknown = { playerId: 'player1', extra: true }) => ({
  name: 'check_inventory',
  arguments: arguments_,
  resultPresent: true,
  resultStatus: 'completed',
  executionMode: 'real',
});
const response = (toolCalls: unknown): ProviderResponse => ({
  output: 'check_inventory was called with player1',
  metadata: { toolCalls },
});
const grade = (assertion: Assertion, providerResponse = response([inventory()])) =>
  runAssertion({ assertion, providerResponse, test: {} });

afterEach(() => vi.restoreAllMocks());

describe('declarative tool-call assertions', () => {
  it.each([
    'check_inventory',
    ['check_inventory'],
    { name: 'check_inventory' },
    { name: 'check_inventory', arguments: { playerId: 'player1' } },
    [{ name: 'check_inventory', arguments: { playerId: 'player1' } }],
  ])('accepts %j without transforms', async (value) => {
    expect(await grade({ type: 'tool-call', value })).toMatchObject({ pass: true, score: 1 });
  });

  it('requires every expected tool while allowing additional calls', async () => {
    const providerResponse = response([inventory(), { name: 'check_stats' }, { name: 'extra' }]);
    expect(
      await grade(
        { type: 'tool-call', value: ['check_inventory', 'check_stats'] },
        providerResponse,
      ),
    ).toMatchObject({ pass: true });
    expect(
      await grade({ type: 'tool-call', value: ['check_inventory', 'missing'] }, providerResponse),
    ).toMatchObject({ pass: false });
  });

  it('matches each expected argument key by deep equality without coercion', async () => {
    const assertion: Assertion = {
      type: 'tool-call',
      value: { name: 'check_inventory', arguments: { amount: 1, nested: { values: [1, null] } } },
    };
    expect(
      await grade(
        assertion,
        response([inventory({ amount: 1, nested: { values: [1, null] }, extra: true })]),
      ),
    ).toMatchObject({ pass: true });
    for (const args of [
      undefined,
      null,
      [],
      { amount: '1', nested: { values: [1, null] } },
      { amount: 1, nested: { values: [2] } },
    ]) {
      expect(await grade(assertion, response([inventory(args)]))).toMatchObject({ pass: false });
    }
  });

  it('does not match inherited properties or combine arguments from different calls', async () => {
    const assertion: Assertion = {
      type: 'tool-call',
      value: { name: 'check_inventory', arguments: { playerId: 'player1', amount: 1 } },
    };
    expect(
      await grade(
        assertion,
        response([inventory({ playerId: 'player1' }), inventory({ amount: 1 })]),
      ),
    ).toMatchObject({ pass: false });
    expect(
      await grade(
        {
          type: 'tool-call',
          value: { name: 'check_inventory', arguments: { playerId: 'player1' } },
        },
        response([inventory(Object.create({ playerId: 'player1' }))]),
      ),
    ).toMatchObject({ pass: false });
  });

  it('can require a completed non-mocked result', async () => {
    const assertion: Assertion = {
      type: 'tool-call',
      value: 'check_inventory',
      config: { requireCompleted: true },
    };
    expect(await grade(assertion)).toMatchObject({ pass: true });
    for (const overrides of [
      { resultPresent: false },
      { resultStatus: 'incomplete' },
      { executionMode: 'mock' },
      { executionMode: undefined },
    ]) {
      expect(await grade(assertion, response([{ ...inventory(), ...overrides }]))).toMatchObject({
        pass: false,
      });
    }
  });

  it('requires no expected matches for a negative list', async () => {
    const assertion: Assertion = {
      type: 'not-tool-call',
      value: ['check_inventory', 'check_stats'],
    };
    expect(await grade(assertion, response([]))).toMatchObject({ pass: true });
    expect(await grade(assertion, response([{ name: 'extra' }]))).toMatchObject({ pass: true });
    expect(await grade(assertion)).toMatchObject({ pass: false });
  });

  it.each([undefined, null, {}, [null], [{ arguments: {} }]])(
    'fails closed on missing/malformed evidence %j, including negation',
    async (toolCalls) => {
      for (const type of ['tool-call', 'not-tool-call'] as const) {
        expect(await grade({ type, value: 'check_inventory' }, response(toolCalls))).toMatchObject({
          pass: false,
          score: 0,
        });
      }
    },
  );

  it.each([
    [],
    '',
    { name: '' },
    { name: 'check_inventory', arguments: [] },
    { name: 'check_inventory', params: {} },
    ['check_inventory', 42],
  ])('rejects invalid expectations %j', async (value) => {
    await expect(grade({ type: 'tool-call', value })).rejects.toThrow(/tool-call/);
  });

  it('does not reveal argument values in mismatch reasons', async () => {
    const result = await grade({
      type: 'tool-call',
      value: { name: 'check_inventory', arguments: { token: 'sensitive' } },
    });
    expect(result.pass).toBe(false);
    expect(result.reason).not.toContain('sensitive');
  });

  it('honors explicit transforms over metadata', async () => {
    const providerResponse = { ...response([]), output: [{ name: 'selected' }] };
    expect(
      await grade({ type: 'tool-call', value: 'selected', transform: 'output' }, providerResponse),
    ).toMatchObject({ pass: true });
    expect(
      await grade(
        { type: 'tool-call-f1', value: ['selected'], transform: 'output' },
        providerResponse,
      ),
    ).toMatchObject({ pass: true });
  });
});

describe('tool-call-f1 metadata defaults', () => {
  it('uses metadata automatically while preserving final output', async () => {
    const providerResponse = response([inventory()]);
    expect(
      await grade({ type: 'tool-call-f1', value: ['check_inventory'] }, providerResponse),
    ).toMatchObject({ pass: true, score: 1 });
    expect(providerResponse.output).toBe('check_inventory was called with player1');
  });

  it('prefers observed empty metadata over tool-looking answer content', async () => {
    expect(
      await grade(
        { type: 'tool-call-f1', value: ['check_inventory'] },
        { ...response([]), output: [{ name: 'check_inventory' }] },
      ),
    ).toMatchObject({ pass: false, score: 0 });
  });

  it('preserves F1 penalties and legacy structured outputs', async () => {
    expect(
      await grade(
        { type: 'tool-call-f1', value: ['check_inventory'] },
        response([inventory(), { name: 'extra' }]),
      ),
    ).toMatchObject({ pass: false, score: 2 / 3 });
    expect(
      await grade(
        { type: 'tool-call-f1', value: ['check_inventory'] },
        { output: [{ name: 'check_inventory' }] },
      ),
    ).toMatchObject({ pass: true });
  });
});
