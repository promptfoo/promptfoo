import { filterTestsByResults } from '../../../src/commands/eval/filterTestsUtil';
import Eval from '../../../src/models/eval';
import type { TestSuite, EvaluateResult, Prompt, ProviderResponse } from '../../../src/types';
import { ResultFailureReason } from '../../../src/types';
import * as util from '../../../src/util';

jest.mock('../../../src/models/eval', () => ({
  findById: jest.fn(),
}));

jest.mock('../../../src/util', () => ({
  ...jest.requireActual('../../../src/util'),
  readOutput: jest.fn(),
  resultIsForTestCase: jest.fn().mockImplementation((result, test) => {
    return result.testCase === test;
  }),
}));

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

    beforeEach(() => {
      jest.resetAllMocks();
      jest.mocked(util.resultIsForTestCase).mockImplementation((result, test) => {
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
        jest.mocked(util.readOutput).mockResolvedValue({
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
              tokenUsage: {
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
              },
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

      it('should return empty array if no results match filter', async () => {
        const result = await filterTestsByResults(mockTestSuite, 'results.json', () => false);
        expect(result).toHaveLength(0);
      });

      it('should handle non-json file path as eval ID', async () => {
        const mockEval = {
          id: 'results.txt',
          toEvaluateSummary: jest.fn().mockResolvedValue({
            version: 2,
            timestamp: new Date().toISOString(),
            results: mockResults,
            table: { head: { prompts: [], vars: [] }, body: [] },
            stats: {
              successes: 0,
              failures: 0,
              errors: 0,
              tokenUsage: {
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
              },
            },
          }),
        };
        jest.mocked(Eval.findById).mockResolvedValue(mockEval as any);

        const result = await filterTestsByResults(
          mockTestSuite,
          'results.txt',
          (result) => result.success,
        );
        expect(result).toHaveLength(1);
        expect(result[0]?.vars?.var1).toBe('test1');
        expect(util.readOutput).not.toHaveBeenCalled();
      });

      it('should handle readOutput returning summary without results', async () => {
        jest.mocked(util.readOutput).mockResolvedValue({
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
              tokenUsage: {
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
              },
            },
          },
          config: {},
          shareableUrl: null,
        });

        const result = await filterTestsByResults(mockTestSuite, 'results.json', () => true);
        expect(result).toHaveLength(0);
      });

      it('should handle readOutput throwing an error', async () => {
        jest.mocked(util.readOutput).mockRejectedValue(new Error('Failed to read file'));
        const result = await filterTestsByResults(mockTestSuite, 'results.json', () => true);
        expect(result).toHaveLength(0);
      });

      it('should handle toEvaluateSummary throwing an error', async () => {
        const mockEval = {
          id: 'eval-123',
          toEvaluateSummary: jest.fn().mockRejectedValue(new Error('Failed to get summary')),
        };
        jest.mocked(Eval.findById).mockResolvedValue(mockEval as any);
        const result = await filterTestsByResults(mockTestSuite, 'eval-123', () => true);
        expect(result).toHaveLength(0);
      });

      it('should handle case where no test matches any result', async () => {
        jest.mocked(util.resultIsForTestCase).mockReturnValue(false);
        const result = await filterTestsByResults(mockTestSuite, 'results.json', () => true);
        expect(result).toHaveLength(0);
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

        jest.mocked(util.readOutput).mockResolvedValue({
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
              tokenUsage: {
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
              },
            },
          },
          config: {},
          shareableUrl: null,
        });

        // Mock resultIsForTestCase to return true only for the first test
        jest.mocked(util.resultIsForTestCase).mockImplementation((result, test) => {
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
          toEvaluateSummary: jest.fn().mockResolvedValue({
            version: 2,
            timestamp: new Date().toISOString(),
            results: mockResults,
            table: { head: { prompts: [], vars: [] }, body: [] },
            stats: {
              successes: 0,
              failures: 0,
              errors: 0,
              tokenUsage: {
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
              },
            },
          }),
        };
        jest.mocked(Eval.findById).mockResolvedValue(mockEval as any);
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
        jest.mocked(Eval.findById).mockResolvedValue(undefined);
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
          toEvaluateSummary: jest.fn().mockResolvedValue({
            version: 2,
            timestamp: new Date().toISOString(),
            results: [],
            table: { head: { prompts: [], vars: [] }, body: [] },
            stats: {
              successes: 0,
              failures: 0,
              errors: 0,
              tokenUsage: {
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
              },
            },
          }),
        };
        jest.mocked(Eval.findById).mockResolvedValue(mockEval as any);
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
          toEvaluateSummary: jest.fn().mockResolvedValue({
            version: 2,
            timestamp: new Date().toISOString(),
            table: { head: { prompts: [], vars: [] }, body: [] },
            stats: {
              successes: 0,
              failures: 0,
              errors: 0,
              tokenUsage: {
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
              },
            },
          }),
        };
        jest.mocked(Eval.findById).mockResolvedValue(mockEval as any);
        const result = await filterTestsByResults(mockTestSuite, 'eval-123', () => true);
        expect(result).toHaveLength(0);
      });
    });
  });
});
