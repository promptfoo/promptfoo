import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadApiProviders } from '../../src/providers/index';
import { readConfig } from '../../src/util/config/load';
import { mockProcessEnv } from '../util/utils';

const readmePath = path.join(__dirname, '../..', 'examples', 'provider-tokenlab', 'README.md');

const TOKENLAB_KEY = 'sk-tokenlab-test';

// Vendor credentials that must NOT be relied on: the example's setup instructions
// only tell the user to export TOKENLAB_API_KEY.
const VENDOR_KEY_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
  'GOOGLE_API_KEY',
  'GEMINI_API_KEY',
  'PALM_API_KEY',
  'VERTEX_API_KEY',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
];

/** Extract the body of every ```yaml fenced block in a markdown document. */
function getYamlBlocks(content: string): string[] {
  const blocks: string[] = [];
  // \r?\n so the fence still matches on Windows checkouts, where git hands back
  // CRLF line endings and a bare \n never matches.
  const pattern = /```ya?ml\r?\n([\s\S]*?)```/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

/** Write a runnable promptfoo config wrapping a README `providers:` snippet. */
function writeConfig(providersYaml: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tokenlab-readme-'));
  const configPath = path.join(dir, 'promptfooconfig.yaml');
  fs.writeFileSync(
    configPath,
    [
      'description: tokenlab readme snippet',
      'prompts:',
      "  - 'Answer: {{question}}'",
      providersYaml,
      'tests:',
      '  - vars:',
      '      question: hi',
      '',
    ].join('\n'),
  );
  return configPath;
}

describe('provider-tokenlab README', () => {
  const readme = fs.readFileSync(readmePath, 'utf-8');
  const providerBlocks = getYamlBlocks(readme).filter((block) => block.includes('providers:'));

  let restoreEnv: (() => void) | undefined;

  beforeEach(() => {
    // Reproduce exactly what the README tells the reader to export, and nothing else.
    restoreEnv = mockProcessEnv({
      ...Object.fromEntries(VENDOR_KEY_ENV_VARS.map((key) => [key, undefined])),
      TOKENLAB_API_KEY: TOKENLAB_KEY,
    });
  });

  afterEach(() => {
    restoreEnv?.();
    restoreEnv = undefined;
  });

  it('documents at least one provider snippet', () => {
    expect(providerBlocks.length).toBeGreaterThan(0);
  });

  // Every provider snippet in the README must authenticate with nothing but
  // TOKENLAB_API_KEY exported. The Anthropic and Google providers read only their
  // own vendor env vars (ANTHROPIC_API_KEY / GOOGLE_API_KEY / GEMINI_API_KEY), so a
  // snippet that sets `apiBaseUrl` without `apiKey` resolves no credential at all
  // and sends an unauthenticated request.
  describe.each(
    providerBlocks.map((block, i) => [i, block] as const),
  )('yaml snippet #%i', (_index, block) => {
    it('resolves the TokenLab key for every provider', async () => {
      const config = await readConfig(writeConfig(block));
      const providers = (await loadApiProviders(config.providers as any)) as Array<{
        id: () => string;
        getApiKey?: () => string | undefined;
      }>;

      expect(providers.length).toBeGreaterThan(0);

      for (const provider of providers) {
        expect(
          provider.getApiKey?.(),
          `Provider "${provider.id()}" in the README resolves no TokenLab credential. ` +
            `Add apiKey: '{{env.TOKENLAB_API_KEY}}' to its config.`,
        ).toBe(TOKENLAB_KEY);
      }
    });
  });

  it('example promptfooconfig.yaml also authenticates from TOKENLAB_API_KEY alone', async () => {
    const config = await readConfig(
      path.join(__dirname, '../..', 'examples', 'provider-tokenlab', 'promptfooconfig.yaml'),
    );
    const providers = (await loadApiProviders(config.providers as any)) as Array<{
      id: () => string;
      getApiKey?: () => string | undefined;
    }>;

    expect(providers.length).toBeGreaterThan(0);
    for (const provider of providers) {
      expect(provider.getApiKey?.(), `Provider "${provider.id()}" resolves no credential`).toBe(
        TOKENLAB_KEY,
      );
    }
  });
});
