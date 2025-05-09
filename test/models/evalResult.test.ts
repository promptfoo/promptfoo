import { runDbMigrations } from '../../src/migrate';
import EvalResult, { sanitizeProvider } from '../../src/models/evalResult';
import { hashPrompt } from '../../src/prompts/utils';
import {
  ResultFailureReason,
  type AtomicTestCase,
  type EvaluateResult,
  type Prompt,
  type ProviderOptions,
  type ApiProvider,
} from '../../src/types';

describe('EvalResult', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(() => {
    process.env.PROMPTFOO_OUTPUT_VARS = '';
    process.env.PROMPTFOO_STRIP_TEST_VARS = '';
  });

  const mockProvider: ProviderOptions = {
    id: 'test-provider',
    label: 'Test Provider',
  };

  const mockTestCase: AtomicTestCase = {
    vars: {
      var1: 'value1',
      var2: 'value2',
      var3: 'value3',
    },
    provider: mockProvider,
  };

  const mockPrompt: Prompt = {
    raw: 'Test prompt',
    display: 'Test prompt',
    label: 'Test label',
  };

  const mockEvaluateResult: EvaluateResult = {
    promptIdx: 0,
    testIdx: 0,
    prompt: mockPrompt,
    success: true,
    score: 1,
    provider: mockProvider,
    testCase: mockTestCase,
    vars: {},
    latencyMs: 100,
    cost: 0.01,
    metadata: {},
    failureReason: ResultFailureReason.NONE,
    id: 'test-id',
    promptId: hashPrompt(mockPrompt),
    namedScores: {},
    response: undefined,
  };

  describe('sanitizeProvider', () => {
    it('should handle ApiProvider objects', () => {
      const apiProvider: ApiProvider = {
        id: () => 'test-provider',
        label: 'Test Provider',
        callApi: async () => ({ output: 'test' }),
        config: {
          apiKey: 'test-key',
        },
      };

      const result = sanitizeProvider(apiProvider);
      expect(result).toEqual({
        id: 'test-provider',
        label: 'Test Provider',
        config: {
          apiKey: 'test-key',
        },
      });
    });

    it('should handle ProviderOptions objects', () => {
      const providerOptions: ProviderOptions = {
        id: 'test-provider',
        label: 'Test Provider',
        config: {
          apiKey: 'test-key',
        },
      };

      const result = sanitizeProvider(providerOptions);
      expect(result).toEqual(providerOptions);
    });

    it('should handle generic objects with id function', () => {
      const provider = {
        id: () => 'test-provider',
        label: 'Test Provider',
        config: {
          apiKey: 'test-key',
        },
      } as ApiProvider;

      const result = sanitizeProvider(provider);
      expect(result).toEqual({
        id: 'test-provider',
        label: 'Test Provider',
        config: {
          apiKey: 'test-key',
        },
      });
    });
  });

  describe('toEvaluateResult', () => {
    it('should filter and order vars based on PROMPTFOO_OUTPUT_VARS', () => {
      process.env.PROMPTFOO_OUTPUT_VARS = 'var2,var1';
      const result = new EvalResult({
        id: 'test-id',
        evalId: 'test-eval',
        promptIdx: 0,
        testIdx: 0,
        testCase: mockTestCase,
        prompt: mockPrompt,
        success: true,
        score: 1,
        response: null,
        gradingResult: null,
        provider: mockProvider,
        failureReason: ResultFailureReason.NONE,
        namedScores: {},
      });

      const evaluateResult = result.toEvaluateResult();
      expect(Object.keys(evaluateResult.vars)).toEqual(['var2', 'var1']);
      expect(evaluateResult.vars).toEqual({
        var2: 'value2',
        var1: 'value1',
      });
    });

    it('should handle non-existent var names in PROMPTFOO_OUTPUT_VARS', () => {
      process.env.PROMPTFOO_OUTPUT_VARS = 'var2,nonexistent,var1';
      const result = new EvalResult({
        id: 'test-id',
        evalId: 'test-eval',
        promptIdx: 0,
        testIdx: 0,
        testCase: mockTestCase,
        prompt: mockPrompt,
        success: true,
        score: 1,
        response: null,
        gradingResult: null,
        provider: mockProvider,
        failureReason: ResultFailureReason.NONE,
        namedScores: {},
      });

      const evaluateResult = result.toEvaluateResult();
      expect(Object.keys(evaluateResult.vars)).toEqual(['var2', 'var1']);
    });

    it('should filter vars based on config evaluateOptions.outputVars', () => {
      const result = new EvalResult({
        id: 'test-id',
        evalId: 'test-eval',
        promptIdx: 0,
        testIdx: 0,
        testCase: mockTestCase,
        prompt: mockPrompt,
        success: true,
        score: 1,
        response: null,
        gradingResult: null,
        provider: mockProvider,
        failureReason: ResultFailureReason.NONE,
        namedScores: {},
        metadata: {
          config: {
            evaluateOptions: {
              outputVars: ['var3', 'var1'],
            },
          },
        },
      });

      const evaluateResult = result.toEvaluateResult();
      expect(Object.keys(evaluateResult.vars)).toEqual(['var3', 'var1']);
    });

    it('should prioritize PROMPTFOO_OUTPUT_VARS over config outputVars', () => {
      process.env.PROMPTFOO_OUTPUT_VARS = 'var2,var1';
      const result = new EvalResult({
        id: 'test-id',
        evalId: 'test-eval',
        promptIdx: 0,
        testIdx: 0,
        testCase: mockTestCase,
        prompt: mockPrompt,
        success: true,
        score: 1,
        response: null,
        gradingResult: null,
        provider: mockProvider,
        failureReason: ResultFailureReason.NONE,
        namedScores: {},
        metadata: {
          config: {
            evaluateOptions: {
              outputVars: ['var3', 'var1'],
            },
          },
        },
      });

      const evaluateResult = result.toEvaluateResult();
      expect(Object.keys(evaluateResult.vars)).toEqual(['var2', 'var1']);
    });

    it('should return all vars when no filtering is specified', () => {
      const result = new EvalResult({
        id: 'test-id',
        evalId: 'test-eval',
        promptIdx: 0,
        testIdx: 0,
        testCase: mockTestCase,
        prompt: mockPrompt,
        success: true,
        score: 1,
        response: null,
        gradingResult: null,
        provider: mockProvider,
        failureReason: ResultFailureReason.NONE,
        namedScores: {},
      });

      const evaluateResult = result.toEvaluateResult();
      expect(evaluateResult.vars).toEqual(mockTestCase.vars);
    });

    it('should return empty object when PROMPTFOO_STRIP_TEST_VARS is true', () => {
      process.env.PROMPTFOO_STRIP_TEST_VARS = 'true';
      process.env.PROMPTFOO_OUTPUT_VARS = 'var1,var2';

      const result = new EvalResult({
        id: 'test-id',
        evalId: 'test-eval',
        promptIdx: 0,
        testIdx: 0,
        testCase: mockTestCase,
        prompt: mockPrompt,
        success: true,
        score: 1,
        response: null,
        gradingResult: null,
        provider: mockProvider,
        failureReason: ResultFailureReason.NONE,
        namedScores: {},
      });

      const evaluateResult = result.toEvaluateResult();
      expect(evaluateResult.vars).toEqual({});
    });
  });

  describe('createFromEvaluateResult', () => {
    it('should create and persist an EvalResult', async () => {
      const evalId = 'test-eval-id';
      const result = await EvalResult.createFromEvaluateResult(evalId, mockEvaluateResult);

      expect(result).toBeInstanceOf(EvalResult);
      expect(result.evalId).toBe(evalId);
      expect(result.promptId).toBe(hashPrompt(mockPrompt));
      expect(result.persisted).toBe(true);

      const retrieved = await EvalResult.findById(result.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.score).toBe(mockEvaluateResult.score);
    });

    it('should create without persisting when persist option is false', async () => {
      const evalId = 'test-eval-id';
      const result = await EvalResult.createFromEvaluateResult(evalId, mockEvaluateResult, {
        persist: false,
      });

      expect(result).toBeInstanceOf(EvalResult);
      expect(result.persisted).toBe(false);

      const retrieved = await EvalResult.findById(result.id);
      expect(retrieved).toBeNull();
    });

    it('should properly handle circular references in provider', async () => {
      const evalId = 'test-eval-id';
      const circularProvider: ProviderOptions = {
        id: 'test-provider',
        label: 'Test Provider',
        config: {
          circular: undefined as any,
        },
      };
      circularProvider.config.circular = circularProvider;

      const testCaseWithCircular: AtomicTestCase = {
        ...mockTestCase,
        provider: circularProvider,
      };

      const resultWithCircular = await EvalResult.createFromEvaluateResult(
        evalId,
        {
          ...mockEvaluateResult,
          provider: circularProvider,
          testCase: testCaseWithCircular,
        },
        { persist: true },
      );

      expect(resultWithCircular.provider).toEqual({
        id: 'test-provider',
        label: 'Test Provider',
        config: {
          circular: {
            id: 'test-provider',
            label: 'Test Provider',
          },
        },
      });

      const retrieved = await EvalResult.findById(resultWithCircular.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.provider).toEqual({
        id: 'test-provider',
        label: 'Test Provider',
        config: {
          circular: {
            id: 'test-provider',
            label: 'Test Provider',
          },
        },
      });
    });
  });

  describe('findManyByEvalId', () => {
    it('should retrieve multiple results for an eval ID', async () => {
      const evalId = 'test-eval-id-multiple';

      await EvalResult.createFromEvaluateResult(evalId, {
        ...mockEvaluateResult,
        testIdx: 0,
        testCase: mockTestCase,
      });

      await EvalResult.createFromEvaluateResult(evalId, {
        ...mockEvaluateResult,
        testIdx: 1,
        testCase: mockTestCase,
      });

      const results = await EvalResult.findManyByEvalId(evalId);
      expect(results).toHaveLength(2);
      expect(results[0]).toBeInstanceOf(EvalResult);
      expect(results[1]).toBeInstanceOf(EvalResult);
    });

    it('should filter by testIdx when provided', async () => {
      const evalId = 'test-eval-id-filter';

      await EvalResult.createFromEvaluateResult(evalId, {
        ...mockEvaluateResult,
        testIdx: 0,
        testCase: mockTestCase,
      });

      await EvalResult.createFromEvaluateResult(evalId, {
        ...mockEvaluateResult,
        testIdx: 1,
        testCase: mockTestCase,
      });

      const results = await EvalResult.findManyByEvalId(evalId, { testIdx: 0 });
      expect(results).toHaveLength(1);
      expect(results[0].testIdx).toBe(0);
    });
  });

  describe('save', () => {
    it('should save new results', async () => {
      const result = new EvalResult({
        id: 'test-save-id',
        evalId: 'test-eval-id',
        promptIdx: 0,
        testIdx: 0,
        testCase: mockTestCase,
        prompt: mockPrompt,
        success: true,
        score: 1,
        response: null,
        gradingResult: null,
        provider: mockProvider,
        failureReason: ResultFailureReason.NONE,
        namedScores: {},
      });

      await result.save();
      expect(result.persisted).toBe(true);

      const retrieved = await EvalResult.findById(result.id);
      expect(retrieved).not.toBeNull();
    });

    it('should update existing results', async () => {
      const result = await EvalResult.createFromEvaluateResult('test-eval-id', mockEvaluateResult);

      result.score = 0.5;
      await result.save();

      const retrieved = await EvalResult.findById(result.id);
      expect(retrieved?.score).toBe(0.5);
    });
  });
});
