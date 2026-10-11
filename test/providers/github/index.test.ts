import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGitHubProvider } from '../../../src/providers/github/index';

vi.mock('../../../src/providers/openai/chat', () => ({
  OpenAiChatCompletionProvider: vi.fn(() => {
    throw new Error('Retired GitHub Models must not construct an inference client');
  }),
}));

afterEach(() => vi.resetAllMocks());

describe('GitHub Models retirement', () => {
  it.each(['github:', 'github:openai/gpt-5', 'github:azureml/Phi-4'])(
    '%s fails before inference',
    (id) => {
      expect(() => createGitHubProvider(id, {}, {})).toThrow(/retired on July 30, 2026/);
    },
  );

  it('does not silently redirect configured credentials to another provider', () => {
    expect(() =>
      createGitHubProvider(
        'github:custom:model',
        {
          config: { apiKey: 'fixture-key', apiBaseUrl: 'https://example.invalid/v1' },
        },
        {},
      ),
    ).toThrow(/Configure another provider with its own credentials/);
  });
});
