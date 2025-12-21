import { randomUUID } from 'crypto';

import { beforeAll, describe, expect, it } from 'vitest';
import { evaluate } from '../src/evaluator';
import { runDbMigrations } from '../src/migrate';
import Eval from '../src/models/eval';

import type { ApiProvider, Prompt, TestSuite } from '../src/types';

const mockApiProvider: ApiProvider = {
  id: () => 'echo',
  callApi: async () => ({
    output: 'test output',
  }),
};

function toPrompt(text: string): Prompt {
  return { raw: text, label: text };
}

describe('Scenario description templating', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  it('should template test descriptions with scenario config vars', async () => {
    const testSuite: TestSuite = {
      prompts: [toPrompt('Translate "{{input}}" to {{language}}')],
      providers: [mockApiProvider],
      scenarios: [
        {
          config: [
            {
              vars: {
                language: 'Spanish',
              },
            },
            {
              vars: {
                language: 'French',
              },
            },
          ],
          tests: [
            {
              description: 'Translated Hello World from {{ language }}',
              vars: {
                input: 'Hello world',
              },
            },
          ],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    const results = await evaluate(testSuite, evalRecord, {
      showProgressBar: false,
    });

    // Check that test descriptions were templated correctly
    const summary = await results.toEvaluateSummary();
    expect(summary.results).toHaveLength(2);

    const spanishTest = summary.results.find((r) => r.testCase?.vars?.language === 'Spanish');
    expect(spanishTest?.testCase?.description).toBe('Translated Hello World from Spanish');

    const frenchTest = summary.results.find((r) => r.testCase?.vars?.language === 'French');
    expect(frenchTest?.testCase?.description).toBe('Translated Hello World from French');
  });

  it('should handle test descriptions without template variables', async () => {
    const testSuite: TestSuite = {
      prompts: [toPrompt('Test prompt')],
      providers: [mockApiProvider],
      scenarios: [
        {
          config: [
            {
              vars: {
                language: 'Spanish',
              },
            },
          ],
          tests: [
            {
              description: 'Static description',
              vars: {
                input: 'Hello',
              },
            },
          ],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    const results = await evaluate(testSuite, evalRecord, {
      showProgressBar: false,
    });

    const summary = await results.toEvaluateSummary();
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0]?.testCase?.description).toBe('Static description');
  });

  it('should handle tests without descriptions', async () => {
    const testSuite: TestSuite = {
      prompts: [toPrompt('Test prompt')],
      providers: [mockApiProvider],
      scenarios: [
        {
          config: [
            {
              vars: {
                language: 'Spanish',
              },
            },
          ],
          tests: [
            {
              vars: {
                input: 'Hello',
              },
            },
          ],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    const results = await evaluate(testSuite, evalRecord, {
      showProgressBar: false,
    });

    const summary = await results.toEvaluateSummary();
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0]?.testCase?.description).toBeUndefined();
  });

  it('should handle complex nunjucks templates in descriptions', async () => {
    const testSuite: TestSuite = {
      prompts: [toPrompt('Test prompt')],
      providers: [mockApiProvider],
      scenarios: [
        {
          config: [
            {
              vars: {
                language: 'Spanish',
                code: 'es',
              },
            },
          ],
          tests: [
            {
              description: 'Testing {{ language }} ({{ code }})',
              vars: {
                input: 'Hello',
              },
            },
          ],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    const results = await evaluate(testSuite, evalRecord, {
      showProgressBar: false,
    });

    const summary = await results.toEvaluateSummary();
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0]?.testCase?.description).toBe('Testing Spanish (es)');
  });

  it('should merge vars from defaultTest, scenario config, and test', async () => {
    const testSuite: TestSuite = {
      prompts: [toPrompt('Test prompt')],
      providers: [mockApiProvider],
      defaultTest: {
        vars: {
          globalVar: 'global',
        },
      },
      scenarios: [
        {
          config: [
            {
              vars: {
                scenarioVar: 'scenario',
              },
            },
          ],
          tests: [
            {
              description: 'Test with {{ globalVar }}, {{ scenarioVar }}, and {{ testVar }}',
              vars: {
                testVar: 'test',
              },
            },
          ],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    const results = await evaluate(testSuite, evalRecord, {
      showProgressBar: false,
    });

    const summary = await results.toEvaluateSummary();
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0]?.testCase?.description).toBe('Test with global, scenario, and test');
  });
});
