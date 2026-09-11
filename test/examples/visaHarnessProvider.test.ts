import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import type { ChildProcess, SpawnOptions } from 'node:child_process';

import * as yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error Standalone JavaScript examples do not ship TypeScript declarations.
import VisaHarnessProvider from '../../examples/visa-vulnerability-agentic-harness/provider.mjs';
import { renderPrompt } from '../../src/evaluatorHelpers';

import type { ApiProvider } from '../../src/types/providers';

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawn: vi.fn(),
}));

const prompt = JSON.stringify({ files: { 'src/app.py': 'print("fixture")' } });

function manifest() {
  return {
    tool: 'vvaharness',
    version: '1.3.0',
    exit_code: 0,
    stages: { s9: { outcome: 'completed' } },
    errors_by_stage: {},
    totals: {
      prompt_tokens: 100,
      completion_tokens: 20,
      cache_read_tokens: 50,
      cache_write_tokens: 30,
      total_tokens: 120,
      calls: 4,
      cost_usd: null as number | null,
    },
  };
}

describe('VVAH example provider', () => {
  let child: EventEmitter & { stderr: PassThrough; pid: number; kill: ReturnType<typeof vi.fn> };
  let started: Promise<void>;
  let cwd: string;
  let args: string[];
  let spawnOptions: SpawnOptions;

  beforeEach(() => {
    vi.mocked(spawn).mockReset();
    vi.spyOn(process, 'kill').mockReturnValue(true);
    child = Object.assign(new EventEmitter(), {
      stderr: new PassThrough(),
      pid: 12345,
      kill: vi.fn(),
    });
    started = new Promise<void>((resolve) => {
      vi.mocked(spawn).mockImplementation(((
        _command: string,
        argv: string[],
        options: SpawnOptions,
      ) => {
        if (_command === 'taskkill') {
          return new EventEmitter() as unknown as ChildProcess;
        }
        args = argv;
        spawnOptions = options;
        cwd = String(options.cwd);
        resolve();
        return child as unknown as ChildProcess;
      }) as typeof spawn);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    child.stderr.destroy();
  });

  function provider(config: Record<string, unknown> = {}): ApiProvider {
    return new VisaHarnessProvider({ config });
  }

  it('loads the example fixtures as source text through the real prompt renderer', async () => {
    const exampleDir = path.resolve('examples/visa-vulnerability-agentic-harness');
    const config = yaml.load(
      await readFile(path.join(exampleDir, 'promptfooconfig.yaml'), 'utf8'),
    ) as {
      prompts: string[];
      tests: { vars: { code: string; expectSqlInjection: boolean } }[];
    };
    for (const test of config.tests) {
      const file = path.resolve(exampleDir, test.vars.code.slice('file://'.length));
      const rendered = await renderPrompt(
        { raw: config.prompts[0], label: 'fixture' },
        { ...test.vars, code: `file://${file}` },
      );
      expect(JSON.parse(rendered)).toEqual({
        files: { 'app.py': (await readFile(file, 'utf8')).trim() },
      });
    }
    expect(spawn).not.toHaveBeenCalled();
  });

  async function finish(report: unknown = { findings: [], degraded: false }, run = manifest()) {
    await started;
    const reportDir = path.join(cwd, 'repo', 'security-scan');
    await mkdir(reportDir);
    await writeFile(path.join(reportDir, 'findings.json'), JSON.stringify(report));
    await writeFile(path.join(cwd, 'run_manifest_20260911.json'), JSON.stringify(run));
    child.emit('close', 0);
  }

  it('stages exact source, resolves config paths, returns ranked findings and usage, and cleans up', async () => {
    const basePath = path.resolve('operator config');
    const api = provider({
      basePath,
      command: './venv/bin/vvaharness',
      harnessConfig: './profile.yaml',
    });
    const resultPromise = api.callApi(prompt);
    await started;
    expect(spawn).toHaveBeenCalledWith(
      path.join(basePath, 'venv/bin/vvaharness'),
      args,
      spawnOptions,
    );
    expect(args).toEqual([
      'scan',
      '--repo',
      path.join(cwd, 'repo'),
      '--stop-after',
      's9',
      '--no-auto-step1',
      '--config',
      path.join(basePath, 'profile.yaml'),
    ]);
    expect(spawnOptions.shell).toBe(false);
    expect(spawnOptions.env?.VVAHARNESS_STATE_DIR).toBe(path.join(cwd, 'state'));
    expect(await readFile(path.join(cwd, 'repo', 'src', 'app.py'), 'utf8')).toBe(
      'print("fixture")',
    );
    const report = { findings: [{ finding: { cwe: 'CWE-89', title: 'SQL injection' } }] };
    const run = manifest();
    run.totals.cost_usd = 0.01;
    await finish(report, run);
    expect(await resultPromise).toMatchObject({
      output: JSON.stringify(report),
      tokenUsage: { prompt: 150, completion: 20, total: 170, cached: 50, numRequests: 4 },
      cost: 0.01,
      metadata: { version: '1.3.0', usage: { cache_write_tokens: 30 } },
    });
    await expect(access(cwd)).rejects.toThrow();
  });

  it('preserves an empty successful scan and leaves unknown cost unset', async () => {
    const resultPromise = provider().callApi(prompt);
    await finish();
    const result = await resultPromise;
    expect(JSON.parse(String(result.output)).findings).toEqual([]);
    expect(result.error).toBeUndefined();
    expect(result.cost).toBeUndefined();
  });

  it.each([
    ['degraded report', { findings: [], degraded: true }, manifest()],
    ['stage errors', { findings: [] }, { ...manifest(), errors_by_stage: { s4: 1 } }],
    [
      'incomplete stage',
      { findings: [] },
      { ...manifest(), stages: { ...manifest().stages, s4: { outcome: 'completed_with_errors' } } },
    ],
    ['manifest exit code', { findings: [] }, { ...manifest(), exit_code: 1 }],
  ])('does not grade %s as clean', async (_name, report, run) => {
    const resultPromise = provider().callApi(prompt);
    await finish(report, run);
    expect(await resultPromise).toMatchObject({
      error: expect.stringContaining('incomplete or degraded'),
      output: JSON.stringify(report),
    });
  });

  it.each([
    '../escape.py',
    '/absolute.py',
    'C:\\escape.py',
    'src/../../escape.py',
    'src\\..\\escape.py',
    '.git/config',
    '.ENV',
    'security-scan/findings.json',
  ])('rejects unsafe fixture path %s before spawning', async (name) => {
    const result = await provider().callApi(JSON.stringify({ files: { [name]: 'payload' } }));
    expect(result.error).toContain('Invalid source file');
    expect(spawn).not.toHaveBeenCalled();
  });

  it.each(['not JSON', 'null', '{}', '{"files":{}}', '{"files":[]}', '{"files":{"a.py":1}}'])(
    'rejects invalid input %s',
    async (input) => {
      expect((await provider().callApi(input)).error).toBeDefined();
      expect(spawn).not.toHaveBeenCalled();
    },
  );

  it('reports missing VVAH installation and removes staged files', async () => {
    const resultPromise = provider().callApi(prompt);
    await started;
    child.emit('error', new Error('spawn vvaharness ENOENT'));
    child.emit('close', -2);
    expect((await resultPromise).error).toContain('ENOENT');
    await expect(access(cwd)).rejects.toThrow();
  });

  it('reports command failures instead of treating them as no findings', async () => {
    const resultPromise = provider().callApi(prompt);
    await started;
    child.stderr.write('preflight failed');
    child.emit('close', 2);
    expect((await resultPromise).error).toContain('code 2: preflight failed');
    await expect(access(cwd)).rejects.toThrow();
  });

  it('rejects missing scan artifacts even after a zero exit code', async () => {
    const resultPromise = provider().callApi(prompt);
    await started;
    child.emit('close', 0);
    expect((await resultPromise).error).toContain('findings.json');
    await expect(access(cwd)).rejects.toThrow();
  });

  it('rejects malformed reports', async () => {
    const resultPromise = provider().callApi(prompt);
    await finish({ summary: 'no findings' });
    expect((await resultPromise).error).toContain('missing its findings array');
  });

  it('requires a manifest confirming the reporting stage completed', async () => {
    const resultPromise = provider().callApi(prompt);
    await finish({ findings: [] }, { ...manifest(), stages: { s9: { outcome: 'not_run' } } });
    expect((await resultPromise).error).toContain('completion through s9');
  });

  it('honors pre-aborted requests without spawning', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await provider().callApi(prompt, undefined, { abortSignal: controller.signal });
    expect(result.error).toContain('abort');
    expect(spawn).not.toHaveBeenCalled();
  });

  it.each(['timeout', 'abort'])(
    'waits for process exit before removing files on %s',
    async (kind) => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const resultPromise = provider({ timeoutMs: 500 }).callApi(prompt, undefined, {
        abortSignal: controller.signal,
      });
      await started;
      if (kind === 'timeout') {
        vi.advanceTimersByTime(500);
      } else {
        controller.abort();
      }
      if (process.platform === 'win32') {
        expect(spawn).toHaveBeenCalledWith('taskkill', ['/pid', '12345', '/T', '/F']);
      } else {
        expect(process.kill).toHaveBeenCalledWith(-12345, 'SIGKILL');
      }
      await expect(access(cwd)).resolves.toBeUndefined();
      child.emit('close', null);
      expect((await resultPromise).error).toContain(kind === 'timeout' ? 'timed out' : 'aborted');
      await expect(access(cwd)).rejects.toThrow();
    },
  );

  it('uses independent workspaces for concurrent calls with the same prompt', async () => {
    const invocations: { child: EventEmitter; cwd: string }[] = [];
    let bothStarted: () => void;
    const ready = new Promise<void>((resolve) => {
      bothStarted = resolve;
    });
    vi.mocked(spawn).mockImplementation(((
      _command: string,
      _args: string[],
      options: SpawnOptions,
    ) => {
      const process = Object.assign(new EventEmitter(), { stderr: new PassThrough() });
      invocations.push({ child: process, cwd: String(options.cwd) });
      if (invocations.length === 2) {
        bothStarted();
      }
      return process as unknown as ChildProcess;
    }) as typeof spawn);
    const api = provider();
    const results = Promise.all([api.callApi(prompt), api.callApi(prompt)]);
    await ready;
    expect(invocations[0].cwd).not.toBe(invocations[1].cwd);
    for (const invocation of invocations) {
      invocation.child.emit('close', 2);
    }
    await results;
    for (const invocation of invocations) {
      await expect(access(invocation.cwd)).rejects.toThrow();
    }
  });
});
