import { handleAnswerRelevance } from '../../src/assertions/answerRelevance';
import { handleContextFaithfulness } from '../../src/assertions/contextFaithfulness';
import { handleContextRecall } from '../../src/assertions/contextRecall';
import { handleContextRelevance } from '../../src/assertions/contextRelevance';
import { handleFactuality } from '../../src/assertions/factuality';
import { handleGEval } from '../../src/assertions/geval';
import { handleLlmRubric } from '../../src/assertions/llmRubric';
import { handleModelGradedClosedQa } from '../../src/assertions/modelGradedClosedQa';
import {
  matchesAnswerRelevance,
  matchesClosedQa,
  matchesContextFaithfulness,
  matchesContextRecall,
  matchesContextRelevance,
  matchesFactuality,
  matchesGEval,
  matchesLlmRubric,
} from '../../src/matchers';

import type { ApiProvider, AssertionParams, CallApiContextParams } from '../../src/types/index';

jest.mock('../../src/matchers');
jest.mock('../../src/assertions/contextUtils', () => ({
  resolveContext: jest.fn().mockResolvedValue('mocked context'),
}));

describe('Context Propagation in Model-Graded Assertions', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  const mockProvider: ApiProvider = {
    id: () => 'test-provider',
    callApi: jest.fn(),
  };

  const mockCallApiContext: CallApiContextParams = {
    originalProvider: mockProvider,
    prompt: { raw: 'test prompt', label: 'test' },
    vars: { testVar: 'value' },
  };

  const baseParams: AssertionParams = {
    assertion: { type: 'llm-rubric' as const },
    baseType: 'llm-rubric',
    callApiContext: mockCallApiContext,
    context: {
      prompt: 'test prompt',
      vars: { testVar: 'value' },
      test: { vars: { testVar: 'value' } },
      logProbs: undefined,
      provider: mockProvider,
      providerResponse: undefined,
    },
    inverse: false,
    output: 'test output',
    outputString: 'test output',
    prompt: 'test prompt',
    provider: mockProvider,
    providerResponse: {},
    test: { vars: { testVar: 'value' } },
  };

  describe('handleLlmRubric', () => {
    it('should pass callApiContext to matchesLlmRubric', async () => {
      const mockResult = { pass: true, score: 1, reason: 'test' };
      jest.mocked(matchesLlmRubric).mockResolvedValue(mockResult);

      const params = {
        ...baseParams,
        renderedValue: 'test rubric',
      };

      await handleLlmRubric(params);

      expect(matchesLlmRubric).toHaveBeenCalledWith(
        'test rubric',
        'test output',
        undefined,
        { testVar: 'value' },
        params.assertion,
        undefined,
        mockCallApiContext,
      );
    });

    it('should work when callApiContext is undefined', async () => {
      const mockResult = { pass: true, score: 1, reason: 'test' };
      jest.mocked(matchesLlmRubric).mockResolvedValue(mockResult);

      const params = {
        ...baseParams,
        callApiContext: undefined,
        renderedValue: 'test rubric',
      };

      await handleLlmRubric(params);

      expect(matchesLlmRubric).toHaveBeenCalledWith(
        'test rubric',
        'test output',
        undefined,
        { testVar: 'value' },
        params.assertion,
        undefined,
        undefined,
      );
    });
  });

  describe('handleFactuality', () => {
    it('should pass callApiContext to matchesFactuality', async () => {
      const mockResult = { pass: true, score: 1, reason: 'test' };
      jest.mocked(matchesFactuality).mockResolvedValue(mockResult);

      const params = {
        ...baseParams,
        assertion: { type: 'factuality' as const },
        baseType: 'factuality' as const,
        renderedValue: 'expected answer',
      };

      await handleFactuality(params);

      expect(matchesFactuality).toHaveBeenCalledWith(
        'test prompt',
        'expected answer',
        'test output',
        undefined,
        { testVar: 'value' },
        mockCallApiContext,
      );
    });
  });

  describe('handleModelGradedClosedQa', () => {
    it('should pass callApiContext to matchesClosedQa', async () => {
      const mockResult = { pass: true, score: 1, reason: 'test' };
      jest.mocked(matchesClosedQa).mockResolvedValue(mockResult);

      const params = {
        ...baseParams,
        assertion: { type: 'model-graded-closedqa' as const },
        baseType: 'model-graded-closedqa' as const,
        renderedValue: 'criteria',
      };

      await handleModelGradedClosedQa(params);

      expect(matchesClosedQa).toHaveBeenCalledWith(
        'test prompt',
        'criteria',
        'test output',
        undefined,
        { testVar: 'value' },
        mockCallApiContext,
      );
    });
  });

  describe('handleGEval', () => {
    it('should pass callApiContext to matchesGEval', async () => {
      const mockResult = { pass: true, score: 0.8, reason: 'test' };
      jest.mocked(matchesGEval).mockResolvedValue(mockResult);

      const params = {
        ...baseParams,
        assertion: { type: 'g-eval' as const, threshold: 0.7 },
        baseType: 'g-eval' as const,
        renderedValue: 'coherence criteria',
      };

      await handleGEval(params);

      expect(matchesGEval).toHaveBeenCalledWith(
        'coherence criteria',
        'test prompt',
        'test output',
        0.7,
        undefined,
        mockCallApiContext,
      );
    });

    it('should pass callApiContext when evaluating array of criteria', async () => {
      const mockResult = { pass: true, score: 0.8, reason: 'test' };
      jest.mocked(matchesGEval).mockResolvedValue(mockResult);

      const params = {
        ...baseParams,
        assertion: { type: 'g-eval' as const, threshold: 0.7 },
        baseType: 'g-eval' as const,
        renderedValue: ['coherence', 'relevance'],
      };

      await handleGEval(params);

      expect(matchesGEval).toHaveBeenNthCalledWith(
        1,
        'coherence',
        'test prompt',
        'test output',
        0.7,
        undefined,
        mockCallApiContext,
      );

      expect(matchesGEval).toHaveBeenNthCalledWith(
        2,
        'relevance',
        'test prompt',
        'test output',
        0.7,
        undefined,
        mockCallApiContext,
      );
    });
  });

  describe('handleAnswerRelevance', () => {
    it('should pass callApiContext to matchesAnswerRelevance', async () => {
      const mockResult = { pass: true, score: 0.9, reason: 'test' };
      jest.mocked(matchesAnswerRelevance).mockResolvedValue(mockResult);

      const params = {
        ...baseParams,
        assertion: { type: 'answer-relevance' as const, threshold: 0.8 },
        baseType: 'answer-relevance' as const,
      };

      await handleAnswerRelevance(params);

      expect(matchesAnswerRelevance).toHaveBeenCalledWith(
        'test prompt',
        'test output',
        0.8,
        undefined,
        mockCallApiContext,
      );
    });

    it('should use query variable if present', async () => {
      const mockResult = { pass: true, score: 0.9, reason: 'test' };
      jest.mocked(matchesAnswerRelevance).mockResolvedValue(mockResult);

      const params = {
        ...baseParams,
        assertion: { type: 'answer-relevance' as const, threshold: 0.8 },
        baseType: 'answer-relevance' as const,
        test: { vars: { query: 'custom query' } },
      };

      await handleAnswerRelevance(params);

      expect(matchesAnswerRelevance).toHaveBeenCalledWith(
        'custom query',
        'test output',
        0.8,
        undefined,
        mockCallApiContext,
      );
    });
  });

  describe('handleContextRecall', () => {
    it('should pass callApiContext to matchesContextRecall', async () => {
      const { resolveContext } = await import('../../src/assertions/contextUtils');
      jest.mocked(resolveContext).mockResolvedValue('resolved context');

      const mockResult = { pass: true, score: 0.85, reason: 'test' };
      jest.mocked(matchesContextRecall).mockResolvedValue(mockResult);

      const params = {
        ...baseParams,
        assertion: { type: 'context-recall' as const, threshold: 0.7 },
        baseType: 'context-recall' as const,
        renderedValue: 'ground truth',
        providerResponse: { output: 'test' },
      };

      await handleContextRecall(params);

      expect(matchesContextRecall).toHaveBeenCalledWith(
        'resolved context',
        'ground truth',
        0.7,
        undefined,
        { testVar: 'value' },
        mockCallApiContext,
      );
    });
  });

  describe('handleContextRelevance', () => {
    it('should pass callApiContext to matchesContextRelevance', async () => {
      const { resolveContext } = await import('../../src/assertions/contextUtils');
      jest.mocked(resolveContext).mockResolvedValue('resolved context');

      const mockResult = { pass: true, score: 0.9, reason: 'test' };
      jest.mocked(matchesContextRelevance).mockResolvedValue(mockResult);

      const params = {
        ...baseParams,
        assertion: { type: 'context-relevance' as const, threshold: 0.8 },
        baseType: 'context-relevance' as const,
        test: { vars: { query: 'user question' } },
        providerResponse: { output: 'test' },
      };

      await handleContextRelevance(params);

      expect(matchesContextRelevance).toHaveBeenCalledWith(
        'user question',
        'resolved context',
        0.8,
        undefined,
        mockCallApiContext,
      );
    });
  });

  describe('handleContextFaithfulness', () => {
    it('should pass callApiContext to matchesContextFaithfulness', async () => {
      const { resolveContext } = await import('../../src/assertions/contextUtils');
      jest.mocked(resolveContext).mockResolvedValue('resolved context');

      const mockResult = { pass: true, score: 0.95, reason: 'test' };
      jest.mocked(matchesContextFaithfulness).mockResolvedValue(mockResult);

      const params = {
        ...baseParams,
        assertion: { type: 'context-faithfulness' as const, threshold: 0.9 },
        baseType: 'context-faithfulness' as const,
        test: { vars: { query: 'user question' } },
        providerResponse: { output: 'test' },
      };

      await handleContextFaithfulness(params);

      expect(matchesContextFaithfulness).toHaveBeenCalledWith(
        'user question',
        'test output',
        'resolved context',
        0.9,
        undefined,
        { query: 'user question' },
        mockCallApiContext,
      );
    });
  });
});
