import { randomUUID } from 'crypto';
import http from 'http';
import { AddressInfo } from 'net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluator';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import { findTargetErrorStatus, isNonTransientHttpStatus } from '../../src/util/fetch/errors';

import type { ApiProvider, Prompt, TestSuite } from '../../src/types';

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
