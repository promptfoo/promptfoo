import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { preflightCodexSdkCliCompatibility } from '../../../src/providers/openai/codexCliCompatibility';

const mockExecFile = vi.hoisted(() => vi.fn());
const mockSchemaRun = vi.hoisted(() => vi.fn());
const mockSchemaStartThread = vi.hoisted(() => vi.fn());
const MockSchemaCodex = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFile: mockExecFile,
}));

interface FixtureOptions {
  sdkVersion?: string;
  supportedCliVersion?: string;
  installedCliVersion?: string;
}

const fixtureDirectories: string[] = [];
const realSdkEntryPoint = path.resolve('node_modules/@openai/codex-sdk/dist/index.js');

async function runtimeReadlineSplitsUnicodeSeparators(): Promise<boolean> {
  const event = `${JSON.stringify({ output: 'before\u2028between\u2029after' })}\n`;
  const lines = readline.createInterface({
    input: Readable.from([event]),
    crlfDelay: Infinity,
  });
  let lineCount = 0;
  for await (const _line of lines) {
    lineCount += 1;
  }
  return lineCount !== 1;
}

function createSdkFixture(options: FixtureOptions = {}) {
  const sdkVersion = options.sdkVersion ?? '0.142.3';
  const supportedCliVersion = options.supportedCliVersion ?? '0.142.3';
  const installedCliVersion = options.installedCliVersion ?? '0.142.3';
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-codex-compat-'));
  fixtureDirectories.push(root);

  const sdkDirectory = path.join(root, 'node_modules', '@openai', 'codex-sdk');
  const sdkEntryPoint = path.join(sdkDirectory, 'dist', 'index.js');
  fs.mkdirSync(path.dirname(sdkEntryPoint), { recursive: true });
  fs.writeFileSync(sdkEntryPoint, 'export class Codex {}\n');
  fs.writeFileSync(
    path.join(sdkDirectory, 'package.json'),
    JSON.stringify({
      name: '@openai/codex-sdk',
      version: sdkVersion,
      dependencies: { '@openai/codex': supportedCliVersion },
    }),
  );

  const cliDirectory = path.join(sdkDirectory, 'node_modules', '@openai', 'codex');
  const cliBin = path.join(cliDirectory, 'bin', 'codex.js');
  fs.mkdirSync(path.dirname(cliBin), { recursive: true });
  fs.writeFileSync(cliBin, '#!/usr/bin/env node\n');
  const cliManifestPath = path.join(cliDirectory, 'package.json');
  fs.writeFileSync(
    cliManifestPath,
    JSON.stringify({
      name: '@openai/codex',
      version: installedCliVersion,
      bin: { codex: 'bin/codex.js' },
    }),
  );

  return { cliBin, cliManifestPath, sdkEntryPoint };
}

function mockVersionProbe(version: string) {
  mockExecFile.mockImplementation(
    (_command: string, _args: string[], _options: unknown, callback: (...args: any[]) => void) => {
      callback(null, `codex-cli-exec ${version}\n`, '');
    },
  );
}

const mockSdkModule = { Codex: MockSchemaCodex };

