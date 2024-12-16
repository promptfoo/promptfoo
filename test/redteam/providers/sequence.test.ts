import { describe, expect } from '@jest/globals';
import { SequenceProvider } from '../../../src/providers/sequence';
import type { ApiProvider, ProviderResponse, CallApiContextParams } from '../../../src/types/providers';
import type { Prompt } from '../../../src/types/prompts';

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

describe('SequenceProvider', () => {
  it('works with basic sequence', async () => {
    const mockProvider = new MockProvider(['Initial response', 'Follow-up response']);
    const sequenceProvider = new SequenceProvider({
      id: 'sequence',
      config: {
        inputs: [
          'Initial prompt: {{prompt}}',
          'Based on the previous response, do this: {{prompt}}',
        ],
        provider: mockProvider,
      },
    });

    const result = await sequenceProvider.callApi('test input');
    expect(result.error).toBeUndefined();
    expect(mockProvider.calls).toHaveLength(2);
    expect(mockProvider.calls).toEqual([
      'Initial prompt: test input',
      'Based on the previous response, do this: test input',
    ]);
    expect(result.output).toBe('Initial response\n---\nFollow-up response');
  });

  it('handles provider errors', async () => {
    const mockProvider = new MockProvider();
    mockProvider.callApi = async () => ({
      error: 'Rate limit exceeded',
      output: '',
    });

    const sequenceProvider = new SequenceProvider({
      id: 'sequence',
      config: {
        inputs: ['test1', 'test2'],
        provider: mockProvider,
      },
    });

    const result = await sequenceProvider.callApi('test input');
    expect(result.error).toBe('Rate limit exceeded');
  });

  it('accumulates token usage', async () => {
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
        provider: mockProvider,
      },
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

  it('should prioritize originalProvider over config.provider', async () => {
    const mockOriginalProvider = new MockProvider(['Original response']);
    const mockConfigProvider = new MockProvider(['Config response']);

    const sequenceProvider = new SequenceProvider({
      id: 'sequence',
      config: {
        inputs: ['Test prompt'],
        provider: mockConfigProvider
      }
    });

    const result = await sequenceProvider.callApi('test input', {
      originalProvider: mockOriginalProvider,
      prompt: { raw: 'test input', label: 'test' } as Prompt,
      vars: {}
    } as CallApiContextParams);

    expect(result.error).toBeUndefined();
    expect(mockOriginalProvider.calls).toHaveLength(1);
    expect(mockConfigProvider.calls).toHaveLength(0);
    expect(mockOriginalProvider.calls[0]).toBe('Test prompt');
    expect(result.output).toBe('Original response');
  });
});
