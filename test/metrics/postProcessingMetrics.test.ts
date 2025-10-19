import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import type { TestSuite } from '../../src/types/index';

describe('Post-processing metrics integration', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a temporary directory for test files
    tempDir = path.join(__dirname, '.temp-post-processing-test');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    jest.resetAllMocks();
  });

  it('should run post-processing metrics after evaluation completes', async () => {
    // Create a simple post-processing metric function
    const metricFunctionPath = path.join(tempDir, 'testMetric.js');
    const metricCode = `
module.exports = function(context) {
  const { results, options } = context;

  // Calculate simple statistics
  const totalTests = results.length;
  const passCount = results.filter(r => r.success).length;
  const passRate = passCount / totalTests;

  return {
    'test.total': totalTests,
    'test.pass_count': passCount,
    'test.pass_rate': passRate,
  };
};
    `;
    fs.writeFileSync(metricFunctionPath, metricCode);

    const testSuite: TestSuite = {
      prompts: [{ raw: 'Test prompt: {{input}}', label: 'test' }],
      providers: [
        {
          id: () => 'test-provider',
          callApi: async () => ({ output: 'test output' }),
        },
      ],
      tests: [
        { vars: { input: 'hello' }, assert: [{ type: 'contains', value: 'test' }] },
        { vars: { input: 'world' }, assert: [{ type: 'contains', value: 'test' }] },
      ],
      derivedMetrics: [
        {
          name: 'post_stats',
          value: `file://${metricFunctionPath}`,
          phase: 'post',
        },
      ],
    };

    const evalRecord = new Eval({}, { persisted: false });
    const result = await evaluate(testSuite, evalRecord, {
      repeat: 1,
      showProgressBar: false,
    });

    // Verify post-processing metrics were added
    expect(result.prompts.length).toBeGreaterThan(0);
    const promptMetrics = result.prompts[0].metrics?.namedScores;
    expect(promptMetrics).toBeDefined();
    expect(promptMetrics?.['test.total']).toBe(2);
    expect(promptMetrics?.['test.pass_count']).toBeGreaterThanOrEqual(0);
    expect(promptMetrics?.['test.pass_rate']).toBeGreaterThanOrEqual(0);
  });

  it('should run built-in repeatStats metric with repeat > 1', async () => {
    const testSuite: TestSuite = {
      prompts: [{ raw: 'Test prompt', label: 'test' }],
      providers: [
        {
          id: () => 'test-provider',
          callApi: async () => ({ output: 'test output' }),
        },
      ],
      tests: [{ assert: [{ type: 'contains', value: 'test' }] }],
      derivedMetrics: [
        {
          name: 'repeat_stats',
          value: 'file://./src/metrics/repeatStats.js',
          phase: 'post',
        },
      ],
    };

    const evalRecord = new Eval({}, { persisted: false });
    const result = await evaluate(testSuite, evalRecord, {
      repeat: 3,
      showProgressBar: false,
    });

    // Verify repeat metrics were calculated
    const promptMetrics = result.prompts[0].metrics?.namedScores;
    expect(promptMetrics).toBeDefined();
    expect(promptMetrics?.['repeat.pass_n']).toBeDefined();
    expect(promptMetrics?.['repeat.pass_rate']).toBeDefined();
    expect(promptMetrics?.['repeat.flip_rate']).toBeDefined();
    expect(promptMetrics?.['repeat.score.mean']).toBeDefined();
    expect(promptMetrics?.['repeat.score.stddev']).toBeDefined();
  });

  it('should skip post-processing metrics when repeat is 1', async () => {
    const testSuite: TestSuite = {
      prompts: [{ raw: 'Test prompt', label: 'test' }],
      providers: [
        {
          id: () => 'test-provider',
          callApi: async () => ({ output: 'test output' }),
        },
      ],
      tests: [{ assert: [{ type: 'contains', value: 'test' }] }],
      derivedMetrics: [
        {
          name: 'repeat_stats',
          value: 'file://./src/metrics/repeatStats.js',
          phase: 'post',
        },
      ],
    };

    const evalRecord = new Eval({}, { persisted: false });
    const result = await evaluate(testSuite, evalRecord, {
      repeat: 1,
      showProgressBar: false,
    });

    // Repeat metrics should be empty when repeat = 1
    const promptMetrics = result.prompts[0].metrics?.namedScores;
    expect(promptMetrics?.['repeat.pass_n']).toBeUndefined();
    expect(promptMetrics?.['repeat.pass_rate']).toBeUndefined();
  });

  it('should handle multiple post-processing metrics', async () => {
    // Create two different metric functions
    const metric1Path = path.join(tempDir, 'metric1.js');
    fs.writeFileSync(
      metric1Path,
      `
module.exports = function(context) {
  return { 'custom.metric1': 42 };
};
    `,
    );

    const metric2Path = path.join(tempDir, 'metric2.js');
    fs.writeFileSync(
      metric2Path,
      `
module.exports = function(context) {
  return { 'custom.metric2': 99 };
};
    `,
    );

    const testSuite: TestSuite = {
      prompts: [{ raw: 'Test', label: 'test' }],
      providers: [
        {
          id: () => 'test-provider',
          callApi: async () => ({ output: 'test' }),
        },
      ],
      tests: [{ assert: [{ type: 'contains', value: 'test' }] }],
      derivedMetrics: [
        { name: 'metric1', value: `file://${metric1Path}`, phase: 'post' },
        { name: 'metric2', value: `file://${metric2Path}`, phase: 'post' },
      ],
    };

    const evalRecord = new Eval({}, { persisted: false });
    const result = await evaluate(testSuite, evalRecord, { showProgressBar: false });

    const promptMetrics = result.prompts[0].metrics?.namedScores;
    expect(promptMetrics?.['custom.metric1']).toBe(42);
    expect(promptMetrics?.['custom.metric2']).toBe(99);
  });

  it('should handle post-processing metric errors gracefully', async () => {
    // Create a metric function that throws an error
    const metricPath = path.join(tempDir, 'errorMetric.js');
    fs.writeFileSync(
      metricPath,
      `
module.exports = function(context) {
  throw new Error('Test error');
};
    `,
    );

    const testSuite: TestSuite = {
      prompts: [{ raw: 'Test', label: 'test' }],
      providers: [
        {
          id: () => 'test-provider',
          callApi: async () => ({ output: 'test' }),
        },
      ],
      tests: [{ assert: [{ type: 'contains', value: 'test' }] }],
      derivedMetrics: [{ name: 'error_metric', value: `file://${metricPath}`, phase: 'post' }],
    };

    const evalRecord = new Eval({}, { persisted: false });

    // Should not throw - errors should be caught and logged
    await expect(
      evaluate(testSuite, evalRecord, { showProgressBar: false }),
    ).resolves.toBeDefined();
  });

  it('should run runtime metrics during evaluation and post metrics after', async () => {
    // Create a runtime metric (normal derived metric)
    const testSuite: TestSuite = {
      prompts: [{ raw: 'Test', label: 'test' }],
      providers: [
        {
          id: () => 'test-provider',
          callApi: async () => ({ output: 'test' }),
        },
      ],
      tests: [
        { assert: [{ type: 'is-json' }] },
        { assert: [{ type: 'is-json' }] },
      ],
      derivedMetrics: [
        // Runtime metric (calculated per-result during eval)
        {
          name: 'runtime_metric',
          value: 'namedScores["is-json"] || 0',
          phase: 'runtime' as const, // Explicitly set phase
        },
        // Post metric (calculated after all results)
        {
          name: 'post_metric',
          value: 'file://./src/metrics/repeatStats.js',
          phase: 'post' as const,
        },
      ],
    };

    const evalRecord = new Eval({}, { persisted: false });
    const result = await evaluate(testSuite, evalRecord, {
      repeat: 2,
      showProgressBar: false,
    });

    const promptMetrics = result.prompts[0].metrics?.namedScores;
    // Runtime metric should exist (evaluated during test runs)
    expect(promptMetrics?.['runtime_metric']).toBeDefined();
    // Post metric should exist (evaluated after all results collected)
    expect(promptMetrics?.['repeat.pass_n']).toBeDefined();
  });
});
