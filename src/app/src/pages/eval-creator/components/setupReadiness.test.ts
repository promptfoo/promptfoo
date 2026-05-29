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

    it('checks variables only for prompts allowed by the test and selected providers', () => {
      const readiness = getSetupReadiness({
        providers: [{ id: 'openai:gpt-4.1', prompts: ['Topic prompt'] }],
        prompts: [
          { raw: 'Write about {{topic}}', label: 'Topic prompt' },
          { raw: 'Reveal {{secret}}', label: 'Other prompt' },
        ],
        tests: [{ prompts: ['Topic prompt'], vars: { topic: 'reliability' } }],
      });

      expect(readiness.isReadyToRun).toBe(true);
      expect(readiness.requiredVariables).toEqual(['topic', 'secret']);
      expect(readiness.testCasesMissingVariables).toEqual([]);
    });

    it('checks variables only for prompts allowed by default test prompt filters', () => {
      const readiness = getSetupReadiness({
        providers: ['openai:gpt-4.1'],
        prompts: [
          { raw: 'Write about {{topic}}', label: 'Topic prompt' },
          { raw: 'Reveal {{secret}}', label: 'Secret prompt' },
        ],
        defaultTest: { prompts: ['Topic prompt'] },
        tests: [{ vars: { topic: 'reliability' } }],
      });

      expect(readiness.isReadyToRun).toBe(true);
      expect(readiness.requiredVariables).toEqual(['topic', 'secret']);
      expect(readiness.testCasesMissingVariables).toEqual([]);
    });

    it('uses top-level vars for property paths in prompt templates', () => {
      const readiness = getSetupReadiness({
        providers: ['openai:gpt-4.1'],
        prompts: ['Write for {{ user.name }}'],
        tests: [{ vars: { user: { name: 'Ada' } } }],
      });

      expect(readiness.isReadyToRun).toBe(true);
      expect(readiness.requiredVariables).toEqual(['user']);
      expect(readiness.testCasesMissingVariables).toEqual([]);
    });

    it('does not treat raw prompt text as a prompt reference label', () => {
      const readiness = getSetupReadiness({
        providers: [{ id: 'openai:gpt-4.1', prompts: ['Reveal {{secret}}'] }],
        prompts: [{ raw: 'Reveal {{secret}}' } as any],
        tests: [{}],
      });

      expect(readiness.testCasesMissingVariables).toEqual([]);
    });

    it('treats file-backed vars as externally supplied instead of missing', () => {
      expect(
        getSetupReadiness({
          providers: ['openai:gpt-4.1'],
          prompts: ['Write about {{topic}} for {{audience}}'],
          defaultTest: { vars: 'file://defaults.yaml' } as any,
          tests: [{ vars: { topic: 'reliability' } }],
        }).testCasesMissingVariables,
      ).toEqual([]);

      expect(
        getSetupReadiness({
          providers: ['openai:gpt-4.1'],
          prompts: ['Write about {{topic}}'],
          tests: [{ vars: ['file://case-vars.yaml'] } as any],
        }).testCasesMissingVariables,
      ).toEqual([]);
    });

    it('treats file-backed vars as supplying context assertion prerequisites', () => {
      const readiness = getSetupReadiness({
        providers: ['openai:gpt-4.1'],
        prompts: ['Answer with context'],
        defaultTest: { vars: ['file://defaults.yaml'] } as any,
        tests: [{ assert: [{ type: 'context-faithfulness' }] }],
      });

      expect(readiness.isReadyToRun).toBe(true);
      expect(readiness.testCasesMissingAssertionVariables).toEqual([]);
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

    it('accepts query arrays because runtime variable expansion can scalarize them', () => {
      const readiness = getSetupReadiness({
        providers: ['openai:gpt-4.1'],
        prompts: ['Answer using retrieved material'],
        tests: [
          {
            assert: [{ type: 'context-faithfulness' }],
            vars: { query: ['not a runtime query'], context: ['retrieved passage'] },
          },
        ],
      });

      expect(readiness.isReadyToRun).toBe(true);
      expect(readiness.testCasesMissingAssertionVariables).toEqual([]);
    });

    it('treats a blank context transform as missing context for RAG assertions', () => {
      const readiness = getSetupReadiness({
        providers: ['openai:gpt-4.1'],
        prompts: ['Answer using retrieved material'],
        tests: [
          {
            assert: [{ type: 'context-faithfulness', contextTransform: '   ' }],
            vars: { query: 'What changed?' },
          },
        ],
      });

      expect(readiness.isReadyToRun).toBe(false);
      expect(readiness.testCasesMissingAssertionVariables).toEqual([0]);
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

    it('ignores invalid default assertions when every test disables default assertions', () => {
      const readiness = getSetupReadiness({
        providers: ['openai:gpt-4.1'],
        prompts: ['Write a summary'],
        defaultTest: { assert: [{ type: 'contains-any', value: [] }] },
        tests: [{ options: { disableDefaultAsserts: true } }],
      });

      expect(readiness.isReadyToRun).toBe(true);
      expect(readiness.defaultTestHasInvalidAssertions).toBe(false);
    });

    it('surfaces null YAML assertion entries as invalid instead of throwing', () => {
      const readiness = getSetupReadiness({
        providers: ['openai:gpt-4.1'],
        prompts: ['Write a summary'],
        tests: [{ assert: [null] as any }],
      });

      expect(readiness.isReadyToRun).toBe(false);
      expect(readiness.testCasesWithInvalidAssertions).toEqual([0]);
    });

    it('blocks imported webhook checks without a configured endpoint', () => {
      const baseConfig = {
        providers: ['openai:gpt-4.1'],
        prompts: ['Write a summary'],
      };

      expect(
        getSetupReadiness({
          ...baseConfig,
          tests: [{ assert: [{ type: 'webhook' as const }] }],
        }).isReadyToRun,
      ).toBe(false);
      expect(
        getSetupReadiness({
          ...baseConfig,
          tests: [{ assert: [{ type: 'webhook' as const, value: 'https://example.com/check' }] }],
        }).isReadyToRun,
      ).toBe(true);
    });

    it('rejects text score thresholds outside their supported range', () => {
      const baseConfig = {
        providers: ['openai:gpt-4.1'],
        prompts: ['Write a summary'],
      };

      expect(
        getSetupReadiness({
          ...baseConfig,
          tests: [{ assert: [{ type: 'rouge-n' as const, value: 'answer', threshold: 1.1 }] }],
        }).isReadyToRun,
      ).toBe(false);
      expect(
        getSetupReadiness({
          ...baseConfig,
          tests: [{ assert: [{ type: 'similar' as const, value: 'answer', threshold: 1.1 }] }],
        }).isReadyToRun,
      ).toBe(false);
      expect(
        getSetupReadiness({
          ...baseConfig,
          tests: [{ assert: [{ type: 'bleu' as const, value: 'answer', threshold: 0.6 }] }],
        }).isReadyToRun,
      ).toBe(true);
    });

    it('validates external Pi scorer criteria and passing thresholds', () => {
      const baseConfig = {
        providers: ['openai:gpt-4.1'],
        prompts: ['Write a summary'],
      };

      expect(
        getSetupReadiness({
          ...baseConfig,
          tests: [{ assert: [{ type: 'pi' as const, value: 'Be concise', threshold: -0.1 }] }],
        }).isReadyToRun,
      ).toBe(false);
      expect(
        getSetupReadiness({
          ...baseConfig,
          tests: [{ assert: [{ type: 'pi' as const, value: 'Be concise', threshold: 0.8 }] }],
        }).isReadyToRun,
      ).toBe(true);
    });

    it('rejects normalized RAG metric thresholds outside the score range', () => {
      const baseConfig = {
        providers: ['openai:gpt-4.1'],
        prompts: ['Answer the query'],
      };

      expect(
        getSetupReadiness({
          ...baseConfig,
          tests: [{ assert: [{ type: 'answer-relevance' as const, threshold: 1.1 }] }],
        }).isReadyToRun,
      ).toBe(false);
      expect(
        getSetupReadiness({
          ...baseConfig,
          tests: [{ assert: [{ type: 'answer-relevance' as const, threshold: 0.8 }] }],
        }).isReadyToRun,
      ).toBe(true);
    });

    it('rejects normalized rubric score thresholds outside the score range', () => {
      const baseConfig = {
        providers: ['openai:gpt-4.1'],
        prompts: ['Write a summary'],
      };

      expect(
        getSetupReadiness({
          ...baseConfig,
          tests: [{ assert: [{ type: 'llm-rubric' as const, threshold: 1.1 }] }],
        }).isReadyToRun,
      ).toBe(false);
      expect(
        getSetupReadiness({
          ...baseConfig,
          tests: [{ assert: [{ type: 'g-eval' as const, value: 'Be clear', threshold: 0.8 }] }],
        }).isReadyToRun,
      ).toBe(true);
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

    it('rejects normalized perplexity score thresholds outside their score range', () => {
      const baseConfig = {
        providers: ['openai:gpt-4.1'],
        prompts: ['Write a summary'],
      };

      expect(
        getSetupReadiness({
          ...baseConfig,
          tests: [{ assert: [{ type: 'perplexity-score' as const, threshold: 1.1 }] }],
        }).isReadyToRun,
      ).toBe(false);
      expect(
        getSetupReadiness({
          ...baseConfig,
          tests: [{ assert: [{ type: 'perplexity-score' as const, threshold: 0.5 }] }],
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

    it('blocks unsupported assertion types and malformed trace assertions', () => {
      const baseConfig = {
        providers: ['openai:gpt-4.1'],
        prompts: ['Use tracing'],
      };

      expect(
        getSetupReadiness({
          ...baseConfig,
          tests: [{ assert: [{ type: 'containz' as any, value: 'hello' }] }],
        }).isReadyToRun,
      ).toBe(false);
      expect(
        getSetupReadiness({
          ...baseConfig,
          tests: [{ assert: [{ type: 'trace-span-count' as const, value: { max: 1 } }] }],
        }).isReadyToRun,
      ).toBe(false);
      expect(
        getSetupReadiness({
          ...baseConfig,
          tests: [
            {
              assert: [
                { type: 'trace-span-duration' as const, value: { pattern: 'fetch*', max: 250 } },
              ],
            },
          ],
        }).isReadyToRun,
      ).toBe(true);
    });

    it('validates trajectory goal content and normalized score thresholds', () => {
      const baseConfig = {
        providers: ['openai:gpt-4.1'],
        prompts: ['Complete the task'],
      };

      expect(
        getSetupReadiness({
          ...baseConfig,
          tests: [{ assert: [{ type: 'trajectory:goal-success' as const, threshold: 0.8 }] }],
        }).isReadyToRun,
      ).toBe(false);
      expect(
        getSetupReadiness({
          ...baseConfig,
          tests: [
            {
              assert: [
                { type: 'trajectory:goal-success' as const, value: 'Finish it', threshold: 1.1 },
              ],
            },
          ],
        }).isReadyToRun,
      ).toBe(false);
      expect(
        getSetupReadiness({
          ...baseConfig,
          tests: [
            {
              assert: [
                {
                  type: 'trajectory:goal-success' as const,
                  value: { goal: 'Finish it' },
                  threshold: 0.8,
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

    it('requires multiple outputs for select-best comparisons', () => {
      const singleOutputConfig = {
        providers: ['openai:gpt-4.1'],
        prompts: ['Write a reply'],
        tests: [{ assert: [{ type: 'select-best' as const, value: 'Choose the clearer reply' }] }],
      };

      const readiness = getSetupReadiness(singleOutputConfig);

      expect(readiness.isReadyToRun).toBe(false);
      expect(readiness.issues).toContainEqual({
        id: 'comparisonOutputs',
        message:
          'Choose best output needs at least two outputs per test case. Add another provider or prompt.',
        stepId: 1,
      });
      expect(
        getSetupReadiness({
          ...singleOutputConfig,
          providers: ['openai:gpt-4.1', 'anthropic:messages:claude-sonnet-4'],
        }).isReadyToRun,
      ).toBe(true);
    });

    it('requires multiple outputs after applying a test provider filter', () => {
      const readiness = getSetupReadiness({
        providers: ['openai:gpt-4.1', 'anthropic:messages:claude-sonnet-4'],
        prompts: ['Write a reply'],
        tests: [
          {
            providers: ['openai:gpt-4.1'],
            assert: [{ type: 'select-best', value: 'Choose the clearer reply' }],
          },
        ],
      });

      // Two providers, one prompt → the fix is on the shorter (prompt) axis, step 2.
      expect(readiness.issues).toContainEqual(
        expect.objectContaining({ id: 'comparisonOutputs', stepId: 2 }),
      );
    });

    it('requires multiple outputs after applying default test provider and prompt filters', () => {
      const readiness = getSetupReadiness({
        providers: ['openai:gpt-4.1', 'anthropic:messages:claude-sonnet-4'],
        prompts: [
          { raw: 'Write a concise reply', label: 'Short prompt' },
          { raw: 'Write a detailed reply', label: 'Long prompt' },
        ],
        defaultTest: {
          providers: ['openai:gpt-4.1'],
          prompts: ['Short prompt'],
        },
        tests: [{ assert: [{ type: 'select-best', value: 'Choose the clearer reply' }] }],
      });

      expect(readiness.issues).toContainEqual(expect.objectContaining({ id: 'comparisonOutputs' }));
    });

    it('defers comparison output count checks for file-backed prompts expanded at runtime', () => {
      const readiness = getSetupReadiness({
        providers: ['openai:gpt-4.1'],
        prompts: ['file://prompts.csv'],
        tests: [{ assert: [{ type: 'select-best', value: 'Choose the clearer reply' }] }],
      });

      expect(readiness.issues).not.toContainEqual(
        expect.objectContaining({ id: 'comparisonOutputs' }),
      );
      expect(readiness.isReadyToRun).toBe(true);
    });

    it('defers filtered comparison checks when prompt labels are produced by file loading', () => {
      const readiness = getSetupReadiness({
        providers: ['openai:gpt-4.1'],
        prompts: ['file://prompts.csv'],
        defaultTest: { prompts: ['Expanded CSV Label'] },
        tests: [{ assert: [{ type: 'select-best', value: 'Choose the clearer reply' }] }],
      });

      expect(readiness.issues).not.toContainEqual(
        expect.objectContaining({ id: 'comparisonOutputs' }),
      );
    });

    it('defers comparison checks for modular provider files expanded at runtime', () => {
      const readiness = getSetupReadiness({
        providers: ['file://providers.yaml'],
        prompts: ['Write a reply'],
        defaultTest: { providers: ['Expanded provider label'] },
        tests: [{ assert: [{ type: 'select-best', value: 'Choose the clearer reply' }] }],
      });

      expect(readiness.issues).not.toContainEqual(
        expect.objectContaining({ id: 'comparisonOutputs' }),
      );
    });

    it('warns when a test filters to one static prompt despite an unrelated dynamic prompt', () => {
      const readiness = getSetupReadiness({
        providers: ['openai:gpt-4.1'],
        prompts: [
          { raw: 'Write a reply', label: 'Static prompt' },
          { raw: 'file://other.txt', label: 'Dynamic prompt' },
        ],
        tests: [
          {
            prompts: ['Static prompt'],
            assert: [{ type: 'select-best', value: 'Choose the clearer reply' }],
          },
        ],
      });

      expect(readiness.issues).toContainEqual(expect.objectContaining({ id: 'comparisonOutputs' }));
      expect(readiness.isReadyToRun).toBe(false);
    });

    it('warns when a test filters to one static provider despite an unrelated dynamic provider', () => {
      const readiness = getSetupReadiness({
        providers: ['openai:gpt-4.1', 'file://providers.yaml'],
        prompts: ['Write a reply'],
        tests: [
          {
            providers: ['openai:gpt-4.1'],
            assert: [{ type: 'select-best', value: 'Choose the clearer reply' }],
          },
        ],
      });

      expect(readiness.issues).toContainEqual(expect.objectContaining({ id: 'comparisonOutputs' }));
    });

    it('routes select-best fixes to the axis the user can still grow', () => {
      // One provider, no prompts → the comparisonOutputs fix is in step 2.
      const oneProviderNoPrompts = getSetupReadiness({
        providers: ['openai:gpt-4.1'],
        prompts: [],
        tests: [{ assert: [{ type: 'select-best' as const, value: 'Choose the clearer reply' }] }],
      });
      expect(oneProviderNoPrompts.issues).toContainEqual(
        expect.objectContaining({ id: 'comparisonOutputs', stepId: 2 }),
      );

      // No providers, one prompt → the comparisonOutputs fix is in step 1.
      const noProvidersOnePrompt = getSetupReadiness({
        providers: [],
        prompts: ['Write a reply'],
        tests: [{ assert: [{ type: 'select-best' as const, value: 'Choose the clearer reply' }] }],
      });
      expect(noProvidersOnePrompt.issues).toContainEqual(
        expect.objectContaining({ id: 'comparisonOutputs', stepId: 1 }),
      );
    });

    it('requires scored comparison candidates for max-score assertions', () => {
      const singleOutputConfig = {
        providers: ['openai:gpt-4.1'],
        prompts: ['Write a reply'],
        tests: [
          {
            assert: [{ type: 'contains' as const, value: 'hello' }, { type: 'max-score' as const }],
          },
        ],
      };

      expect(getSetupReadiness(singleOutputConfig).issues).toContainEqual({
        id: 'comparisonOutputs',
        message:
          'Choose highest score needs at least two outputs per test case. Add another provider or prompt.',
        stepId: 1,
      });

      const multipleOutputsConfig = {
        ...singleOutputConfig,
        providers: ['openai:gpt-4.1', 'anthropic:messages:claude-sonnet-4'],
      };
      expect(getSetupReadiness(multipleOutputsConfig).isReadyToRun).toBe(true);

      const missingScoringAssertion = getSetupReadiness({
        ...multipleOutputsConfig,
        tests: [{ assert: [{ type: 'max-score' as const }] }],
      });
      expect(missingScoringAssertion.isReadyToRun).toBe(false);
      expect(missingScoringAssertion.issues).toContainEqual({
        id: 'comparisonScoring',
        message: 'Choose highest score needs at least one other assertion to score each output.',
        stepId: 3,
      });
    });

    it('detects comparison assertions nested inside an assert-set', () => {
      const readiness = getSetupReadiness({
        providers: ['openai:gpt-4.1'],
        prompts: ['Write a reply'],
        tests: [
          {
            assert: [
              {
                type: 'assert-set',
                assert: [{ type: 'select-best', value: 'Choose the clearer reply' }],
              },
            ],
          },
        ],
      });

      expect(readiness.issues).toContainEqual(expect.objectContaining({ id: 'comparisonOutputs' }));
    });

    it('does not count an assert-set wrapping only comparison assertions as a scoring assertion', () => {
      const readiness = getSetupReadiness({
        providers: ['openai:gpt-4.1', 'anthropic:messages:claude-sonnet-4'],
        prompts: ['Write a reply'],
        tests: [
          {
            assert: [
              { type: 'max-score' },
              {
                type: 'assert-set',
                assert: [{ type: 'select-best', value: 'Choose the clearer reply' }],
              },
            ],
          },
        ],
      });

      expect(readiness.issues).toContainEqual(expect.objectContaining({ id: 'comparisonScoring' }));
    });

    it('validates default max-score assertions for external and string-array tests', () => {
      const externalTests = getSetupReadiness({
        providers: ['openai:gpt-4.1', 'anthropic:messages:claude-sonnet-4'],
        prompts: ['Write a reply'],
        defaultTest: { assert: [{ type: 'max-score' }] },
        tests: 'file://tests.csv',
      });
      expect(externalTests.issues).toContainEqual({
        id: 'comparisonScoring',
        message: 'Choose highest score needs at least one other assertion to score each output.',
        stepId: 3,
      });

      const stringArrayTests = getSetupReadiness({
        providers: ['openai:gpt-4.1'],
        prompts: ['Write a reply'],
        defaultTest: { assert: [{ type: 'select-best', value: 'Choose the clearer reply' }] },
        tests: ['file://tests.csv'] as any,
      });
      expect(stringArrayTests.issues).toContainEqual(
        expect.objectContaining({ id: 'comparisonOutputs' }),
      );
    });

    it('accepts blank moderation categories and runtime array form', () => {
      const baseConfig = {
        providers: ['openai:gpt-4.1'],
        prompts: ['Write a reply'],
      };

      expect(
        getSetupReadiness({
          ...baseConfig,
          tests: [{ assert: [{ type: 'moderation', value: '' }] }],
        }).isReadyToRun,
      ).toBe(true);
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

    it('multiplies providers, prompts, and test cases for the base request count', () => {
      const readiness = getSetupReadiness({
        providers: ['openai:gpt-4.1', 'anthropic:messages:claude-sonnet-4'],
        prompts: ['Write a reply', 'Write a summary'],
        tests: [{ vars: {} }, { vars: {} }, { vars: {} }],
      });

      expect(readiness.plannedBaseRequestCount).toBe(12);
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

    it('recognizes filtered, dotted, and conditional Nunjucks variables', () => {
      expect(
        extractVariablesFromPrompts([
          '{{ topic | lower }} {{ user.name }}',
          '{% if not audience %}Tailor the response{% endif %}',
        ]),
      ).toEqual(['topic', 'user', 'audience']);
    });

    it('does not treat the runtime env global as a required test variable', () => {
      expect(extractVariablesFromPrompts(['Use {{ env.OPENAI_API_KEY }} for {{ topic }}'])).toEqual(
        ['topic'],
      );
    });

    it('handles Nunjucks whitespace-control markers', () => {
      expect(extractVariablesFromPrompts(['{{- topic -}}'])).toEqual(['topic']);
      expect(
        extractVariablesFromPrompts([
          '{%- for item in items -%}{{- item -}}{%- endfor -%}Afterward: {{ item }}',
        ]),
      ).toEqual(['items', 'item']);
    });

    it('extracts from large unbalanced loop templates without catastrophic backtracking', () => {
      const pathological = '{% for x in y %}'.repeat(2000);
      const start = performance.now();
      const variables = extractVariablesFromPrompts([pathological]);
      expect(performance.now() - start).toBeLessThan(1000);
      expect(variables).toEqual(['y']);
    });

    it('does not treat loop locals as required vars inside loops only', () => {
      expect(
        extractVariablesFromPrompts([
          '{% for item in items %}{{ item }}{% endfor %}Afterward: {{ item }}',
          '{% for key, value in entries %}{{ key }}={{ value }}{% endfor %}',
        ]),
      ).toEqual(['items', 'item', 'entries']);
    });
  });
});
