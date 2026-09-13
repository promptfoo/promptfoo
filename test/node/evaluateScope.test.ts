import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as migrations from '../../src/migrate';
import { evaluate } from '../../src/node/evaluate';
import { providerRegistry } from '../../src/providers/providerRegistry';
import * as externalFile from '../../src/util/file';
import * as util from '../../src/util/index';
import * as testCaseReader from '../../src/util/testCaseReader';
import { createDeferred } from '../util/utils';

import type { ApiProvider, EvaluateTestSuite, TestCase } from '../../src/types';

describe('SDK provider lifecycle', () => {
  beforeAll(async () => {
    await migrations.runDbMigrations();
  });
  afterEach(async () => {
    await providerRegistry.shutdownAll();
    vi.restoreAllMocks();
  });

  it.each(['migration', 'provider', 'default-test', 'tests', 'filters', 'prompts'])(
    'cleans up input providers when %s setup fails',
    async (stage) => {
      const cleanup = vi.fn();
      const nested: ApiProvider & { cleanup: typeof cleanup } = {
        id: () => 'preconstructed-nested-provider',
        callApi: vi.fn<ApiProvider['callApi']>(),
        cleanup,
      };
      const suite: EvaluateTestSuite = {
        providers: ['echo'],
        prompts: ['ok'],
        tests: [{ options: { provider: { text: nested } } }],
      };
      const missing = 'file://missing-sdk-provider-scope-fixture';
      switch (stage) {
        case 'migration':
          suite.writeLatestResults = true;
          vi.spyOn(migrations, 'runDbMigrations').mockRejectedValueOnce(
            new Error('Migration failed'),
          );
          break;
        case 'provider':
          suite.providers = ['unknown-provider-for-scope-test'];
          break;
        case 'default-test':
          suite.defaultTest = missing;
          break;
        case 'tests':
          vi.spyOn(testCaseReader, 'readTests').mockRejectedValueOnce(new Error('Tests failed'));
          break;
        case 'filters':
          vi.spyOn(util, 'readFilters').mockRejectedValueOnce(new Error('Filters failed'));
          break;
        case 'prompts':
          suite.prompts = [missing];
          break;
      }
      await expect(evaluate(suite, { cache: false })).rejects.toThrow();
      expect(nested.callApi).not.toHaveBeenCalled();
      expect(cleanup).toHaveBeenCalledOnce();
    },
  );

  it('adopts providers loaded from test files before later setup fails', async () => {
    const cleanup = vi.fn();
    const provider = { id: () => 'test-file-provider', callApi: vi.fn(), cleanup };
    vi.spyOn(testCaseReader, 'readTests').mockResolvedValueOnce([{ provider }]);
    vi.spyOn(util, 'readFilters').mockRejectedValueOnce(new Error('Filters failed'));
    await expect(
      evaluate({ providers: ['echo'], prompts: ['ok'], tests: 'tests.yaml' }),
    ).rejects.toThrow('Filters failed');
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('adopts a provider from the default-test file before loading other tests', async () => {
    const cleanup = vi.fn();
    const provider = { id: () => 'default-test-file-provider', callApi: vi.fn(), cleanup };
    vi.spyOn(externalFile, 'maybeLoadFromExternalFile').mockResolvedValueOnce({ provider });
    vi.spyOn(testCaseReader, 'readTests').mockRejectedValueOnce(new Error('Tests failed'));
    await expect(
      evaluate({
        providers: ['echo'],
        prompts: ['ok'],
        defaultTest: 'file://default-test.yaml',
        tests: [],
      }),
    ).rejects.toThrow('Tests failed');
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it.each([
    'default-target',
    'test-target',
    'default-grader',
    'test-grader',
    'default-assertion',
    'test-assertion',
    'assertion-set',
    'typed-grader',
    'scenario-config',
    'scenario-test',
  ])('cleans up an existing nested provider at %s', async (location) => {
    const cleanup = vi.fn();
    const provider: ApiProvider & { cleanup: typeof cleanup } = {
      id: () => 'nested-sdk-provider',
      cleanup,
      callApi: vi.fn(async () => ({ output: '{"pass":true,"score":1,"reason":"ok"}' })),
    };
    const assertion = { type: 'llm-rubric' as const, value: 'The answer is valid.' };
    const test: TestCase = { assert: [assertion] };
    const suite: EvaluateTestSuite = { providers: ['echo'], prompts: ['ok'], tests: [test] };
    if (location.endsWith('target')) {
      test.assert = [];
      if (location === 'default-target') {
        suite.defaultTest = { provider };
      } else {
        test.provider = provider;
      }
    } else if (location.endsWith('grader')) {
      const options = { provider: location === 'typed-grader' ? { text: provider } : provider };
      if (location === 'default-grader') {
        suite.defaultTest = { options };
      } else {
        test.options = options;
      }
    } else if (location.startsWith('scenario')) {
      test.assert = [];
      suite.tests = [];
      suite.scenarios = [
        {
          config: [location === 'scenario-config' ? { provider } : {}],
          tests: [location === 'scenario-test' ? { provider } : {}],
        },
      ];
    } else {
      test.assert = [{ ...assertion, provider }];
      if (location === 'default-assertion') {
        suite.defaultTest = { assert: test.assert };
        test.assert = [];
      } else if (location === 'assertion-set') {
        test.assert = [{ type: 'assert-set', assert: [{ ...assertion, provider }] }];
      }
    }
    const result = await (await evaluate(suite, { cache: false })).toEvaluateSummary();
    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(true);
    expect(provider.callApi).toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it.each(['top-level', 'nested'])(
    'keeps a shared %s provider alive until both SDK evaluations finish',
    async (location) => {
      const started = createDeferred<void>();
      const finishSlow = createDeferred<void>();
      let arrivals = 0;
      let closed = false;
      const shutdown = vi.fn(async () => {
        closed = true;
      });
      const provider: ApiProvider & { shutdown: typeof shutdown } = {
        id: () => 'shared-sdk-provider',
        shutdown,
        async callApi(prompt) {
          if (++arrivals === 2) {
            started.resolve();
          }
          await started.promise;
          if (prompt === 'slow') {
            await finishSlow.promise;
          }
          return closed ? { error: 'Provider closed during another SDK run' } : { output: prompt };
        },
      };
      const run = (prompt: string) =>
        evaluate(
          {
            providers: location === 'top-level' ? [provider] : ['echo'],
            ...(location === 'nested' && { defaultTest: { provider } }),
            prompts: [prompt],
            tests: [{ assert: [{ type: 'equals', value: prompt }] }],
          },
          { cache: false },
        );
      const fast = run('fast');
      const slow = run('slow');
      let shutdownsAfterFast: number;
      try {
        await fast;
        shutdownsAfterFast = shutdown.mock.calls.length;
      } finally {
        finishSlow.resolve();
      }
      const summary = await (await slow).toEvaluateSummary();
      expect(shutdownsAfterFast).toBe(0);
      expect(summary.results[0].success).toBe(true);
      expect(shutdown).toHaveBeenCalledOnce();
    },
  );
});
