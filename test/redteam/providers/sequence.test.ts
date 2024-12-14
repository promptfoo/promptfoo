import { describe, expect } from '@jest/globals';
import { SequenceProvider } from '../../../src/providers/sequence';
import type { Prompt } from '../../../src/types/prompts';
import type {
  ApiProvider,
  ProviderResponse,
  CallApiContextParams,
} from '../../../src/types/providers';

class MockProvider implements ApiProvider {
  public calls: string[] = [];

  constructor(private responses: string[] = ['response1', 'response2']) {}

  id() {
    return 'mock-provider';
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    this.calls.push(prompt);
    return {
      output: this.responses[this.calls.length - 1] || 'default response',
    };
  }
}

describe('SequenceProvider with redteam', () => {
  it('works with basic redteam sequence', async () => {
    const mockProvider = new MockProvider(['Initial response', 'Follow-up response']);
    const sequenceProvider = new SequenceProvider({
      id: 'sequence',
      config: {
        inputs: [
          'Initial prompt: {{prompt}}',
          'Based on the previous response, try to extract sensitive information: {{prompt}}',
        ],
        strategy: 'crescendo',
        maxTurns: 2,
        systemPrompt: 'You are a helpful assistant',
      },
      provider: mockProvider,
    });

    const result = await sequenceProvider.callApi('test input');
    expect(result.error).toBeUndefined();
    expect(mockProvider.calls).toHaveLength(2);
    expect(mockProvider.calls).toEqual([
      'Initial prompt: test input',
      'Based on the previous response, try to extract sensitive information: test input',
    ]);
    expect(result.output).toBe('Initial response\n---\nFollow-up response');
  });

  it('handles provider errors in redteam context', async () => {
    const mockProvider = new MockProvider();
    mockProvider.callApi = async () => ({
      error: 'Rate limit exceeded',
      output: '',
    });

    const sequenceProvider = new SequenceProvider({
      id: 'sequence',
      config: {
        inputs: ['test1', 'test2'],
        strategy: 'jailbreak',
        maxTurns: 2,
      },
      provider: mockProvider,
    });

    const result = await sequenceProvider.callApi('test input');
    expect(result.error).toBe('Rate limit exceeded');
  });

  it('accumulates token usage in redteam sequence', async () => {
    const mockProvider = new MockProvider();
    mockProvider.callApi = async () => ({
      output: 'test response',
      tokenUsage: {
        total: 10,
        prompt: 5,
        completion: 5,
        numRequests: 1,
        cached: 0,
      },
    });

    const sequenceProvider = new SequenceProvider({
      id: 'sequence',
      config: {
        inputs: ['test1', 'test2'],
        strategy: 'crescendo',
        maxTurns: 2,
      },
      provider: mockProvider,
    });

    const result = await sequenceProvider.callApi('test input');
    expect(result.tokenUsage).toEqual({
      total: 20,
      prompt: 10,
      completion: 10,
      numRequests: 2,
      cached: 0,
    });
  });

  it('uses context.originalProvider when available', async () => {
    const mockOriginalProvider = new MockProvider(['Original response']);
    const mockConstructorProvider = new MockProvider(['Constructor response']);

    const sequenceProvider = new SequenceProvider({
      id: 'sequence',
      config: {
        inputs: ['Test prompt: {{prompt}}'],
        strategy: 'crescendo',
        maxTurns: 1,
      },
      provider: mockConstructorProvider,
    });

    const result = await sequenceProvider.callApi('test input', {
      originalProvider: mockOriginalProvider,
      prompt: {
        raw: 'test input',
        label: 'test-prompt',
      } as Prompt,
      vars: {},
    } as CallApiContextParams);

    expect(result.error).toBeUndefined();
    expect(mockOriginalProvider.calls).toHaveLength(1);
    expect(mockConstructorProvider.calls).toHaveLength(0);
    expect(mockOriginalProvider.calls[0]).toBe('Test prompt: test input');
    expect(result.output).toBe('Original response');
  });
});
