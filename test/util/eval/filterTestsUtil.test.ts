import { beforeEach, describe, expect, it, vi } from 'vitest';
import Eval from '../../../src/models/eval';
import { ResultFailureReason } from '../../../src/types/index';
import {
  filterTestsByResults,
  topLevelResultMatchContext,
} from '../../../src/util/eval/filterTestsUtil';
import * as util from '../../../src/util/index';

import type { EvaluateResult, Prompt, ProviderResponse, TestSuite } from '../../../src/types/index';

vi.mock('../../../src/models/eval', () => ({
  default: {
    findById: vi.fn(),
  },
}));

vi.mock('../../../src/util', async () => ({
  ...(await vi.importActual('../../../src/util')),
  readOutput: vi.fn(),

  resultIsForTestCase: vi.fn().mockImplementation(function (result, test) {
    return result.testCase === test;
  }),
}));

const createMockTokenUsage = () => ({
  total: 0,
  prompt: 0,
  completion: 0,
  cached: 0,
  numRequests: 0,
  completionDetails: {
    reasoning: 0,
    acceptedPrediction: 0,
    rejectedPrediction: 0,
  },
  assertions: {
    total: 0,
    prompt: 0,
    completion: 0,
    cached: 0,
  },
});

const createFailedStats = () => ({
  successes: 0,
  failures: 1,
  errors: 0,
  tokenUsage: createMockTokenUsage(),
});

