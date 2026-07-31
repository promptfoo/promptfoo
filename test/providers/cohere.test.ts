import { describe, expect, it } from 'vitest';
import { CohereChatCompletionProvider } from '../../src/providers/cohere';

describe('CohereChatCompletionProvider', () => {
  it('recognizes the published Command A+ model ID', () => {
    expect(CohereChatCompletionProvider.COHERE_CHAT_MODELS).toContain('command-a-plus-05-2026');
  });
});
