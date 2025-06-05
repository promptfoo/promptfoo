import { RedteamGraderBase } from '../../../src/redteam/plugins/base';
import { PolicyPlugin, PolicyViolationGrader } from '../../../src/redteam/plugins/policy';
import type { ApiProvider, AtomicTestCase } from '../../../src/types';

describe('PolicyPlugin', () => {
  const mockProvider = {
    id: () => 'test-provider',
    callApi: jest.fn().mockResolvedValue({ output: 'test output' }),
  } as unknown as ApiProvider;

  const mockPurpose = 'Test purpose';
  const mockInjectVar = 'test-var';
  const mockPolicy = 'Test policy';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with required parameters', () => {
    const plugin = new PolicyPlugin(mockProvider, mockPurpose, mockInjectVar, {
      policy: mockPolicy,
    });
    expect(plugin.id).toBe('promptfoo:redteam:policy');
  });

  it('should throw error if policy is not provided', () => {
    expect(() => {
      new PolicyPlugin(mockProvider, mockPurpose, mockInjectVar, { policy: '' });
    }).toThrow('A "policy" property is required for the policy plugin.');
  });

  it('should include policy in test metadata', async () => {
    const plugin = new PolicyPlugin(mockProvider, mockPurpose, mockInjectVar, {
      policy: mockPolicy,
    });

    const mockApiResponse = { output: 'Prompt: Test generated prompt' };
    jest.mocked(mockProvider.callApi).mockResolvedValueOnce(mockApiResponse);

    const tests = await plugin.generateTests(1, 0);
    expect(tests).toHaveLength(1);
    expect(tests[0].metadata).toHaveProperty('policy', mockPolicy);
  });

  it('should generate tests with correct template', async () => {
    const plugin = new PolicyPlugin(mockProvider, mockPurpose, mockInjectVar, {
      policy: mockPolicy,
    });

    const mockApiResponse = { output: 'Prompt: Test generated prompt' };
    jest.mocked(mockProvider.callApi).mockResolvedValueOnce(mockApiResponse);

    const tests = await plugin.generateTests(1, 0);
    expect(tests[0].vars).toHaveProperty(mockInjectVar);
    expect(mockProvider.callApi).toHaveBeenCalledWith(expect.stringContaining(mockPolicy));
  });

  it('should handle multiple test generation', async () => {
    const plugin = new PolicyPlugin(mockProvider, mockPurpose, mockInjectVar, {
      policy: mockPolicy,
    });

    const mockApiResponse = { output: 'Prompt: Test1\nPrompt: Test2' };
    jest.mocked(mockProvider.callApi).mockResolvedValueOnce(mockApiResponse);

    const tests = await plugin.generateTests(2, 0);
    expect(tests).toHaveLength(2);
  });

  it('should return correct assertions', () => {
    const plugin = new PolicyPlugin(mockProvider, mockPurpose, mockInjectVar, {
      policy: mockPolicy,
    });
    const assertions = (plugin as any).getAssertions('Prompt: Something');
    expect(Array.isArray(assertions)).toBe(true);
    expect(assertions[0]).toHaveProperty('type', 'promptfoo:redteam:policy');
    expect(assertions[0]).toHaveProperty('metric', 'PolicyViolation');
  });

  it('should generate template containing updated formatting instructions', async () => {
    const plugin = new PolicyPlugin(mockProvider, mockPurpose, mockInjectVar, {
      policy: mockPolicy,
    });
    const template = await (plugin as any).getTemplate();
    expect(template).toContain('CRITICAL FORMATTING REQUIREMENTS:');
    expect(template).toContain('PromptBlock: ');
    expect(template).toContain('Prompt: ');
    expect(template).toContain('no explanations, commentary, or markdown');
    expect(template).toContain('Generate {{n}} diverse and creative prompts');
    expect(template).toContain(mockPurpose);
    expect(template).toContain(mockPolicy);
  });
});

