import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAICodexPluginProvider } from '../../src/providers/openai/codex-plugin';
import { providerRegistry } from '../../src/providers/providerRegistry';

const mocks = vi.hoisted(() => {
  const callApi = vi.fn();
  const cleanup = vi.fn();
  const shutdown = vi.fn();
  const MockOpenAICodexSDKProvider = vi.fn().mockImplementation(function () {
    return { callApi, cleanup, shutdown };
  });
  return { callApi, cleanup, shutdown, MockOpenAICodexSDKProvider };
});

vi.mock('../../src/providers/openai/codex-sdk', () => ({
  OpenAICodexSDKProvider: mocks.MockOpenAICodexSDKProvider,
}));

function writePlugin(root: string, version = '1.2.3'): string {
  const pluginRoot = path.join(root, 'plugin');
  fs.mkdirSync(path.join(pluginRoot, '.codex-plugin'), { recursive: true });
  fs.writeFileSync(
    path.join(pluginRoot, '.codex-plugin', 'plugin.json'),
    JSON.stringify({ name: 'demo-plugin', version }),
  );
  fs.mkdirSync(path.join(pluginRoot, 'skills', 'demo-skill'), { recursive: true });
  fs.writeFileSync(path.join(pluginRoot, 'skills', 'demo-skill', 'SKILL.md'), '# Demo\n');
  return pluginRoot;
}

function context(): any {
  return {
    prompt: { id: 'prompt', label: 'prompt', raw: 'Return JSON' },
    vars: {},
  };
}

