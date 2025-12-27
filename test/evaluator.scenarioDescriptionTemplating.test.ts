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

  describe('filterPattern option', () => {
    it('should filter scenario tests by templated description pattern', async () => {
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
                description: 'Translation to {{ language }}',
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
        filterPattern: 'Spanish',
      });

      // Only Spanish test should run
      const summary = await results.toEvaluateSummary();
      expect(summary.results).toHaveLength(1);
      expect(summary.results[0]?.testCase?.vars?.language).toBe('Spanish');
      expect(summary.results[0]?.testCase?.description).toBe('Translation to Spanish');
    });

    it('should filter multiple scenario tests by pattern', async () => {
      const testSuite: TestSuite = {
        prompts: [toPrompt('Test prompt')],
        providers: [mockApiProvider],
        scenarios: [
          {
            config: [
              { vars: { language: 'Spanish' } },
              { vars: { language: 'French' } },
              { vars: { language: 'German' } },
            ],
            tests: [
              {
                description: 'Test {{ language }} translation',
                vars: { input: 'Hello' },
              },
              {
                description: 'Verify {{ language }} output',
                vars: { input: 'World' },
              },
            ],
          },
        ],
      };

      const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
      const results = await evaluate(testSuite, evalRecord, {
        showProgressBar: false,
        filterPattern: 'French',
      });

      // Only French tests should run (2 tests x 1 matching config = 2 results)
      const summary = await results.toEvaluateSummary();
      expect(summary.results).toHaveLength(2);
      expect(summary.results.every((r) => r.testCase?.vars?.language === 'French')).toBe(true);
    });

    it('should return no results when pattern matches nothing', async () => {
      const testSuite: TestSuite = {
        prompts: [toPrompt('Test prompt')],
        providers: [mockApiProvider],
        scenarios: [
          {
            config: [{ vars: { language: 'Spanish' } }],
            tests: [
              {
                description: 'Test {{ language }}',
                vars: { input: 'Hello' },
              },
            ],
          },
        ],
      };

      const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
      const results = await evaluate(testSuite, evalRecord, {
        showProgressBar: false,
        filterPattern: 'Japanese',
      });

      const summary = await results.toEvaluateSummary();
      expect(summary.results).toHaveLength(0);
    });

    it('should filter non-scenario tests by pattern', async () => {
      const testSuite: TestSuite = {
        prompts: [toPrompt('Test prompt')],
        providers: [mockApiProvider],
        tests: [
          { description: 'Test Spanish translation', vars: { input: 'hola' } },
          { description: 'Test French translation', vars: { input: 'bonjour' } },
          { description: 'Test German translation', vars: { input: 'hallo' } },
        ],
      };

      const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
      const results = await evaluate(testSuite, evalRecord, {
        showProgressBar: false,
        filterPattern: 'Spanish',
      });

      const summary = await results.toEvaluateSummary();
      expect(summary.results).toHaveLength(1);
      expect(summary.results[0]?.testCase?.description).toBe('Test Spanish translation');
    });

    it('should support regex patterns', async () => {
      const testSuite: TestSuite = {
        prompts: [toPrompt('Test prompt')],
        providers: [mockApiProvider],
        scenarios: [
          {
            config: [
              { vars: { language: 'Spanish' } },
              { vars: { language: 'French' } },
              { vars: { language: 'German' } },
            ],
            tests: [
              {
                description: 'Test {{ language }}',
                vars: { input: 'Hello' },
              },
            ],
          },
        ],
      };

      const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
      const results = await evaluate(testSuite, evalRecord, {
        showProgressBar: false,
        filterPattern: 'Spanish|German',
      });

      const summary = await results.toEvaluateSummary();
      expect(summary.results).toHaveLength(2);
      const languages = summary.results.map((r) => r.testCase?.vars?.language);
      expect(languages).toContain('Spanish');
      expect(languages).toContain('German');
      expect(languages).not.toContain('French');
    });
  });
});
