import { describe, expect, it } from 'vitest';
import {
  countTests,
  extractVariablesFromPrompts,
  getSetupReadiness,
  normalizePrompts,
  normalizePromptsForJob,
  normalizeProviders,
} from './setupReadiness';

describe('setupReadiness', () => {
  describe('normalizeProviders', () => {
    it('normalizes shorthand providers and ignores blank values', () => {
      expect(normalizeProviders(['openai:gpt-4.1', ''])).toEqual([{ id: 'openai:gpt-4.1' }]);
    });

    it('preserves provider option objects that include extra config keys', () => {
      const provider = {
        id: 'openai:gpt-4.1',
        label: 'GPT-4.1',
        config: { temperature: 0 },
        customHeader: 'x-trace-id',
      };

      expect(
        normalizeProviders([provider] as unknown as Parameters<typeof normalizeProviders>[0]),
      ).toEqual([provider]);
    });

    it('does not fabricate providers from provider option objects without ids', () => {
      expect(
        normalizeProviders([
          {
            label: 'Missing id',
            config: { temperature: 0 },
            customHeader: 'x-trace-id',
          },
        ] as unknown as Parameters<typeof normalizeProviders>[0]),
      ).toEqual([]);
    });

    it('normalizes provider maps and skips malformed entries', () => {
      expect(
        normalizeProviders([
          {
            'openai:gpt-4.1': { config: { temperature: 0 } },
            broken: 'not provider options',
          },
        ] as unknown as Parameters<typeof normalizeProviders>[0]),
      ).toEqual([{ id: 'openai:gpt-4.1', config: { temperature: 0 } }]);
    });

    it('normalizes provider maps whose ids overlap provider option keys', () => {
      expect(
        normalizeProviders([
          {
            label: { id: 'openai:gpt-4.1', config: { temperature: 0 } },
          },
        ] as unknown as Parameters<typeof normalizeProviders>[0]),
      ).toEqual([{ id: 'openai:gpt-4.1', config: { temperature: 0 } }]);
    });
  });

  describe('normalizePrompts', () => {
    it('normalizes scalar, inline, raw, and legacy map prompts', () => {
      expect(normalizePrompts('file://prompt.txt')).toEqual(['file://prompt.txt']);
      expect(
        normalizePrompts([
          'inline prompt',
          { raw: 'raw prompt', label: 'Raw prompt' },
          { id: 'x' },
        ]),
      ).toEqual(['inline prompt', 'raw prompt', 'x']);
      expect(normalizePrompts({ 'Write about {{topic}}': 'Prompt label' })).toEqual([
        'Write about {{topic}}',
      ]);
    });

    it('filters blank prompt values', () => {
      expect(normalizePrompts('   ')).toEqual([]);
      expect(normalizePrompts(['', { raw: '   ', label: 'Blank prompt' }])).toEqual([]);
      expect(normalizePrompts([{ raw: '   ', id: 'file://prompt.txt' }])).toEqual([
        'file://prompt.txt',
      ]);
      expect(normalizePrompts(undefined)).toEqual([]);
    });
  });

  describe('normalizePromptsForJob', () => {
    it('serializes scalar and legacy map prompts for eval job submission', () => {
      expect(normalizePromptsForJob('file://prompt.txt')).toEqual(['file://prompt.txt']);
      expect(normalizePromptsForJob({ 'file://prompt.txt': 'Prompt label' })).toEqual([
        { raw: 'file://prompt.txt', label: 'Prompt label' },
      ]);
    });

    it('preserves arrays and filters malformed legacy map entries', () => {
      const promptArray = ['inline prompt', { raw: 'raw prompt', label: 'Raw prompt' }];

      expect(normalizePromptsForJob(promptArray)).toEqual(promptArray);
      expect(
        normalizePromptsForJob({
          'file://prompt.txt': 'Prompt label',
          '': 'Missing raw',
          'file://blank.txt': '   ',
        }),
      ).toEqual([{ raw: 'file://prompt.txt', label: 'Prompt label' }]);
      expect(normalizePromptsForJob(undefined)).toEqual([]);
    });
  });

  describe('countTests', () => {
    it('counts inline, scalar, and generated test configs', () => {
      expect(countTests([{ vars: { topic: 'cats' } }, { vars: { topic: 'dogs' } }])).toBe(2);
      expect(countTests('file://tests.csv')).toBe(1);
      expect(countTests({ path: 'file://generate-tests.js' })).toBe(1);
    });

    it('ignores blank or missing test configs', () => {
      expect(countTests('   ')).toBe(0);
      expect(countTests(undefined)).toBe(0);
    });
  });

  describe('getSetupReadiness', () => {
    it('blocks running when an inline test case omits a prompt variable', () => {
      const readiness = getSetupReadiness({
        providers: ['openai:gpt-4.1'],
        prompts: ['Write about {{topic}} for {{audience}}'],
        tests: [{ vars: { topic: 'ocean life' } }],
      });

      expect(readiness.isReadyToRun).toBe(false);
      expect(readiness.requiredVariables).toEqual(['topic', 'audience']);
      expect(readiness.testCasesMissingVariables).toEqual([0]);
      expect(readiness.issues).toContainEqual({
        id: 'variables',
        message: 'Test case 1 is missing values required by your prompts.',
        stepId: 3,
      });
    });

    it('uses default test variables when reviewing inline test cases', () => {
      const readiness = getSetupReadiness({
        providers: ['openai:gpt-4.1'],
        prompts: ['Write about {{topic}} for {{audience}}'],
        defaultTest: { vars: { audience: 'engineering leaders' } },
        tests: [{ vars: { topic: 'reliability' } }],
      });

      expect(readiness.isReadyToRun).toBe(true);
      expect(readiness.testCasesMissingVariables).toEqual([]);
      expect(readiness.testCasesMissingAssertionVariables).toEqual([]);
      expect(readiness.testCasesWithInvalidAssertions).toEqual([]);
      expect(readiness.defaultTestHasInvalidAssertions).toBe(false);
      expect(readiness.plannedBaseRequestCount).toBe(1);
    });

    it('blocks context assertions until required query and context values are supplied', () => {
      const readiness = getSetupReadiness({
        providers: ['openai:gpt-4.1'],
        prompts: ['Answer using the supplied material'],
        tests: [{ assert: [{ type: 'context-faithfulness' }], vars: {} }],
      });

      expect(readiness.isReadyToRun).toBe(false);
      expect(readiness.testCasesMissingAssertionVariables).toEqual([0]);
      expect(readiness.issues).toContainEqual({
        id: 'assertionVariables',
        message: 'Test case 1 is missing query and context values required by context assertions.',
        stepId: 3,
      });
    });

    it('accepts context assertions with default query values and a context transform', () => {
      const readiness = getSetupReadiness({
        providers: ['openai:gpt-4.1'],
        prompts: ['Answer using retrieved material'],
        defaultTest: { vars: { query: 'What changed?' } },
        tests: [{ assert: [{ type: 'context-relevance', contextTransform: 'output' }] }],
      });

      expect(readiness.isReadyToRun).toBe(true);
      expect(readiness.testCasesMissingAssertionVariables).toEqual([]);
    });

    it('blocks imported inline tests with incomplete assertion values', () => {
      const readiness = getSetupReadiness({
        providers: ['openai:gpt-4.1'],
        prompts: ['Write a summary'],
        tests: [
          { assert: [{ type: 'equals', value: '' }] },
          { assert: [{ type: 'contains', value: '' }] },
        ],
      });

      expect(readiness.isReadyToRun).toBe(false);
      expect(readiness.testCasesWithInvalidAssertions).toEqual([1]);
      expect(readiness.issues).toContainEqual({
        id: 'assertions',
        message: 'Add required assertion values in test case 2.',
        stepId: 3,
      });
    });

    it('blocks an incomplete assertion inherited from the default test', () => {
      const readiness = getSetupReadiness({
        providers: ['openai:gpt-4.1'],
        prompts: ['Write a summary'],
        defaultTest: { assert: [{ type: 'contains-any', value: [] }] },
        tests: [{}],
      });

      expect(readiness.isReadyToRun).toBe(false);
      expect(readiness.defaultTestHasInvalidAssertions).toBe(true);
      expect(readiness.issues).toContainEqual({
        id: 'assertions',
        message: 'Add required assertion values in your default test in YAML.',
        stepId: 3,
      });
    });

    it('requires the threshold property used by runtime cost checks', () => {
      const readiness = getSetupReadiness({
        providers: ['openai:gpt-4.1'],
        prompts: ['Write a summary'],
        tests: [{ assert: [{ type: 'cost', value: 0.01 }] }],
      });

      expect(readiness.isReadyToRun).toBe(false);
      expect(readiness.testCasesWithInvalidAssertions).toEqual([0]);
      expect(
        getSetupReadiness({
          providers: ['openai:gpt-4.1'],
          prompts: ['Write a summary'],
          tests: [{ assert: [{ type: 'cost', threshold: 0.01 }] }],
        }).isReadyToRun,
      ).toBe(true);
    });

    it('allows authored LLM rubric assertions that use runtime rubric defaults', () => {
      const readiness = getSetupReadiness({
        providers: ['openai:gpt-4.1'],
        prompts: ['Write a summary'],
        tests: [{ assert: [{ type: 'llm-rubric' }] }],
      });

      expect(readiness.isReadyToRun).toBe(true);
      expect(readiness.testCasesWithInvalidAssertions).toEqual([]);
    });

    it('blocks authored model-graded assertions that require expected text', () => {
      const readiness = getSetupReadiness({
        providers: ['openai:gpt-4.1'],
        prompts: ['Write a summary'],
        tests: [{ assert: [{ type: 'factuality' }] }],
      });

      expect(readiness.isReadyToRun).toBe(false);
      expect(readiness.testCasesWithInvalidAssertions).toEqual([0]);
    });

    it('accepts a non-empty authored G-Eval criteria list', () => {
      const readiness = getSetupReadiness({
        providers: ['openai:gpt-4.1'],
        prompts: ['Write a summary'],
        tests: [{ assert: [{ type: 'g-eval', value: ['Be concise', 'Be accurate'] }] }],
      });

      expect(readiness.isReadyToRun).toBe(true);
      expect(readiness.testCasesWithInvalidAssertions).toEqual([]);
    });

    it('blocks malformed structured trajectory assertions and accepts JSON-shaped values', () => {
      const baseConfig = {
        providers: ['openai:gpt-4.1'],
        prompts: ['Use a search tool'],
      };

      expect(
        getSetupReadiness({
          ...baseConfig,
          tests: [{ assert: [{ type: 'trajectory:tool-args-match', value: 'search' }] }],
        }).isReadyToRun,
      ).toBe(false);
      expect(
        getSetupReadiness({
          ...baseConfig,
          tests: [
            {
              assert: [
                {
                  type: 'trajectory:tool-args-match',
                  value: { name: 'search', args: { query: 'release notes' } },
                },
              ],
            },
          ],
        }).isReadyToRun,
      ).toBe(true);
    });

    it('accepts blank SQL validation settings but rejects non-object settings', () => {
      const baseConfig = {
        providers: ['openai:gpt-4.1'],
        prompts: ['Write SQL'],
      };

      expect(
        getSetupReadiness({
          ...baseConfig,
          tests: [{ assert: [{ type: 'is-sql' }] }],
        }).isReadyToRun,
      ).toBe(true);
      expect(
        getSetupReadiness({
          ...baseConfig,
          tests: [{ assert: [{ type: 'is-sql', value: 'PostgreSQL' }] }],
        }).isReadyToRun,
      ).toBe(false);
    });

    it('requires a valid exact or bounded word count before running', () => {
      const baseConfig = {
        providers: ['openai:gpt-4.1'],
        prompts: ['Write a concise reply'],
      };

      expect(
        getSetupReadiness({
          ...baseConfig,
          tests: [{ assert: [{ type: 'word-count' }] }],
        }).isReadyToRun,
      ).toBe(false);
      expect(
        getSetupReadiness({
          ...baseConfig,
          tests: [{ assert: [{ type: 'word-count', value: { max: 120 } }] }],
        }).isReadyToRun,
      ).toBe(true);
      expect(
        getSetupReadiness({
          ...baseConfig,
          tests: [{ assert: [{ type: 'word-count', value: { min: 20, max: 10 } }] }],
        }).isReadyToRun,
      ).toBe(false);
    });

    it('rejects authored moderation categories unless they use runtime array form', () => {
      const baseConfig = {
        providers: ['openai:gpt-4.1'],
        prompts: ['Write a reply'],
      };

      expect(
        getSetupReadiness({
          ...baseConfig,
          tests: [{ assert: [{ type: 'moderation', value: 'hate' }] }],
        }).isReadyToRun,
      ).toBe(false);
      expect(
        getSetupReadiness({
          ...baseConfig,
          tests: [{ assert: [{ type: 'moderation', value: ['hate'] }] }],
        }).isReadyToRun,
      ).toBe(true);
    });

    it('does not claim an exact base request count for external test files', () => {
      const readiness = getSetupReadiness({
        providers: ['openai:gpt-4.1'],
        prompts: ['Write a summary'],
        tests: 'file://tests.csv',
      });

      expect(readiness.isReadyToRun).toBe(true);
      expect(readiness.plannedBaseRequestCount).toBeUndefined();
    });
  });

  describe('extractVariablesFromPrompts', () => {
    it('deduplicates valid template variables across prompts', () => {
      expect(
        extractVariablesFromPrompts([
          'Hello {{ name }}',
          '{{name}} from {{location}}',
          '{{ no spaces }}',
        ]),
      ).toEqual(['name', 'location']);
    });
  });
});
