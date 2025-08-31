import { RedteamGraderBase } from '../../../src/redteam/plugins/base';
import { PolicyPlugin, PolicyViolationGrader } from '../../../src/redteam/plugins/policy';

import type { ApiProvider, AtomicTestCase } from '../../../src/types';

describe('PolicyPlugin', () => {
  const mockProvider: ApiProvider = {
    id: () => 'test-provider',
    callApi: jest.fn().mockResolvedValue({ output: 'test output' }),
  };

  const mockPurpose = 'Test purpose';
  const mockInjectVar = 'test-var';
  const mockPolicy = 'Test policy';

  afterEach(() => {
    jest.resetAllMocks();
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

    expect(tests).toEqual([
      expect.objectContaining({
        vars: expect.objectContaining({
          [mockInjectVar]: expect.any(String),
        }),
        metadata: expect.objectContaining({
          policy: mockPolicy,
        }),
      }),
    ]);
  });

  it('should generate tests with correct template and call provider', async () => {
    const plugin = new PolicyPlugin(mockProvider, mockPurpose, mockInjectVar, {
      policy: mockPolicy,
    });

    const mockApiResponse = { output: 'Prompt: Test generated prompt' };
    jest.mocked(mockProvider.callApi).mockResolvedValueOnce(mockApiResponse);

    const tests = await plugin.generateTests(1, 0);

    expect(tests[0].vars).toHaveProperty(mockInjectVar);
    expect(mockProvider.callApi).toHaveBeenCalledWith(expect.stringContaining(mockPolicy));
    expect(mockProvider.callApi).toHaveBeenCalledWith(expect.stringContaining(mockPurpose));
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

    expect(assertions).toEqual([
      expect.objectContaining({
        type: 'promptfoo:redteam:policy',
        metric: 'PolicyViolation',
      }),
    ]);
  });

  it('should generate template with correct formatting instructions', async () => {
    const plugin = new PolicyPlugin(mockProvider, mockPurpose, mockInjectVar, {
      policy: mockPolicy,
    });
    const template = await (plugin as any).getTemplate();

    expect(template).toContain('FORMATTING:');
    expect(template).toContain('PromptBlock: ');
    expect(template).toContain('Prompt: ');
    expect(template).toContain('No explanations or commentary');
    expect(template).toContain('Generate {{n}}');
    expect(template).toContain(mockPurpose);
    expect(template).toContain(mockPolicy);
  });
});

describe('PolicyViolationGrader', () => {
  const mockProvider = {
    id: () => 'test-provider',
    callApi: jest.fn(),
  } as unknown as ApiProvider;

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should initialize with correct properties', () => {
    const grader = new PolicyViolationGrader();

    expect({
      id: grader.id,
      hasSystemPurpose: grader.rubric.includes('<system_purpose>'),
      hasPolicy: grader.rubric.includes('<policy>'),
      hasAssessmentCriteria: grader.rubric.includes('Assessment criteria:'),
    }).toEqual({
      id: 'promptfoo:redteam:policy',
      hasSystemPurpose: true,
      hasPolicy: true,
      hasAssessmentCriteria: true,
    });
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

    jest.spyOn(RedteamGraderBase.prototype, 'getResult').mockResolvedValueOnce({
      grade: { score: 1, reason: 'No violation', passed: true, pass: true },
      rubric: 'No specific policy provided',
    } as any);

    const result = await grader.getResult(
      'test prompt',
      'test output',
      testWithoutPolicy,
      mockProvider,
    );

    expect(result).toEqual({
      grade: expect.objectContaining({
        score: 1,
        reason: 'No violation',
        passed: true,
        pass: true,
      }),
      rubric: 'No specific policy provided',
    });
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

    jest.spyOn(RedteamGraderBase.prototype, 'getResult').mockResolvedValueOnce({
      grade: { score: 1, reason: 'No violation', passed: true, pass: true },
      rubric: `Rubric for policy: ${testWithExtraMetadata.metadata?.policy}`,
    } as any);

    const result = await grader.getResult(
      'test prompt',
      'test output',
      testWithExtraMetadata,
      mockProvider,
    );

    expect(result.grade).toBeDefined();
    expect(testWithExtraMetadata.metadata).toEqual(
      expect.objectContaining({
        policy: 'test policy',
        purpose: 'test purpose',
        extraField: 'extra value',
      }),
    );
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
      .spyOn(RedteamGraderBase.prototype, 'getResult')
      .mockRejectedValueOnce(new Error('Grading failed'));

    await expect(
      grader.getResult('test prompt', 'test output', testCase, mockProvider),
    ).rejects.toThrow('Grading failed');
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

    jest.spyOn(RedteamGraderBase.prototype, 'getResult').mockResolvedValueOnce({
      grade: { score: 1, reason: 'Empty output', passed: true, pass: true },
      rubric: 'Some rubric',
    } as any);

    const result = await grader.getResult('test prompt', '', testCase, mockProvider);

    expect(result).toEqual({
      grade: expect.objectContaining({
        score: 1,
        reason: 'Empty output',
        passed: true,
        pass: true,
      }),
      rubric: 'Some rubric',
    });
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
      .mockResolvedValueOnce({
        grade: { score: 0, reason: 'Violated', passed: false, pass: false },
        rubric: 'rubric',
      } as any);

    const result = await grader.getResult('prompt', 'output', testCase, mockProvider);

    expect(result).toEqual({
      grade: expect.objectContaining({
        score: 0,
        reason: 'Violated',
        passed: false,
        pass: false,
      }),
      rubric: 'rubric',
    });
    expect(superGetResult).toHaveBeenCalledWith(
      'prompt',
      'output',
      expect.objectContaining({
        metadata: expect.objectContaining({
          policy: 'test policy',
          purpose: 'test purpose',
        }),
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
      .mockResolvedValueOnce({
        grade: { score: 1, reason: 'No violation', passed: true, pass: true },
        rubric: 'No specific policy provided',
      } as any);

    const result = await grader.getResult('prompt', 'output', testCase, mockProvider);

    expect(result).toEqual({
      grade: expect.objectContaining({
        score: 1,
        reason: 'No violation',
        passed: true,
        pass: true,
      }),
      rubric: 'No specific policy provided',
    });
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
