import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkCodexCliCompatibility } from '../../../src/providers/openai/codexCliCompatibility';

const mockExecFile = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({ execFile: mockExecFile }));

describe('checkCodexCliCompatibility', () => {
  let sdkRoot: string;
  let sdkEntryPoint: string;

  beforeEach(() => {
    sdkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-codex-sdk-'));
    sdkEntryPoint = path.join(sdkRoot, 'dist', 'index.js');
    fs.mkdirSync(path.dirname(sdkEntryPoint));
    fs.writeFileSync(sdkEntryPoint, '');
    fs.writeFileSync(
      path.join(sdkRoot, 'package.json'),
      JSON.stringify({
        name: '@openai/codex-sdk',
        dependencies: { '@openai/codex': '0.130.0' },
      }),
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
    fs.rmSync(sdkRoot, { recursive: true, force: true });
  });

  function mockVersion(stdout: string, error: Error | null = null) {
    mockExecFile.mockImplementation((_file, _args, _options, callback) => {
      callback(error, { stdout, stderr: '' });
    });
  }

  it('accepts the CLI version declared by the SDK', async () => {
    mockVersion('codex-cli 0.130.0');
    const env = { PATH: '/bin' };

    await expect(
      checkCodexCliCompatibility({
        sdkEntryPoint,
        codexPathOverride: '/custom/codex',
        env,
      }),
    ).resolves.toBeUndefined();
    await checkCodexCliCompatibility({
      sdkEntryPoint,
      codexPathOverride: '/custom/codex',
      env,
    });

    expect(mockExecFile).toHaveBeenCalledWith(
      '/custom/codex',
      ['exec', '--experimental-json', '--version'],
      expect.objectContaining({ env, timeout: 10_000 }),
      expect.any(Function),
    );
    expect(mockExecFile).toHaveBeenCalledTimes(1);
  });

  it('rejects the r7 SDK and CLI mismatch', async () => {
    mockVersion('codex-cli 0.142.3');

    await expect(
      checkCodexCliCompatibility({
        sdkEntryPoint,
        codexPathOverride: '/custom/codex',
        env: {},
      }),
    ).rejects.toThrow(
      '@openai/codex-sdk supports Codex CLI/event schema 0.130.0, but /custom/codex reports 0.142.3',
    );
  });

  it('fails closed when JSON event mode is unavailable', async () => {
    mockVersion('', new Error('unknown option --experimental-json'));

    await expect(
      checkCodexCliCompatibility({
        sdkEntryPoint,
        codexPathOverride: '/custom/codex',
        env: {},
      }),
    ).rejects.toThrow('Could not verify Codex CLI compatibility');

    mockVersion('codex-cli 0.130.0');
    await expect(
      checkCodexCliCompatibility({
        sdkEntryPoint,
        codexPathOverride: '/custom/codex',
        env: {},
      }),
    ).resolves.toBeUndefined();
    expect(mockExecFile).toHaveBeenCalledTimes(2);
  });

  it('fails closed on unrecognized version output', async () => {
    mockVersion('codex-cli unknown');

    await expect(
      checkCodexCliCompatibility({
        sdkEntryPoint,
        codexPathOverride: '/custom/codex',
        env: {},
      }),
    ).rejects.toThrow('reports an unknown version');
  });
});
