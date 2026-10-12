import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

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

describe('Alovia Watchdog example response transform', () => {
  beforeAll(async () => {
    const module = await import(pathToFileURL(transformPath).href);
    transform = module.default as WatchdogTransform;
  });

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
