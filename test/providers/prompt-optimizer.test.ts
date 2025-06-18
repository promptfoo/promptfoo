import { runAssertions } from '../../src/assertions';
import { EchoProvider } from '../../src/providers/echo';
import { PromptOptimizerProvider } from '../../src/providers/prompt-optimizer';

jest.mock('../../src/assertions', () => ({
  runAssertions: jest.fn(),
}));

// Mock loadApiProvider to return our controlled improver
jest.mock('../../src/providers/index', () => ({
  loadApiProvider: jest.fn(),
}));

const mockedRun = jest.mocked(runAssertions);
const { loadApiProvider } = require('../../src/providers/index');

describe('PromptOptimizerProvider', () => {
  let mockImprover: jest.Mocked<any>;

  beforeEach(() => {
    mockedRun.mockReset();

    // Create a mock improver that returns better values
    mockImprover = {
      callApi: jest.fn(),
      id: () => 'mock-improver',
    };

    loadApiProvider.mockResolvedValue(mockImprover);
  });

  it('optimizes variable values until assertions pass', async () => {
    mockedRun
      .mockResolvedValueOnce({ pass: false, score: 0, reason: 'Translation not found' })
      .mockResolvedValueOnce({ pass: true, score: 1, reason: 'All assertions passed' });

    // Mock improver to suggest better value
    mockImprover.callApi.mockResolvedValue({ output: 'Bonjour le monde' });

    const provider = new PromptOptimizerProvider({
      config: {
        maxTurns: 3,
        targetVariable: 'text',
        improverModel: 'openai:gpt-4o',
      },
    });

    const target = new EchoProvider();
    const context = {
      originalProvider: target,
      prompt: { raw: 'Translate {{text}} to French', label: 'test-prompt' },
      vars: { text: 'Hello world' },
      test: { assert: [{ type: 'contains', value: 'Bonjour' }] } as any,
    };

    const result = await provider.callApi('Translate {{text}} to French', context);

    expect(mockedRun).toHaveBeenCalledTimes(2);
    
    // Check that original vars were updated
    expect(context.vars.text).toBe('Bonjour le monde');
    
    // Check new structured metadata
    expect(result.metadata?.promptOptimizer).toEqual({
      originalValue: 'Hello world',
      optimizedValue: 'Bonjour le monde',
      targetVariable: 'text',
      iterations: 2,
      finalScore: 1,
      succeeded: true,
      stallIterations: 2,
      maxTurns: 3,
      history: [
        {
          iteration: 1,
          text: 'Hello world',
          output: expect.any(String),
          score: 0,
          reason: 'Translation not found',
          success: false,
        },
        {
          iteration: 2,
          text: 'Bonjour le monde',
          output: expect.any(String),
          score: 1,
          reason: 'All assertions passed',
          success: true,
        },
      ],
    });
    
    // Check legacy metadata still exists
    expect(result.metadata?.optimizationHistory).toHaveLength(2);
    expect(result.metadata?.finalVars).toEqual({ text: 'Bonjour le monde' });
    expect(result.metadata?.optimizedVariable).toBe('text');
    
    expect(mockImprover.callApi).toHaveBeenCalledTimes(1);
  });

  it('handles missing target variable', async () => {
    const provider = new PromptOptimizerProvider({
      config: { targetVariable: 'missing' },
    });

    const target = new EchoProvider();

    await expect(
      provider.callApi('Test {{text}}', {
        originalProvider: target,
        prompt: { raw: 'Test {{text}}', label: 'test-prompt' },
        vars: { text: 'Hello' },
        test: { assert: [] } as any,
      }),
    ).rejects.toThrow('Target variable "missing" not found in test vars');
  });

  it('uses default target variable "text" when not specified', async () => {
    mockedRun.mockResolvedValue({ pass: true, score: 1, reason: 'passed' });

    const provider = new PromptOptimizerProvider({ config: {} });
    const target = new EchoProvider();

    const result = await provider.callApi('Test {{text}}', {
      originalProvider: target,
      prompt: { raw: 'Test {{text}}', label: 'test-prompt' },
      vars: { text: 'Hello' },
      test: { assert: [] } as any,
    });

    expect(result.metadata?.promptOptimizer.targetVariable).toBe('text');
    expect(result.metadata?.optimizedVariable).toBe('text');
  });

  it('stops optimization when stalled and records metadata correctly', async () => {
    mockedRun
      .mockResolvedValueOnce({ pass: false, score: 0.5, reason: 'not good enough' })
      .mockResolvedValueOnce({ pass: false, score: 0.4, reason: 'worse' })
      .mockResolvedValueOnce({ pass: false, score: 0.3, reason: 'even worse' });

    mockImprover.callApi
      .mockResolvedValueOnce({ output: 'attempt 1' })
      .mockResolvedValueOnce({ output: 'attempt 2' });

    const provider = new PromptOptimizerProvider({
      config: {
        maxTurns: 5,
        stallIterations: 2,
        targetVariable: 'text',
        improverModel: 'openai:gpt-4o',
      },
    });

    const target = new EchoProvider();
    const context = {
      originalProvider: target,
      prompt: { raw: 'Test {{text}}', label: 'test-prompt' },
      vars: { text: 'original' },
      test: { assert: [{ type: 'contains', value: 'target' }] } as any,
    };

    const result = await provider.callApi('Test {{text}}', context);

    // Should stop after 3 attempts due to stalling (2 worse scores)
    expect(mockedRun).toHaveBeenCalledTimes(3);
    expect(result.metadata?.promptOptimizer.iterations).toBe(3);
    expect(result.metadata?.promptOptimizer.succeeded).toBe(false);
    expect(result.metadata?.promptOptimizer.finalScore).toBe(0.5);
    expect(result.metadata?.promptOptimizer.history).toHaveLength(3);
    
    // Original vars should be updated to best attempt
    expect(context.vars.text).toBe('original'); // First iteration had best score
  });
});
