import { runAssertions } from '../../src/assertions';
import { EchoProvider } from '../../src/providers/echo';
import { loadApiProvider } from '../../src/providers/index';
import { VariableOptimizerProvider } from '../../src/providers/variableOptimizer';

jest.mock('../../src/assertions', () => ({
  runAssertions: jest.fn(),
}));

// Mock loadApiProvider to return our controlled improver
jest.mock('../../src/providers/index', () => ({
  loadApiProvider: jest.fn(),
}));

const mockedRun = jest.mocked(runAssertions);
const mockedLoadApiProvider = jest.mocked(loadApiProvider);

describe('VariableOptimizerProvider', () => {
  let mockImprover: jest.Mocked<any>;

  beforeEach(() => {
    mockedRun.mockReset();

    // Create a mock improver that returns better values
    mockImprover = {
      callApi: jest.fn(),
      id: () => 'mock-improver',
    };

    mockedLoadApiProvider.mockResolvedValue(mockImprover);
  });

  it('optimizes variable values until assertions pass', async () => {
    mockedRun
      .mockResolvedValueOnce({ pass: false, score: 0, reason: 'Translation not found' })
      .mockResolvedValueOnce({ pass: true, score: 1, reason: 'All assertions passed' });

    // Mock improver to suggest better value in JSON format with candidates array
    mockImprover.callApi.mockResolvedValue({
      output: JSON.stringify({ candidates: ['Bonjour le monde'] }),
    });

    const provider = new VariableOptimizerProvider({
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
      stallIterations: 5, // Default value from implementation
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
    const provider = new VariableOptimizerProvider({
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

    const provider = new VariableOptimizerProvider({ config: {} });
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
    // First iteration: score 0.5 (best so far)
    // Second iteration: score 0.4 (worse - stall count = 1)
    // Third iteration: score 0.3 (worse - stall count = 2)
    // Fourth iteration: score 0.2 (worse - stall count = 3)
    // Fifth iteration: score 0.1 (worse - stall count = 4)
    // Sixth iteration: score 0.0 (worse - stall count = 5, should stop)
    mockedRun
      .mockResolvedValueOnce({ pass: false, score: 0.5, reason: 'not good enough' })
      .mockResolvedValueOnce({ pass: false, score: 0.4, reason: 'worse' })
      .mockResolvedValueOnce({ pass: false, score: 0.3, reason: 'even worse' })
      .mockResolvedValueOnce({ pass: false, score: 0.2, reason: 'still worse' })
      .mockResolvedValueOnce({ pass: false, score: 0.1, reason: 'very bad' })
      .mockResolvedValueOnce({ pass: false, score: 0.0, reason: 'terrible' });

    // Mock improver to return JSON candidates
    mockImprover.callApi
      .mockResolvedValueOnce({ output: JSON.stringify({ candidates: ['attempt 1'] }) })
      .mockResolvedValueOnce({ output: JSON.stringify({ candidates: ['attempt 2'] }) })
      .mockResolvedValueOnce({ output: JSON.stringify({ candidates: ['attempt 3'] }) })
      .mockResolvedValueOnce({ output: JSON.stringify({ candidates: ['attempt 4'] }) })
      .mockResolvedValueOnce({ output: JSON.stringify({ candidates: ['attempt 5'] }) });

    const provider = new VariableOptimizerProvider({
      config: {
        maxTurns: 10,
        stallIterations: 5, // Should stop after 5 iterations without improvement
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

    // Should stop after 6 attempts due to stalling (5 consecutive worse scores after the first)
    expect(mockedRun).toHaveBeenCalledTimes(6);
    expect(result.metadata?.promptOptimizer.iterations).toBe(6);
    expect(result.metadata?.promptOptimizer.succeeded).toBe(false);
    expect(result.metadata?.promptOptimizer.finalScore).toBe(0.5); // Best score from first iteration
    expect(result.metadata?.promptOptimizer.history).toHaveLength(6);

    // Original vars should be updated to best attempt (first iteration)
    expect(context.vars.text).toBe('original'); // First iteration had best score
  });

  it('generates multiple candidates and selects the best one', async () => {
    mockedRun
      .mockResolvedValueOnce({ pass: false, score: 0, reason: 'Initial failure' })
      .mockResolvedValueOnce({ pass: false, score: 0.3, reason: 'Candidate 1 partial' })
      .mockResolvedValueOnce({ pass: false, score: 0.7, reason: 'Candidate 2 better' })
      .mockResolvedValueOnce({ pass: true, score: 1.0, reason: 'Candidate 3 success' });

    // Mock improver to return multiple candidates
    mockImprover.callApi.mockResolvedValue({
      output: JSON.stringify({
        candidates: ['candidate1', 'candidate2', 'candidate3'],
      }),
    });

    const provider = new VariableOptimizerProvider({
      config: {
        maxTurns: 3,
        targetVariable: 'text',
        improverModel: 'openai:gpt-4o',
        numCandidates: 3,
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

    // Should test original + 3 candidates = 4 total calls
    expect(mockedRun).toHaveBeenCalledTimes(4);
    expect(result.metadata?.promptOptimizer.succeeded).toBe(true);
    expect(result.metadata?.promptOptimizer.optimizedValue).toBe('candidate3');
    expect(result.metadata?.promptOptimizer.finalScore).toBe(1.0);

    expect(mockImprover.callApi).toHaveBeenCalledTimes(1);
  });
});
