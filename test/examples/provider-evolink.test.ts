import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import { loadApiProviders } from '../../src/providers/index';

import type { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import type { EnvOverrides } from '../../src/types/env';
import type { ProviderOptions } from '../../src/types/providers';

const configPath = path.join(__dirname, '../../examples/provider-evolink/promptfooconfig.yaml');

function readProvider(): ProviderOptions {
  const config = parseDocument(fs.readFileSync(configPath, 'utf-8')).toJS() as {
    providers: ProviderOptions[];
  };
  return config.providers[0];
}

async function loadEvoLinkProvider(env: EnvOverrides, id = 'openai:chat:evolink/auto') {
  const [provider] = await loadApiProviders([{ ...readProvider(), id }], { env });
  return provider as OpenAiChatCompletionProvider;
}

describe('provider-evolink example', () => {
  it.each([
    undefined,
    '',
  ])('does not reuse ambient OpenAI settings when the EvoLink key is %s', async (apiKey) => {
    const provider = await loadEvoLinkProvider({
      EVOLINK_API_KEY: apiKey,
      OPENAI_API_HOST: 'ambient-openai.example.test',
      OPENAI_API_KEY: 'openai-decoy-key',
      OPENAI_ORGANIZATION: 'openai-decoy-org',
    });

    expect(provider.getApiUrl()).toBe('https://direct.evolink.ai/v1');
    expect(provider.getApiKey()).toBe('__EVOLINK_API_KEY_REQUIRED__');
    expect(provider.getOpenAiRequestHeaders()).not.toHaveProperty('OpenAI-Organization');
  });

  it('uses the configured EvoLink key', async () => {
    const provider = await loadEvoLinkProvider({
      EVOLINK_API_KEY: 'evolink-test-key',
      OPENAI_API_HOST: 'ambient-openai.example.test',
      OPENAI_API_KEY: 'openai-decoy-key',
    });

    expect(provider.getApiUrl()).toBe('https://direct.evolink.ai/v1');
    expect(provider.getApiKey()).toBe('evolink-test-key');
  });

  it('keeps a valid temperature when only the documented model ID changes', async () => {
    expect(readProvider()).not.toHaveProperty('label');

    const provider = await loadEvoLinkProvider(
      { EVOLINK_API_KEY: 'evolink-test-key' },
      'openai:chat:MiniMax-M2.5',
    );

    const { body } = await provider.getOpenAiBody('Hello');

    expect(body.model).toBe('MiniMax-M2.5');
    expect(body.temperature).toBe(0.2);
  });
});
