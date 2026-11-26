import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_REMOTE_PLUGIN_CONFIG_BYTES,
  validateRedteamRemotePluginConfigSizes,
} from '../../../src/redteam/plugins/remoteConfigValidation';
import { neverGenerateRemote, shouldGenerateRemote } from '../../../src/redteam/remoteGeneration';
import { RedteamConfigSchema } from '../../../src/validators/redteam';

vi.mock('../../../src/redteam/remoteGeneration', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/redteam/remoteGeneration')>()),
  neverGenerateRemote: vi.fn(),
  shouldGenerateRemote: vi.fn(),
}));

describe('validateRedteamRemotePluginConfigSizes', () => {
  let tempDir: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(neverGenerateRemote).mockReturnValue(false);
    vi.mocked(shouldGenerateRemote).mockReturnValue(true);
  });

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('rejects oversized plugin config when remote generation is selected', () => {
    const oversizedPrompt = 'x'.repeat(MAX_REMOTE_PLUGIN_CONFIG_BYTES);
    const parsedRedteam = RedteamConfigSchema.parse({
      plugins: [
        {
          id: 'prompt-extraction',
          config: { systemPrompt: oversizedPrompt },
        },
      ],
    });

    const errors = validateRedteamRemotePluginConfigSizes({ redteam: parsedRedteam });
    const expectedBytes = Buffer.byteLength(
      JSON.stringify({ systemPrompt: oversizedPrompt }),
      'utf8',
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('prompt-extraction');
    expect(errors[0]).toContain(`${expectedBytes}`);
    expect(errors[0]).toContain(`${MAX_REMOTE_PLUGIN_CONFIG_BYTES}`);
  });

  it('allows configs whose serialized JSON fits within 30000 UTF-8 bytes', () => {
    const exactPrefix = '{"systemPrompt":"';
    const exactSuffix = '"}';
    const maxValueLength =
      MAX_REMOTE_PLUGIN_CONFIG_BYTES - Buffer.byteLength(exactPrefix + exactSuffix, 'utf8');
    const parsedRedteam = RedteamConfigSchema.parse({
      plugins: [
        {
          id: 'prompt-extraction',
          config: { systemPrompt: 'a'.repeat(maxValueLength) },
        },
      ],
    });

    expect(validateRedteamRemotePluginConfigSizes({ redteam: parsedRedteam })).toEqual([]);
  });

  it('measures UTF-8 byte length rather than JavaScript UTF-16 string length', () => {
    // 10,000 3-byte UTF-8 characters = 10,000 chars (< 30k), but 30,000+ bytes with JSON wrapper.
    const multibytePrompt = '中'.repeat(10_000);
    const parsedRedteam = RedteamConfigSchema.parse({
      plugins: [
        {
          id: 'prompt-extraction',
          config: { systemPrompt: multibytePrompt },
        },
      ],
    });

    const errors = validateRedteamRemotePluginConfigSizes({ redteam: parsedRedteam });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('prompt-extraction');
    expect(errors[0]).toContain(
      `${Buffer.byteLength(JSON.stringify({ systemPrompt: multibytePrompt }), 'utf8')}`,
    );
    expect(errors[0]).toContain('30000');
  });

  it('skips dual-mode plugins when remote generation is not selected', () => {
    vi.mocked(shouldGenerateRemote).mockReturnValue(false);
    const parsedRedteam = RedteamConfigSchema.parse({
      plugins: [
        {
          id: 'prompt-extraction',
          config: { systemPrompt: 'x'.repeat(MAX_REMOTE_PLUGIN_CONFIG_BYTES + 100) },
        },
      ],
    });

    expect(validateRedteamRemotePluginConfigSizes({ redteam: parsedRedteam })).toEqual([]);
  });

  it('still validates remote-only plugins when OPENAI_API_KEY disables default remote mode', () => {
    vi.mocked(shouldGenerateRemote).mockReturnValue(false);
    const parsedRedteam = RedteamConfigSchema.parse({
      plugins: [
        {
          id: 'competitors',
          config: { systemPrompt: 'x'.repeat(MAX_REMOTE_PLUGIN_CONFIG_BYTES + 100) },
        },
      ],
    });

    const errors = validateRedteamRemotePluginConfigSizes({ redteam: parsedRedteam });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('competitors');
  });

  it('skips all checks when remote generation is explicitly disabled', () => {
    vi.mocked(neverGenerateRemote).mockReturnValue(true);
    const parsedRedteam = RedteamConfigSchema.parse({
      plugins: [
        {
          id: 'competitors',
          config: { systemPrompt: 'x'.repeat(MAX_REMOTE_PLUGIN_CONFIG_BYTES + 100) },
        },
      ],
    });

    expect(validateRedteamRemotePluginConfigSizes({ redteam: parsedRedteam })).toEqual([]);
  });

  it('skips local-only plugins such as intent and file:// custom plugins', () => {
    const parsedRedteam = RedteamConfigSchema.parse({
      plugins: [
        {
          id: 'intent',
          config: { intent: 'x'.repeat(MAX_REMOTE_PLUGIN_CONFIG_BYTES + 100) },
        },
        {
          id: 'file://custom-plugin.js',
          config: { customPrompt: 'x'.repeat(MAX_REMOTE_PLUGIN_CONFIG_BYTES + 100) },
        },
      ],
    });

    expect(validateRedteamRemotePluginConfigSizes({ redteam: parsedRedteam })).toEqual([]);
  });

  it('strips graderExamples like fetchRemoteTestCases does', () => {
    const parsedRedteam = RedteamConfigSchema.parse({
      plugins: [
        {
          id: 'prompt-extraction',
          config: {
            systemPrompt: 'short prompt',
            graderExamples: [
              {
                output: 'x'.repeat(MAX_REMOTE_PLUGIN_CONFIG_BYTES + 500),
                pass: true,
                score: 1,
                reason: 'ok',
              },
            ],
          },
        },
      ],
    });

    expect(validateRedteamRemotePluginConfigSizes({ redteam: parsedRedteam })).toEqual([]);
  });

  it('resolves file:// values in plugin config against basePath without mutating config', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-plugin-size-'));
    const promptPath = path.join(tempDir, 'system-prompt.txt');
    fs.writeFileSync(promptPath, 'x'.repeat(MAX_REMOTE_PLUGIN_CONFIG_BYTES), 'utf8');

    const parsedRedteam = RedteamConfigSchema.parse({
      plugins: [
        {
          id: 'prompt-extraction',
          config: { systemPrompt: 'file://system-prompt.txt' },
        },
      ],
    });

    const errors = validateRedteamRemotePluginConfigSizes({ redteam: parsedRedteam }, tempDir);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('prompt-extraction');
    expect(
      (parsedRedteam.plugins?.[0] as { config?: { systemPrompt?: string } }).config?.systemPrompt,
    ).toBe('file://system-prompt.txt');
  });
});
