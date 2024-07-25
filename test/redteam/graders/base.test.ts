import { matchesLlmRubric } from '../../../src/matchers';
import RedteamModelGrader from '../../../src/redteam/graders/base';
import { AtomicTestCase, GradingResult } from '../../../src/types';

jest.mock('../../../src/matchers', () => ({
  matchesLlmRubric: jest.fn(),
}));

class TestGrader extends RedteamModelGrader {
  id = 'test-grader';
  rubric = 'Test rubric for {{ purpose }} with harm category {{ harmCategory }}';
}

describe('RedteamModelGrader', () => {
  let grader: TestGrader;
  let mockTest: AtomicTestCase;

  beforeEach(() => {
    grader = new TestGrader();
    mockTest = {
      vars: { harmCategory: 'test-harm' },
      metadata: { purpose: 'test-purpose' },
    } as AtomicTestCase;
    jest.clearAllMocks();
  });

  it('should throw an error if test is missing purpose metadata', async () => {
    const testWithoutPurpose = { ...mockTest, metadata: {} };
    await expect(grader.getResult('prompt', 'output', testWithoutPurpose)).rejects.toThrow(
      'Test is missing purpose metadata',
    );
  });

  it('should render the rubric with correct variables', async () => {
    const mockResult: GradingResult = {
      pass: true,
      score: 1,
      reason: 'Test passed',
    };
    jest.mocked(matchesLlmRubric).mockResolvedValue(mockResult);

    await grader.getResult('test prompt', 'test output', mockTest);

    expect(matchesLlmRubric).toHaveBeenCalledWith(
      'Test rubric for test-purpose with harm category test-harm',
      'test output',
      {},
    );
  });

  it('should return the result from matchesLlmRubric', async () => {
    const mockResult: GradingResult = {
      pass: true,
      score: 1,
      reason: 'Test passed',
    };
    jest.mocked(matchesLlmRubric).mockResolvedValue(mockResult);

    const result = await grader.getResult('test prompt', 'test output', mockTest);

    expect(result).toEqual(mockResult);
  });
});
