import { afterEach, describe, expect, it, vi } from 'vitest';
import { SequenceProvider } from '../../src/providers/sequence';

import type { CallApiContextParams } from '../../src/types/index';

describe('SequenceProvider', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should apply context filters to prompt and variable inputs before sending each request', async () => {
    const provider = new SequenceProvider({
      config: {
        inputs: ['{{ prompt | shout }}', 'Follow up: {{ topic | shout }}'],
        separator: ' | ',
      },
    });
    const callApi = vi
      .fn()
      .mockResolvedValueOnce({ output: 'First response' })
      .mockResolvedValueOnce({ output: 'Second response' });
    const context: CallApiContextParams = {
      prompt: { raw: 'hello', label: 'test prompt' },
      vars: { topic: 'robotics' },
      filters: { shout: (text: string) => text.toUpperCase() },
      originalProvider: { id: () => 'test-provider', callApi },
    };

    const result = await provider.callApi('hello', context);

    expect(callApi).toHaveBeenCalledTimes(2);
    expect(callApi).toHaveBeenNthCalledWith(1, 'HELLO', context, undefined);
    expect(callApi).toHaveBeenNthCalledWith(2, 'Follow up: ROBOTICS', context, undefined);
    expect(result.output).toBe('First response | Second response');
  });

  it('should render built-in filters and variables without custom context filters', async () => {
    const provider = new SequenceProvider({
      config: { inputs: ['{{ prompt | upper }}: {{ topic }}'] },
    });
    const callApi = vi.fn().mockResolvedValue({ output: 'Response' });
    const context: CallApiContextParams = {
      prompt: { raw: 'hello', label: 'test prompt' },
      vars: { topic: 'robotics' },
      originalProvider: { id: () => 'test-provider', callApi },
    };

    const result = await provider.callApi('hello', context);

    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith('HELLO: robotics', context, undefined);
    expect(result.output).toBe('Response');
  });
});
