import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, it } from 'vitest';

it('finishes an evaluation timeout when a Python configuration loader never resolves', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'python-config-timeout-'));
  const moduleUrl = (filename: string) => pathToFileURL(path.resolve(filename)).href;
  const pendingConfig = path.join(directory, 'pending.mjs');
  await writeFile(
    pendingConfig,
    `export default () => {
    globalThis.pythonTimeoutLoaderEntered = true;
    return new Promise(() => {});
  };`,
  );
  const script = `
    const { PythonProvider } = await import(${JSON.stringify(moduleUrl('src/providers/pythonCompletion.ts'))});
    const { evaluate } = await import(${JSON.stringify(moduleUrl('src/evaluator.ts'))});
    const { default: Eval } = await import(${JSON.stringify(moduleUrl('src/models/eval.ts'))});
    const { default: telemetry } = await import(${JSON.stringify(moduleUrl('src/telemetry.ts'))});
    // Disabling telemetry still sends an opt-out event outside IS_TESTING.
    // Keep this real evaluator regression entirely offline.
    telemetry.record = () => {};
    await import(${JSON.stringify(pathToFileURL(pendingConfig).href)});
    const provider = new PythonProvider(${JSON.stringify(path.resolve('test/smoke/fixtures/providers/echo_provider.py'))}, {
      config: { settings: ${JSON.stringify(`file://${pendingConfig}`)}, workers: 1 },
    });
    // Keep the child alive if shutdown deadlocks, so unresolved top-level await
    // cannot masquerade as successful evaluation completion.
    const keepAlive = setInterval(() => {}, 1000);
    const record = new Eval({});
    await evaluate({ providers: [provider], prompts: [{ raw: 'hello', label: 'hello' }], tests: [{}] }, record, {
      timeoutMs: 100, maxConcurrency: 1, showProgressBar: false,
    });
    process.send({ rows: record.results.map(({ success, score, error }) => ({ success, score, error })),
      loaderEntered: globalThis.pythonTimeoutLoaderEntered,
      signalListeners: process.listenerCount('SIGTERM') });
    clearInterval(keepAlive);
    process.disconnect();
  `;
  const child = spawn(
    process.execPath,
    [
      '--import',
      moduleUrl('node_modules/tsx/dist/loader.mjs'),
      '--input-type=module',
      '-e',
      script,
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PROMPTFOO_CONFIG_DIR: directory,
        PROMPTFOO_CACHE_ENABLED: 'false',
        PROMPTFOO_DISABLE_TELEMETRY: 'true',
        PROMPTFOO_DISABLE_UPDATE: 'true',
        IS_TESTING: 'false',
        LOG_LEVEL: 'error',
      },
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    },
  );
  let stderr = '';
  child.stderr!.on('data', (data) => {
    stderr += String(data);
  });
  const closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
  let timer: NodeJS.Timeout | undefined;
  try {
    const result = await new Promise<{
      rows: Array<{ success: boolean; score: number; error: string }>;
      loaderEntered: boolean;
      signalListeners: number;
    }>((resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Evaluation cleanup did not finish: ${stderr}`)),
        15_000,
      );
      child.once('message', (message) => resolve(message as Awaited<typeof result>));
      child.once('error', reject);
      child.once('exit', () =>
        reject(new Error(`Child exited before returning results: ${stderr}`)),
      );
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ success: false, score: 0 });
    expect(result.rows[0].error).toContain('timed out');
    expect(result.loaderEntered).toBe(true);
    expect(result.signalListeners).toBe(0);
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
    await closed;
    await rm(directory, { recursive: true, force: true });
  }
});
