import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const grade = require('../examples/eval-selective-clarification/grade.cjs');
const FixtureProvider = require('../examples/eval-selective-clarification/provider.cjs');

describe('selective clarification example', () => {
  it.each([
    ['answer', 'answer', true, 0, 0],
    ['clarify', 'clarify', true, 0, 0],
    ['answer', 'clarify', false, 1, 0],
    ['clarify', 'answer', false, 0, 1],
  ])('grades %s against %s', (decision, expected, pass, missed, unnecessary) => {
    const result = grade(JSON.stringify({ decision }), { vars: { expected } });
    expect(result.pass).toBe(pass);
    expect(result.score).toBe(Number(pass));
    expect(result.namedScores).toMatchObject({
      cases: 1,
      invalid: 0,
      missed_clarification: missed,
      unnecessary_clarification: unnecessary,
    });
  });

  it.each(['not JSON', 'null', '{}', '{"decision":"maybe"}', '{"decision":false}'])(
    'counts invalid output %s as a failure, not a missing row',
    (output) => {
      const result = grade(output, { vars: { expected: 'clarify' } });
      expect(result.pass).toBe(false);
      expect(result.namedScores).toMatchObject({ cases: 1, correct: 0, invalid: 1 });
    },
  );

  it('rejects an invalid reference label', () => {
    expect(() => grade('{"decision":"answer"}', { vars: { expected: 'unknown' } })).toThrow(
      'Expected label must be answer or clarify',
    );
  });

  it.each(['new-case', 'constructor', '__proto__', 'toString'])(
    'rejects unknown case %s',
    async (id) => {
      const provider = new FixtureProvider({ config: { policy: 'recorded' } });
      await expect(provider.callApi(JSON.stringify({ id }))).rejects.toThrow(
        'No recorded decision for case',
      );
    },
  );
});
