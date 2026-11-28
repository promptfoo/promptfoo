import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import yaml from 'yaml';
import { runAssertions } from '../../src/assertions';
import cliState from '../../src/cliState';

import type { AtomicTestCase } from '../../src/types';

const exampleDir = path.resolve(__dirname, '../../examples/eval-currency-and-validity-boundaries');
const { tests }: { tests: (AtomicTestCase & { vars: { query: string } })[] } = yaml.parse(
  readFileSync(path.join(exampleDir, 'promptfooconfig.yaml'), 'utf8'),
);
const provider = { id: () => 'echo', callApi: async (prompt: string) => ({ output: prompt }) };

describe('Currency and validity boundary example', () => {
  let previousBasePath: typeof cliState.basePath;
  beforeEach(() => {
    previousBasePath = cliState.basePath;
    cliState.basePath = exampleDir;
  });
  afterEach(() => {
    cliState.basePath = previousBasePath;
  });

  it.each(tests)('$description', async (test) => {
    const query = test.vars.query;
    const result = await runAssertions({
      prompt: query,
      provider,
      providerResponse: await provider.callApi(query),
      test,
    });
    expect(result.pass, result.reason).toBe(true);
  });

  it.each([
    [
      'validateExactMoney',
      { currency: 'USD', items: [{ amount: '0.25' }], total: '0.24' },
      /total mismatch/i,
    ],
    [
      'validateExactMoney',
      { currency: 'USD', items: [{ amount: '-0.25' }], total: '0.25' },
      /total mismatch/i,
    ],
    [
      'validateExactMoney',
      { currency: 'USD', items: [{ amount: 0.001 }], total: 0 },
      /invalid item amount/i,
    ],
    ['validateTemporalBoundary', { effectiveUntil: '2026-05-31T23:59:59' }, /valid ISO dates/i],
    ['validateTemporalBoundary', { effectiveUntil: '2026-02-30T00:00:00Z' }, /valid ISO dates/i],
    ['validateCurrencyCode', { currency: 'EUR', total: '0.25' }, /currency mismatch/i],
  ] as const)('rejects invalid output from %s: %j', async (handler, invoice, reason) => {
    const query = JSON.stringify(invoice);
    const result = await runAssertions({
      prompt: query,
      provider,
      providerResponse: await provider.callApi(query),
      test: {
        vars: { expectedCurrency: 'USD', cutoffUtc: '2026-06-01T00:00:00Z' },
        assert: [{ type: 'javascript', value: `file://assert-boundary.cjs:${handler}` }],
      },
    });
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(reason);
  });
});
