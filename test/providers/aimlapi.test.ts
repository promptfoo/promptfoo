import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAimlApiProvider } from '../../src/providers/aimlapi';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { OpenAiCompletionProvider } from '../../src/providers/openai/completion';
import { OpenAiEmbeddingProvider } from '../../src/providers/openai/embedding';

vi.mock('../../src/providers/openai');

afterEach(() => {
  vi.resetAllMocks();
});

describe('createAimlApiProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates chat completion provider when type is chat', () => {
    const provider = createAimlApiProvider('aimlapi:chat:model-name');
    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('model-name', expect.any(Object));
  });

  it('creates completion provider when type is completion', () => {
    const provider = createAimlApiProvider('aimlapi:completion:model-name');
    expect(provider).toBeInstanceOf(OpenAiCompletionProvider);
    expect(OpenAiCompletionProvider).toHaveBeenCalledWith('model-name', expect.any(Object));
  });

  it('creates embedding provider when type is embedding', () => {
    const provider = createAimlApiProvider('aimlapi:embedding:model-name');
    expect(provider).toBeInstanceOf(OpenAiEmbeddingProvider);
    expect(OpenAiEmbeddingProvider).toHaveBeenCalledWith('model-name', expect.any(Object));
  });

  it('defaults to chat provider when no type specified', () => {
    const provider = createAimlApiProvider('aimlapi:model-name');
    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('model-name', expect.any(Object));
  });
});
