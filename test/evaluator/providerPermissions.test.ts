import './setup';

import { randomUUID } from 'crypto';

import { beforeEach, expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import { runExtensionHook } from '../../src/evaluatorHelpers';
import Eval from '../../src/models/eval';
import { ConfigPermissionError, checkCloudPermissions } from '../../src/util/cloud';
import * as providerSelection from '../../src/util/eval/providerSelection';
import { createProviderSelection } from '../../src/util/eval/providerSelection';
import { mockApiProvider, toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

import type { ApiProvider, AtomicTestCase, TestSuite } from '../../src/types';

vi.mock('../../src/util/cloud', async (importOriginal) => ({
  ...(await importOriginal()),
  checkCloudPermissions: vi.fn(),
}));

describeEvaluator('provider permissions after extension hooks', () => {
  const linkedTargetId = 'promptfoo://provider/22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    vi.mocked(checkCloudPermissions).mockReset().mockResolvedValue(undefined);
  });

  it.each(['beforeAll', 'beforeEach'] as const)(
    'blocks a grader introduced by %s before any provider call',
    async (hook) => {
      const grader: ApiProvider = {
        id: () => 'hook-grader',
        config: { linkedTargetId, apiKey: 'grader-secret' },
        callApi: vi.fn().mockResolvedValue({ output: '{"pass":true,"score":1,"reason":"ok"}' }),
      };
      vi.mocked(checkCloudPermissions).mockImplementation(async (config) => {
        if (JSON.stringify(config.providers).includes(linkedTargetId)) {
          throw new ConfigPermissionError('Grader is not permitted');
        }
      });
      vi.mocked(runExtensionHook).mockImplementation(async (_extensions, name, context) => {
        if (name === hook) {
          const tests =
            name === 'beforeAll'
              ? (context as { suite: TestSuite }).suite.tests!
              : [(context as { test: AtomicTestCase }).test];
          for (const test of tests) {
            test.assert = [{ type: 'llm-rubric', value: 'good', provider: grader }];
          }
        }
        return context;
      });
      const suite: TestSuite = {
        providers: [mockApiProvider],
        prompts: [toPrompt('hello')],
        tests: [{}],
        extensions: ['file://hooks.js'],
      };
      const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
      await evaluate(suite, record, {
        providerSelection: createProviderSelection(
          suite.providers,
          ['test-provider'],
          suite.providers,
        ),
      }).catch((error) => {
        expect(error).toBeInstanceOf(ConfigPermissionError);
      });
      expect(checkCloudPermissions).toHaveBeenCalledWith(
        expect.objectContaining({
          providers: expect.arrayContaining([{ id: 'hook-grader', config: { linkedTargetId } }]),
        }),
      );
      expect(mockApiProvider.callApi).not.toHaveBeenCalled();
      expect(grader.callApi).not.toHaveBeenCalled();
      expect(JSON.stringify(vi.mocked(checkCloudPermissions).mock.calls)).not.toContain(
        'grader-secret',
      );
    },
  );

  it('builds the provider permission projection once when there are no extensions', async () => {
    const projection = vi.spyOn(providerSelection, 'buildProviderPermissionConfig');
    const suite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('first'), toPrompt('second')],
      tests: [{ vars: { case: 'a' } }, { vars: { case: 'b' } }],
    };
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
    await evaluate(suite, record, {
      repeat: 3,
      providerSelection: createProviderSelection(
        suite.providers,
        ['test-provider'],
        suite.providers,
      ),
    });
    expect((await record.toEvaluateSummary()).stats.successes).toBe(12);
    expect(projection).toHaveBeenCalledTimes(1);
  });

  it('checks an allowed hook grader once across concurrent tests', async () => {
    const grader: ApiProvider = {
      id: () => 'hook-grader',
      config: { linkedTargetId },
      callApi: vi.fn().mockResolvedValue({ output: '{"pass":true,"score":1,"reason":"ok"}' }),
    };
    vi.mocked(runExtensionHook).mockImplementation(async (_extensions, name, context) => {
      if (name === 'beforeEach') {
        (context as { test: AtomicTestCase }).test.assert = [
          { type: 'llm-rubric', value: 'good', provider: grader },
        ];
      }
      return context;
    });
    const suite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('hello')],
      tests: [{}, {}],
      extensions: ['file://hooks.js'],
    };
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
    await evaluate(suite, record, {
      maxConcurrency: 2,
      providerSelection: createProviderSelection(
        suite.providers,
        ['test-provider'],
        suite.providers,
      ),
    });
    const summary = await record.toEvaluateSummary();
    expect(summary.stats.successes).toBe(2);
    expect(grader.callApi).toHaveBeenCalledTimes(2);
    expect(
      vi
        .mocked(checkCloudPermissions)
        .mock.calls.filter(([config]) => JSON.stringify(config.providers).includes(linkedTargetId)),
    ).toHaveLength(1);
  });
});
