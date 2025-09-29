import { filterTests } from '../../../src/commands/eval/filterTests';
import { filterTestsByResults } from '../../../src/commands/eval/filterTestsUtil';
import Eval from '../../../src/models/eval';
import { ResultFailureReason } from '../../../src/types';
import * as util from '../../../src/util';

import type { EvaluateResult, Prompt, ProviderResponse, TestSuite } from '../../../src/types';

jest.mock('../../../src/models/eval', () => ({
  findById: jest.fn(),
}));

jest.mock('../../../src/util', () => ({
  ...jest.requireActual('../../../src/util'),
  readOutput: jest.fn(),
  resultIsForTestCase: jest.fn().mockImplementation((result, test) => {
    // Simple matching based on vars
    return JSON.stringify(result.vars) === JSON.stringify(test.vars);
  }),
}));

describe('filterTests with scenarios', () => {
  const mockPrompt: Prompt = {
    raw: 'test prompt',
    display: 'test prompt',
    label: 'Test Prompt',
  };

  const mockResponse: ProviderResponse = {
    output: 'response',
    tokenUsage: { total: 0, prompt: 0, completion: 0 },
  };

  const mockTokenUsage = {
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
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('filterTestsByResults with scenarios', () => {
    it('should filter tests from scenario-expanded results correctly', async () => {
      // Test suite with scenarios but no direct tests
      const mockTestSuiteWithScenarios: TestSuite = {
        prompts: [],
        providers: [],
        tests: [], // Empty - tests are generated from scenarios
        scenarios: [
          {
            description: 'Test Scenario',
            config: [{ vars: { scenario_var: 'value1' } }, { vars: { scenario_var: 'value2' } }],
            tests: [
              { vars: { test_var: 'a' }, assert: [] },
              { vars: { test_var: 'b' }, assert: [] },
            ],
          },
        ],
      };

      // Mock results that would be generated from the scenario expansion
      // 2 scenario configs × 2 tests = 4 total test cases
      const expandedTestCase1 = {
        vars: { scenario_var: 'value1', test_var: 'a' },
        assert: [],
      };
      const expandedTestCase2 = {
        vars: { scenario_var: 'value1', test_var: 'b' },
        assert: [],
      };
      const expandedTestCase3 = {
        vars: { scenario_var: 'value2', test_var: 'a' },
        assert: [],
      };
      const expandedTestCase4 = {
        vars: { scenario_var: 'value2', test_var: 'b' },
        assert: [],
      };

      const mockResults: EvaluateResult[] = [
        {
          vars: { scenario_var: 'value1', test_var: 'a' },
          success: true,
          provider: { id: 'test-provider', label: 'Test Provider' },
          prompt: mockPrompt,
          response: mockResponse,
          promptIdx: 0,
          testIdx: 0,
          testCase: expandedTestCase1,
          promptId: 'test-prompt',
          latencyMs: 0,
          failureReason: ResultFailureReason.NONE,
          score: 1,
          namedScores: {},
        },
        {
          vars: { scenario_var: 'value1', test_var: 'b' },
          success: false,
          failureReason: ResultFailureReason.ASSERT,
          provider: { id: 'test-provider', label: 'Test Provider' },
          prompt: mockPrompt,
          response: mockResponse,
          promptIdx: 0,
          testIdx: 1,
          testCase: expandedTestCase2,
          promptId: 'test-prompt',
          latencyMs: 0,
          score: 0,
          namedScores: {},
        },
        {
          vars: { scenario_var: 'value2', test_var: 'a' },
          success: false,
          failureReason: ResultFailureReason.ERROR,
          provider: { id: 'test-provider', label: 'Test Provider' },
          prompt: mockPrompt,
          response: mockResponse,
          promptIdx: 0,
          testIdx: 2,
          testCase: expandedTestCase3,
          promptId: 'test-prompt',
          latencyMs: 0,
          score: 0,
          namedScores: {},
        },
        {
          vars: { scenario_var: 'value2', test_var: 'b' },
          success: true,
          provider: { id: 'test-provider', label: 'Test Provider' },
          prompt: mockPrompt,
          response: mockResponse,
          promptIdx: 0,
          testIdx: 3,
          testCase: expandedTestCase4,
          promptId: 'test-prompt',
          latencyMs: 0,
          failureReason: ResultFailureReason.NONE,
          score: 1,
          namedScores: {},
        },
      ];

      jest.mocked(util.readOutput).mockResolvedValue({
        evalId: null,
        results: {
          version: 2,
          timestamp: new Date().toISOString(),
          results: mockResults,
          table: { head: { prompts: [], vars: [] }, body: [] },
          stats: {
            successes: 2,
            failures: 1,
            errors: 1,
            tokenUsage: mockTokenUsage,
          },
        },
        config: {},
        shareableUrl: null,
      });

      // Test filtering for failed tests (should get 2 results)
      const failedTests = await filterTestsByResults(
        mockTestSuiteWithScenarios,
        'results.json',
        (result) => !result.success,
      );

      expect(failedTests).toHaveLength(2);
      expect(failedTests[0]?.vars).toEqual({ scenario_var: 'value1', test_var: 'b' });
      expect(failedTests[1]?.vars).toEqual({ scenario_var: 'value2', test_var: 'a' });
    });

    it('should handle mixed scenarios and regular tests', async () => {
      // Test suite with both regular tests and scenarios
      const mockMixedTestSuite: TestSuite = {
        prompts: [],
        providers: [],
        tests: [
          { vars: { regular_test: 'test1' }, assert: [] },
          { vars: { regular_test: 'test2' }, assert: [] },
        ],
        scenarios: [
          {
            description: 'Test Scenario',
            config: [{ vars: { scenario_var: 'value1' } }],
            tests: [{ vars: { test_var: 'a' }, assert: [] }],
          },
        ],
      };

      const regularTestCase1 = { vars: { regular_test: 'test1' }, assert: [] };
      const regularTestCase2 = { vars: { regular_test: 'test2' }, assert: [] };
      const scenarioTestCase = { vars: { scenario_var: 'value1', test_var: 'a' }, assert: [] };

      const mockResults: EvaluateResult[] = [
        {
          vars: { regular_test: 'test1' },
          success: true,
          provider: { id: 'test-provider', label: 'Test Provider' },
          prompt: mockPrompt,
          response: mockResponse,
          promptIdx: 0,
          testIdx: 0,
          testCase: regularTestCase1,
          promptId: 'test-prompt',
          latencyMs: 0,
          failureReason: ResultFailureReason.NONE,
          score: 1,
          namedScores: {},
        },
        {
          vars: { regular_test: 'test2' },
          success: false,
          failureReason: ResultFailureReason.ASSERT,
          provider: { id: 'test-provider', label: 'Test Provider' },
          prompt: mockPrompt,
          response: mockResponse,
          promptIdx: 0,
          testIdx: 1,
          testCase: regularTestCase2,
          promptId: 'test-prompt',
          latencyMs: 0,
          score: 0,
          namedScores: {},
        },
        {
          vars: { scenario_var: 'value1', test_var: 'a' },
          success: false,
          failureReason: ResultFailureReason.ERROR,
          provider: { id: 'test-provider', label: 'Test Provider' },
          prompt: mockPrompt,
          response: mockResponse,
          promptIdx: 0,
          testIdx: 2,
          testCase: scenarioTestCase,
          promptId: 'test-prompt',
          latencyMs: 0,
          score: 0,
          namedScores: {},
        },
      ];

      jest.mocked(util.readOutput).mockResolvedValue({
        evalId: null,
        results: {
          version: 2,
          timestamp: new Date().toISOString(),
          results: mockResults,
          table: { head: { prompts: [], vars: [] }, body: [] },
          stats: {
            successes: 1,
            failures: 1,
            errors: 1,
            tokenUsage: mockTokenUsage,
          },
        },
        config: {},
        shareableUrl: null,
      });

      // When we have mixed tests, resultIsForTestCase should match regular tests
      jest.mocked(util.resultIsForTestCase).mockImplementation((result, test) => {
        // Only match regular tests, not scenario-expanded ones
        return JSON.stringify(result.vars) === JSON.stringify(test.vars);
      });

      // Test filtering for failed tests (should get both regular and scenario failures)
      const failedTests = await filterTestsByResults(
        mockMixedTestSuite,
        'results.json',
        (result) => !result.success,
      );

      expect(failedTests).toHaveLength(2);
      // Should include the regular failed test
      expect(failedTests.some((t) => t.vars?.regular_test === 'test2')).toBe(true);
      // Should include the scenario-expanded failed test
      expect(
        failedTests.some((t) => t.vars?.scenario_var === 'value1' && t.vars?.test_var === 'a'),
      ).toBe(true);
    });
  });

  describe('filterTests with failing option', () => {
    it('should correctly filter failing tests from scenarios', async () => {
      const mockTestSuiteWithScenarios: TestSuite = {
        prompts: [],
        providers: [],
        tests: [],
        scenarios: [
          {
            description: 'Test Scenario',
            config: [{ vars: { scenario_var: 'value1' } }],
            tests: [
              { vars: { test_var: 'a' }, assert: [] },
              { vars: { test_var: 'b' }, assert: [] },
            ],
          },
        ],
      };

      const mockResults: EvaluateResult[] = [
        {
          vars: { scenario_var: 'value1', test_var: 'a' },
          success: true,
          provider: { id: 'test-provider', label: 'Test Provider' },
          prompt: mockPrompt,
          response: mockResponse,
          promptIdx: 0,
          testIdx: 0,
          testCase: { vars: { scenario_var: 'value1', test_var: 'a' }, assert: [] },
          promptId: 'test-prompt',
          latencyMs: 0,
          failureReason: ResultFailureReason.NONE,
          score: 1,
          namedScores: {},
        },
        {
          vars: { scenario_var: 'value1', test_var: 'b' },
          success: false,
          failureReason: ResultFailureReason.ASSERT,
          provider: { id: 'test-provider', label: 'Test Provider' },
          prompt: mockPrompt,
          response: mockResponse,
          promptIdx: 0,
          testIdx: 1,
          testCase: { vars: { scenario_var: 'value1', test_var: 'b' }, assert: [] },
          promptId: 'test-prompt',
          latencyMs: 0,
          score: 0,
          namedScores: {},
        },
      ];

      jest.mocked(util.readOutput).mockResolvedValue({
        evalId: null,
        results: {
          version: 2,
          timestamp: new Date().toISOString(),
          results: mockResults,
          table: { head: { prompts: [], vars: [] }, body: [] },
          stats: {
            successes: 1,
            failures: 1,
            errors: 0,
            tokenUsage: mockTokenUsage,
          },
        },
        config: {},
        shareableUrl: null,
      });

      // Use filterTests with failing option
      const filteredTests = await filterTests(mockTestSuiteWithScenarios, {
        failing: 'results.json',
      });

      // Should only return the failed test from scenario
      expect(filteredTests).toHaveLength(1);
      expect(filteredTests[0]?.vars).toEqual({ scenario_var: 'value1', test_var: 'b' });
    });
  });
});

