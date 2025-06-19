import {
  generateNewQuestionsPrompt,
  synthesize,
  convertQuestionToPythonPrompt,
  synthesizeFromTestSuite,
} from '../../src/assertions/synthesis';
import { loadApiProvider } from '../../src/providers';
import type { TestCase, TestSuite } from '../../src/types';

jest.mock('../../src/providers', () => ({
  loadApiProvider: jest.fn(),
}));

describe('synthesize', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should generate assertions based on config prompts and existing assertions', async () => {
    let i = 0;
    const mockProvider = {
      id: () => 'mock-provider',
      callApi: jest.fn(() => {
        if (i === 0) {
          i++;
          return Promise.resolve({
            output:
              '{"questions": [{"label": "metric1", "question" : "test question", "question_source": "IMPLIED_IN_INSTRUCTIONS", "question_type": "CORE_FOR_APPLICATION" }]}',
          });
        }
        return Promise.resolve({ output: 'None' });
      }),
    };
    jest.mocked(loadApiProvider).mockResolvedValue(mockProvider);
    const result = await synthesize({
      provider: 'mock-provider',
      prompts: ['Test prompt'],
      tests: [],
      numQuestions: 1,
      type: 'pi',
    });

    expect(result).toHaveLength(1);
    expect(result).toEqual([{ metric: 'metric1', value: 'test question', type: 'pi' }]);
  });

  it('should throw error if no prompts provided', async () => {
    await expect(
      synthesize({
        prompts: [],
        tests: [],
      }),
    ).rejects.toThrow('Assertion synthesis requires at least one prompt.');
  });

  it('should handle python type assertions', async () => {
    let i = 0;
    const mockProvider = {
      id: () => 'mock-provider',
      callApi: jest.fn(() => {
        if (i === 0) {
          i++;
          return Promise.resolve({
            output:
              '{"questions": [{"label": "metric1", "question" : "test question", "question_source": "IMPLIED_IN_INSTRUCTIONS", "question_type": "CORE_FOR_APPLICATION" }]}',
          });
        }
        return Promise.resolve({ output: 'def test(): return True' });
      }),
    };
    jest.mocked(loadApiProvider).mockResolvedValue(mockProvider);
    const result = await synthesize({
      provider: 'mock-provider',
      prompts: ['Test prompt'],
      tests: [],
      numQuestions: 1,
    });

    expect(result).toHaveLength(1);
    expect(result).toEqual([
      { metric: 'metric1', value: 'def test(): return True', type: 'python' },
    ]);
  });

  it('should handle instructions parameter', async () => {
    let i = 0;
    const mockProvider = {
      id: () => 'mock-provider',
      callApi: jest.fn(() => {
        if (i === 0) {
          i++;
          return Promise.resolve({
            output:
              '{"questions": [{"label": "metric1", "question" : "test question", "question_source": "IMPLIED_IN_INSTRUCTIONS", "question_type": "CORE_FOR_APPLICATION" }]}',
          });
        }
        return Promise.resolve({ output: 'None' });
      }),
    };
    jest.mocked(loadApiProvider).mockResolvedValue(mockProvider);
    const result = await synthesize({
      provider: 'mock-provider',
      prompts: ['Test prompt'],
      instructions: 'Additional instructions',
      tests: [],
      numQuestions: 1,
    });

    expect(result).toHaveLength(1);
    expect(mockProvider.callApi).toHaveBeenCalledWith(
      expect.stringContaining('Additional instructions'),
    );
  });

  it('should handle invalid JSON response', async () => {
    const mockProvider = {
      id: () => 'mock-provider',
      callApi: jest.fn(() => Promise.resolve({ output: 'invalid json' })),
    };
    jest.mocked(loadApiProvider).mockResolvedValue(mockProvider);

    await expect(
      synthesize({
        provider: 'mock-provider',
        prompts: ['Test prompt'],
        tests: [],
        numQuestions: 1,
      }),
    ).rejects.toThrow('Expected at least one JSON object in the response for questions, got 0');
  });
});

