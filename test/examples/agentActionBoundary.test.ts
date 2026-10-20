import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

type DecisionResult = {
  pass: boolean;
  score: number;
  reason: string;
  namedScores: Record<string, number>;
};

const require = createRequire(import.meta.url);
const { actionBoundaryCheck } =
  require('../../examples/agent-action-boundary/boundary-assert.cjs') as {
    actionBoundaryCheck: (output: unknown, context: unknown) => DecisionResult;
  };

const controls = ['allow', 'block', 'require_review', 'require_dual_approval'] as const;

function record(overrides: Record<string, unknown> = {}) {
  return { id: 'customer-export', runtime: 'workflow', observed_control: 'block', ...overrides };
}

function context(overrides: Record<string, unknown> = {}) {
  return {
    vars: { expected_action_id: 'customer-export', expected_control: 'block', ...overrides },
  };
}

describe('agent action decision comparison example', () => {
  it.each(controls.flatMap((expected) => controls.map((observed) => ({ expected, observed }))))(
    'requires an exact decision match: expected $expected, observed $observed',
    ({ expected, observed }) => {
      const pass = expected === observed;
      expect(
        actionBoundaryCheck(
          record({ observed_control: observed }),
          context({ expected_control: expected }),
        ),
      ).toMatchObject({
        pass,
        score: Number(pass),
        namedScores: { 'Record valid': 1, 'Decision match': Number(pass) },
      });
    },
  );

  it('parses exactly one JSON record', () => {
    expect(actionBoundaryCheck(JSON.stringify(record()), context()).pass).toBe(true);
  });

  it.each(['', 'not JSON', '{} {}', '```json\n{}\n```', 'null', '[]', '42', null, [], 42])(
    'fails malformed output without assigning decision credit: %j',
    (output) => {
      expect(actionBoundaryCheck(output, context())).toMatchObject({
        pass: false,
        score: 0,
        namedScores: { 'Record valid': 0, 'Decision match': 0 },
      });
    },
  );

  it.each(['id', 'runtime', 'observed_control'])(
    'rejects a missing required field: %s',
    (field) => {
      const output: Record<string, unknown> = record();
      delete output[field];
      expect(actionBoundaryCheck(output, context())).toMatchObject({ pass: false, score: 0 });
    },
  );

  it.each(
    ['id', 'runtime'].flatMap((field) =>
      [null, false, 0, [], {}, '', '  '].map((value) => ({ field, value })),
    ),
  )('rejects an invalid identifier: $field = $value', ({ field, value }) => {
    expect(actionBoundaryCheck(record({ [field]: value }), context())).toMatchObject({
      pass: false,
      score: 0,
      namedScores: { 'Record valid': 0, 'Decision match': 0 },
    });
  });

  it.each([null, false, 1, {}, [], '', 'permit', 'ALLOW', ' allow '])(
    'rejects an unknown or malformed observed control: %j',
    (observed_control) => {
      expect(actionBoundaryCheck(record({ observed_control }), context())).toMatchObject({
        pass: false,
        score: 0,
        namedScores: { 'Record valid': 0, 'Decision match': 0 },
      });
    },
  );

  it.each([
    undefined,
    null,
    {},
    { vars: {} },
    context({ expected_control: 'permit' }),
    context({ expected_control: null }),
    context({ expected_action_id: '' }),
    context({ expected_action_id: null }),
  ])('rejects missing or invalid independently supplied expectations: %j', (oracle) => {
    expect(actionBoundaryCheck(record(), oracle)).toMatchObject({ pass: false, score: 0 });
  });

  it('does not accept a matching control for a different action', () => {
    expect(actionBoundaryCheck(record({ id: 'other-action' }), context())).toMatchObject({
      pass: false,
      score: 0,
      namedScores: { 'Record valid': 1, 'Decision match': 0 },
    });
  });

  it('does not trust an expected control supplied in the output', () => {
    expect(
      actionBoundaryCheck(
        record({ observed_control: 'allow', expected_control: 'allow' }),
        context(),
      ),
    ).toMatchObject({ pass: false, score: 0 });
  });

  it.each([
    {
      operation: null,
      resource: null,
      effect: null,
      destination: null,
      authority: null,
      side_effect: null,
    },
    { operation: 'truncate_table', effect: 'data_deletion', side_effect: false },
    { receipt: { present: true } },
    { receipt: { present: true, fresh: true } },
  ])('rejects unsupported action or receipt fields rather than inferring safety: %j', (extra) => {
    expect(
      actionBoundaryCheck(
        record({ observed_control: 'allow', ...extra }),
        context({ expected_control: 'allow' }),
      ),
    ).toMatchObject({
      pass: false,
      score: 0,
      namedScores: { 'Record valid': 0, 'Decision match': 0 },
    });
  });

  it('gives no match credit to review when the independent label requires blocking', () => {
    const result = actionBoundaryCheck(record({ observed_control: 'require_review' }), context());
    expect(result).toMatchObject({ pass: false, score: 0, namedScores: { 'Decision match': 0 } });
    expect(result.namedScores).not.toHaveProperty('Risky action protected');
    expect(result.namedScores).not.toHaveProperty('Receipt freshness checked');
  });
});
