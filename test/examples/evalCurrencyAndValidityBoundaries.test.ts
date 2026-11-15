import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import yaml from 'yaml';
import { runAssertions } from '../../src/assertions';
import cliState from '../../src/cliState';

import type { ApiProvider, AtomicTestCase, TestSuite } from '../../src/types';

describe('Currency and validity boundary evaluation example', () => {
  const configPath = path.resolve(
    __dirname,
    '../../examples/eval-currency-and-validity-boundaries/promptfooconfig.yaml',
  );
  const exampleDir = path.dirname(configPath);

  let config: TestSuite;
  let provider: ApiProvider;
  let previousBasePath: typeof cliState.basePath;

  beforeEach(() => {
    vi.clearAllMocks();
    previousBasePath = cliState.basePath;
    cliState.basePath = exampleDir;
    config = yaml.parse(readFileSync(configPath, 'utf8')) as TestSuite;
    provider = {
      id: () => 'echo',
      callApi: async (prompt: string) => ({ output: prompt }),
    };
  });

  afterEach(() => {
    cliState.basePath = previousBasePath;
    vi.restoreAllMocks();
  });

  it('loads promptfooconfig.yaml with expected structure', () => {
    expect(config.description).toBeDefined();
    expect(config.tests).toBeDefined();
    expect(Array.isArray(config.tests)).toBe(true);
    expect(config.tests?.length).toBeGreaterThanOrEqual(6);
  });

  describe('Integer arithmetic exact money calculations', () => {
    it('passes exact two-decimal total matching item sum using integer cents', async () => {
      const testCase = (config.tests as AtomicTestCase[]).find(
        (t) => t.description === 'Exact USD total with floating-point sensitive items',
      );
      expect(testCase).toBeDefined();

      const result = await runAssertions({
        prompt: 'Calculate invoice',
        provider,
        providerResponse: {
          output: JSON.stringify({
            currency: 'USD',
            items: [
              { description: 'Consulting', amount: '19.99' },
              { description: 'Processing fee', amount: '0.05' },
              { description: 'Regulatory surcharge', amount: '1.40' },
            ],
            total: '21.44',
          }),
        },
        test: testCase!,
      });

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('rejects an off-by-one-cent total discrepancy', async () => {
      const testCase = (config.tests as AtomicTestCase[]).find(
        (t) => t.description === 'Exact USD total with floating-point sensitive items',
      );
      expect(testCase).toBeDefined();

      const result = await runAssertions({
        prompt: 'Calculate invoice',
        provider,
        providerResponse: {
          output: JSON.stringify({
            currency: 'USD',
            items: [
              { description: 'Consulting', amount: '19.99' },
              { description: 'Processing fee', amount: '0.05' },
              { description: 'Regulatory surcharge', amount: '1.40' },
            ],
            total: '21.45', // 1 cent off
          }),
        },
        test: testCase!,
      });

      expect(result.pass).toBe(false);
      expect(result.reason).toMatch(/total mismatch/i);
    });
  });

  describe('Currency code boundary enforcement', () => {
    it('passes when currency code and amount match expected ISO 4217 code', async () => {
      const testCase = (config.tests as AtomicTestCase[]).find(
        (t) => t.description === 'Matches expected EUR amount and currency code',
      );
      expect(testCase).toBeDefined();

      const result = await runAssertions({
        prompt: 'Quote fee in EUR',
        provider,
        providerResponse: {
          output: JSON.stringify({
            currency: 'EUR',
            total: '150.00',
          }),
        },
        test: testCase!,
      });

      expect(result.pass).toBe(true);
    });

    it('rejects identical numeric amount when currency code does not match', async () => {
      const testCase = (config.tests as AtomicTestCase[]).find(
        (t) => t.description === 'Matches expected EUR amount and currency code',
      );
      expect(testCase).toBeDefined();

      const result = await runAssertions({
        prompt: 'Quote fee in EUR',
        provider,
        providerResponse: {
          output: JSON.stringify({
            currency: 'USD', // Wrong currency code despite matching 150.00
            total: '150.00',
          }),
        },
        test: testCase!,
      });

      expect(result.pass).toBe(false);
      expect(result.reason).toMatch(/currency mismatch/i);
    });
  });

  describe('Temporal validity boundary checks (UTC cutoff)', () => {
    it('accepts quote issued immediately before fixed UTC cutoff', async () => {
      const testCase = (config.tests as AtomicTestCase[]).find(
        (t) => t.description === 'Quote issued before UTC cutoff boundary',
      );
      expect(testCase).toBeDefined();

      const result = await runAssertions({
        prompt: 'Check validity',
        provider,
        providerResponse: {
          output: JSON.stringify({
            quoteId: 'Q-1001',
            effectiveUntil: '2026-05-31T23:59:59.000Z',
          }),
        },
        test: testCase!,
      });

      expect(result.pass).toBe(true);
    });

    it('accepts quote issued at exact UTC cutoff boundary', async () => {
      const testCase = (config.tests as AtomicTestCase[]).find(
        (t) => t.description === 'Quote issued at exact UTC cutoff boundary',
      );
      expect(testCase).toBeDefined();

      const result = await runAssertions({
        prompt: 'Check validity',
        provider,
        providerResponse: {
          output: JSON.stringify({
            quoteId: 'Q-1002',
            effectiveUntil: '2026-06-01T00:00:00.000Z',
          }),
        },
        test: testCase!,
      });

      expect(result.pass).toBe(true);
    });

    it('rejects quote issued after fixed UTC cutoff using inverted assertion', async () => {
      const testCase = (config.tests as AtomicTestCase[]).find(
        (t) => t.description === 'Quote issued after UTC cutoff boundary',
      );
      expect(testCase).toBeDefined();

      const result = await runAssertions({
        prompt: 'Check validity',
        provider,
        providerResponse: {
          output: JSON.stringify({
            quoteId: 'Q-1003',
            effectiveUntil: '2026-06-01T00:00:01.000Z', // 1s past boundary
          }),
        },
        test: testCase!,
      });

      // The inverted assertion passes because the quote is correctly detected as expired
      expect(result.pass).toBe(true);
    });
  });
});