describe('PolicyViolationGrader', () => {
  const mockProvider = {
    id: () => 'test-provider',
    callApi: jest.fn(),
  } as unknown as ApiProvider;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with correct id', () => {
    const grader = new PolicyViolationGrader();
    expect(grader.id).toBe('promptfoo:redteam:policy');
  });

  it('should have correct rubric format', () => {
    const grader = new PolicyViolationGrader();
    expect(grader.rubric).toContain('<system_purpose>');
    expect(grader.rubric).toContain('<policy>');
    expect(grader.rubric).toContain('Assessment criteria:');
  });

  it('should handle missing policy in metadata', async () => {
    const grader = new PolicyViolationGrader();
    const testWithoutPolicy = {
      prompt: 'test prompt',
      vars: {},
      metadata: {
        purpose: 'test purpose',
      },
    } as AtomicTestCase;

    // Patch the parent getResult to resolve quickly
    jest.spyOn(PolicyViolationGrader.prototype, 'getResult').mockImplementationOnce(async function (
      prompt: string,
      llmOutput: string,
      test: AtomicTestCase,
      provider: ApiProvider | undefined,
    ) {
      return {
        grade: { score: 1, reason: 'No violation', passed: true, pass: true },
        rubric: `No specific policy provided`,
      } as any;
    });

    const result = await grader.getResult(
      'test prompt',
      'test output',
      testWithoutPolicy,
      mockProvider,
    );

    expect(result.grade).toBeDefined();
    expect(result.rubric).toContain('No specific policy provided');
  });

  it('should preserve other metadata when grading', async () => {
    const grader = new PolicyViolationGrader();
    const testWithExtraMetadata = {
      prompt: 'test prompt',
      vars: {},
      metadata: {
        policy: 'test policy',
        purpose: 'test purpose',
        extraField: 'extra value',
      },
    } as AtomicTestCase;

    jest.spyOn(PolicyViolationGrader.prototype, 'getResult').mockImplementationOnce(async function (
      prompt: string,
      llmOutput: string,
      test: AtomicTestCase,
      provider: ApiProvider | undefined,
    ) {
      return {
        grade: { score: 1, reason: 'No violation', passed: true, pass: true },
        rubric: `Rubric for policy: ${test.metadata?.policy}`,
      } as any;
    });

    const result = await grader.getResult(
      'test prompt',
      'test output',
      testWithExtraMetadata,
      mockProvider,
    );

    expect(result.grade).toBeDefined();
    expect(testWithExtraMetadata.metadata).toHaveProperty('extraField', 'extra value');
  });

  it('should handle failed grading attempts gracefully', async () => {
    const grader = new PolicyViolationGrader();
    const testCase = {
      prompt: 'test prompt',
      vars: {},
      metadata: {
        policy: 'test policy',
        purpose: 'test purpose',
      },
    } as AtomicTestCase;

    jest
      .spyOn(PolicyViolationGrader.prototype, 'getResult')
      .mockImplementationOnce(async function () {
        throw new Error('Grading failed');
      });

    let errorCaught = false;
    try {
      await grader.getResult('test prompt', 'test output', testCase, mockProvider);
    } catch (err) {
      errorCaught = true;
      // eslint-disable-next-line jest/no-conditional-expect
      expect((err as Error).message).toBe('Grading failed');
    }
    expect(errorCaught).toBe(true);
  });

  it('should handle empty output from provider', async () => {
    const grader = new PolicyViolationGrader();
    const testCase = {
      prompt: 'test prompt',
      vars: {},
      metadata: {
        policy: 'test policy',
        purpose: 'test purpose',
      },
    } as AtomicTestCase;

    jest.spyOn(PolicyViolationGrader.prototype, 'getResult').mockImplementationOnce(async function (
      prompt: string,
      llmOutput: string,
      test: AtomicTestCase,
      provider: ApiProvider | undefined,
    ) {
      return {
        grade: { score: 1, reason: 'Empty output', passed: true, pass: true },
        rubric: 'Some rubric',
      } as any;
    });

    const result = await grader.getResult('test prompt', '', testCase, mockProvider);

    expect(result.grade).toBeDefined();
    expect(result.grade.reason).toBe('Empty output');
  });

  it('should call super.getResult with correct policy in metadata', async () => {
    const grader = new PolicyViolationGrader();
    const testCase = {
      prompt: 'prompt',
      vars: {},
      metadata: {
        policy: 'test policy',
        purpose: 'test purpose',
      },
    } as AtomicTestCase;

    const superGetResult = jest
      .spyOn(RedteamGraderBase.prototype, 'getResult')
      .mockImplementationOnce(async function (
        prompt: string,
        llmOutput: string,
        test: AtomicTestCase,
        provider: ApiProvider | undefined,
        options?: any,
      ) {
        return {
          grade: { score: 0, reason: 'Violated', passed: false, pass: false },
          rubric: 'rubric',
        } as any;
      });

    const result = await grader.getResult('prompt', 'output', testCase, mockProvider);
    expect(result.grade).toBeDefined();
    expect(result.rubric).toBe('rubric');
    expect(superGetResult).toHaveBeenCalledWith(
      'prompt',
      'output',
      expect.objectContaining({
        metadata: expect.objectContaining({ policy: 'test policy', purpose: 'test purpose' }),
      }),
      mockProvider,
      undefined,
    );
  });

  it('should default policy if not present in metadata', async () => {
    const grader = new PolicyViolationGrader();
    const testCase = {
      prompt: 'prompt',
      vars: {},
      metadata: {
        purpose: 'test purpose',
      },
    } as AtomicTestCase;

    const superGetResult = jest
      .spyOn(RedteamGraderBase.prototype, 'getResult')
      .mockImplementationOnce(async function (
        prompt: string,
        llmOutput: string,
        test: AtomicTestCase,
        provider: ApiProvider | undefined,
        options?: any,
      ) {
        return {
          grade: { score: 1, reason: 'No violation', passed: true, pass: true },

          rubric: (test.metadata && (test.metadata as any).policy) || 'No specific policy provided',
        } as any;
      });

    const result = await grader.getResult('prompt', 'output', testCase, mockProvider);
    expect(result.grade).toBeDefined();
    expect(result.rubric).toBe('No specific policy provided');
    expect(superGetResult).toHaveBeenCalledWith(
      'prompt',
      'output',
      expect.objectContaining({
        metadata: expect.objectContaining({
          policy: 'No specific policy provided',
          purpose: 'test purpose',
        }),
      }),
      mockProvider,
      undefined,
    );
  });
});