describe('OpenAICodexPluginProvider', () => {
  let root: string;
  let workspace: string;
  let pluginRoot: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-codex-plugin-test-'));
    workspace = path.join(root, 'workspace');
    fs.mkdirSync(workspace);
    pluginRoot = writePlugin(root);
    mocks.callApi.mockReset().mockResolvedValue({
      output: '{"ok":true}',
      tokenUsage: { prompt: 1, completion: 2, total: 3 },
      metadata: { existing: true },
      sessionId: 'thread-123',
      raw: JSON.stringify({ id: 'turn-123' }),
    });
    mocks.cleanup.mockReset().mockResolvedValue(undefined);
    mocks.shutdown.mockReset().mockResolvedValue(undefined);
    mocks.MockOpenAICodexSDKProvider.mockClear();
  });

  afterEach(async () => {
    await providerRegistry.shutdownAll();
    fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('installs a path plugin into an isolated Codex home for each case', async () => {
    const provider = new OpenAICodexPluginProvider({
      config: {
        plugin: { path: pluginRoot },
        skill: 'demo-skill',
        workspace,
        output_schema: { type: 'object' },
      },
    });

    const result = await provider.callApi('Return JSON', {
      ...context(),
      traceparent: '00-trace-parent-span-01',
    });

    expect(mocks.callApi).toHaveBeenCalledWith(
      'Use the demo-plugin:demo-skill skill.\n\nReturn JSON',
      expect.any(Object),
      expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
    );
    const sdkConfig = mocks.MockOpenAICodexSDKProvider.mock.calls[0][0].config;
    expect(sdkConfig.working_dir).toBe(workspace);
    expect(sdkConfig.inherit_process_env).toBe(false);
    expect(sdkConfig.output_schema).toEqual({ type: 'object' });
    expect(sdkConfig.cli_env.CODEX_HOME).toContain('promptfoo-codex-plugin-');
    expect(fs.existsSync(sdkConfig.cli_env.CODEX_HOME)).toBe(false);
    expect(result.latencyMs).toEqual(expect.any(Number));
    expect(result.metadata).toMatchObject({
      existing: true,
      codexPlugin: {
        plugin: {
          name: 'demo-plugin',
          version: '1.2.3',
          source: 'path',
          sourceDigest: expect.stringMatching(/^sha256:/),
          gitCommit: null,
        },
        invocation: 'skill:demo-skill',
        workspace,
        status: 'completed',
        traceIdentity: '00-trace-parent-span-01',
        executionIdentity: { sessionId: 'thread-123', turnId: 'turn-123' },
      },
    });
    expect(mocks.shutdown).toHaveBeenCalledOnce();
  });

  it('exports only provider-owned artifact references before cleanup', async () => {
    const exportedArtifacts = path.join(root, 'exported-artifacts');
    mocks.callApi.mockImplementationOnce(async () => {
      const sdkConfig = mocks.MockOpenAICodexSDKProvider.mock.calls[0][0].config;
      const artifactPath = path.join(
        sdkConfig.cli_env.PROMPTFOO_CODEX_PLUGIN_ARTIFACT_DIR,
        'scan.json',
      );
      fs.writeFileSync(artifactPath, '{"ok":true}');
      return { output: 'ok' };
    });
    const provider = new OpenAICodexPluginProvider({
      config: {
        plugin: { path: pluginRoot },
        invocation: 'Run the plugin.',
        workspace,
        artifacts_dir: exportedArtifacts,
      },
    });

    const result = await provider.callApi('Return JSON', context());

    expect(result.metadata?.codexPlugin.artifacts).toEqual([
      {
        path: expect.stringContaining(
          path.join(exportedArtifacts, 'manual-eval', 'openai-codex-plugin', 'demo-plugin'),
        ),
        relativePath: 'scan.json',
        owner: 'caller-export',
      },
    ]);
    const exportedPath = result.metadata?.codexPlugin.artifacts[0].path;
    expect(fs.readFileSync(exportedPath, 'utf8')).toBe('{"ok":true}');
  });

  it('uses one abort signal for pre-abort and setup timeout/cancellation', async () => {
    const preAborted = new AbortController();
    preAborted.abort();
    const provider = new OpenAICodexPluginProvider({
      config: { plugin: { path: pluginRoot }, workspace },
    });
    const preAbortResult = await provider.callApi('Return JSON', context(), {
      abortSignal: preAborted.signal,
    });
    expect(preAbortResult.metadata?.codexPlugin.status).toBe('cancelled');
    expect(mocks.MockOpenAICodexSDKProvider).not.toHaveBeenCalled();

    const originalReaddir = fs.promises.readdir.bind(fs.promises);
    vi.spyOn(fs.promises, 'readdir').mockImplementation(async (...args: any[]) => {
      if (String(args[0]) === pluginRoot) {
        return new Promise(() => {});
      }
      return originalReaddir(...(args as Parameters<typeof fs.promises.readdir>));
    });
    const timeoutProvider = new OpenAICodexPluginProvider({
      config: { plugin: { path: pluginRoot }, workspace, timeout_ms: 1 },
    });
    const timeoutResult = await timeoutProvider.callApi('Return JSON', context());
    expect(timeoutResult.metadata?.codexPlugin.status).toBe('timeout');

    const controller = new AbortController();
    const cancellationProvider = new OpenAICodexPluginProvider({
      config: { plugin: { path: pluginRoot }, workspace },
    });
    const cancellationPromise = cancellationProvider.callApi('Return JSON', context(), {
      abortSignal: controller.signal,
    });
    controller.abort();
    const cancellationResult = await cancellationPromise;
    expect(cancellationResult.metadata?.codexPlugin.status).toBe('cancelled');
  });

  it('cleans auth and runtime when shutdown fails without losing primary errors', async () => {
    const codexHome = path.join(root, 'codex-home');
    fs.mkdirSync(codexHome);
    fs.writeFileSync(path.join(codexHome, 'auth.json'), '{"token":"secret"}');
    mocks.shutdown.mockRejectedValueOnce(new Error('shutdown failed'));
    const provider = new OpenAICodexPluginProvider({
      config: { plugin: { path: pluginRoot }, workspace, codex_home: codexHome },
    });
    const shutdownResult = await provider.callApi('Return JSON', context());
    expect(shutdownResult.error).toBe('Codex plugin SDK shutdown failed: shutdown failed');
    expect(shutdownResult.metadata?.codexPlugin.status).toBe('failed');
    const sdkConfig = mocks.MockOpenAICodexSDKProvider.mock.calls[0][0].config;
    expect(fs.existsSync(path.join(sdkConfig.cli_env.CODEX_HOME, 'auth.json'))).toBe(false);
    expect(fs.existsSync(path.dirname(sdkConfig.cli_env.HOME))).toBe(false);

    mocks.callApi.mockRejectedValueOnce(new Error('primary failed'));
    mocks.shutdown.mockRejectedValueOnce(new Error('shutdown failed'));
    const primaryErrorResult = await provider.callApi('Return JSON', context());
    expect(primaryErrorResult.error).toBe('primary failed');
    expect(primaryErrorResult.metadata?.codexPlugin.status).toBe('failed');
  });

  it('namespaces concurrent artifact exports by case', async () => {
    const exportedArtifacts = path.join(root, 'exported-artifacts');
    mocks.callApi.mockImplementation(async (_prompt, sdkContext) => {
      const sdkConfig = sdkContext.prompt.config;
      fs.writeFileSync(
        path.join(sdkConfig.cli_env.PROMPTFOO_CODEX_PLUGIN_ARTIFACT_DIR, 'scan.json'),
        sdkConfig.cli_env.CODEX_HOME,
      );
      return { output: 'ok' };
    });
    const provider = new OpenAICodexPluginProvider({
      config: { plugin: { path: pluginRoot }, workspace, artifacts_dir: exportedArtifacts },
    });
    const [left, right] = await Promise.all([
      provider.callApi('Return JSON', {
        ...context(),
        evaluationId: 'eval',
        testCaseId: 'left',
        promptIdx: 0,
      }),
      provider.callApi('Return JSON', {
        ...context(),
        evaluationId: 'eval',
        testCaseId: 'right',
        promptIdx: 0,
      }),
    ]);
    const leftPath = left.metadata?.codexPlugin.artifacts[0].path;
    const rightPath = right.metadata?.codexPlugin.artifacts[0].path;
    expect(leftPath).not.toBe(rightPath);
    expect(fs.existsSync(leftPath)).toBe(true);
    expect(fs.existsSync(rightPath)).toBe(true);
  });

  it('rejects traversal-equivalent artifact namespace identifiers before export', async () => {
    const exportedArtifacts = path.join(root, 'exported-artifacts');
    for (const maliciousIdentifier of [
      '.',
      '..',
      '../escape',
      '..%2fescape',
      '%252e%252e%252fescape',
    ]) {
      const provider = new OpenAICodexPluginProvider({
        id: maliciousIdentifier,
        config: { plugin: { path: pluginRoot }, workspace, artifacts_dir: exportedArtifacts },
      });
      const result = await provider.callApi('Return JSON', context());
      expect(result.error).toContain('unsafe path segment');
      expect(result.metadata?.codexPlugin.status).toBe('failed');
    }
    expect(fs.existsSync(path.join(root, 'escape'))).toBe(false);
  });

  it('asserts artifact export containment after resolving an existing symlink', async () => {
    const exportedArtifacts = path.join(root, 'exported-artifacts');
    const outside = path.join(root, 'outside');
    fs.mkdirSync(exportedArtifacts);
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(exportedArtifacts, 'manual-eval'));
    const provider = new OpenAICodexPluginProvider({
      config: { plugin: { path: pluginRoot }, workspace, artifacts_dir: exportedArtifacts },
    });
    const result = await provider.callApi('Return JSON', context());
    expect(result.error).toContain('must stay within configured artifacts_dir');
    expect(result.metadata?.codexPlugin.status).toBe('failed');
  });

  it('kills aborted package resolver descendants before removing runtime', async () => {
    if (process.platform === 'win32') {
      return;
    }
    const binDir = path.join(root, 'bin');
    const pidPath = path.join(root, 'descendant.pid');
    const runtimePath = path.join(root, 'runtime-path');
    const lateWritePath = path.join(root, 'late-write');
    fs.mkdirSync(binDir);
    fs.writeFileSync(
      path.join(binDir, 'npm'),
      `#!/bin/sh
while [ "$1" != "--pack-destination" ]; do shift; done
shift
runtime=$(dirname "$1")
printf '%s' "$runtime" > ${JSON.stringify(runtimePath)}
(sh -c 'trap "" TERM; sleep 2; printf late > ${lateWritePath}') &
printf '%s' "$!" > ${JSON.stringify(pidPath)}
trap '' TERM
while :; do sleep 1; done
`,
      { mode: 0o755 },
    );
    vi.stubEnv('PATH', `${binDir}:${process.env.PATH}`);
    try {
      const provider = new OpenAICodexPluginProvider({
        config: { plugin: { package: 'demo-plugin' }, workspace },
      });
      const controller = new AbortController();
      const resultPromise = provider.callApi('Return JSON', context(), {
        abortSignal: controller.signal,
      });
      while (!fs.existsSync(pidPath)) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      controller.abort();
      const result = await resultPromise;
      const descendantPid = Number(fs.readFileSync(pidPath, 'utf8'));
      const runtime = fs.readFileSync(runtimePath, 'utf8');
      expect(result.metadata?.codexPlugin.status).toBe('cancelled');
      expect(() => process.kill(descendantPid, 0)).toThrow();
      expect(fs.existsSync(runtime)).toBe(false);
      await new Promise((resolve) => setTimeout(resolve, 1100));
      expect(fs.existsSync(lateWritePath)).toBe(false);
      expect(fs.existsSync(runtime)).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('reports artifact export errors as terminal sanitized failures', async () => {
    const exportedArtifacts = path.join(root, 'exported-artifacts');
    mocks.callApi.mockImplementationOnce(async () => {
      const sdkConfig = mocks.MockOpenAICodexSDKProvider.mock.calls[0][0].config;
      fs.writeFileSync(
        path.join(sdkConfig.cli_env.PROMPTFOO_CODEX_PLUGIN_ARTIFACT_DIR, 'scan.json'),
        'ok',
      );
      return { output: 'ok' };
    });
    fs.mkdirSync(exportedArtifacts);
    const provider = new OpenAICodexPluginProvider({
      config: { plugin: { path: pluginRoot }, workspace, artifacts_dir: exportedArtifacts },
    });
    const originalCopyFileSync = fs.copyFileSync.bind(fs);
    vi.spyOn(fs, 'copyFileSync').mockImplementation((...args: any[]) => {
      if (String(args[1]).includes(exportedArtifacts)) {
        throw new Error('secret-token=do-not-leak');
      }
      return originalCopyFileSync(...(args as Parameters<typeof fs.copyFileSync>));
    });
    const result = await provider.callApi('Return JSON', context());
    expect(result.error).toBe('Codex plugin artifact export failed');
    expect(result.error).not.toContain('secret-token');
    expect(result.metadata?.codexPlugin).toMatchObject({
      status: 'failed',
      artifactError: 'Codex plugin artifact export failed',
      artifacts: [],
    });
  });

  it('deletes copied auth within the cleanup deadline even when runtime deletion hangs', async () => {
    const codexHome = path.join(root, 'codex-home');
    fs.mkdirSync(codexHome);
    fs.writeFileSync(path.join(codexHome, 'auth.json'), '{"token":"secret"}');
    const originalRm = fs.promises.rm.bind(fs.promises);
    vi.spyOn(fs.promises, 'rm').mockImplementation(async (...args: any[]) => {
      if (String(args[0]).includes('promptfoo-codex-plugin-')) {
        return new Promise(() => {});
      }
      return originalRm(...(args as Parameters<typeof fs.promises.rm>));
    });
    const provider = new OpenAICodexPluginProvider({
      config: { plugin: { path: pluginRoot }, workspace, codex_home: codexHome, timeout_ms: 100 },
    });
    const startedAt = Date.now();
    const result = await provider.callApi('Return JSON', context());
    const sdkConfig = mocks.MockOpenAICodexSDKProvider.mock.calls[0][0].config;
    expect(Date.now() - startedAt).toBeLessThan(500);
    expect(fs.existsSync(path.join(sdkConfig.cli_env.CODEX_HOME, 'auth.json'))).toBe(false);
    expect(result.metadata?.codexPlugin.cleanup.runtimeRemoved).toBe(false);
    vi.restoreAllMocks();
    fs.rmSync(path.dirname(sdkConfig.cli_env.HOME), { recursive: true, force: true });
  });

  it('excludes .git internals while hashing path plugin content', async () => {
    fs.mkdirSync(path.join(pluginRoot, '.git'));
    fs.writeFileSync(path.join(pluginRoot, '.git', 'HEAD'), 'first');
    const provider = new OpenAICodexPluginProvider({
      config: { plugin: { path: pluginRoot }, workspace },
    });
    const first = await provider.callApi('Return JSON', context());
    fs.writeFileSync(path.join(pluginRoot, '.git', 'HEAD'), 'second');
    const second = await provider.callApi('Return JSON', context());
    expect(first.metadata?.codexPlugin.plugin.sourceDigest).toBe(
      second.metadata?.codexPlugin.plugin.sourceDigest,
    );
  });

  it('marks timeout and cancellation terminal statuses', async () => {
    mocks.callApi.mockImplementation((_prompt, _context, options) => {
      return new Promise((resolve) => {
        options.abortSignal.addEventListener('abort', () => resolve({ error: 'aborted' }), {
          once: true,
        });
      });
    });
    const timeoutProvider = new OpenAICodexPluginProvider({
      config: { plugin: { path: pluginRoot }, workspace, timeout_ms: 1 },
    });
    const timeoutResult = await timeoutProvider.callApi('Return JSON', context());
    expect(timeoutResult.metadata?.codexPlugin.status).toBe('timeout');

    const controller = new AbortController();
    const cancellationProvider = new OpenAICodexPluginProvider({
      config: { plugin: { path: pluginRoot }, workspace },
    });
    const resultPromise = cancellationProvider.callApi('Return JSON', context(), {
      abortSignal: controller.signal,
    });
    controller.abort();
    const cancellationResult = await resultPromise;
    expect(cancellationResult.metadata?.codexPlugin.status).toBe('cancelled');
  });

  it('rejects untrusted plugin source shapes and symlinked plugin trees', async () => {
    expect(
      () =>
        new OpenAICodexPluginProvider({
          config: { plugin: { path: pluginRoot, package: 'demo-plugin' }, workspace },
        }),
    ).toThrow('set exactly one of plugin.package or plugin.path');

    fs.symlinkSync(path.join(root, 'outside'), path.join(pluginRoot, 'unsafe-link'));
    const provider = new OpenAICodexPluginProvider({
      config: { plugin: { path: pluginRoot }, workspace },
    });
    const result = await provider.callApi('Return JSON', context());
    expect(result.error).toContain('may not contain symlinks');
    expect(result.metadata?.codexPlugin.status).toBe('failed');
  });

  it('accepts pinned npm package sources and rejects credential-bearing package specs', () => {
    expect(
      () =>
        new OpenAICodexPluginProvider({
          config: { plugin: { package: '@openai/demo-plugin', version: '1.2.3' }, workspace },
        }),
    ).not.toThrow();
    expect(
      () =>
        new OpenAICodexPluginProvider({
          config: { plugin: { package: 'https://token@example.com/demo.tgz' }, workspace },
        }),
    ).toThrow('Invalid OpenAI Codex plugin config');
  });
});
