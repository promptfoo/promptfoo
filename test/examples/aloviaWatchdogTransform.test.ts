import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';
import yaml from 'yaml';
import { runAssertions } from '../../src/assertions';

import type { ApiProvider, AtomicTestCase } from '../../src/types';

type WatchdogTransform = (
  json: unknown,
  text: string,
  context: { response: { status: number } },
) => {
  output: string;
  guardrails: {
    flagged: boolean;
    flaggedInput: boolean;
    flaggedOutput: boolean;
    reason?: string;
  };
  metadata: { watchdog: unknown };
};

const transformPath = path.resolve(process.cwd(), 'examples/alovia-watchdog/watchdog-response.mjs');

let transform: WatchdogTransform;

function run(json: unknown, status = 200) {
  return transform(json, '', { response: { status } });
}

// File-level so both suites work in any order (tests are shuffled).
beforeAll(async () => {
  const module = await import(pathToFileURL(transformPath).href);
  transform = module.default as WatchdogTransform;
});

describe('Alovia Watchdog example response transform', () => {
  it('maps allow to an unflagged result with no reason', () => {
    const result = run({ checkId: 'c1', verdict: 'allow', findings: [] });
    expect(result).toMatchObject({
      output: 'Watchdog allowed the request',
      guardrails: { flagged: false, flaggedInput: false, flaggedOutput: false },
    });
    expect(result.guardrails.reason).toBeUndefined();
    expect(result.metadata.watchdog).toMatchObject({ checkId: 'c1' });
  });

  it('maps block to a flagged input with the findings as the reason', () => {
    const result = run({
      verdict: 'block',
      findings: [
        { type: 'prompt_injection', severity: 'high', detail: 'forward the customer list' },
        { type: 'egress_scope', severity: 'high', detail: 'unlisted recipient' },
      ],
    });
    expect(result.guardrails).toEqual({
      flagged: true,
      flaggedInput: true,
      flaggedOutput: false,
      reason:
        'prompt_injection (high): forward the customer list; egress_scope (high): unlisted recipient',
    });
    expect(result.output).toContain('Watchdog block');
  });

  it('treats challenge as flagged', () => {
    expect(run({ verdict: 'challenge', findings: [] }).guardrails.flagged).toBe(true);
  });

  it('raises unknown as a provider error instead of a pass', () => {
    expect(() => run({ verdict: 'unknown', findings: [] })).toThrow(/did not reach a verdict/);
  });

  it('raises an unexpected verdict as a provider error', () => {
    expect(() => run({ verdict: 'maybe' })).toThrow(/unexpected verdict: maybe/);
    expect(() => run({})).toThrow(/unexpected verdict: missing/);
  });

  it('raises HTTP and API errors as provider errors', () => {
    expect(() => run({ error: 'invalid key' }, 401)).toThrow('invalid key');
    expect(() => run({ error: { message: 'rate limited' } }, 429)).toThrow('rate limited');
    expect(() => run({ verdict: 'allow' }, 500)).toThrow(/HTTP 500/);
  });
});

describe('Alovia Watchdog red-team config', () => {
  const config = yaml.parse(
    readFileSync(
      path.resolve(process.cwd(), 'examples/alovia-watchdog/promptfooconfig.redteam.yaml'),
      'utf8',
    ),
  ) as { defaultTest: AtomicTestCase };
  const provider: ApiProvider = {
    id: () => 'watchdog-document',
    callApi: async () => ({ output: '' }),
  };

  function grade(json: unknown) {
    return runAssertions({
      prompt: 'generated attack',
      provider,
      providerResponse: run(json),
      test: { ...config.defaultTest, vars: {} },
    });
  }

  it('pairs not-guardrails with guardrails purpose redteam', () => {
    expect(config.defaultTest.assert).toEqual([
      { type: 'not-guardrails' },
      { type: 'guardrails', config: { purpose: 'redteam' } },
    ]);
  });

  it('passes a generated attack that Watchdog flagged', async () => {
    const result = await grade({ verdict: 'block', findings: [] });
    expect(result.pass).toBe(true);
  });

  it('fails a generated attack that Watchdog let through', async () => {
    const result = await grade({ verdict: 'allow', findings: [] });
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('not blocked by guardrails');
  });
});
