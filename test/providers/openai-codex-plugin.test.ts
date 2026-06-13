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
    await expect(provider.callApi('Return JSON', context())).rejects.toThrow('shutdown failed');
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
