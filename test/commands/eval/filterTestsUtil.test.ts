import { filterTestsByResults } from '../../../src/commands/eval/filterTestsUtil';
import Eval from '../../../src/models/eval';
import type {
  TestSuite,
  EvaluateResult,
  Prompt,
  ApiProvider,
  EvaluateStats,
  TokenUsage,
} from '../../../src/types';
import { readOutput, resultIsForTestCase } from '../../../src/util';

jest.mock('../../../src/util', () => ({
  readOutput: jest.fn(),
  resultIsForTestCase: jest.fn(),
}));

describe('filterTestsByResults', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockTestSuite: TestSuite = {
    tests: [{ vars: { test: '1' } }, { vars: { test: '2' } }, { vars: { test: '3' } }],
    prompts: [{ raw: 'test prompt', label: 'test' }],
    providers: [
      {
        id: 'test-provider',
        callApi: jest.fn(),
      },
    ] as unknown as ApiProvider[],
  };

  const mockPrompt: Prompt = {
    raw: 'test prompt',
    label: 'test',
    function: () => Promise.resolve('test'),
  };

  const mockProvider = {
    id: 'test-provider',
    label: 'Test Provider',
  };

  const mockResults: EvaluateResult[] = [
    {
      vars: {},
      prompt: mockPrompt,
      response: { output: 'test1' },
      success: true,
      testIdx: 0,
      promptIdx: 0,
      testCase: mockTestSuite.tests![0],
      promptId: 'test1',
      provider: mockProvider,
      error: null,
      score: 1,
      failureReason: null as any,
      latencyMs: 100,
      namedScores: {},
    },
    {
      vars: {},
      prompt: mockPrompt,
      response: { output: 'test2' },
      success: false,
      testIdx: 1,
      promptIdx: 0,
      testCase: mockTestSuite.tests![1],
      promptId: 'test2',
      provider: mockProvider,
      error: null,
      score: 0,
      failureReason: 'assertion' as any,
      latencyMs: 100,
      namedScores: {},
    },
    {
      vars: {},
      prompt: mockPrompt,
      response: { output: 'test3' },
      success: true,
      testIdx: 2,
      promptIdx: 0,
      testCase: mockTestSuite.tests![2],
      promptId: 'test3',
      provider: mockProvider,
      error: null,
      score: 1,
      failureReason: null as any,
      latencyMs: 100,
      namedScores: {},
    },
  ];

  const mockTokenUsage: Required<TokenUsage> = {
    prompt: 0,
    completion: 0,
    total: 0,
    cached: 0,
    numRequests: 0,
    completionDetails: {
      reasoning: 0,
      acceptedPrediction: 0,
      rejectedPrediction: 0,
    },
  };

  const mockStats = {
    tokenUsage: mockTokenUsage,
    successes: 2,
    failures: 1,
    errors: 0,
    namedScores: {},
    namedScoresCount: {},
  } as EvaluateStats;

  const mockEvaluateSummary = {
    version: 3,
    timestamp: '2025-02-01T00:00:00.000Z',
    prompts: [mockPrompt],
    results: mockResults,
    stats: mockStats,
    table: {
      head: { prompts: [], vars: [] },
      body: [],
    },
  };

  const mockOutputFile = {
    evalId: 'test-eval',
    config: {},
    results: mockEvaluateSummary,
    shareableUrl: null,
  };

  it('should return empty array if testSuite has no tests', async () => {
    const result = await filterTestsByResults(
      { tests: null, prompts: [], providers: [] } as unknown as TestSuite,
      'test.json',
      () => true,
    );
    expect(result).toEqual([]);
  });

  it('should handle JSON file path and filter results', async () => {
    jest.mocked(readOutput).mockResolvedValue(mockOutputFile);
    jest.mocked(resultIsForTestCase).mockImplementation((result, test) => {
      return result.testCase === test;
    });

    const filterFn = (result: EvaluateResult) => result.success;
    const result = await filterTestsByResults(mockTestSuite, 'test.json', filterFn);

    expect(readOutput).toHaveBeenCalledWith('test.json');
    expect(result).toEqual([mockTestSuite.tests![0], mockTestSuite.tests![2]]);
  });

  it('should handle eval ID and filter results', async () => {
    const mockEval = {
      toEvaluateSummary: jest.fn().mockResolvedValue(mockEvaluateSummary),
    };
    jest.spyOn(Eval, 'findById').mockResolvedValue(mockEval as any);
    jest.mocked(resultIsForTestCase).mockImplementation((result, test) => {
      return result.testCase === test;
    });

    const filterFn = (result: EvaluateResult) => result.success;
    const result = await filterTestsByResults(mockTestSuite, 'eval-123', filterFn);

    expect(Eval.findById).toHaveBeenCalledWith('eval-123');
    expect(result).toEqual([mockTestSuite.tests![0], mockTestSuite.tests![2]]);
  });

  it('should return empty array if eval is not found', async () => {
    jest.spyOn(Eval, 'findById').mockResolvedValue(undefined);

    const result = await filterTestsByResults(mockTestSuite, 'eval-123', () => true);
    expect(result).toEqual([]);
  });

  it('should return empty array if eval summary has no results', async () => {
    const mockEval = {
      toEvaluateSummary: jest.fn().mockResolvedValue({}),
    };
    jest.spyOn(Eval, 'findById').mockResolvedValue(mockEval as any);

    const result = await filterTestsByResults(mockTestSuite, 'eval-123', () => true);
    expect(result).toEqual([]);
  });

  it('should return empty array if no results pass the filter', async () => {
    jest.mocked(readOutput).mockResolvedValue(mockOutputFile);
    jest.mocked(resultIsForTestCase).mockReturnValue(true);

    const filterFn = (result: EvaluateResult) => false;
    const result = await filterTestsByResults(mockTestSuite, 'test.json', filterFn);
    expect(result).toEqual([]);
  });

  it('should handle read errors gracefully', async () => {
    jest.mocked(readOutput).mockRejectedValue(new Error('Read error'));

    const result = await filterTestsByResults(mockTestSuite, 'test.json', () => true);
    expect(result).toEqual([]);
  });
});
