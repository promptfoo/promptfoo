import { describe, expect, it } from 'vitest';
import { createOpenAiClient } from '../../../src/providers/openai/client';

describe('createOpenAiClient', () => {
  it('disables SDK retries by default', () => {
    const client = createOpenAiClient({
      apiKey: 'test-key',
      baseURL: 'https://api.openai.com/v1',
    });

    expect(client.maxRetries).toBe(0);
  });

  it('preserves explicit SDK retry overrides', () => {
    const client = createOpenAiClient({
      apiKey: 'test-key',
      baseURL: 'https://api.openai.com/v1',
      maxRetries: 3,
    });

    expect(client.maxRetries).toBe(3);
  });
});