describe('preflightCodexSdkCliCompatibility', () => {
  beforeEach(() => {
    mockExecFile.mockReset();
    mockVersionProbe('0.142.3');
    mockSchemaRun.mockReset();
    mockSchemaRun.mockResolvedValue({
      finalResponse: 'codex-sdk-event-schema-compatible',
      items: [
        {
          id: 'compatibility-command',
          type: 'command_execution',
          aggregated_output: 'before\u2028between\u2029after',
        },
      ],
    });
    mockSchemaStartThread.mockReset();
    mockSchemaStartThread.mockReturnValue({ run: mockSchemaRun });
    MockSchemaCodex.mockReset();
    MockSchemaCodex.mockImplementation(function () {
      return { startThread: mockSchemaStartThread };
    });
  });

  afterEach(() => {
    for (const directory of fixtureDirectories.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects an absolute entry point outside the Codex SDK package', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-not-codex-sdk-'));
    fixtureDirectories.push(root);
    const sdkEntryPoint = path.join(root, 'nested', 'dist', 'index.js');
    fs.mkdirSync(path.dirname(sdkEntryPoint), { recursive: true });
    fs.writeFileSync(sdkEntryPoint, 'export {};\n');
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'another-package' }));

    await expect(
      preflightCodexSdkCliCompatibility({ sdkEntryPoint, sdkModule: mockSdkModule, env: {} }),
    ).rejects.toThrow('Could not locate the @openai/codex-sdk manifest');
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('accepts a custom CLI with the exact SDK-declared event protocol version', async () => {
    const { sdkEntryPoint } = createSdkFixture();

    const result = await preflightCodexSdkCliCompatibility({
      sdkEntryPoint,
      sdkModule: mockSdkModule,
      codexPathOverride: '/custom/codex',
      env: { PATH: '/usr/bin' },
    });

    expect(result).toEqual({
      sdkVersion: '0.142.3',
      supportedCliVersion: '0.142.3',
      selectedCliVersion: '0.142.3',
      selectedCliPath: '/custom/codex',
    });
    expect(mockExecFile).toHaveBeenCalledWith(
      '/custom/codex',
      ['exec', '--experimental-json', '--version'],
      expect.objectContaining({
        encoding: 'utf8',
        env: { PATH: '/usr/bin' },
        timeout: 60_000,
      }),
      expect.any(Function),
    );
    expect(MockSchemaCodex).toHaveBeenCalledWith({
      codexPathOverride: process.execPath,
      env: {
        NODE_OPTIONS: expect.stringMatching(/^--require ".*emit-events\.cjs"$/),
      },
    });
    expect(mockSchemaStartThread).toHaveBeenCalledWith({
      workingDirectory: expect.stringContaining('promptfoo-codex-sdk-preflight-'),
      skipGitRepoCheck: true,
    });
    expect(mockSchemaRun).toHaveBeenCalledWith('compatibility-preflight', {
      signal: expect.any(AbortSignal),
    });
  });

  it('rejects the r7 SDK and custom CLI mismatch', async () => {
    const { sdkEntryPoint } = createSdkFixture({
      sdkVersion: '0.130.0',
      supportedCliVersion: '0.130.0',
      installedCliVersion: '0.130.0',
    });
    mockVersionProbe('0.142.3');

    await expect(
      preflightCodexSdkCliCompatibility({
        sdkEntryPoint,
        sdkModule: mockSdkModule,
        codexPathOverride: '/custom/codex-0.142.3',
        env: {},
      }),
    ).rejects.toThrow(
      '@openai/codex-sdk 0.130.0 supports Codex CLI/event schema 0.130.0, but /custom/codex-0.142.3 reports 0.142.3',
    );
    expect(MockSchemaCodex).not.toHaveBeenCalled();
    expect(mockSchemaStartThread).not.toHaveBeenCalled();
    expect(mockSchemaRun).not.toHaveBeenCalled();
  });

  it('probes the SDK-bundled CLI through its npm launcher', async () => {
    const { cliBin, sdkEntryPoint } = createSdkFixture();

    const result = await preflightCodexSdkCliCompatibility({
      sdkEntryPoint,
      sdkModule: mockSdkModule,
      env: { PATH: '/usr/bin' },
    });

    const resolvedCliBin = fs.realpathSync(cliBin);
    expect(result.selectedCliPath).toBe(resolvedCliBin);
    expect(mockExecFile).toHaveBeenCalledWith(
      process.execPath,
      [resolvedCliBin, 'exec', '--experimental-json', '--version'],
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('rejects a bundled CLI package that does not match the SDK contract', async () => {
    const { sdkEntryPoint } = createSdkFixture({ installedCliVersion: '0.142.2' });

    await expect(
      preflightCodexSdkCliCompatibility({ sdkEntryPoint, sdkModule: mockSdkModule, env: {} }),
    ).rejects.toThrow('The SDK declares Codex CLI 0.142.3, but its bundled CLI package is 0.142.2');
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('rejects a missing bundled CLI entry point declared with string bin syntax', async () => {
    const { cliManifestPath, sdkEntryPoint } = createSdkFixture();
    fs.writeFileSync(
      cliManifestPath,
      JSON.stringify({
        name: '@openai/codex',
        version: '0.142.3',
        bin: 'bin/missing.js',
      }),
    );

    await expect(
      preflightCodexSdkCliCompatibility({ sdkEntryPoint, sdkModule: mockSdkModule, env: {} }),
    ).rejects.toThrow('The bundled Codex CLI entry point does not exist');
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('rejects a non-exact SDK CLI dependency because compatibility is ambiguous', async () => {
    const { sdkEntryPoint } = createSdkFixture({ supportedCliVersion: '^0.142.3' });

    await expect(
      preflightCodexSdkCliCompatibility({ sdkEntryPoint, sdkModule: mockSdkModule, env: {} }),
    ).rejects.toThrow(
      '@openai/codex-sdk dependency on @openai/codex must be an exact semantic version, received ^0.142.3',
    );
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('fails closed when the CLI does not support the SDK JSON event invocation', async () => {
    const { sdkEntryPoint } = createSdkFixture();
    mockExecFile.mockImplementation(
      (
        _command: string,
        _args: string[],
        _options: unknown,
        callback: (...args: any[]) => void,
      ) => {
        callback(
          new Error("unexpected argument '--experimental-json'"),
          'partial stdout',
          'stderr detail',
        );
      },
    );

    await expect(
      preflightCodexSdkCliCompatibility({
        sdkEntryPoint,
        sdkModule: mockSdkModule,
        codexPathOverride: '/custom/codex',
        env: {},
      }),
    ).rejects.toThrow(
      /JSON event mode probe failed.*unexpected argument '--experimental-json'.*partial stdout.*stderr detail/s,
    );
  });

  it('fails closed when the CLI version output is unrecognized', async () => {
    const { sdkEntryPoint } = createSdkFixture();
    mockExecFile.mockImplementation(
      (
        _command: string,
        _args: string[],
        _options: unknown,
        callback: (...args: any[]) => void,
      ) => {
        callback(null, 'unknown build\n', '');
      },
    );

    await expect(
      preflightCodexSdkCliCompatibility({
        sdkEntryPoint,
        sdkModule: mockSdkModule,
        codexPathOverride: '/custom/codex',
        env: {},
      }),
    ).rejects.toThrow('JSON event mode probe returned an unrecognized version');
  });

  it('rejects malformed semantic versions in otherwise recognizable CLI output', async () => {
    const { sdkEntryPoint } = createSdkFixture();
    mockVersionProbe('0.142.3-alpha.');

    await expect(
      preflightCodexSdkCliCompatibility({
        sdkEntryPoint,
        sdkModule: mockSdkModule,
        codexPathOverride: '/custom/codex',
        env: {},
      }),
    ).rejects.toThrow('JSON event mode probe returned an invalid semantic version');
  });

  it('fails closed when the SDK returns an incomplete event result', async () => {
    const { sdkEntryPoint } = createSdkFixture();
    mockSchemaRun.mockResolvedValue(undefined);

    await expect(
      preflightCodexSdkCliCompatibility({
        sdkEntryPoint,
        sdkModule: mockSdkModule,
        codexPathOverride: '/custom/codex',
        env: {},
      }),
    ).rejects.toThrow(
      'SDK returned an unexpected result for the representative JSONL event stream',
    );
  });

  it('fails closed when the SDK parser cannot consume the representative event schema', async () => {
    const { sdkEntryPoint } = createSdkFixture();
    mockSchemaRun.mockRejectedValue(
      new Error('Failed to parse item: Unterminated string in JSON at position 123'),
    );

    await expect(
      preflightCodexSdkCliCompatibility({
        sdkEntryPoint,
        sdkModule: mockSdkModule,
        codexPathOverride: '/custom/codex',
        env: {},
      }),
    ).rejects.toThrow(
      /cannot parse the supported CLI event schema on Node .*U\+2028\/U\+2029 was split or rejected.*No Codex API request was made/,
    );
  });

  it('runs the zero-token event schema canary through the real installed SDK parser', async () => {
    const sdkManifest = JSON.parse(
      fs.readFileSync(path.resolve(path.dirname(realSdkEntryPoint), '../package.json'), 'utf8'),
    );
    const supportedCliVersion = sdkManifest.dependencies['@openai/codex'];
    mockVersionProbe(supportedCliVersion);
    const realSdkModule = await import(pathToFileURL(realSdkEntryPoint).href);
    const preflight = preflightCodexSdkCliCompatibility({
      sdkEntryPoint: realSdkEntryPoint,
      sdkModule: realSdkModule,
      env: {},
    });

    if (await runtimeReadlineSplitsUnicodeSeparators()) {
      const escapedNodeVersion = process.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      await expect(preflight).rejects.toThrow(
        new RegExp(`cannot parse the supported CLI event schema on Node ${escapedNodeVersion}`),
      );
    } else {
      await expect(preflight).resolves.toMatchObject({
        sdkVersion: sdkManifest.version,
        supportedCliVersion,
        selectedCliVersion: supportedCliVersion,
      });
    }
  });
});
