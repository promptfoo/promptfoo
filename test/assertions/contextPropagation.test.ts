import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleAnswerRelevance } from '../../src/assertions/answerRelevance';
import { handleContextFaithfulness } from '../../src/assertions/contextFaithfulness';
import { handleContextRecall } from '../../src/assertions/contextRecall';
import { handleContextRelevance } from '../../src/assertions/contextRelevance';
import { handleFactuality } from '../../src/assertions/factuality';
import { handleGEval } from '../../src/assertions/geval';
import { runCompareAssertion } from '../../src/assertions/index';
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
  matchesSelectBest,
} from '../../src/matchers';

import type {
  ApiProvider,
  AssertionParams,
  CallApiContextParams,
  ProviderResponse,
} from '../../src/types/index';

vi.mock('../../src/matchers');
vi.mock('../../src/assertions/contextUtils', () => ({
  resolveContext: vi.fn().mockResolvedValue('mocked context'),
}));

describe('Context Propagation in Model-Graded Assertions', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  const mockProvider: ApiProvider = {
    id: () => 'test-provider',
    callApi: vi.fn().mockResolvedValue({} as ProviderResponse),
  };

  const mockCallApiContext: CallApiContextParams = {
    originalProvider: mockProvider,
    prompt: { raw: 'test prompt', label: 'test' },
    vars: { testVar: 'value' },
  };

  const baseParams: AssertionParams = {
    assertion: { type: 'llm-rubric' as const },
    baseType: 'llm-rubric',
    providerCallContext: mockCallApiContext,
    assertionValueContext: {
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
      vi.mocked(matchesLlmRubric).mockResolvedValue(mockResult);

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
      vi.mocked(matchesLlmRubric).mockResolvedValue(mockResult);

      const params = {
        ...baseParams,
        providerCallContext: undefined,
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
      vi.mocked(matchesFactuality).mockResolvedValue(mockResult);

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
      vi.mocked(matchesClosedQa).mockResolvedValue(mockResult);

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
      vi.mocked(matchesGEval).mockResolvedValue(mockResult);

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
      vi.mocked(matchesGEval).mockResolvedValue(mockResult);

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
      vi.mocked(matchesAnswerRelevance).mockResolvedValue(mockResult);

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
      vi.mocked(matchesAnswerRelevance).mockResolvedValue(mockResult);

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
      vi.mocked(resolveContext).mockResolvedValue('resolved context');

      const mockResult = { pass: true, score: 0.85, reason: 'test' };
      vi.mocked(matchesContextRecall).mockResolvedValue(mockResult);

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
      vi.mocked(resolveContext).mockResolvedValue('resolved context');

      const mockResult = { pass: true, score: 0.9, reason: 'test' };
      vi.mocked(matchesContextRelevance).mockResolvedValue(mockResult);

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
      vi.mocked(resolveContext).mockResolvedValue('resolved context');

      const mockResult = { pass: true, score: 0.95, reason: 'test' };
      vi.mocked(matchesContextFaithfulness).mockResolvedValue(mockResult);

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

  describe('runCompareAssertion (select-best)', () => {
    it('should pass callApiContext to matchesSelectBest', async () => {
      const mockResult = [
        { pass: true, score: 1, reason: 'best' },
        { pass: false, score: 0, reason: 'not best' },
      ];
      vi.mocked(matchesSelectBest).mockResolvedValue(mockResult);

      const test = { vars: { testVar: 'value' }, options: { provider: 'test-provider' } };
      const assertion = { type: 'select-best' as const, value: 'test criteria' };
      const outputs = ['output1', 'output2'];

      await runCompareAssertion(test, assertion, outputs, mockCallApiContext);

      expect(matchesSelectBest).toHaveBeenCalledWith(
        'test criteria',
        outputs,
        { provider: 'test-provider' },
        { testVar: 'value' },
        mockCallApiContext,
      );
    });

    it('should work when callApiContext is undefined', async () => {
      const mockResult = [
        { pass: true, score: 1, reason: 'best' },
        { pass: false, score: 0, reason: 'not best' },
      ];
      vi.mocked(matchesSelectBest).mockResolvedValue(mockResult);

      const test = { vars: { testVar: 'value' } };
      const assertion = { type: 'select-best' as const, value: 'test criteria' };
      const outputs = ['output1', 'output2'];

      await runCompareAssertion(test, assertion, outputs, undefined);

      expect(matchesSelectBest).toHaveBeenCalledWith(
        'test criteria',
        outputs,
        { provider: undefined, rubricPrompt: undefined },
        { testVar: 'value' },
        undefined,
      );
    });
  });
});