describe('filterTestsUtil', () => {
  describe('filterTestsByResults', () => {
    const mockTestSuite: TestSuite = {
      prompts: [],
      providers: [],
      tests: [
        { vars: { var1: 'test1' }, assert: [] },
        { vars: { var1: 'test2' }, assert: [] },
        { vars: { var1: 'test3' }, assert: [] },
      ],
    };

    const mockPrompt: Prompt = {
      raw: 'test prompt',
      display: 'test prompt',
      label: 'Test Prompt',
    };

    const mockResponse: ProviderResponse = {
      output: 'response',
      tokenUsage: { total: 0, prompt: 0, completion: 0 },
    };

    const mockResults: EvaluateResult[] = [
      {
        vars: { var1: 'test1' },
        success: true,
        provider: { id: 'test-provider', label: 'Test Provider' },
        prompt: mockPrompt,
        response: mockResponse,
        promptIdx: 0,
        testIdx: 0,
        testCase: mockTestSuite.tests![0],
        promptId: 'test-prompt',
        latencyMs: 0,
        failureReason: ResultFailureReason.NONE,
        score: 1,
        namedScores: {},
      },
      {
        vars: { var1: 'test2' },
        success: false,
        failureReason: ResultFailureReason.ASSERT,
        provider: { id: 'test-provider', label: 'Test Provider' },
        prompt: mockPrompt,
        response: mockResponse,
        promptIdx: 0,
        testIdx: 1,
        testCase: mockTestSuite.tests![1],
        promptId: 'test-prompt',
        latencyMs: 0,
        score: 0,
        namedScores: {},
      },
      {
        vars: { var1: 'test3' },
        success: false,
        failureReason: ResultFailureReason.ERROR,
        provider: { id: 'test-provider', label: 'Test Provider' },
        prompt: mockPrompt,
        response: mockResponse,
        promptIdx: 0,
        testIdx: 2,
        testCase: mockTestSuite.tests![2],
        promptId: 'test-prompt',
        latencyMs: 0,
        score: 0,
        namedScores: {},
      },
    ];

    const mockTokenUsage = createMockTokenUsage();

    beforeEach(() => {
      vi.resetAllMocks();
      vi.mocked(util.resultIsForTestCase).mockImplementation(function (result, test) {
        return result.testCase === test;
      });
    });

    it('should return empty array if testSuite has no tests', async () => {
      const result = await filterTestsByResults(
        { prompts: [], providers: [] },
        'path.json',
        () => true,
      );
      expect(result).toEqual([]);
    });

    describe('with file path', () => {
      beforeEach(() => {
        vi.mocked(util.readOutput).mockResolvedValue({
          evalId: null,
          results: {
            version: 2,
            timestamp: new Date().toISOString(),
            results: mockResults,
            table: { head: { prompts: [], vars: [] }, body: [] },
            stats: {
              successes: 0,
              failures: 0,
              errors: 0,
              tokenUsage: mockTokenUsage,
            },
          },
          config: {},
          shareableUrl: null,
        });
      });

      it('should filter tests based on success', async () => {
        const result = await filterTestsByResults(
          mockTestSuite,
          'results.json',
          (result) => result.success,
        );
        expect(result).toHaveLength(1);
        expect(result[0]?.vars?.var1).toBe('test1');
      });

      it('should filter tests based on failure reason', async () => {
        const result = await filterTestsByResults(
          mockTestSuite,
          'results.json',
          (result) => result.failureReason === ResultFailureReason.ERROR,
        );
        expect(result).toHaveLength(1);
        expect(result[0]?.vars?.var1).toBe('test3');
      });

      it('passes complete file config provenance through the shared results cache', async () => {
        const output = {
          evalId: null,
          results: {
            version: 3 as const,
            timestamp: new Date().toISOString(),
            results: mockResults,
            table: { head: { prompts: [], vars: [] }, body: [] },
            stats: { successes: 0, failures: 2, errors: 0, tokenUsage: mockTokenUsage },
          },
          config: { prompts: [], providers: [], tests: [] },
          shareableUrl: null,
        };
        vi.mocked(util.readOutput).mockResolvedValue(output as any);
        const includesResult = vi.fn(
          (_result: EvaluateResult, source?: { hasScenarios?: boolean }) =>
            source?.hasScenarios !== false,
        );
        const resultLoadCache = new Map();
        const context = { includesResult, matchesTest: () => false, resultLoadCache };

        const selected = await Promise.all([
          filterTestsByResults(mockTestSuite, 'complete.json', () => true, undefined, context),
          filterTestsByResults(mockTestSuite, 'complete.json', () => true, undefined, context),
        ]);

        expect(selected).toEqual([[], []]);
        expect(util.readOutput).toHaveBeenCalledTimes(1);
        expect(includesResult).toHaveBeenCalledWith(mockResults[0], { hasScenarios: false });
      });

      it('keeps old partial file config provenance unknown', async () => {
        const includesResult = vi.fn(() => false);
        await filterTestsByResults(mockTestSuite, 'results.json', () => true, undefined, {
          includesResult,
          matchesTest: () => false,
        });
        expect(includesResult).toHaveBeenCalledWith(mockResults[0], {});
      });

      it('infers generated scenario IDs only from undeclared IDs in a complete saved config', async () => {
        const scenarioResult = {
          ...mockResults[1],
          testCase: {
            ...mockResults[1].testCase,
            metadata: { conversationId: '__scenario_0__' },
          },
        };
        const config = {
          prompts: [],
          providers: [],
          tests: [],
          scenarios: [{ config: [{}], tests: [] }],
        };
        const output = {
          evalId: null,
          results: {
            version: 3,
            timestamp: new Date().toISOString(),
            results: [mockResults[0], scenarioResult],
            table: { head: { prompts: [], vars: [] }, body: [] },
            stats: { successes: 0, failures: 1, errors: 0, tokenUsage: mockTokenUsage },
          },
          config,
          shareableUrl: null,
        };
        vi.mocked(util.readOutput).mockResolvedValue(output as any);
        const includesResult = vi.fn(() => false);
        const context = { includesResult, matchesTest: () => false };

        await filterTestsByResults(mockTestSuite, 'generated.json', () => true, undefined, context);
        expect(includesResult).toHaveBeenCalledWith(mockResults[0], {
          hasScenarios: true,
          generatedScenarioIdsObserved: true,
        });

        vi.mocked(util.readOutput).mockResolvedValue({
          ...output,
          config: {
            ...config,
            scenarios: [
              { config: [{ metadata: { conversationId: '__scenario_0__' } }], tests: [] },
            ],
          },
        } as any);
        includesResult.mockClear();
        await filterTestsByResults(mockTestSuite, 'explicit.json', () => true, undefined, context);
        expect(includesResult).toHaveBeenCalledWith(mockResults[0], {
          hasScenarios: true,
          generatedScenarioIdsObserved: false,
        });
      });

      it('keeps generated-ID evidence unknown when saved metadata sources are unresolved', async () => {
        const output = {
          evalId: null,
          results: {
            version: 3,
            timestamp: new Date().toISOString(),
            results: [
              {
                ...mockResults[1],
                testCase: {
                  ...mockResults[1].testCase,
                  metadata: { conversationId: '__scenario_0__' },
                },
              },
            ],
            table: { head: { prompts: [], vars: [] }, body: [] },
            stats: { successes: 0, failures: 1, errors: 0, tokenUsage: mockTokenUsage },
          },
          config: {
            prompts: [],
            providers: [],
            tests: [],
            scenarios: [{ config: [{}], tests: [{}] }],
            defaultTest: 'file://old-default.yaml',
          },
          shareableUrl: null,
        };
        vi.mocked(util.readOutput).mockResolvedValue(output as any);
        const includesResult = vi.fn(() => false);
        const context = { includesResult, matchesTest: () => false };

        await filterTestsByResults(
          mockTestSuite,
          'unresolved-default.json',
          () => true,
          undefined,
          context,
        );
        expect(includesResult).toHaveBeenCalledWith(expect.anything(), { hasScenarios: true });

        vi.mocked(util.readOutput).mockResolvedValue({
          ...output,
          config: {
            ...output.config,
            defaultTest: undefined,
            scenarios: [{ config: [{}], tests: 'file://old-tests.yaml' }],
          },
        } as any);
        includesResult.mockClear();
        await filterTestsByResults(
          mockTestSuite,
          'unresolved-tests.json',
          () => true,
          undefined,
          context,
        );
        expect(includesResult).toHaveBeenCalledWith(expect.anything(), { hasScenarios: true });
      });

      it('does not extract a marked removed scenario', async () => {
        const saved = {
          ...mockResults[1],
          metadata: { __promptfoo: { evalOrigin: 'scenario' } },
          testCase: {
            ...mockResults[1].testCase,
            metadata: { role: 'common', conversationId: 'stable-A' },
          },
        };
        vi.mocked(util.readOutput).mockResolvedValue({
          evalId: null,
          results: {
            version: 3,
            timestamp: new Date().toISOString(),
            results: [saved],
            table: { head: { prompts: [], vars: [] }, body: [] },
            stats: { successes: 0, failures: 1, errors: 0, tokenUsage: mockTokenUsage },
          },
          config: {
            prompts: [],
            providers: [],
            tests: [],
            scenarios: [
              {
                config: [{ metadata: { role: 'common', conversationId: 'stable-A' } }],
                tests: [{ vars: { var1: 'test2' } }],
              },
            ],
          },
          shareableUrl: null,
        } as any);
        const currentSuite: TestSuite = {
          prompts: [],
          providers: [],
          tests: [],
          scenarios: [{ config: [{}], tests: [{ vars: { var1: 'test2' } }] }],
        };

        const selected = await filterTestsByResults(
          currentSuite,
          'saved-explicit.json',
          () => true,
          undefined,
          topLevelResultMatchContext(currentSuite),
        );

        expect(selected).toEqual([]);
      });

      it('keeps one historical top-level timeout when old rows have ambiguous origin', async () => {
        const saved = {
          ...mockResults[1],
          success: false,
          failureReason: ResultFailureReason.ERROR,
          error: 'Evaluation timed out after 10ms',
          vars: { caseId: 'shared' },
          testCase: {
            vars: { caseId: 'shared' },
            metadata: { role: 'common', conversationId: 'stable-shared' },
          },
        };
        vi.mocked(util.readOutput).mockResolvedValue({
          evalId: null,
          results: {
            version: 3,
            timestamp: new Date().toISOString(),
            results: [
              { ...saved, testIdx: 0 },
              { ...saved, testIdx: 1 },
            ],
            table: { head: { prompts: [], vars: [] }, body: [] },
            stats: { successes: 0, failures: 0, errors: 2, tokenUsage: mockTokenUsage },
          },
          config: {
            prompts: [],
            providers: [],
            tests: [],
            scenarios: [
              {
                config: [{ metadata: { role: 'common', conversationId: 'stable-shared' } }],
                tests: [{ vars: { caseId: 'shared' } }],
              },
            ],
          },
          shareableUrl: null,
        } as any);
        const currentSuite: TestSuite = {
          prompts: [],
          providers: [],
          tests: [],
          scenarios: [{ config: [{}], tests: [{ vars: { caseId: 'other' } }] }],
        };

        const selected = await filterTestsByResults(
          currentSuite,
          'legacy-ambiguous.json',
          () => true,
          undefined,
          topLevelResultMatchContext(currentSuite),
        );

        expect(selected).toHaveLength(1);
        expect(selected[0]?.vars?.caseId).toBe('shared');

        const retainedScenarioSuite: TestSuite = {
          ...currentSuite,
          scenarios: [
            {
              config: [{ metadata: { role: 'common', conversationId: 'stable-shared' } }],
              tests: [{ vars: { caseId: 'shared' } }],
            },
          ],
        };
        const retainedSelected = await filterTestsByResults(
          retainedScenarioSuite,
          'legacy-ambiguous.json',
          () => true,
          undefined,
          topLevelResultMatchContext(retainedScenarioSuite),
        );
        expect(retainedSelected).toHaveLength(1);
        expect(retainedSelected[0]?.vars?.caseId).toBe('shared');
      });

      it('separates marked top-level and scenario rows sharing one explicit conversation ID', async () => {
        const savedResult = (caseId: string) => ({
          ...mockResults[1],
          metadata: {
            __promptfoo: { evalOrigin: caseId === 'top' ? 'top-level' : 'scenario' },
          },
          vars: { caseId },
          testCase: { vars: { caseId }, metadata: { conversationId: 'shared' } },
        });
        vi.mocked(util.readOutput).mockResolvedValue({
          evalId: null,
          results: {
            version: 3,
            timestamp: new Date().toISOString(),
            results: [savedResult('top'), savedResult('scenario')],
            table: { head: { prompts: [], vars: [] }, body: [] },
            stats: { successes: 0, failures: 2, errors: 0, tokenUsage: mockTokenUsage },
          },
          config: {
            prompts: [],
            providers: [],
            tests: [{ vars: { caseId: 'top' }, metadata: { conversationId: 'shared' } }],
            scenarios: [
              {
                config: [{}],
                tests: [{ vars: { caseId: 'scenario' }, metadata: { conversationId: 'shared' } }],
              },
            ],
          },
          shareableUrl: null,
        } as any);
        const currentSuite: TestSuite = {
          prompts: [],
          providers: [],
          tests: [],
          scenarios: [{ config: [{}], tests: [{ vars: { caseId: 'current' } }] }],
        };
        const context = topLevelResultMatchContext(currentSuite);

        const top = await filterTestsByResults(
          currentSuite,
          'shared-id.json',
          (result) => result.vars.caseId === 'top',
          undefined,
          context,
        );
        const scenario = await filterTestsByResults(
          currentSuite,
          'shared-id.json',
          (result) => result.vars.caseId === 'scenario',
          undefined,
          context,
        );

        expect(top).toHaveLength(1);
        expect(top[0]?.vars?.caseId).toBe('top');
        expect(scenario).toEqual([]);
      });

      it('uses result origin to distinguish providers sharing an ID and vars', async () => {
        const savedResult = (providerId: string) => ({
          ...mockResults[1],
          metadata: {
            __promptfoo: {
              evalOrigin: providerId === 'provider:top' ? 'top-level' : 'scenario',
            },
          },
          vars: { caseId: 'shared' },
          testCase: {
            vars: { caseId: 'shared' },
            metadata: { conversationId: 'shared' },
            provider: { id: providerId, label: 'shared-label' },
          },
        });
        vi.mocked(util.readOutput).mockResolvedValue({
          evalId: null,
          results: {
            version: 3,
            timestamp: new Date().toISOString(),
            results: [savedResult('provider:top'), savedResult('provider:scenario')],
            table: { head: { prompts: [], vars: [] }, body: [] },
            stats: { successes: 0, failures: 2, errors: 0, tokenUsage: mockTokenUsage },
          },
          config: {
            prompts: [],
            providers: [],
            tests: [
              {
                vars: { caseId: 'shared' },
                metadata: { conversationId: 'shared' },
                provider: 'provider:top',
              },
            ],
            scenarios: [
              {
                config: [{}],
                tests: [
                  {
                    vars: { caseId: 'shared' },
                    metadata: { conversationId: 'shared' },
                    provider: 'provider:scenario',
                  },
                ],
              },
            ],
          },
          shareableUrl: null,
        } as any);
        const currentSuite: TestSuite = { prompts: [], providers: [], tests: [] };
        const context = topLevelResultMatchContext(currentSuite);

        const top = await filterTestsByResults(
          currentSuite,
          'shared-provider.json',
          (result) =>
            (result.testCase?.provider as { id?: string } | undefined)?.id === 'provider:top',
          undefined,
          context,
        );
        const scenario = await filterTestsByResults(
          currentSuite,
          'shared-provider.json',
          (result) =>
            (result.testCase?.provider as { id?: string } | undefined)?.id === 'provider:scenario',
          undefined,
          context,
        );

        expect(top).toHaveLength(1);
        expect(scenario).toEqual([]);
      });

      it('does not misclassify a saved top-level vars expansion as a removed scenario', async () => {
        const saved = {
          ...mockResults[1],
          vars: { caseId: 'a' },
          testCase: { vars: { caseId: 'a' }, metadata: { conversationId: 'shared' } },
        };
        vi.mocked(util.readOutput).mockResolvedValue({
          evalId: null,
          results: {
            version: 3,
            timestamp: new Date().toISOString(),
            results: [saved],
            table: { head: { prompts: [], vars: [] }, body: [] },
            stats: { successes: 0, failures: 1, errors: 0, tokenUsage: mockTokenUsage },
          },
          config: {
            prompts: [],
            providers: [],
            tests: [{ vars: { caseId: ['a', 'b'] }, metadata: { conversationId: 'shared' } }],
            scenarios: [
              {
                config: [{}],
                tests: [{ vars: { caseId: 'a' }, metadata: { conversationId: 'shared' } }],
              },
            ],
          },
          shareableUrl: null,
        } as any);
        const currentSuite: TestSuite = { prompts: [], providers: [], tests: [] };

        const selected = await filterTestsByResults(
          currentSuite,
          'expanded.json',
          () => true,
          undefined,
          topLevelResultMatchContext(currentSuite),
        );

        expect(selected).toHaveLength(1);
        expect(selected[0]?.vars?.caseId).toBe('a');
      });

      it.each(['vars', 'provider'] as const)(
        'keeps saved origin unknown when top-level %s need file resolution',
        async (unresolved) => {
          const saved = {
            ...mockResults[1],
            vars: { caseId: 'a' },
            testCase: {
              vars: { caseId: 'a' },
              metadata: { conversationId: 'shared' },
              provider: { id: 'provider:scenario' },
            },
          };
          vi.mocked(util.readOutput).mockResolvedValue({
            evalId: null,
            results: {
              version: 3,
              timestamp: new Date().toISOString(),
              results: [saved],
              table: { head: { prompts: [], vars: [] }, body: [] },
              stats: { successes: 0, failures: 1, errors: 0, tokenUsage: mockTokenUsage },
            },
            config: {
              prompts: [],
              providers: [],
              tests: [
                {
                  vars: { caseId: unresolved === 'vars' ? 'file://./case.txt' : 'a' },
                  metadata: { conversationId: 'shared' },
                  provider: unresolved === 'provider' ? 'file://./provider.cjs' : undefined,
                },
              ],
              scenarios: [
                {
                  config: [{}],
                  tests: [
                    {
                      vars: { caseId: 'a' },
                      metadata: { conversationId: 'shared' },
                      provider: 'provider:scenario',
                    },
                  ],
                },
              ],
            },
            shareableUrl: null,
          } as any);
          const currentSuite: TestSuite = { prompts: [], providers: [], tests: [] };

          const selected = await filterTestsByResults(
            currentSuite,
            'unresolved-origin.json',
            () => true,
            undefined,
            topLevelResultMatchContext(currentSuite),
          );

          expect(selected).toHaveLength(1);
        },
      );

      it('excludes a marked scenario with an ID inherited from root metadata', async () => {
        const saved = {
          ...mockResults[1],
          metadata: { __promptfoo: { evalOrigin: 'scenario' } },
          vars: { caseId: 'scenario' },
          testCase: {
            vars: { caseId: 'scenario' },
            metadata: { conversationId: 'root-shared' },
          },
        };
        vi.mocked(util.readOutput).mockResolvedValue({
          evalId: null,
          results: {
            version: 3,
            timestamp: new Date().toISOString(),
            results: [saved],
            table: { head: { prompts: [], vars: [] }, body: [] },
            stats: { successes: 0, failures: 1, errors: 0, tokenUsage: mockTokenUsage },
          },
          config: {
            prompts: [],
            providers: [],
            tests: [{ vars: { caseId: 'top' } }],
            metadata: { conversationId: 'root-shared' },
            scenarios: [{ config: [{}], tests: [{ vars: { caseId: 'scenario' } }] }],
          },
          shareableUrl: null,
        } as any);
        const currentSuite: TestSuite = {
          prompts: [],
          providers: [],
          tests: [],
          scenarios: [{ config: [{}], tests: [{ vars: { caseId: 'current' } }] }],
        };

        expect(
          await filterTestsByResults(
            currentSuite,
            'root-shared.json',
            () => true,
            undefined,
            topLevelResultMatchContext(currentSuite),
          ),
        ).toEqual([]);
      });

      it('should return empty array if no results match filter', async () => {
        const result = await filterTestsByResults(mockTestSuite, 'results.json', () => false);
        expect(result).toHaveLength(0);
      });

      it('should handle non-json file path as eval ID', async () => {
        const mockEval = {
          id: 'results.txt',
          toEvaluateSummary: vi.fn().mockResolvedValue({
            version: 2,
            timestamp: new Date().toISOString(),
            results: mockResults,
            table: { head: { prompts: [], vars: [] }, body: [] },
            stats: {
              successes: 0,
              failures: 0,
              errors: 0,
              tokenUsage: mockTokenUsage,
            },
          }),
        };
        vi.mocked(Eval.findById).mockResolvedValue(mockEval as any);

        const result = await filterTestsByResults(
          mockTestSuite,
          'results.txt',
          (result) => result.success,
        );
        expect(result).toHaveLength(1);
        expect(result[0]?.vars?.var1).toBe('test1');
        expect(util.readOutput).not.toHaveBeenCalled();
      });

      it('passes complete saved Eval config provenance through one summary read', async () => {
        const summary = vi.fn().mockResolvedValue({ results: mockResults });
        vi.mocked(Eval.findById).mockResolvedValue({
          config: { prompts: [], providers: [], tests: [] },
          toEvaluateSummary: summary,
        } as any);
        const includesResult = vi.fn(() => false);
        const context = {
          includesResult,
          matchesTest: () => false,
          resultLoadCache: new Map(),
        };

        await Promise.all([
          filterTestsByResults(mockTestSuite, 'eval-complete', () => true, undefined, context),
          filterTestsByResults(mockTestSuite, 'eval-complete', () => true, undefined, context),
        ]);

        expect(Eval.findById).toHaveBeenCalledTimes(1);
        expect(summary).toHaveBeenCalledTimes(1);
        expect(includesResult).toHaveBeenCalledWith(mockResults[0], { hasScenarios: false });
      });

      it('should handle readOutput returning summary without results', async () => {
        vi.mocked(util.readOutput).mockResolvedValue({
          evalId: null,
          results: {
            version: 2,
            timestamp: new Date().toISOString(),
            results: [],
            table: { head: { prompts: [], vars: [] }, body: [] },
            stats: {
              successes: 0,
              failures: 0,
              errors: 0,
              tokenUsage: mockTokenUsage,
            },
          },
          config: {},
          shareableUrl: null,
        });

        const result = await filterTestsByResults(mockTestSuite, 'results.json', () => true);
        expect(result).toHaveLength(0);
      });

      it('should handle readOutput throwing an error', async () => {
        vi.mocked(util.readOutput).mockRejectedValue(new Error('Failed to read file'));
        const result = await filterTestsByResults(mockTestSuite, 'results.json', () => true);
        expect(result).toHaveLength(0);
      });

      it('should handle toEvaluateSummary throwing an error', async () => {
        const mockEval = {
          id: 'eval-123',
          toEvaluateSummary: vi.fn().mockRejectedValue(new Error('Failed to get summary')),
        };
        vi.mocked(Eval.findById).mockResolvedValue(mockEval as any);
        const result = await filterTestsByResults(mockTestSuite, 'eval-123', () => true);
        expect(result).toHaveLength(0);
      });

      it('should extract tests from results when no config test matches', async () => {
        // When resultIsForTestCase returns false, no config tests match
        // But results have testCase data, so we extract those tests
        vi.mocked(util.resultIsForTestCase).mockReturnValue(false);
        const result = await filterTestsByResults(mockTestSuite, 'results.json', () => true);
        // New behavior: extracts 3 tests from results since they have testCase data
        expect(result).toHaveLength(3);
        expect(result.map((t) => t.vars?.var1)).toEqual(['test1', 'test2', 'test3']);
      });

      it('should handle case where some tests match results', async () => {
        const testResults = [
          {
            vars: { var1: 'test1' },
            success: true,
            provider: { id: 'test-provider', label: 'Test Provider' },
            prompt: mockPrompt,
            response: mockResponse,
            promptIdx: 0,
            testIdx: 0,
            testCase: mockTestSuite.tests![0],
            promptId: 'test-prompt',
            latencyMs: 0,
            failureReason: ResultFailureReason.NONE,
            score: 1,
            namedScores: {},
          },
          {
            vars: { var1: 'test2' },
            success: false,
            provider: { id: 'test-provider', label: 'Test Provider' },
            prompt: mockPrompt,
            response: mockResponse,
            promptIdx: 0,
            testIdx: 1,
            testCase: mockTestSuite.tests![1],
            promptId: 'test-prompt',
            latencyMs: 0,
            failureReason: ResultFailureReason.ASSERT,
            score: 0,
            namedScores: {},
          },
          {
            vars: { var1: 'test3' },
            success: false,
            provider: { id: 'test-provider', label: 'Test Provider' },
            prompt: mockPrompt,
            response: mockResponse,
            promptIdx: 0,
            testIdx: 2,
            testCase: mockTestSuite.tests![2],
            promptId: 'test-prompt',
            latencyMs: 0,
            failureReason: ResultFailureReason.ERROR,
            score: 0,
            namedScores: {},
          },
        ];

        vi.mocked(util.readOutput).mockResolvedValue({
          evalId: null,
          results: {
            version: 2,
            timestamp: new Date().toISOString(),
            results: testResults,
            table: { head: { prompts: [], vars: [] }, body: [] },
            stats: {
              successes: 0,
              failures: 0,
              errors: 0,
              tokenUsage: mockTokenUsage,
            },
          },
          config: {},
          shareableUrl: null,
        });

        // Mock resultIsForTestCase to return true only for the first test
        vi.mocked(util.resultIsForTestCase).mockImplementation(function (_result, test) {
          return test === mockTestSuite.tests![0];
        });

        const result = await filterTestsByResults(mockTestSuite, 'results.json', () => true);
        expect(result).toHaveLength(1);
        expect(result[0]).toBe(mockTestSuite.tests![0]);
      });
    });

    describe('with eval ID', () => {
      beforeEach(() => {
        const mockEval = {
          id: 'eval-123',
          createdAt: new Date().getTime(),
          config: {},
          results: [],
          resultsCount: 0,
          prompts: [],
          persisted: true,
          toEvaluateSummary: vi.fn().mockResolvedValue({
            version: 2,
            timestamp: new Date().toISOString(),
            results: mockResults,
            table: { head: { prompts: [], vars: [] }, body: [] },
            stats: {
              successes: 0,
              failures: 0,
              errors: 0,
              tokenUsage: mockTokenUsage,
            },
          }),
        };
        vi.mocked(Eval.findById).mockResolvedValue(mockEval as any);
      });

      it('should filter tests based on success', async () => {
        const result = await filterTestsByResults(
          mockTestSuite,
          'eval-123',
          (result) => result.success,
        );
        expect(result).toHaveLength(1);
        expect(result[0]?.vars?.var1).toBe('test1');
      });

      it('should filter tests based on failure reason', async () => {
        const result = await filterTestsByResults(
          mockTestSuite,
          'eval-123',
          (result) => result.failureReason === ResultFailureReason.ERROR,
        );
        expect(result).toHaveLength(1);
        expect(result[0]?.vars?.var1).toBe('test3');
      });

      it('should return empty array if eval not found', async () => {
        vi.mocked(Eval.findById).mockResolvedValue(undefined);
        const result = await filterTestsByResults(mockTestSuite, 'eval-123', () => true);
        expect(result).toHaveLength(0);
      });

      it('should return empty array if eval has no results', async () => {
        const mockEval = {
          id: 'eval-123',
          createdAt: new Date().getTime(),
          config: {},
          results: [],
          resultsCount: 0,
          prompts: [],
          persisted: true,
          toEvaluateSummary: vi.fn().mockResolvedValue({
            version: 2,
            timestamp: new Date().toISOString(),
            results: [],
            table: { head: { prompts: [], vars: [] }, body: [] },
            stats: {
              successes: 0,
              failures: 0,
              errors: 0,
              tokenUsage: mockTokenUsage,
            },
          }),
        };
        vi.mocked(Eval.findById).mockResolvedValue(mockEval as any);
        const result = await filterTestsByResults(mockTestSuite, 'eval-123', () => true);
        expect(result).toHaveLength(0);
      });

      it('should return empty array if eval has no results property', async () => {
        const mockEval = {
          id: 'eval-123',
          createdAt: new Date().getTime(),
          config: {},
          results: [],
          resultsCount: 0,
          prompts: [],
          persisted: true,
          toEvaluateSummary: vi.fn().mockResolvedValue({
            version: 2,
            timestamp: new Date().toISOString(),
            table: { head: { prompts: [], vars: [] }, body: [] },
            stats: {
              successes: 0,
              failures: 0,
              errors: 0,
              tokenUsage: mockTokenUsage,
            },
          }),
        };
        vi.mocked(Eval.findById).mockResolvedValue(mockEval as any);
        const result = await filterTestsByResults(mockTestSuite, 'eval-123', () => true);
        expect(result).toHaveLength(0);
      });
    });
  });

  describe('runtime variable filtering integration', () => {
    /**
     * These tests verify that resultIsForTestCase properly filters runtime variables
     * when matching test cases. They use the real resultIsForTestCase without mocking.
     */

    beforeEach(() => {
      // Reset mocks but restore real resultIsForTestCase behavior for these tests
      vi.resetAllMocks();
    });

    it('should match results with _conversation runtime var to test cases without it', async () => {
      // Use the real resultIsForTestCase by restoring its implementation
      const { resultIsForTestCase: realResultIsForTestCase } =
        await vi.importActual<typeof import('../../../src/util/index')>('../../../src/util/index');

      vi.mocked(util.resultIsForTestCase).mockImplementation(realResultIsForTestCase);

      const testSuite: TestSuite = {
        prompts: [],
        providers: [],
        tests: [{ vars: { prompt: 'hello', goal: 'test' }, assert: [] }],
      };

      // Result has _conversation added during multi-turn evaluation
      const resultsWithRuntimeVars: EvaluateResult[] = [
        {
          vars: { prompt: 'hello', goal: 'test', _conversation: [{ role: 'user', content: 'hi' }] },
          success: false,
          failureReason: ResultFailureReason.ASSERT,
          provider: { id: 'test-provider' },
          prompt: { raw: 'test', display: 'test', label: 'Test' },
          response: { output: 'response', tokenUsage: { total: 0, prompt: 0, completion: 0 } },
          promptIdx: 0,
          testIdx: 0,
          testCase: { vars: { prompt: 'hello', goal: 'test' } },
          promptId: 'test',
          latencyMs: 0,
          score: 0,
          namedScores: {},
        },
      ];

      vi.mocked(util.readOutput).mockResolvedValue({
        evalId: null,
        results: {
          version: 2,
          timestamp: new Date().toISOString(),
          results: resultsWithRuntimeVars,
          table: { head: { prompts: [], vars: [] }, body: [] },
          stats: createFailedStats(),
        },
        config: {},
        shareableUrl: null,
      });

      const result = await filterTestsByResults(testSuite, 'results.json', (r) => !r.success);

      // Should match because _conversation is filtered out during comparison
      // Runtime vars are restored into the returned test case for re-evaluation
      expect(result).toHaveLength(1);
      expect(result[0]?.vars).toEqual({
        prompt: 'hello',
        goal: 'test',
        _conversation: [{ role: 'user', content: 'hi' }],
      });
    });

    it('should match results with sessionId runtime var to test cases without it', async () => {
      const { resultIsForTestCase: realResultIsForTestCase } =
        await vi.importActual<typeof import('../../../src/util/index')>('../../../src/util/index');

      vi.mocked(util.resultIsForTestCase).mockImplementation(realResultIsForTestCase);

      const testSuite: TestSuite = {
        prompts: [],
        providers: [],
        tests: [{ vars: { prompt: 'attack prompt' }, assert: [] }],
      };

      // Result has sessionId added during GOAT/Crescendo strategy execution
      const resultsWithSessionId: EvaluateResult[] = [
        {
          vars: { prompt: 'attack prompt', sessionId: 'goat-session-abc123' },
          success: false,
          failureReason: ResultFailureReason.ASSERT,
          provider: { id: 'test-provider' },
          prompt: { raw: 'test', display: 'test', label: 'Test' },
          response: { output: 'response', tokenUsage: { total: 0, prompt: 0, completion: 0 } },
          promptIdx: 0,
          testIdx: 0,
          testCase: { vars: { prompt: 'attack prompt' } },
          promptId: 'test',
          latencyMs: 0,
          score: 0,
          namedScores: {},
        },
      ];

      vi.mocked(util.readOutput).mockResolvedValue({
        evalId: null,
        results: {
          version: 2,
          timestamp: new Date().toISOString(),
          results: resultsWithSessionId,
          table: { head: { prompts: [], vars: [] }, body: [] },
          stats: createFailedStats(),
        },
        config: {},
        shareableUrl: null,
      });

      const result = await filterTestsByResults(testSuite, 'results.json', (r) => !r.success);

      // Should match because sessionId is filtered out during comparison
      // Runtime vars are restored into the returned test case for re-evaluation
      expect(result).toHaveLength(1);
      expect(result[0]?.vars).toEqual({
        prompt: 'attack prompt',
        sessionId: 'goat-session-abc123',
      });
    });

    it('should match results with both _conversation and sessionId to test cases without them', async () => {
      const { resultIsForTestCase: realResultIsForTestCase } =
        await vi.importActual<typeof import('../../../src/util/index')>('../../../src/util/index');

      vi.mocked(util.resultIsForTestCase).mockImplementation(realResultIsForTestCase);

      const testSuite: TestSuite = {
        prompts: [],
        providers: [],
        tests: [{ vars: { input: 'test input' }, assert: [] }],
      };

      // Result has both runtime vars
      const resultsWithBothRuntimeVars: EvaluateResult[] = [
        {
          vars: {
            input: 'test input',
            _conversation: [{ role: 'user', content: 'hello' }],
            sessionId: 'session-xyz789',
          },
          success: false,
          failureReason: ResultFailureReason.ERROR,
          provider: { id: 'test-provider' },
          prompt: { raw: 'test', display: 'test', label: 'Test' },
          response: { output: 'error', tokenUsage: { total: 0, prompt: 0, completion: 0 } },
          promptIdx: 0,
          testIdx: 0,
          testCase: { vars: { input: 'test input' } },
          promptId: 'test',
          latencyMs: 0,
          score: 0,
          namedScores: {},
        },
      ];

      vi.mocked(util.readOutput).mockResolvedValue({
        evalId: null,
        results: {
          version: 2,
          timestamp: new Date().toISOString(),
          results: resultsWithBothRuntimeVars,
          table: { head: { prompts: [], vars: [] }, body: [] },
          stats: {
            successes: 0,
            failures: 0,
            errors: 1,
            tokenUsage: createMockTokenUsage(),
          },
        },
        config: {},
        shareableUrl: null,
      });

      const result = await filterTestsByResults(
        testSuite,
        'results.json',
        (r) => r.failureReason === ResultFailureReason.ERROR,
      );

      // Should match because both _conversation and sessionId are filtered out during comparison
      // Runtime vars are restored into the returned test case for re-evaluation
      expect(result).toHaveLength(1);
      expect(result[0]?.vars).toEqual({
        input: 'test input',
        _conversation: [{ role: 'user', content: 'hello' }],
        sessionId: 'session-xyz789',
      });
    });

    it('should match results with underscore-prefixed custom runtime vars', async () => {
      const { resultIsForTestCase: realResultIsForTestCase } =
        await vi.importActual<typeof import('../../../src/util/index')>('../../../src/util/index');

      vi.mocked(util.resultIsForTestCase).mockImplementation(realResultIsForTestCase);

      const testSuite: TestSuite = {
        prompts: [],
        providers: [],
        tests: [{ vars: { prompt: 'test' }, assert: [] }],
      };

      // Result has custom underscore-prefixed runtime var
      const resultsWithCustomRuntimeVar: EvaluateResult[] = [
        {
          vars: { prompt: 'test', _customMetadata: { injected: true } },
          success: false,
          failureReason: ResultFailureReason.ASSERT,
          provider: { id: 'test-provider' },
          prompt: { raw: 'test', display: 'test', label: 'Test' },
          response: { output: 'response', tokenUsage: { total: 0, prompt: 0, completion: 0 } },
          promptIdx: 0,
          testIdx: 0,
          testCase: { vars: { prompt: 'test' } },
          promptId: 'test',
          latencyMs: 0,
          score: 0,
          namedScores: {},
        },
      ];

      vi.mocked(util.readOutput).mockResolvedValue({
        evalId: null,
        results: {
          version: 2,
          timestamp: new Date().toISOString(),
          results: resultsWithCustomRuntimeVar,
          table: { head: { prompts: [], vars: [] }, body: [] },
          stats: createFailedStats(),
        },
        config: {},
        shareableUrl: null,
      });

      const result = await filterTestsByResults(testSuite, 'results.json', (r) => !r.success);

      // Should match because _customMetadata is filtered out during comparison (underscore prefix convention)
      // Runtime vars are restored into the returned test case for re-evaluation
      expect(result).toHaveLength(1);
      expect(result[0]?.vars).toEqual({ prompt: 'test', _customMetadata: { injected: true } });
    });

    it('should give precedence to result runtime vars over test runtime vars', async () => {
      // Documents behavior: when a test already has runtime vars that differ from
      // the matched result, the result's runtime vars take precedence (overwrite).
      const { resultIsForTestCase: realResultIsForTestCase } =
        await vi.importActual<typeof import('../../../src/util/index')>('../../../src/util/index');
      vi.mocked(util.resultIsForTestCase).mockImplementation(realResultIsForTestCase);

      // Test case has pre-existing runtime vars
      const testSuite: TestSuite = {
        prompts: [],
        providers: [],
        tests: [
          {
            vars: {
              prompt: 'hello',
              _conversation: [{ role: 'system', content: 'old conversation' }],
              sessionId: 'old-session-123',
            },
            assert: [],
          },
        ],
      };

      // Result has different runtime vars
      const resultsWithRuntimeVars: EvaluateResult[] = [
        {
          vars: {
            prompt: 'hello',
            _conversation: [{ role: 'user', content: 'new conversation' }],
            sessionId: 'new-session-456',
          },
          success: false,
          failureReason: ResultFailureReason.ASSERT,
          provider: { id: 'test-provider' },
          prompt: { raw: 'test', display: 'test', label: 'Test' },
          response: { output: 'response', tokenUsage: { total: 0, prompt: 0, completion: 0 } },
          promptIdx: 0,
          testIdx: 0,
          testCase: {
            vars: {
              prompt: 'hello',
              _conversation: [{ role: 'system', content: 'old conversation' }],
              sessionId: 'old-session-123',
            },
          },
          promptId: 'test',
          latencyMs: 0,
          score: 0,
          namedScores: {},
        },
      ];

      vi.mocked(util.readOutput).mockResolvedValue({
        evalId: null,
        results: {
          version: 2,
          timestamp: new Date().toISOString(),
          results: resultsWithRuntimeVars,
          table: { head: { prompts: [], vars: [] }, body: [] },
          stats: createFailedStats(),
        },
        config: {},
        shareableUrl: null,
      });

      const result = await filterTestsByResults(testSuite, 'results.json', (r) => !r.success);

      // Result's runtime vars should overwrite test's runtime vars
      // This is the expected behavior: result vars are spread last, taking precedence
      expect(result).toHaveLength(1);
      expect(result[0]?.vars).toEqual({
        prompt: 'hello',
        _conversation: [{ role: 'user', content: 'new conversation' }],
        sessionId: 'new-session-456',
      });
    });

    it('should prefer matching results that have runtime vars when multiple match', async () => {
      // Verifies fix for order-dependent runtime var restoration:
      // When a test matches multiple results, prefer the one with runtime vars
      // to ensure _conversation and sessionId are restored even if the first match lacks them.
      const { resultIsForTestCase: realResultIsForTestCase } =
        await vi.importActual<typeof import('../../../src/util/index')>('../../../src/util/index');
      vi.mocked(util.resultIsForTestCase).mockImplementation(realResultIsForTestCase);

      const testSuite: TestSuite = {
        prompts: [],
        providers: [],
        tests: [{ vars: { prompt: 'hello' }, assert: [] }],
      };

      // Multiple results match the same test, but only the SECOND one has runtime vars
      // This tests that we prefer the result with runtime vars, not just the first match
      const resultsWithMixedRuntimeVars: EvaluateResult[] = [
        {
          // First result: matches but has NO runtime vars
          vars: { prompt: 'hello' },
          success: false,
          failureReason: ResultFailureReason.ASSERT,
          provider: { id: 'test-provider' },
          prompt: { raw: 'test', display: 'test', label: 'Test' },
          response: { output: 'response', tokenUsage: { total: 0, prompt: 0, completion: 0 } },
          promptIdx: 0,
          testIdx: 0,
          testCase: { vars: { prompt: 'hello' } },
          promptId: 'test',
          latencyMs: 0,
          score: 0,
          namedScores: {},
        },
        {
          // Second result: matches AND has runtime vars
          vars: {
            prompt: 'hello',
            _conversation: [{ role: 'user', content: 'multi-turn context' }],
            sessionId: 'session-abc',
          },
          success: false,
          failureReason: ResultFailureReason.ASSERT,
          provider: { id: 'test-provider' },
          prompt: { raw: 'test', display: 'test', label: 'Test' },
          response: { output: 'response', tokenUsage: { total: 0, prompt: 0, completion: 0 } },
          promptIdx: 1,
          testIdx: 0,
          testCase: { vars: { prompt: 'hello' } },
          promptId: 'test',
          latencyMs: 0,
          score: 0,
          namedScores: {},
        },
      ];

      vi.mocked(util.readOutput).mockResolvedValue({
        evalId: null,
        results: {
          version: 2,
          timestamp: new Date().toISOString(),
          results: resultsWithMixedRuntimeVars,
          table: { head: { prompts: [], vars: [] }, body: [] },
          stats: {
            successes: 0,
            failures: 2,
            errors: 0,
            tokenUsage: createMockTokenUsage(),
          },
        },
        config: {},
        shareableUrl: null,
      });

      const result = await filterTestsByResults(testSuite, 'results.json', (r) => !r.success);

      // Should restore runtime vars from the second result (the one that has them),
      // not the first result (which matched but has no runtime vars)
      expect(result).toHaveLength(1);
      expect(result[0]?.vars).toEqual({
        prompt: 'hello',
        _conversation: [{ role: 'user', content: 'multi-turn context' }],
        sessionId: 'session-abc',
      });
    });
  });

  describe('defaultTest merging', () => {
    /**
     * These tests verify that defaultTest.vars are properly merged when matching tests.
     */
    const mockPrompt: Prompt = {
      raw: 'test prompt',
      display: 'test prompt',
      label: 'Test Prompt',
    };

    const mockResponse: ProviderResponse = {
      output: 'response',
      tokenUsage: { total: 0, prompt: 0, completion: 0 },
    };

    const mockTokenUsage = createMockTokenUsage();

    beforeEach(() => {
      vi.resetAllMocks();
    });

    it('should merge defaultTest.vars when matching tests', async () => {
      const { resultIsForTestCase: realResultIsForTestCase } =
        await vi.importActual<typeof import('../../../src/util/index')>('../../../src/util/index');
      vi.mocked(util.resultIsForTestCase).mockImplementation(realResultIsForTestCase);

      // TestSuite with defaultTest that has vars
      const testSuite: TestSuite = {
        prompts: [],
        providers: [],
        defaultTest: {
          vars: { systemPrompt: 'You are a helpful assistant' },
        },
        tests: [{ vars: { userPrompt: 'hello' }, assert: [] }],
      };

      // Result has merged vars (systemPrompt from defaultTest + userPrompt from test)
      const resultsWithMergedVars: EvaluateResult[] = [
        {
          vars: { systemPrompt: 'You are a helpful assistant', userPrompt: 'hello' },
          success: false,
          failureReason: ResultFailureReason.ASSERT,
          provider: { id: 'test-provider' },
          prompt: mockPrompt,
          response: mockResponse,
          promptIdx: 0,
          testIdx: 0,
          testCase: { vars: { userPrompt: 'hello' } },
          promptId: 'test',
          latencyMs: 0,
          score: 0,
          namedScores: {},
        },
      ];

      vi.mocked(util.readOutput).mockResolvedValue({
        evalId: null,
        results: {
          version: 2,
          timestamp: new Date().toISOString(),
          results: resultsWithMergedVars,
          table: { head: { prompts: [], vars: [] }, body: [] },
          stats: { successes: 0, failures: 1, errors: 0, tokenUsage: mockTokenUsage },
        },
        config: {},
        shareableUrl: null,
      });

      const result = await filterTestsByResults(testSuite, 'results.json', (r) => !r.success);

      // Should match because defaultTest.vars are merged during comparison
      expect(result).toHaveLength(1);
      expect(result[0]?.vars?.userPrompt).toBe('hello');
    });

    it('should fallback to matching without defaults for old results', async () => {
      const { resultIsForTestCase: realResultIsForTestCase } =
        await vi.importActual<typeof import('../../../src/util/index')>('../../../src/util/index');
      vi.mocked(util.resultIsForTestCase).mockImplementation(realResultIsForTestCase);

      // TestSuite with defaultTest that has vars
      const testSuite: TestSuite = {
        prompts: [],
        providers: [],
        defaultTest: {
          vars: { systemPrompt: 'You are a helpful assistant' },
        },
        tests: [{ vars: { userPrompt: 'hello' }, assert: [] }],
      };

      // Old result that does NOT have merged defaultTest.vars
      // (before the merge was consistent)
      const oldResultsWithoutMergedVars: EvaluateResult[] = [
        {
          vars: { userPrompt: 'hello' }, // Only test vars, no defaultTest.vars merged
          success: false,
          failureReason: ResultFailureReason.ASSERT,
          provider: { id: 'test-provider' },
          prompt: mockPrompt,
          response: mockResponse,
          promptIdx: 0,
          testIdx: 0,
          testCase: { vars: { userPrompt: 'hello' } },
          promptId: 'test',
          latencyMs: 0,
          score: 0,
          namedScores: {},
        },
      ];

      vi.mocked(util.readOutput).mockResolvedValue({
        evalId: null,
        results: {
          version: 2,
          timestamp: new Date().toISOString(),
          results: oldResultsWithoutMergedVars,
          table: { head: { prompts: [], vars: [] }, body: [] },
          stats: { successes: 0, failures: 1, errors: 0, tokenUsage: mockTokenUsage },
        },
        config: {},
        shareableUrl: null,
      });

      const result = await filterTestsByResults(testSuite, 'results.json', (r) => !r.success);

      // Should match via fallback (matching without merged defaults)
      expect(result).toHaveLength(1);
      expect(result[0]?.vars?.userPrompt).toBe('hello');
    });

    it('should handle string defaultTest (no merging needed)', async () => {
      const { resultIsForTestCase: realResultIsForTestCase } =
        await vi.importActual<typeof import('../../../src/util/index')>('../../../src/util/index');
      vi.mocked(util.resultIsForTestCase).mockImplementation(realResultIsForTestCase);

      // TestSuite with string defaultTest (reference to another file)
      const testSuite: TestSuite = {
        prompts: [],
        providers: [],
        defaultTest: 'file://default.json' as any,
        tests: [{ vars: { prompt: 'hello' }, assert: [] }],
      };

      const resultsForStringDefault: EvaluateResult[] = [
        {
          vars: { prompt: 'hello' },
          success: false,
          failureReason: ResultFailureReason.ASSERT,
          provider: { id: 'test-provider' },
          prompt: mockPrompt,
          response: mockResponse,
          promptIdx: 0,
          testIdx: 0,
          testCase: { vars: { prompt: 'hello' } },
          promptId: 'test',
          latencyMs: 0,
          score: 0,
          namedScores: {},
        },
      ];

      vi.mocked(util.readOutput).mockResolvedValue({
        evalId: null,
        results: {
          version: 2,
          timestamp: new Date().toISOString(),
          results: resultsForStringDefault,
          table: { head: { prompts: [], vars: [] }, body: [] },
          stats: { successes: 0, failures: 1, errors: 0, tokenUsage: mockTokenUsage },
        },
        config: {},
        shareableUrl: null,
      });

      const result = await filterTestsByResults(testSuite, 'results.json', (r) => !r.success);

      // Should match directly without merging (string defaultTest is ignored)
      expect(result).toHaveLength(1);
      expect(result[0]?.vars?.prompt).toBe('hello');
    });
  });

  describe('runtime-generated test extraction', () => {
    /**
     * These tests verify that tests are extracted from results when they don't match
     * any test in the config file (e.g., remotely-generated tests like cipher-code).
     */

    const mockPrompt: Prompt = {
      raw: 'test prompt',
      display: 'test prompt',
      label: 'Test Prompt',
    };

    const mockResponse: ProviderResponse = {
      output: 'response',
      tokenUsage: { total: 0, prompt: 0, completion: 0 },
    };

    const mockTokenUsage = createMockTokenUsage();

    beforeEach(() => {
      vi.resetAllMocks();
    });

    it('restores a unique authored prompt ID from saved config for legacy DB results', async () => {
      const { resultIsForTestCase: realResultIsForTestCase } =
        await vi.importActual<typeof import('../../../src/util/index')>('../../../src/util/index');
      vi.mocked(util.resultIsForTestCase).mockImplementation(realResultIsForTestCase);
      const testSuite: TestSuite = {
        prompts: [],
        providers: [],
        tests: [{ vars: { caseId: 'shared' }, prompts: ['alpha-custom-id'] }],
      };
      const result = {
        vars: { caseId: 'shared' },
        success: false,
        failureReason: ResultFailureReason.ASSERT,
        provider: { id: 'echo' },
        prompt: { raw: 'alpha case=shared', label: 'QA:alpha-label' },
        promptId: 'hash-of-label',
        promptIdx: 0,
        testIdx: 0,
        testCase: { vars: { caseId: 'shared' }, prompts: ['alpha-custom-id'] },
      } as unknown as EvaluateResult;
      vi.mocked(util.readOutput).mockResolvedValue({
        evalId: null,
        results: {
          version: 3,
          timestamp: new Date().toISOString(),
          results: [result],
          table: { head: { prompts: [], vars: [] }, body: [] },
          stats: createFailedStats(),
        },
        config: {
          prompts: [
            { raw: 'alpha case={{caseId}}', label: 'QA:alpha-label', id: 'alpha-custom-id' },
          ],
          providers: [],
          tests: [],
        },
        shareableUrl: null,
      });

      const selected = await filterTestsByResults(
        testSuite,
        'legacy.json',
        () => true,
        undefined,
        topLevelResultMatchContext(testSuite),
      );

      expect(selected).toHaveLength(1);
      expect(selected[0]).toEqual(testSuite.tests?.[0]);
      expect(result.prompt.id).toBeUndefined();
    });

    it('does not guess a legacy prompt ID when saved definitions share a label', async () => {
      const { resultIsForTestCase: realResultIsForTestCase } =
        await vi.importActual<typeof import('../../../src/util/index')>('../../../src/util/index');
      vi.mocked(util.resultIsForTestCase).mockImplementation(realResultIsForTestCase);
      const testSuite: TestSuite = {
        prompts: [],
        providers: [],
        tests: [{ vars: { caseId: 'shared' }, prompts: ['alpha-custom-id'] }],
      };
      const result = {
        vars: { caseId: 'shared' },
        success: false,
        failureReason: ResultFailureReason.ASSERT,
        provider: { id: 'echo' },
        prompt: { raw: 'alpha case=shared', label: 'shared-label' },
        promptId: 'hash-of-label',
        promptIdx: 0,
        testIdx: 0,
        testCase: { vars: { caseId: 'shared' }, prompts: ['alpha-custom-id'] },
      } as unknown as EvaluateResult;
      vi.mocked(util.readOutput).mockResolvedValue({
        evalId: null,
        results: {
          version: 3,
          timestamp: new Date().toISOString(),
          results: [result],
          table: { head: { prompts: [], vars: [] }, body: [] },
          stats: createFailedStats(),
        },
        config: {
          prompts: [
            { raw: 'alpha case={{caseId}}', label: 'shared-label', id: 'alpha-custom-id' },
            { raw: 'beta case={{caseId}}', label: 'shared-label', id: 'beta-custom-id' },
          ],
          providers: [],
          tests: [],
        },
        shareableUrl: null,
      });

      const selected = await filterTestsByResults(
        testSuite,
        'ambiguous.json',
        () => true,
        undefined,
        topLevelResultMatchContext(testSuite),
      );

      expect(selected).toEqual([]);
    });

    it('does not infer a legacy prompt ID alongside an unresolved saved prompt', async () => {
      const { resultIsForTestCase: realResultIsForTestCase } =
        await vi.importActual<typeof import('../../../src/util/index')>('../../../src/util/index');
      vi.mocked(util.resultIsForTestCase).mockImplementation(realResultIsForTestCase);
      const testSuite: TestSuite = {
        prompts: [],
        providers: [],
        tests: [{ vars: { caseId: 'shared' }, prompts: ['alpha-custom-id'] }],
      };
      const result = {
        vars: { caseId: 'shared' },
        success: false,
        failureReason: ResultFailureReason.ASSERT,
        provider: { id: 'echo' },
        prompt: { raw: 'rendered', label: 'shared-label' },
        promptId: 'hash-of-label',
        promptIdx: 0,
        testIdx: 0,
        testCase: { vars: { caseId: 'shared' }, prompts: ['alpha-custom-id'] },
      } as unknown as EvaluateResult;
      vi.mocked(util.readOutput).mockResolvedValue({
        evalId: null,
        results: {
          version: 3,
          timestamp: new Date().toISOString(),
          results: [result],
          table: { head: { prompts: [], vars: [] }, body: [] },
          stats: createFailedStats(),
        },
        config: {
          prompts: [
            { raw: 'alpha', label: 'shared-label', id: 'alpha-custom-id' },
            'file://./possibly-same-label.txt',
          ],
          providers: [],
          tests: [],
        },
        shareableUrl: null,
      });

      const selected = await filterTestsByResults(
        testSuite,
        'unresolved-prompt.json',
        () => true,
        undefined,
        topLevelResultMatchContext(testSuite),
      );

      expect(selected).toEqual([]);
    });

    it('keeps distinct exact-mode runtime prompt and provider selectors without copying provider config', async () => {
      const testSuite: TestSuite = { prompts: [], providers: [], tests: [] };
      const results = ['alpha', 'beta'].map((label) => ({
        vars: { caseId: 'shared' },
        success: false,
        failureReason: ResultFailureReason.ASSERT,
        provider: { id: `provider-${label}` },
        prompt: { raw: 'rendered', label },
        promptId: `hash-${label}`,
        promptIdx: 0,
        testIdx: 0,
        testCase: {
          vars: { caseId: 'shared' },
          metadata: { group: 'common' },
          prompts: [label],
          providers: [`provider-${label}`],
          provider: { id: `old-provider-${label}`, config: { apiKey: 'stale' } },
        },
      })) as unknown as EvaluateResult[];
      vi.mocked(util.readOutput).mockResolvedValue({
        evalId: null,
        results: {
          version: 2,
          timestamp: new Date().toISOString(),
          results,
          table: { head: { prompts: [], vars: [] }, body: [] },
          stats: createFailedStats(),
        },
        config: {},
        shareableUrl: null,
      });

      const selected = await filterTestsByResults(
        testSuite,
        'runtime.json',
        () => true,
        undefined,
        topLevelResultMatchContext(testSuite),
      );

      expect(selected).toHaveLength(2);
      expect(selected.map((test) => test.prompts)).toEqual([['alpha'], ['beta']]);
      expect(selected.map((test) => test.providers)).toEqual([
        ['provider-alpha'],
        ['provider-beta'],
      ]);
      expect(selected.every((test) => test.provider === undefined)).toBe(true);
    });

    it('should extract tests from results when no config match exists', async () => {
      const { resultIsForTestCase: realResultIsForTestCase } =
        await vi.importActual<typeof import('../../../src/util/index')>('../../../src/util/index');
      vi.mocked(util.resultIsForTestCase).mockImplementation(realResultIsForTestCase);

      // Config has one test
      const testSuite: TestSuite = {
        prompts: [],
        providers: [],
        tests: [{ vars: { prompt: 'config test' }, assert: [] }],
      };

      // Results have a test that's NOT in config (runtime-generated)
      const resultsWithRuntimeTest: EvaluateResult[] = [
        {
          vars: { prompt: 'runtime generated cipher test' },
          success: false,
          failureReason: ResultFailureReason.ERROR,
          provider: { id: 'test-provider' },
          prompt: mockPrompt,
          response: mockResponse,
          promptIdx: 0,
          testIdx: 0,
          testCase: {
            vars: { prompt: 'runtime generated cipher test' },
            metadata: { pluginId: 'cipher-code' },
            assert: [{ type: 'llm-rubric', value: 'test' }],
          },
          promptId: 'test',
          latencyMs: 0,
          score: 0,
          namedScores: {},
        },
      ];

      vi.mocked(util.readOutput).mockResolvedValue({
        evalId: null,
        results: {
          version: 2,
          timestamp: new Date().toISOString(),
          results: resultsWithRuntimeTest,
          table: { head: { prompts: [], vars: [] }, body: [] },
          stats: { successes: 0, failures: 0, errors: 1, tokenUsage: mockTokenUsage },
        },
        config: {},
        shareableUrl: null,
      });

      const result = await filterTestsByResults(
        testSuite,
        'results.json',
        (r) => r.failureReason === ResultFailureReason.ERROR,
      );

      // Should extract the runtime-generated test
      expect(result).toHaveLength(1);
      expect(result[0]?.vars).toEqual({ prompt: 'runtime generated cipher test' });
      expect(result[0]?.metadata?.pluginId).toBe('cipher-code');
    });

    it('should not duplicate tests that match both config and results', async () => {
      const { resultIsForTestCase: realResultIsForTestCase } =
        await vi.importActual<typeof import('../../../src/util/index')>('../../../src/util/index');
      vi.mocked(util.resultIsForTestCase).mockImplementation(realResultIsForTestCase);

      const testSuite: TestSuite = {
        prompts: [],
        providers: [],
        tests: [{ vars: { prompt: 'test in config' }, assert: [] }],
      };

      // Result matches the config test
      const resultsMatchingConfig: EvaluateResult[] = [
        {
          vars: { prompt: 'test in config' },
          success: false,
          failureReason: ResultFailureReason.ERROR,
          provider: { id: 'test-provider' },
          prompt: mockPrompt,
          response: mockResponse,
          promptIdx: 0,
          testIdx: 0,
          testCase: { vars: { prompt: 'test in config' } },
          promptId: 'test',
          latencyMs: 0,
          score: 0,
          namedScores: {},
        },
      ];

      vi.mocked(util.readOutput).mockResolvedValue({
        evalId: null,
        results: {
          version: 2,
          timestamp: new Date().toISOString(),
          results: resultsMatchingConfig,
          table: { head: { prompts: [], vars: [] }, body: [] },
          stats: { successes: 0, failures: 0, errors: 1, tokenUsage: mockTokenUsage },
        },
        config: {},
        shareableUrl: null,
      });

      const result = await filterTestsByResults(
        testSuite,
        'results.json',
        (r) => r.failureReason === ResultFailureReason.ERROR,
      );

      // Should return only 1 test (from config), not duplicated
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(testSuite.tests![0]);
    });

    it('should handle results without testCase data gracefully', async () => {
      const { resultIsForTestCase: realResultIsForTestCase } =
        await vi.importActual<typeof import('../../../src/util/index')>('../../../src/util/index');
      vi.mocked(util.resultIsForTestCase).mockImplementation(realResultIsForTestCase);

      const testSuite: TestSuite = {
        prompts: [],
        providers: [],
        tests: [{ vars: { prompt: 'config test' }, assert: [] }],
      };

      // Result has no testCase (null)
      const resultsWithoutTestCase: EvaluateResult[] = [
        {
          vars: { prompt: 'orphan result' },
          success: false,
          failureReason: ResultFailureReason.ERROR,
          provider: { id: 'test-provider' },
          prompt: mockPrompt,
          response: mockResponse,
          promptIdx: 0,
          testIdx: 0,
          testCase: undefined as any,
          promptId: 'test',
          latencyMs: 0,
          score: 0,
          namedScores: {},
        },
      ];

      vi.mocked(util.readOutput).mockResolvedValue({
        evalId: null,
        results: {
          version: 2,
          timestamp: new Date().toISOString(),
          results: resultsWithoutTestCase,
          table: { head: { prompts: [], vars: [] }, body: [] },
          stats: { successes: 0, failures: 0, errors: 1, tokenUsage: mockTokenUsage },
        },
        config: {},
        shareableUrl: null,
      });

      const result = await filterTestsByResults(
        testSuite,
        'results.json',
        (r) => r.failureReason === ResultFailureReason.ERROR,
      );

      // Should return empty - no config match and can't extract without testCase
      expect(result).toHaveLength(0);
    });

    it('should filter runtime vars from extracted tests', async () => {
      const { resultIsForTestCase: realResultIsForTestCase } =
        await vi.importActual<typeof import('../../../src/util/index')>('../../../src/util/index');
      vi.mocked(util.resultIsForTestCase).mockImplementation(realResultIsForTestCase);

      const testSuite: TestSuite = {
        prompts: [],
        providers: [],
        tests: [], // Empty config
      };

      // Result has runtime vars that should be filtered
      const resultsWithRuntimeVars: EvaluateResult[] = [
        {
          vars: {
            prompt: 'runtime test',
            _conversation: [{ role: 'user', content: 'hi' }],
            sessionId: 'session-123',
          },
          success: false,
          failureReason: ResultFailureReason.ERROR,
          provider: { id: 'test-provider' },
          prompt: mockPrompt,
          response: mockResponse,
          promptIdx: 0,
          testIdx: 0,
          testCase: {
            vars: {
              prompt: 'runtime test',
              _conversation: [{ role: 'user', content: 'hi' }],
              sessionId: 'session-123',
            },
          },
          promptId: 'test',
          latencyMs: 0,
          score: 0,
          namedScores: {},
        },
      ];

      vi.mocked(util.readOutput).mockResolvedValue({
        evalId: null,
        results: {
          version: 2,
          timestamp: new Date().toISOString(),
          results: resultsWithRuntimeVars,
          table: { head: { prompts: [], vars: [] }, body: [] },
          stats: { successes: 0, failures: 0, errors: 1, tokenUsage: mockTokenUsage },
        },
        config: {},
        shareableUrl: null,
      });

      const result = await filterTestsByResults(
        testSuite,
        'results.json',
        (r) => r.failureReason === ResultFailureReason.ERROR,
      );

      // Should extract test with runtime vars filtered out
      expect(result).toHaveLength(1);
      expect(result[0]?.vars).toEqual({ prompt: 'runtime test' });
      expect(result[0]?.vars?._conversation).toBeUndefined();
      expect(result[0]?.vars?.sessionId).toBeUndefined();
    });

    it('should not copy provider from extracted tests (security)', async () => {
      const { resultIsForTestCase: realResultIsForTestCase } =
        await vi.importActual<typeof import('../../../src/util/index')>('../../../src/util/index');
      vi.mocked(util.resultIsForTestCase).mockImplementation(realResultIsForTestCase);

      const testSuite: TestSuite = {
        prompts: [],
        providers: [],
        tests: [], // Empty config
      };

      // Result has testCase with provider
      const resultsWithProvider: EvaluateResult[] = [
        {
          vars: { prompt: 'test' },
          success: false,
          failureReason: ResultFailureReason.ERROR,
          provider: { id: 'openai:gpt-4' },
          prompt: mockPrompt,
          response: mockResponse,
          promptIdx: 0,
          testIdx: 0,
          testCase: {
            vars: { prompt: 'test' },
            provider: 'openai:gpt-4-with-api-key-embedded',
          },
          promptId: 'test',
          latencyMs: 0,
          score: 0,
          namedScores: {},
        },
      ];

      vi.mocked(util.readOutput).mockResolvedValue({
        evalId: null,
        results: {
          version: 2,
          timestamp: new Date().toISOString(),
          results: resultsWithProvider,
          table: { head: { prompts: [], vars: [] }, body: [] },
          stats: { successes: 0, failures: 0, errors: 1, tokenUsage: mockTokenUsage },
        },
        config: {},
        shareableUrl: null,
      });

      const result = await filterTestsByResults(
        testSuite,
        'results.json',
        (r) => r.failureReason === ResultFailureReason.ERROR,
      );

      // Should extract test WITHOUT provider (security - don't leak credentials)
      expect(result).toHaveLength(1);
      expect(result[0]?.provider).toBeUndefined();
    });

    it('extracts an unmatched provider result even when its vars and metadata match an authored test', async () => {
      const { resultIsForTestCase: realResultIsForTestCase } =
        await vi.importActual<typeof import('../../../src/util/index')>('../../../src/util/index');
      vi.mocked(util.resultIsForTestCase).mockImplementation(realResultIsForTestCase);
      const authoredTest = {
        vars: { id: 'shared' },
        metadata: { group: 'common' },
        provider: 'provider-A',
      };
      const testSuite: TestSuite = { prompts: [], providers: [], tests: [authoredTest] };
      const results = ['provider-A', 'provider-B', 'provider-C'].map((providerId) => ({
        vars: { id: 'shared' },
        success: false,
        failureReason: ResultFailureReason.ASSERT,
        provider: { id: 'echo' },
        testCase: {
          vars: { id: 'shared' },
          metadata: { group: 'common' },
          provider: { id: providerId },
        },
      })) as unknown as EvaluateResult[];
      vi.mocked(util.readOutput).mockResolvedValue({
        evalId: null,
        results: {
          version: 2,
          timestamp: new Date().toISOString(),
          results,
          table: { head: { prompts: [], vars: [] }, body: [] },
          stats: { successes: 0, failures: 3, errors: 0, tokenUsage: mockTokenUsage },
        },
        config: {},
        shareableUrl: null,
      });

      const selected = await filterTestsByResults(
        testSuite,
        'results.json',
        () => true,
        undefined,
        topLevelResultMatchContext(testSuite),
      );

      expect(selected).toHaveLength(2);
      expect(selected[0]).toEqual(authoredTest);
      expect(selected[1]).toMatchObject({ vars: { id: 'shared' }, metadata: { group: 'common' } });
      expect(selected[1].provider).toBeUndefined();
    });

    it('does not extract another provider column excluded by the current authored allowlist', async () => {
      const { resultIsForTestCase: realResultIsForTestCase } =
        await vi.importActual<typeof import('../../../src/util/index')>('../../../src/util/index');
      vi.mocked(util.resultIsForTestCase).mockImplementation(realResultIsForTestCase);
      const authoredTest = {
        vars: { id: 'shared' },
        metadata: { group: 'common' },
        provider: 'target',
        providers: ['echo:A'],
      };
      const testSuite: TestSuite = { prompts: [], providers: [], tests: [authoredTest] };
      const results = ['echo:A', 'echo:B'].map((columnId) => ({
        vars: { id: 'shared' },
        success: false,
        failureReason: ResultFailureReason.ASSERT,
        provider: { id: columnId, label: 'shared-label' },
        testCase: {
          vars: { id: 'shared' },
          metadata: { group: 'common' },
          provider: { id: 'target' },
        },
      })) as unknown as EvaluateResult[];
      vi.mocked(util.readOutput).mockResolvedValue({
        evalId: null,
        results: {
          version: 2,
          timestamp: new Date().toISOString(),
          results,
          table: { head: { prompts: [], vars: [] }, body: [] },
          stats: { successes: 0, failures: 2, errors: 0, tokenUsage: mockTokenUsage },
        },
        config: {},
        shareableUrl: null,
      });

      const selected = await filterTestsByResults(
        testSuite,
        'results.json',
        () => true,
        undefined,
        topLevelResultMatchContext(testSuite),
      );

      expect(selected).toHaveLength(1);
      expect(selected[0]).toEqual(authoredTest);
    });

    it('does not extract another prompt excluded by the current authored allowlist', async () => {
      const { resultIsForTestCase: realResultIsForTestCase } =
        await vi.importActual<typeof import('../../../src/util/index')>('../../../src/util/index');
      vi.mocked(util.resultIsForTestCase).mockImplementation(realResultIsForTestCase);
      const authoredTest = {
        vars: { id: 'shared' },
        metadata: { group: 'common' },
        provider: 'target',
        prompts: ['alpha'],
      };
      const testSuite: TestSuite = { prompts: [], providers: [], tests: [authoredTest] };
      const results = ['alpha', 'beta'].map((label) => ({
        vars: { id: 'shared' },
        success: false,
        failureReason: ResultFailureReason.ASSERT,
        provider: { id: 'echo' },
        prompt: { raw: 'rendered', label },
        promptId: `hash-${label}`,
        testCase: {
          vars: { id: 'shared' },
          metadata: { group: 'common' },
          provider: { id: 'target' },
        },
      })) as unknown as EvaluateResult[];
      vi.mocked(util.readOutput).mockResolvedValue({
        evalId: null,
        results: {
          version: 2,
          timestamp: new Date().toISOString(),
          results,
          table: { head: { prompts: [], vars: [] }, body: [] },
          stats: { successes: 0, failures: 2, errors: 0, tokenUsage: mockTokenUsage },
        },
        config: {},
        shareableUrl: null,
      });

      const selected = await filterTestsByResults(
        testSuite,
        'results.json',
        () => true,
        undefined,
        topLevelResultMatchContext(testSuite),
      );

      expect(selected).toHaveLength(1);
      expect(selected[0]).toEqual(authoredTest);
    });

    it('should deduplicate extracted tests with same vars', async () => {
      const { resultIsForTestCase: realResultIsForTestCase } =
        await vi.importActual<typeof import('../../../src/util/index')>('../../../src/util/index');
      vi.mocked(util.resultIsForTestCase).mockImplementation(realResultIsForTestCase);

      const testSuite: TestSuite = {
        prompts: [],
        providers: [],
        tests: [], // Empty config - all tests will be extracted
      };

      // Multiple results with the same vars (duplicates)
      const duplicateResults: EvaluateResult[] = [
        {
          vars: { prompt: 'duplicate test' },
          success: false,
          failureReason: ResultFailureReason.ERROR,
          provider: { id: 'test-provider' },
          prompt: mockPrompt,
          response: mockResponse,
          promptIdx: 0,
          testIdx: 0,
          testCase: { vars: { prompt: 'duplicate test' }, metadata: { pluginId: 'plugin1' } },
          promptId: 'test',
          latencyMs: 0,
          score: 0,
          namedScores: {},
        },
        {
          vars: { prompt: 'duplicate test' }, // Same vars as above
          success: false,
          failureReason: ResultFailureReason.ERROR,
          provider: { id: 'test-provider' },
          prompt: mockPrompt,
          response: mockResponse,
          promptIdx: 1,
          testIdx: 1,
          testCase: { vars: { prompt: 'duplicate test' }, metadata: { pluginId: 'plugin1' } },
          promptId: 'test',
          latencyMs: 0,
          score: 0,
          namedScores: {},
        },
        {
          vars: { prompt: 'unique test' }, // Different vars
          success: false,
          failureReason: ResultFailureReason.ERROR,
          provider: { id: 'test-provider' },
          prompt: mockPrompt,
          response: mockResponse,
          promptIdx: 2,
          testIdx: 2,
          testCase: { vars: { prompt: 'unique test' }, metadata: { pluginId: 'plugin2' } },
          promptId: 'test',
          latencyMs: 0,
          score: 0,
          namedScores: {},
        },
      ];

      vi.mocked(util.readOutput).mockResolvedValue({
        evalId: null,
        results: {
          version: 2,
          timestamp: new Date().toISOString(),
          results: duplicateResults,
          table: { head: { prompts: [], vars: [] }, body: [] },
          stats: { successes: 0, failures: 0, errors: 3, tokenUsage: mockTokenUsage },
        },
        config: {},
        shareableUrl: null,
      });

      const result = await filterTestsByResults(
        testSuite,
        'results.json',
        (r) => r.failureReason === ResultFailureReason.ERROR,
      );

      // Should extract only 2 unique tests (duplicates are removed)
      expect(result).toHaveLength(2);
      expect(result.map((t) => t.vars?.prompt)).toContain('duplicate test');
      expect(result.map((t) => t.vars?.prompt)).toContain('unique test');
    });

    it('should combine config matches and extracted tests', async () => {
      const { resultIsForTestCase: realResultIsForTestCase } =
        await vi.importActual<typeof import('../../../src/util/index')>('../../../src/util/index');
      vi.mocked(util.resultIsForTestCase).mockImplementation(realResultIsForTestCase);

      const testSuite: TestSuite = {
        prompts: [],
        providers: [],
        tests: [{ vars: { prompt: 'config test' }, assert: [] }],
      };

      // Results have both a config match and a runtime-generated test
      const mixedResults: EvaluateResult[] = [
        {
          vars: { prompt: 'config test' },
          success: false,
          failureReason: ResultFailureReason.ERROR,
          provider: { id: 'test-provider' },
          prompt: mockPrompt,
          response: mockResponse,
          promptIdx: 0,
          testIdx: 0,
          testCase: { vars: { prompt: 'config test' } },
          promptId: 'test',
          latencyMs: 0,
          score: 0,
          namedScores: {},
        },
        {
          vars: { prompt: 'runtime cipher test' },
          success: false,
          failureReason: ResultFailureReason.ERROR,
          provider: { id: 'test-provider' },
          prompt: mockPrompt,
          response: mockResponse,
          promptIdx: 0,
          testIdx: 1,
          testCase: {
            vars: { prompt: 'runtime cipher test' },
            metadata: { pluginId: 'cipher-code' },
          },
          promptId: 'test',
          latencyMs: 0,
          score: 0,
          namedScores: {},
        },
      ];

      vi.mocked(util.readOutput).mockResolvedValue({
        evalId: null,
        results: {
          version: 2,
          timestamp: new Date().toISOString(),
          results: mixedResults,
          table: { head: { prompts: [], vars: [] }, body: [] },
          stats: { successes: 0, failures: 0, errors: 2, tokenUsage: mockTokenUsage },
        },
        config: {},
        shareableUrl: null,
      });

      const result = await filterTestsByResults(
        testSuite,
        'results.json',
        (r) => r.failureReason === ResultFailureReason.ERROR,
      );

      // Should return both: 1 from config, 1 extracted
      expect(result).toHaveLength(2);
      expect(result.map((t) => t.vars?.prompt)).toContain('config test');
      expect(result.map((t) => t.vars?.prompt)).toContain('runtime cipher test');
    });
  });
});
