import {
  generateNewQuestionsPrompt,
  convertQuestionToPythonPrompt,
  synthesize,
  synthesizeFromTestSuite,
} from '../../src/assertions/synthesis';
import { loadApiProvider } from '../../src/providers';
import { getDefaultProviders } from '../../src/providers/defaults';
import type { ApiProvider, TestCase, TestSuite } from '../../src/types';

jest.mock('../../src/providers');
jest.mock('../../src/providers/defaults');

describe('synthesis', () => {
  const mockProvider: ApiProvider = {
    id: () => 'test-provider',
    callApi: jest.fn(),
    config: {},
  };

  // Mock the complete DefaultProviders interface
  const mockDefaultProviders = {
    synthesizeProvider: mockProvider,
    embeddingProvider: mockProvider,
    gradingJsonProvider: mockProvider,
    gradingProvider: mockProvider,
    moderationProvider: mockProvider,
    suggestionsProvider: mockProvider,
  };

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(getDefaultProviders).mockResolvedValue(mockDefaultProviders);
    jest.mocked(loadApiProvider).mockResolvedValue(mockProvider);
    jest.mocked(mockProvider.callApi).mockReset();
  });

  describe('generateNewQuestionsPrompt', () => {
    it('should generate prompt with prompts and test cases', () => {
      const prompts = ['Test prompt 1', 'Test prompt 2'];
      const testCases: TestCase[] = [
        {
          description: 'Test case 1',
          assert: [{ type: 'equals', value: 'test' }],
        },
      ];

      const result = generateNewQuestionsPrompt(prompts, testCases, 5);

      expect(result).toContain('Test prompt 1');
      expect(result).toContain('Test prompt 2');
      expect(result).toContain(JSON.stringify([{ type: 'equals', value: 'test' }]));
      expect(result).toContain('Create total 5 questions with:');
    });

    it('should handle empty test cases', () => {
      const prompts = ['Test prompt'];
      const testCases: TestCase[] = [];

      const result = generateNewQuestionsPrompt(prompts, testCases, 3);

      expect(result).toContain('Test prompt');
      expect(result).toContain("There aren't any existing test cases yet");
    });

    it('should handle zero numQuestions', () => {
      const prompts = ['Test prompt'];
      const testCases: TestCase[] = [];

      const result = generateNewQuestionsPrompt(prompts, testCases, 0);

      expect(result).toContain('Test prompt');
      expect(result).toContain('Create a comprehensive set of evaluation questions with:');
    });
  });

  describe('convertQuestionToPythonPrompt', () => {
    it('should generate python conversion prompt', () => {
      const prompts = ['Test prompt'];
      const question = 'Does the output contain valid JSON?';

      const result = convertQuestionToPythonPrompt(prompts, question);

      expect(result).toContain('Test prompt');
      expect(result).toContain('Does the output contain valid JSON?');
      expect(result).toContain('You are a specialized system');
    });

    it('should handle multiple prompts', () => {
      const prompts = ['Prompt 1', 'Prompt 2', 'Prompt 3'];
      const question = 'Test question?';

      const result = convertQuestionToPythonPrompt(prompts, question);

      prompts.forEach((prompt) => {
        expect(result).toContain(prompt);
      });
      expect(result).toContain('Test question?');
    });
  });

  describe('synthesize', () => {
    it('should synthesize questions from prompts', async () => {
      const mockResponse = {
        output: JSON.stringify({
          questions: [
            {
              label: 'Test Label',
              question: 'Test question?',
              question_source: 'IMPLIED_IN_INSTRUCTIONS',
              question_type: 'CORE_FOR_APPLICATION',
            },
          ],
        }),
      };

      jest
        .mocked(mockProvider.callApi)
        .mockResolvedValueOnce(mockResponse)
        .mockResolvedValueOnce({ output: 'import json\nreturn {"pass": True, "score": 1.0}' });

      const result = await synthesize({
        prompts: ['Test prompt'],
        tests: [],
        numQuestions: 1,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        label: 'Test Label',
        question: 'Test question?',
        question_source: 'IMPLIED_IN_INSTRUCTIONS',
        question_type: 'CORE_FOR_APPLICATION',
        code: 'import json\nreturn {"pass": True, "score": 1.0}',
      });
    });

    it('should throw error if no prompts provided', async () => {
      await expect(
        synthesize({
          prompts: [],
          tests: [],
        }),
      ).rejects.toThrow('Assertion synthesis requires at least one prompt.');
    });

    it('should handle custom instructions', async () => {
      const mockResponse = {
        output: JSON.stringify({
          questions: [
            {
              label: 'Custom Label',
              question: 'Custom question?',
              question_source: 'IMPLIED_IN_INSTRUCTIONS',
              question_type: 'CORE_FOR_APPLICATION',
            },
          ],
        }),
      };

      jest
        .mocked(mockProvider.callApi)
        .mockResolvedValueOnce(mockResponse)
        .mockResolvedValueOnce({ output: 'None' });

      const result = await synthesize({
        prompts: ['Test prompt'],
        tests: [],
        instructions: 'Custom instructions',
        numQuestions: 1,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        label: 'Custom Label',
        question: 'Custom question?',
        question_source: 'IMPLIED_IN_INSTRUCTIONS',
        question_type: 'CORE_FOR_APPLICATION',
      });
    });
  });

  describe('synthesizeFromTestSuite', () => {
    it('should synthesize from test suite', async () => {
      const testSuite: TestSuite = {
        prompts: [{ raw: 'Test prompt', label: 'Test Label' }],
        tests: [],
        providers: [], // Added required field
      };

      const mockResponse = {
        output: JSON.stringify({
          questions: [
            {
              label: 'Test Label',
              question: 'Test question?',
              question_source: 'IMPLIED_IN_INSTRUCTIONS',
              question_type: 'CORE_FOR_APPLICATION',
            },
          ],
        }),
      };

      jest
        .mocked(mockProvider.callApi)
        .mockResolvedValueOnce(mockResponse)
        .mockResolvedValueOnce({ output: 'None' });

      const result = await synthesizeFromTestSuite(testSuite, {
        numQuestions: 1,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        label: 'Test Label',
        question: 'Test question?',
        question_source: 'IMPLIED_IN_INSTRUCTIONS',
        question_type: 'CORE_FOR_APPLICATION',
      });
    });

    it('should handle custom provider', async () => {
      const testSuite: TestSuite = {
        prompts: [{ raw: 'Test prompt', label: 'Test Label' }],
        tests: [],
        providers: [], // Added required field
      };

      const mockResponse = {
        output: JSON.stringify({
          questions: [
            {
              label: 'Custom Label',
              question: 'Custom question?',
              question_source: 'IMPLIED_IN_INSTRUCTIONS',
              question_type: 'CORE_FOR_APPLICATION',
            },
          ],
        }),
      };

      jest
        .mocked(mockProvider.callApi)
        .mockResolvedValueOnce(mockResponse)
        .mockResolvedValueOnce({ output: 'None' });

      const result = await synthesizeFromTestSuite(testSuite, {
        provider: 'custom-provider',
        numQuestions: 1,
      });

      expect(result).toHaveLength(1);
      expect(loadApiProvider).toHaveBeenCalledWith('custom-provider');
    });
  });
});
