import { describe, expect, it } from 'vitest';
import { runAssertion } from '../../src/assertions/index';

import type { Assertion, AtomicTestCase, ProviderResponse } from '../../src/types/index';

describe('skill-used assertion', () => {
  const testCase: AtomicTestCase = {
    vars: {},
  };

  const providerResponse: ProviderResponse = {
    output: 'Done',
    metadata: {
      skillCalls: [
        {
          name: 'token-skill',
          path: '.agents/skills/token-skill/SKILL.md',
          source: 'heuristic',
        },
        {
          name: 'project-standards:standards-check',
          source: 'tool',
        },
      ],
    },
  };

  async function runSkillAssertion(assertion: Assertion) {
    return runAssertion({
      assertion,
      test: testCase,
      providerResponse,
    });
  }

  it('passes when an exact skill name is present', async () => {
    const result = await runSkillAssertion({
      type: 'skill-used',
      value: 'token-skill',
    });

    expect(result.pass).toBe(true);
    expect(result.reason).toContain('Observed required skill(s): token-skill');
  });

  it('passes when all expected skills in a list are present', async () => {
    const result = await runSkillAssertion({
      type: 'skill-used',
      value: ['token-skill', 'project-standards:standards-check'],
    });

    expect(result.pass).toBe(true);
  });

  it('supports pattern matching with count thresholds', async () => {
    const result = await runSkillAssertion({
      type: 'skill-used',
      value: {
        pattern: 'project-*:*',
        min: 1,
        max: 1,
      },
    });

    expect(result.pass).toBe(true);
    expect(result.reason).toContain('Matched skill "project-*:*" 1 time(s)');
  });

  it('trims object matcher name and pattern values', async () => {
    const result = await runSkillAssertion({
      type: 'skill-used',
      value: {
        pattern: ' project-*:* ',
        min: 1,
      },
    });

    expect(result.pass).toBe(true);
    expect(result.reason).toContain('Matched skill "project-*:*" 1 time(s)');
  });

  it('supports inverse assertions', async () => {
    const result = await runSkillAssertion({
      type: 'not-skill-used',
      value: 'forbidden-skill',
    });

    expect(result.pass).toBe(true);
  });

  it('fails when a required skill is missing', async () => {
    const result = await runSkillAssertion({
      type: 'skill-used',
      value: 'missing-skill',
    });

    expect(result.pass).toBe(false);
    expect(result.reason).toContain('Missing required skill(s): missing-skill');
  });

  it('fails inverse assertions when a forbidden skill is used', async () => {
    const result = await runSkillAssertion({
      type: 'not-skill-used',
      value: 'token-skill',
    });

    expect(result.pass).toBe(false);
    expect(result.reason).toContain('Forbidden skill(s) were used: token-skill');
  });

  it('treats not-skill-used object assertions with no count bounds as forbidding any match', async () => {
    const result = await runSkillAssertion({
      type: 'not-skill-used',
      value: {
        pattern: 'token-*',
      },
    });

    expect(result.pass).toBe(false);
    expect(result.reason).toContain('Forbidden skill "token-*" was used 1 time(s)');
  });

  it('fails not-skill-used object assertions with max: 0 when a matching skill is present', async () => {
    const result = await runSkillAssertion({
      type: 'not-skill-used',
      value: {
        pattern: 'token-*',
        max: 0,
      },
    });

    expect(result.pass).toBe(false);
    expect(result.reason).toContain('Forbidden skill "token-*" was used 1 time(s)');
  });

  it('passes not-skill-used object assertions with max: 0 when no matching skill is present', async () => {
    const result = await runSkillAssertion({
      type: 'not-skill-used',
      value: {
        pattern: 'missing-*',
        max: 0,
      },
    });

    expect(result.pass).toBe(true);
    expect(result.reason).toContain('Forbidden skill "missing-*" was not used');
  });

  it('rejects ambiguous not-skill-used count bounds other than max: 0', async () => {
    await expect(
      runSkillAssertion({
        type: 'not-skill-used',
        value: {
          pattern: 'token-*',
          max: 1,
        },
      }),
    ).rejects.toThrow(
      'not-skill-used object assertions only support name/pattern with no count bounds, or max: 0',
    );
  });

  it('rejects invalid count bounds', async () => {
    await expect(
      runSkillAssertion({
        type: 'skill-used',
        value: {
          pattern: 'token-*',
          min: -1,
        },
      }),
    ).rejects.toThrow('skill-used assertion object min must be a finite non-negative integer');

    await expect(
      runSkillAssertion({
        type: 'skill-used',
        value: {
          pattern: 'token-*',
          min: 2,
          max: 1,
        },
      }),
    ).rejects.toThrow('skill-used assertion object max must be greater than or equal to min');
  });

  it('throws when object values omit name and pattern', async () => {
    await expect(
      runSkillAssertion({
        type: 'skill-used',
        value: { min: 1 },
      }),
    ).rejects.toThrow('skill-used assertion object must include a name or pattern property');
  });

  it('fails gracefully when skillCalls is an empty array', async () => {
    const result = await runAssertion({
      assertion: {
        type: 'skill-used',
        value: 'token-skill',
      },
      test: testCase,
      providerResponse: {
        output: 'Done',
        metadata: {
          skillCalls: [],
        },
      },
    });

    expect(result.pass).toBe(false);
    expect(result.reason).toContain('Missing required skill(s): token-skill');
    expect(result.reason).toContain('Actual skills: (none)');
  });
});
