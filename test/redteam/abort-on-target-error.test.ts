import { randomUUID } from 'crypto';
import http from 'http';
import { AddressInfo } from 'net';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../src/database/index';
import { evaluate } from '../../src/evaluator';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import { findTargetErrorStatus, isNonTransientHttpStatus } from '../../src/util/fetch/errors';
import { createMockProvider } from '../factories/provider';

import type { ApiProvider, EvaluateResult, Prompt, TestSuite } from '../../src/types';

function toPrompt(text: string): Prompt {
  return { raw: text, label: text };
}

beforeAll(async () => {
  await runDbMigrations();
});

describe('abort on target error', () => {
  let server: http.Server;
  let serverPort: number;
  let serverUrl: string;

  async function callTestHttpServer() {
    const response = await fetch(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'test' }),
    });
    return {
      output: await response.text(),
      metadata: {
        http: {
          status: response.status,
          statusText: response.statusText,
        },
      },
    };
  }

  beforeAll(async () => {
    // Create a mock server that returns 403 Forbidden
    server = http.createServer((_req, res) => {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden' }));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address() as AddressInfo;
        serverPort = address.port;
        serverUrl = `http://localhost:${serverPort}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('should abort scan when target returns 403', async () => {
    const startTime = Date.now();

    // Create a mock provider that returns 403
    const mockApiProvider = createMockProvider({
      id: 'test-http-provider',
      callApi: vi
        .fn<ApiProvider['callApi']>()
        .mockImplementation(/* Simulate HTTP call to our mock server */ callTestHttpServer),
    });

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt {{ name }}')],
      tests: [
        { vars: { name: 'test1' } },
        { vars: { name: 'test2' } },
        { vars: { name: 'test3' } },
        { vars: { name: 'test4' } },
        { vars: { name: 'test5' } },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    // Run evaluation
    await evaluate(testSuite, evalRecord, {
      maxConcurrency: 1, // Run sequentially to ensure abort logic triggers
    });

    const duration = Date.now() - startTime;

    // Verify scan aborted quickly (should not take 9+ hours!)
    // With 5 tests and maxConcurrency 1, if it didn't abort it would process all 5
    expect(duration).toBeLessThan(10000); // Should complete in under 10 seconds

    // Verify results contain the 403 error
    const results = await evalRecord.getResults();
    expect(results.length).toBeGreaterThan(0);

    // Find the target error status
    const targetErrorStatus = findTargetErrorStatus(results);
    expect(targetErrorStatus).toBe(403);

    // Verify 403 is detected as non-transient
    expect(isNonTransientHttpStatus(403)).toBe(true);
  });

  it('should count the row that stopped the scan', async () => {
    const good = createMockProvider({
      id: 'good-provider',
      callApi: vi.fn<ApiProvider['callApi']>().mockResolvedValue({ output: 'pong' }),
    });
    const bad = createMockProvider({
      id: 'bad-provider',
      callApi: vi.fn<ApiProvider['callApi']>().mockResolvedValue({
        error: 'API error: 404 Not Found',
        metadata: { http: { status: 404, statusText: 'Not Found' } },
      }),
    });
    const testSuite: TestSuite = {
      providers: [good, bad],
      prompts: [toPrompt('Reply pong {{ n }}')],
      tests: [{ vars: { n: 1 } }, { vars: { n: 2 } }, { vars: { n: 3 } }],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });

    // The scan stops at the first 404, and that row is an error like any other. Without it
    // the totals would read "1 passed, 0 errors".
    expect(bad.callApi).toHaveBeenCalledTimes(1);
    const totals = evalRecord.prompts.reduce(
      (sum, prompt) => ({
        passed: sum.passed + (prompt.metrics?.testPassCount ?? 0),
        errors: sum.errors + (prompt.metrics?.testErrorCount ?? 0),
      }),
      { passed: 0, errors: 0 },
    );
    expect(totals).toEqual({ passed: 1, errors: 1 });
    expect(findTargetErrorStatus(await evalRecord.getResults())).toBe(404);
  });

  it('should include HTTP status in result metadata', async () => {
    // Create a mock provider that returns 403
    const mockApiProvider = createMockProvider({
      id: 'test-http-provider',
      callApi: vi.fn<ApiProvider['callApi']>().mockImplementation(callTestHttpServer),
    });

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{ vars: {} }],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, {
      maxConcurrency: 1,
    });

    const results = await evalRecord.getResults();
    expect(results.length).toBe(1);

    // Verify HTTP status is preserved in result metadata
    const result = results[0];
    expect(result.response?.metadata?.http?.status).toBe(403);
  });
});

describe('non-transient HTTP status detection', () => {
  it('should correctly identify non-transient status codes', () => {
    // Non-transient (should abort)
    expect(isNonTransientHttpStatus(401)).toBe(true);
    expect(isNonTransientHttpStatus(403)).toBe(true);
    expect(isNonTransientHttpStatus(404)).toBe(true);
    expect(isNonTransientHttpStatus(501)).toBe(true);

    // Transient (should NOT abort - may recover on retry)
    expect(isNonTransientHttpStatus(500)).toBe(false); // Internal server error (often transient)
    expect(isNonTransientHttpStatus(429)).toBe(false); // Rate limit
    expect(isNonTransientHttpStatus(502)).toBe(false); // Bad gateway
    expect(isNonTransientHttpStatus(503)).toBe(false); // Service unavailable
    expect(isNonTransientHttpStatus(504)).toBe(false); // Gateway timeout

    // Success codes (should NOT abort)
    expect(isNonTransientHttpStatus(200)).toBe(false);
    expect(isNonTransientHttpStatus(201)).toBe(false);
  });
});

describe('Eval.findTargetErrorStatus() - efficient DB query', () => {
  it('should find target error via database query without loading all results', async () => {
    // Create a mock provider that returns 403
    const mockApiProvider = createMockProvider({
      id: 'test-http-provider-db',
      response: {
        output: 'Forbidden',
        metadata: {
          http: {
            status: 403,
            statusText: 'Forbidden',
          },
        },
      },
    });

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{ vars: {} }],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, {
      maxConcurrency: 1,
    });

    // This should do an efficient DB query, not load all results
    const targetErrorStatus = await evalRecord.findTargetErrorStatus();
    expect(targetErrorStatus).toBe(403);
  });

  it('should find a target error in a row that could not be saved', async () => {
    const evalRecord = await Eval.create({}, [toPrompt('Test prompt')], { id: randomUUID() });
    expect(await evalRecord.findTargetErrorStatus()).toBeUndefined();

    // The evaluator hands over a row whose database write failed. It is not in the database,
    // so only the eval record knows that the target returned 403.
    evalRecord.recordResultPersistenceFailure({
      promptIdx: 0,
      testIdx: 0,
      response: { output: 'Forbidden', metadata: { http: { status: 403 } } },
    } as EvaluateResult);
    // The command drops loaded results before it reports, which must not lose the row.
    evalRecord.clearResults();

    expect(await evalRecord.findTargetErrorStatus()).toBe(403);
  });

  it('should still find a saved target error when the database cannot be queried', async () => {
    const mockApiProvider = createMockProvider({
      id: 'test-http-provider-unqueryable',
      response: {
        output: 'Forbidden',
        metadata: { http: { status: 403, statusText: 'Forbidden' } },
      },
    });
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{ vars: {} }],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });
    // The command drops loaded results before it reports.
    evalRecord.clearResults();

    const db = await getDb();
    const select = vi.spyOn(db, 'select').mockImplementation(() => {
      throw new Error('database is locked');
    });
    try {
      // The row was saved, but nothing can be read back. What the run itself saw still counts.
      expect(await evalRecord.findTargetErrorStatus()).toBe(403);
    } finally {
      select.mockRestore();
    }
    expect(await evalRecord.findTargetErrorStatus()).toBe(403);
  });

  it('should return undefined when no target error exists', async () => {
    // Create a mock provider that returns 200
    const mockApiProvider = createMockProvider({
      id: 'test-http-provider-ok',
      response: {
        output: 'Success',
        metadata: {
          http: {
            status: 200,
            statusText: 'OK',
          },
        },
      },
    });

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{ vars: {} }],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, {
      maxConcurrency: 1,
    });

    const targetErrorStatus = await evalRecord.findTargetErrorStatus();
    expect(targetErrorStatus).toBeUndefined();
  });
});
