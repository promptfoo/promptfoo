import { PiiGrader, getPiiLeakTestsForCategory } from '../../../src/redteam/plugins/pii';
import type { PluginActionParams } from '../../../src/types';

describe('PiiGrader', () => {
  let grader: PiiGrader;

  beforeEach(() => {
    grader = new PiiGrader();
  });

  it('should have correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:pii');
  });

  it('should render rubric with variables', () => {
    const vars = {
      prompt: 'test prompt',
      purpose: 'test purpose',
      entities: ['entity1', 'entity2'],
    };

    const renderedRubric = grader.renderRubric(vars);

    expect(renderedRubric).toContain('test prompt');
    expect(renderedRubric).toContain('test purpose');
    expect(renderedRubric).toContain('entity1');
    expect(renderedRubric).toContain('entity2');
  });

  it('should render rubric without entities', () => {
    const vars = {
      prompt: 'test prompt',
      purpose: 'test purpose',
    };

    const renderedRubric = grader.renderRubric(vars);

    expect(renderedRubric).toContain('test prompt');
    expect(renderedRubric).toContain('test purpose');
    expect(renderedRubric).not.toContain('AllowedEntities');
  });
});

describe('getPiiLeakTestsForCategory', () => {
  const mockProvider = {
    callApi: jest.fn(),
  };

  const params: PluginActionParams = {
    provider: mockProvider as any,
    purpose: 'test purpose',
    injectVar: 'prompt',
    n: 2,
    delayMs: 0,
    config: {
      examples: ['Example 1', 'Example 2'],
    },
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should generate test cases for valid category', async () => {
    mockProvider.callApi.mockResolvedValue({
      output: 'Prompt: Test prompt 1\nPrompt: Test prompt 2',
    });

    const result = await getPiiLeakTestsForCategory(params, 'pii:direct');

    expect(result[0]!.vars!.prompt).toBe('Test prompt 1');
    expect(result[1]!.vars!.prompt).toBe('Test prompt 2');
    expect(result[0]!.assert![0]!.type).toBe('promptfoo:redteam:pii');
    expect(result[0]!.assert![0]!.metric).toBe('PIILeak');
  });

  it('should throw error for invalid category', async () => {
    await expect(getPiiLeakTestsForCategory(params, 'invalid')).rejects.toThrow(
      'Category invalid not found',
    );
  });

  it('should handle empty provider response', async () => {
    mockProvider.callApi.mockResolvedValue({
      output: '',
    });

    const result = await getPiiLeakTestsForCategory(params, 'pii:direct');
    expect(result).toHaveLength(0);
  });

  it('should handle non-string provider response', async () => {
    mockProvider.callApi.mockResolvedValue({
      output: { foo: 'bar' },
    });

    const result = await getPiiLeakTestsForCategory(params, 'pii:direct');
    expect(result).toHaveLength(0);
  });

  it('should filter out non-prompt lines', async () => {
    mockProvider.callApi.mockResolvedValue({
      output: 'Some text\nPrompt: Test prompt\nOther text',
    });

    const result = await getPiiLeakTestsForCategory(params, 'pii:direct');
    expect(result).toHaveLength(1);
    expect(result[0]!.vars!.prompt).toBe('Test prompt');
  });
});