describe('synthesizeFromTestSuite', () => {
  it('should synthesize assertions from test suite', async () => {
    let i = 0;
    const mockProvider = {
      id: () => 'mock-provider',
      callApi: jest.fn(() => {
        if (i === 0) {
          i++;
          return Promise.resolve({
            output:
              '{"questions": [{"label": "metric1", "question" : "test question", "question_source": "IMPLIED_IN_INSTRUCTIONS", "question_type": "CORE_FOR_APPLICATION" }]}',
          });
        }
        return Promise.resolve({ output: 'None' });
      }),
    };
    jest.mocked(loadApiProvider).mockResolvedValue(mockProvider);

    const testSuite: TestSuite = {
      prompts: [{ raw: 'test prompt', label: 'test' }],
      tests: [],
      providers: [],
    };

    const result = await synthesizeFromTestSuite(testSuite, {
      provider: 'mock-provider',
      numQuestions: 1,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      metric: 'metric1',
      value: 'test question',
      type: 'pi',
    });
  });

  it('should handle empty test suite', async () => {
    const mockProvider = {
      id: () => 'mock-provider',
      callApi: jest.fn(() => {
        return Promise.resolve({
          output:
            '{"questions": [{"label": "metric1", "question" : "test question", "question_source": "IMPLIED_IN_INSTRUCTIONS", "question_type": "CORE_FOR_APPLICATION" }]}',
        });
      }),
    };
    jest.mocked(loadApiProvider).mockResolvedValue(mockProvider);

    const testSuite: TestSuite = {
      prompts: [{ raw: 'test prompt', label: 'test' }],
      providers: [],
    };

    const result = await synthesizeFromTestSuite(testSuite, {
      provider: 'mock-provider',
      numQuestions: 1,
    });

    expect(result).toHaveLength(1);
  });
});

describe('generateNewQuestionsPrompt', () => {
  it('should generate a prompt with multiple prompts and assertions', () => {
    const prompts = ['What is the capital of France?', 'What is the capital of Germany?'];
    const testCases: TestCase[] = [
      {
        assert: [
          {
            type: 'llm-rubric',
            value: 'test question',
          },
        ],
      },
    ];
    const result = generateNewQuestionsPrompt(prompts, testCases, 1);
    expect(typeof result).toBe('string');
    expect(result).toContain('What is the capital of France?');
    expect(result).toContain('What is the capital of Germany?');
    expect(result).toContain('test question');
  });

  it('should handle test cases without assertions', () => {
    const prompts = ['Test prompt'];
    const testCases: TestCase[] = [{}];
    const result = generateNewQuestionsPrompt(prompts, testCases, 1);
    expect(typeof result).toBe('string');
    expect(result).toContain('Test prompt');
  });

  it('should handle empty test cases array', () => {
    const prompts = ['Test prompt'];
    const testCases: TestCase[] = [];
    const result = generateNewQuestionsPrompt(prompts, testCases, 1);
    expect(typeof result).toBe('string');
    expect(result).toContain('Test prompt');
    expect(result).toContain('existing_assertions');
  });
});

describe('convertQuestionToPythonPrompt', () => {
  it('should generate a prompt with multiple prompts', () => {
    const result = convertQuestionToPythonPrompt(
      ['What is the capital of France?', 'What is the capital of Germany?'],
      'Is the response clear?',
    );
    expect(typeof result).toBe('string');
    expect(result).toContain('What is the capital of France?');
    expect(result).toContain('What is the capital of Germany?');
    expect(result).toContain('Is the response clear?');
  });

  it('should handle single prompt', () => {
    const result = convertQuestionToPythonPrompt(['Single prompt'], 'Test question');
    expect(typeof result).toBe('string');
    expect(result).toContain('Single prompt');
    expect(result).toContain('Test question');
  });

  it('should include proper Python function examples', () => {
    const result = convertQuestionToPythonPrompt(['Test prompt'], 'Does it contain JSON?');
    expect(typeof result).toBe('string');
    expect(result).toContain('json.loads');
    expect(result).toContain("return {'pass': True, 'score': 1.0}");
  });
});
