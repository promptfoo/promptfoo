import { randomUUID } from 'crypto';
import http from 'http';
import { AddressInfo } from 'net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluator';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';

import type { ApiProvider, Prompt, TestSuite } from '../../src/types';

function toPrompt(text: string): Prompt {
  return { raw: text, label: text };
}

beforeAll(async () => {
  await runDbMigrations();
});

describe('abort on target error', () => {
  let server: http.Server;
  let serverUrl: string;

  beforeAll(async () => {
    // Create a mock server that returns 403 Forbidden
    server = http.createServer((_req, res) => {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden' }));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const { port } = server.address() as AddressInfo;
        serverUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('should abort redteam scan after 3 consecutive 403 errors', async () => {
    const startTime = Date.now();

    // Create a mock provider that returns 403
    const mockApiProvider: ApiProvider = {
      id: () => 'test-http-provider',
      callApi: async () => {
        // Simulate HTTP call to our mock server
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
      },
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt {{ name }}')],
      tests: [
        { vars: { name: 'test1' } },
        { vars: { name: 'test2' } },
        { vars: { name: 'test3' } },
        { vars: { name: 'test4' } },
        { vars: { name: 'test5' } },
        { vars: { name: 'test6' } },
        { vars: { name: 'test7' } },
        { vars: { name: 'test8' } },
        { vars: { name: 'test9' } },
        { vars: { name: 'test10' } },
      ],
      // Must be a redteam scan to trigger abort
      redteam: {
        purpose: 'test',
      },
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    // Run evaluation
    await evaluate(testSuite, evalRecord, {
      maxConcurrency: 1, // Run sequentially to ensure abort logic triggers
    });

    const duration = Date.now() - startTime;

    // Verify scan aborted quickly (should not take 9+ hours!)
    expect(duration).toBeLessThan(10000); // Should complete in under 10 seconds

    // Verify results contain the 403 error — should have exactly 3 (the threshold)
    const results = await evalRecord.getResults();
    expect(results.length).toBe(3);

    // Verify targetErrorStatus is set on the eval record
    expect(evalRecord.targetErrorStatus).toBe(403);

    // Verify the DB method also finds the error
    const targetErrorStatus = await evalRecord.findTargetErrorStatus();
    expect(targetErrorStatus).toBe(403);
  });

  it('should not abort non-redteam eval on HTTP errors', async () => {
    const mockApiProvider: ApiProvider = {
      id: () => 'test-http-provider-no-redteam',
      callApi: async () => ({
        output: 'Forbidden',
        metadata: {
          http: {
            status: 403,
            statusText: 'Forbidden',
          },
        },
      }),
    };

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
      // No redteam section — regular eval should NOT abort
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, {
      maxConcurrency: 1,
    });

    // All 5 tests should complete — no abort for non-redteam evals
    const results = await evalRecord.getResults();
    expect(results.length).toBe(5);
    expect(evalRecord.targetErrorStatus).toBeUndefined();
  });

  it('should reset consecutive error counter on success', async () => {
    let callCount = 0;
    const mockApiProvider: ApiProvider = {
      id: () => 'test-http-provider-mixed',
      callApi: async () => {
        callCount++;
        // Return 403 for calls 1-2, 200 for call 3, then 403 for calls 4-5, 200 for call 6, etc.
        // This ensures we never hit 3 consecutive errors
        const status = callCount % 3 === 0 ? 200 : 403;
        return {
          output: status === 200 ? 'Success' : 'Forbidden',
          metadata: { http: { status, statusText: status === 200 ? 'OK' : 'Forbidden' } },
        };
      },
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt {{ name }}')],
      tests: [
        { vars: { name: 'test1' } },
        { vars: { name: 'test2' } },
        { vars: { name: 'test3' } },
        { vars: { name: 'test4' } },
        { vars: { name: 'test5' } },
        { vars: { name: 'test6' } },
      ],
      redteam: {
        purpose: 'test',
      },
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, {
      maxConcurrency: 1,
    });

    // All 6 tests should complete — consecutive errors never reach threshold of 3
    const results = await evalRecord.getResults();
    expect(results.length).toBe(6);
    expect(evalRecord.targetErrorStatus).toBeUndefined();
  });

  it('should include HTTP status in result metadata', async () => {
    // Create a mock provider that returns 403
    const mockApiProvider: ApiProvider = {
      id: () => 'test-http-provider',
      callApi: async () => {
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
      },
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{ vars: {} }],
      // No redteam — so it won't abort, just verifying metadata
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

describe('Eval.findTargetErrorStatus() - efficient DB query', () => {
  it('should find target error via database query without loading all results', async () => {
    // Create a mock provider that returns 403
    const mockApiProvider: ApiProvider = {
      id: () => 'test-http-provider-db',
      callApi: async () => ({
        output: 'Forbidden',
        metadata: {
          http: {
            status: 403,
            statusText: 'Forbidden',
          },
        },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{ vars: {} }, { vars: {} }, { vars: {} }],
      redteam: {
        purpose: 'test',
      },
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, {
      maxConcurrency: 1,
    });

    // This should return the status set by the evaluator, or fall back to DB query
    const targetErrorStatus = await evalRecord.findTargetErrorStatus();
    expect(targetErrorStatus).toBe(403);
  });

  it('should return undefined when no target error exists', async () => {
    // Create a mock provider that returns 200
    const mockApiProvider: ApiProvider = {
      id: () => 'test-http-provider-ok',
      callApi: async () => ({
        output: 'Success',
        metadata: {
          http: {
            status: 200,
            statusText: 'OK',
          },
        },
      }),
    };

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
