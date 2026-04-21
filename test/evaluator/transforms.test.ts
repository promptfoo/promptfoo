import './setup';

import { randomUUID } from 'crypto';

import { expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { type ApiProvider, type TestSuite } from '../../src/types/index';
import { mockApiProvider, toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

describeEvaluator('evaluator transforms', () => {
  it('evaluate with transform option - default test', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      defaultTest: {
        options: {
          transform: 'output + " postprocessed"',
        },
      },
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].response?.output).toBe('Test output postprocessed');
  });

  it('evaluate with transform option - single test', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'equals',
              value: 'Test output postprocessed',
            },
          ],
          options: {
            transform: 'output + " postprocessed"',
          },
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].response?.output).toBe('Test output postprocessed');
  });

  it('evaluate with transform option - json provider', async () => {
    const mockApiJsonProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider-json'),
      callApi: vi.fn().mockResolvedValue({
        output: '{"output": "testing", "value": 123}',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiJsonProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'equals',
              value: '123',
            },
          ],
          options: {
            transform: `JSON.parse(output).value`,
          },
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiJsonProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].response?.output).toBe(123);
  });

  it('evaluate with provider transform', async () => {
    const mockApiProviderWithTransform: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider-transform'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Original output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
      transform: '`Transformed: ${output}`',
    };

    const testSuite: TestSuite = {
      providers: [mockApiProviderWithTransform],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'equals',
              value: 'Transformed: Original output',
            },
          ],
          options: {}, // No test transform, relying on provider's transform
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProviderWithTransform.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].response?.output).toBe('Transformed: Original output');
  });

  it('evaluate with vars transform', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Hello {{ name }}, your age is {{ age }}')],
      tests: [
        {
          vars: { name: 'Alice', age: 30 },
        },
        {
          vars: { name: 'Bob', age: 25 },
          options: {
            transformVars: '{ ...vars, age: vars.age + 5 }',
          },
        },
      ],
      defaultTest: {
        options: {
          transformVars: '{ ...vars, name: vars.name.toUpperCase() }',
        },
      },
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();
    expect(summary).toEqual(
      expect.objectContaining({
        stats: expect.objectContaining({
          successes: 2,
          failures: 0,
        }),
        results: expect.arrayContaining([
          expect.objectContaining({
            prompt: expect.objectContaining({
              raw: 'Hello ALICE, your age is 30',
              label: 'Hello {{ name }}, your age is {{ age }}',
            }),
            response: expect.objectContaining({
              output: 'Test output',
            }),
          }),
          expect.objectContaining({
            // NOTE: test overrides defaultTest transform. Bob not BOB
            prompt: expect.objectContaining({
              raw: 'Hello Bob, your age is 30',
            }),
            response: expect.objectContaining({
              output: 'Test output',
            }),
            vars: {
              name: 'Bob',
              age: 30,
            },
          }),
        ]),
      }),
    );

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(2);
  });

  it('evaluate with context in vars transform in defaultTest', async () => {
    const mockApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Hello {{ name }}, your age is {{ age }}')],
      defaultTest: {
        options: {
          transformVars: `return {
                ...vars,
                // Test that context.uuid is available
                id: context.uuid,
                // Test that context.prompt is available but empty
                hasPrompt: Boolean(context.prompt)
              }`,
        },
      },
      tests: [
        {
          vars: {
            name: 'Alice',
            age: 25,
          },
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary).toEqual(
      expect.objectContaining({
        stats: expect.objectContaining({
          successes: 1,
          failures: 0,
        }),
        results: expect.arrayContaining([
          expect.objectContaining({
            vars: expect.objectContaining({
              id: expect.stringMatching(
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
              ),
              hasPrompt: true,
            }),
          }),
        ]),
      }),
    );

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
  });

  it('evaluate with provider transform and test transform', async () => {
    const mockApiProviderWithTransform: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider-transform'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Original output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
      transform: '`ProviderTransformed: ${output}`',
    };

    const testSuite: TestSuite = {
      providers: [mockApiProviderWithTransform],
      prompts: [toPrompt('Test prompt')],
      defaultTest: {
        options: {
          // overridden by the test transform
          transform: '"defaultTestTransformed " + output',
        },
      },
      tests: [
        {
          assert: [
            {
              type: 'equals',
              // Order of transforms: 1. Provider transform 2. Test transform (or defaultTest transform, if test transform unset)
              value: 'testTransformed ProviderTransformed: Original output',
            },
          ],
          // This transform overrides the defaultTest transform
          options: { transform: '"testTransformed " + output' },
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary).toEqual(
      expect.objectContaining({
        stats: expect.objectContaining({
          successes: 1,
          failures: 0,
        }),
        results: expect.arrayContaining([
          expect.objectContaining({
            response: expect.objectContaining({
              output: 'testTransformed ProviderTransformed: Original output',
            }),
          }),
        ]),
      }),
    );

    expect(mockApiProviderWithTransform.callApi).toHaveBeenCalledTimes(1);
  });

  it('evaluate with multiple transforms', async () => {
    const mockApiProviderWithTransform: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider-transform'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Original output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
      transform: '`Provider: ${output}`',
    };

    const testSuite: TestSuite = {
      providers: [mockApiProviderWithTransform],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'equals',
              value: 'Test: Provider: Original output',
            },
          ],
          options: {
            transform: '`Test: ${output}`',
          },
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProviderWithTransform.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].response?.output).toBe('Test: Provider: Original output');
  });

  it('evaluate with provider transform and test postprocess (deprecated)', async () => {
    const mockApiProviderWithTransform: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider-transform'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Original output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
      transform: '`Provider: ${output}`',
    };

    const testSuite: TestSuite = {
      providers: [mockApiProviderWithTransform],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'equals',
              value: 'Postprocess: Provider: Original output',
            },
          ],
          options: {
            postprocess: '`Postprocess: ${output}`',
          },
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();
    expect(summary).toMatchObject({
      stats: expect.objectContaining({
        successes: 1,
        failures: 0,
      }),
    });
    expect(summary.results[0].response?.output).toBe('Postprocess: Provider: Original output');

    expect(mockApiProviderWithTransform.callApi).toHaveBeenCalledTimes(1);
  });

  it('evaluate with provider transform, test transform, and test postprocess (deprecated)', async () => {
    const mockApiProviderWithTransform: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider-transform'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Original output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
      transform: '`Provider: ${output}`',
    };

    const testSuite: TestSuite = {
      providers: [mockApiProviderWithTransform],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'equals',
              value: 'Transform: Provider: Original output',
            },
          ],
          options: {
            transform: '`Transform: ${output}`',
            postprocess: '`Postprocess: ${output}`', // This should be ignored
          },
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();
    expect(summary).toMatchObject({
      stats: expect.objectContaining({
        successes: 1,
        failures: 0,
      }),
      results: expect.arrayContaining([
        expect.objectContaining({
          response: expect.objectContaining({
            output: 'Transform: Provider: Original output',
          }),
        }),
      ]),
    });
    expect(mockApiProviderWithTransform.callApi).toHaveBeenCalledTimes(1);
  });

  it('evaluate with no output', async () => {
    const mockApiProviderNoOutput: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider-no-output'),
      callApi: vi.fn().mockResolvedValue({
        output: null,
        tokenUsage: { total: 5, prompt: 5, completion: 0, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProviderNoOutput],
      prompts: [toPrompt('Test prompt')],
      tests: [],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.stats.successes).toBe(0);
    expect(summary.stats.failures).toBe(1);
    expect(summary.results[0].error).toBe('No output');
    expect(summary.results[0].success).toBe(false);
    expect(summary.results[0].score).toBe(0);
    expect(mockApiProviderNoOutput.callApi).toHaveBeenCalledTimes(1);
  });

  it('evaluate with false output', async () => {
    const mockApiProviderNoOutput: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider-no-output'),
      callApi: vi.fn().mockResolvedValue({
        output: false,
        tokenUsage: { total: 5, prompt: 5, completion: 0, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProviderNoOutput],
      prompts: [toPrompt('Test prompt')],
      tests: [],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].success).toBe(true);
    expect(summary.results[0].score).toBe(1);
    expect(mockApiProviderNoOutput.callApi).toHaveBeenCalledTimes(1);
  });

  it('merges defaultTest.vars before applying transformVars', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt {{ test1 }} {{ test2 }} {{ test2UpperCase }}')],
      defaultTest: {
        vars: {
          test2: 'bar',
        },
        options: {
          transformVars: `
              return {
                ...vars,
                test2UpperCase: vars.test2.toUpperCase()
              };
            `,
        },
      },
      tests: [
        {
          vars: {
            test1: 'foo',
          },
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);

    // Check that vars were merged correctly and transform was applied
    expect(summary.results[0].vars).toEqual({
      test1: 'foo',
      test2: 'bar',
      test2UpperCase: 'BAR',
    });

    // Verify the prompt was rendered with all variables
    expect(summary.results[0].prompt.raw).toBe('Test prompt foo bar BAR');
  });
});
