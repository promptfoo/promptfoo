import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache, disableCache, enableCache, isCacheEnabled } from '../../src/cache';
import { importModule } from '../../src/esm';
import { type AgentWorkspace, createAgentWorkspace } from '../../src/providers/agentWorkspace';
import { ClaudeCodeSDKProvider } from '../../src/providers/claude-agent-sdk';
import { OpenAICodexSDKProvider } from '../../src/providers/openai/codex-sdk';
import { OpenCodeSDKProvider } from '../../src/providers/opencode-sdk';
import { getPackageVersion } from '../../src/util/packageVersion';
import { mockProcessEnv } from '../util/utils';

import type { CallApiContextParams } from '../../src/types/index';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  codex: vi.fn(),
  startThread: vi.fn(),
  createOpencode: vi.fn(),
  createOpencodeClient: vi.fn(),
  closeServer: vi.fn(),
}));

vi.mock('../../src/esm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/esm')>()),
  importModule: vi.fn(),
  resolvePackageEntryPoint: vi.fn((name: string) => name),
}));

vi.mock('../../src/util/packageVersion', () => ({ getPackageVersion: vi.fn() }));

vi.mock('@opencode-ai/sdk/v2', () => ({
  createOpencode: mocks.createOpencode,
  createOpencodeClient: mocks.createOpencodeClient,
}));

// A Claude Agent SDK query that immediately reports success.
function claudeQuery(result: string) {
  const messages = async function* () {
    yield {
      type: 'result',
      subtype: 'success',
      session_id: 'session',
      uuid: '12345678-1234-1234-1234-123456789abc',
      result,
      usage: { input_tokens: 1, output_tokens: 1 },
      total_cost_usd: 0,
      duration_ms: 1,
      duration_api_ms: 1,
      is_error: false,
      num_turns: 1,
      permission_denials: [],
    };
  };
  return Object.assign(messages(), {
    interrupt: vi.fn().mockResolvedValue(undefined),
    setPermissionMode: vi.fn().mockResolvedValue(undefined),
  });
}

function workspaceContext(dir: string): CallApiContextParams {
  return {
    prompt: { raw: 'Edit the file', label: 'edit', config: { working_dir: dir } },
    vars: {},
  };
}

const NOT_AN_EVAL_STEP = 'This call was not made by an eval step';

describe('copy_working_dir in agentic providers', () => {
  let source: string;
  let workspace: AgentWorkspace;
  let cacheWasEnabled: boolean;
  let restoreEnv: (() => void) | undefined;

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.mocked(getPackageVersion).mockImplementation((name) =>
      name === '@openai/codex-sdk' ? '0.156.1' : '0.3.273',
    );
    source = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-workspace-provider-'));
    execFileSync('git', ['init', '--quiet', source]);
    fs.writeFileSync(path.join(source, 'file.txt'), 'content\n');
    workspace = await createAgentWorkspace(source, 'copy');
    cacheWasEnabled = isCacheEnabled();
    enableCache();
  });

  afterEach(async () => {
    restoreEnv?.();
    restoreEnv = undefined;
    vi.restoreAllMocks();
    vi.resetAllMocks();
    await workspace.remove();
    fs.rmSync(source, { recursive: true, force: true });
    await clearCache();
    if (!cacheWasEnabled) {
      disableCache();
    }
  });

  const repositoryEnv = () => ({
    GIT_DIR: path.join(source, '.git'),
    GIT_WORK_TREE: source,
    GIT_INDEX_FILE: path.join(source, '.git', 'index'),
    AGENT_WORKSPACE_TEST_VALUE: 'preserved',
  });

  const gitRoot = (cwd: string, env: NodeJS.ProcessEnv) =>
    fs.realpathSync.native(
      execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, env, encoding: 'utf8' }).trim(),
    );

  describe('Claude Agent SDK', () => {
    beforeEach(() => {
      vi.mocked(importModule).mockResolvedValue({ query: mocks.query });
      mocks.query.mockImplementation(() => claudeQuery('edited'));
    });

    const createProvider = () =>
      new ClaudeCodeSDKProvider({
        config: { working_dir: source, copy_working_dir: true },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

    it('refuses a call that would run in working_dir itself', async () => {
      await expect(createProvider().callApi('Edit the file')).rejects.toThrow(NOT_AN_EVAL_STEP);
      expect(mocks.query).not.toHaveBeenCalled();
    });

    it('runs in the workspace and never answers from the cache', async () => {
      const provider = createProvider();

      const first = await provider.callApi('Edit the file', workspaceContext(workspace.dir));
      const second = await provider.callApi('Edit the file', workspaceContext(workspace.dir));

      expect(first.output).toBe('edited');
      expect(second.cached).toBeFalsy();
      expect(mocks.query).toHaveBeenCalledTimes(2);
      expect(mocks.query.mock.calls[0][0].options.cwd).toBe(workspace.dir);
    });

    it.each(['process', 'config', 'grader'])(
      'scrubs %s Git selectors for isolated calls',
      async (location) => {
        const overrides = repositoryEnv();
        if (location !== 'config') {
          restoreEnv = mockProcessEnv(overrides);
        }
        const provider = new ClaudeCodeSDKProvider({
          config: {
            working_dir: source,
            copy_working_dir: location === 'grader' ? undefined : true,
            ...(location === 'config' ? { env: overrides } : {}),
          },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi(
          'Inspect the repository',
          workspaceContext(workspace.dir),
        );
        expect(result.error).toBeUndefined();

        const { cwd, env } = mocks.query.mock.calls[0][0].options;
        expect(gitRoot(cwd, env)).toBe(fs.realpathSync.native(workspace.dir));
        expect(env.AGENT_WORKSPACE_TEST_VALUE).toBe('preserved');
        if (location !== 'config') {
          expect(process.env.GIT_DIR).toBe(overrides.GIT_DIR);
        }
      },
    );

    it('preserves Git selectors for ordinary calls', async () => {
      const overrides = repositoryEnv();
      restoreEnv = mockProcessEnv(overrides);
      const provider = new ClaudeCodeSDKProvider({
        config: { working_dir: source },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      await provider.callApi('Inspect the repository');

      expect(mocks.query.mock.calls[0][0].options.env).toMatchObject(overrides);
    });
  });

  describe('Codex SDK', () => {
    beforeEach(() => {
      const thread = {
        id: 'thread',
        run: vi.fn().mockResolvedValue({ finalResponse: 'edited', items: [], usage: null }),
      };
      mocks.startThread.mockReturnValue(thread);
      mocks.codex.mockImplementation(function () {
        return { startThread: mocks.startThread };
      });
      vi.mocked(importModule).mockResolvedValue({ Codex: mocks.codex });
    });

    const createProvider = () =>
      new OpenAICodexSDKProvider({
        config: { working_dir: source, copy_working_dir: true, skip_git_repo_check: true },
        env: { OPENAI_API_KEY: 'test-api-key' },
      });

    it('refuses a call that would run in working_dir itself', async () => {
      await expect(createProvider().callApi('Edit the file')).rejects.toThrow(NOT_AN_EVAL_STEP);
      expect(mocks.startThread).not.toHaveBeenCalled();
    });

    it('starts its thread in the workspace', async () => {
      const response = await createProvider().callApi(
        'Edit the file',
        workspaceContext(workspace.dir),
      );

      expect(response.output).toBe('edited');
      expect(mocks.startThread).toHaveBeenCalledWith(
        expect.objectContaining({ workingDirectory: workspace.dir }),
      );
    });

    it.each(['process', 'config', 'grader'])(
      'scrubs %s Git selectors for isolated calls',
      async (location) => {
        const overrides = repositoryEnv();
        if (location !== 'config') {
          restoreEnv = mockProcessEnv(overrides);
        }
        const provider = new OpenAICodexSDKProvider({
          config: {
            working_dir: source,
            copy_working_dir: location === 'grader' ? undefined : true,
            inherit_process_env: true,
            ...(location === 'config' ? { cli_env: overrides } : {}),
          },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi(
          'Inspect the repository',
          workspaceContext(workspace.dir),
        );
        expect(result.error).toBeUndefined();

        const { env } = mocks.codex.mock.calls[0][0];
        const { workingDirectory } = mocks.startThread.mock.calls[0][0];
        expect(gitRoot(workingDirectory, env)).toBe(fs.realpathSync.native(workspace.dir));
        expect(env.AGENT_WORKSPACE_TEST_VALUE).toBe('preserved');
        if (location !== 'config') {
          expect(process.env.GIT_DIR).toBe(overrides.GIT_DIR);
        }
      },
    );

    it('preserves Git selectors for ordinary calls', async () => {
      const overrides = repositoryEnv();
      restoreEnv = mockProcessEnv(overrides);
      const provider = new OpenAICodexSDKProvider({
        config: { working_dir: source, inherit_process_env: true },
        env: { OPENAI_API_KEY: 'test-api-key' },
      });

      await provider.callApi('Inspect the repository');

      expect(mocks.codex.mock.calls[0][0].env).toMatchObject(overrides);
    });
  });

  describe('OpenCode SDK', () => {
    beforeEach(() => {
      const client = {
        session: {
          create: vi.fn().mockResolvedValue({ data: { id: 'session' } }),
          prompt: vi
            .fn()
            .mockResolvedValue({ data: { parts: [{ type: 'text', text: 'edited' }] } }),
          delete: vi.fn().mockResolvedValue({}),
        },
      };
      mocks.createOpencode.mockResolvedValue({
        client,
        server: { url: 'http://localhost:1234', close: mocks.closeServer },
      });
      mocks.createOpencodeClient.mockReturnValue(client);
    });

    it('refuses a call that would run in working_dir itself', async () => {
      const provider = new OpenCodeSDKProvider({
        config: { working_dir: source, copy_working_dir: true },
      });

      await expect(provider.callApi('Edit the file')).rejects.toThrow(NOT_AN_EVAL_STEP);
      expect(importModule).not.toHaveBeenCalled();
    });

    it('rejects a missing isolated working_dir before allocating a temporary directory', async () => {
      const allocate = vi.spyOn(fs, 'mkdtempSync');
      const provider = new OpenCodeSDKProvider({ config: { copy_working_dir: true } });

      await expect(provider.callApi('Edit the file')).rejects.toThrow(NOT_AN_EVAL_STEP);

      expect(allocate).not.toHaveBeenCalled();
      expect(mocks.createOpencode).not.toHaveBeenCalled();
    });

    it('rejects inherited Git selectors before starting an isolated server', async () => {
      const overrides = repositoryEnv();
      restoreEnv = mockProcessEnv(overrides);
      const allocate = vi.spyOn(fs, 'mkdtempSync');
      const provider = new OpenCodeSDKProvider({
        config: { working_dir: source, copy_working_dir: true },
      });

      await expect(
        provider.callApi('Edit the file', workspaceContext(workspace.dir)),
      ).rejects.toThrow('OpenCode SDK does not support replacing that environment');

      expect(allocate).not.toHaveBeenCalled();
      expect(mocks.createOpencode).not.toHaveBeenCalled();
      expect(process.env.GIT_DIR).toBe(overrides.GIT_DIR);
    });

    it('preserves ordinary calls but rejects reusing a server started with Git selectors', async () => {
      const overrides = repositoryEnv();
      restoreEnv = mockProcessEnv(overrides);
      const provider = new OpenCodeSDKProvider({ config: { working_dir: source } });

      const response = await provider.callApi('Inspect the repository');
      expect(response.output).toBe('edited');
      expect(mocks.createOpencode.mock.calls[0][0].env).toMatchObject(overrides);
      restoreEnv();

      await expect(
        provider.callApi('Edit the file', workspaceContext(workspace.dir)),
      ).rejects.toThrow('OpenCode SDK does not support replacing that environment');
      expect(mocks.createOpencode).toHaveBeenCalledTimes(1);
      await provider.cleanup();
    });

    it('allows an isolated call when the local server has no Git selectors', async () => {
      const provider = new OpenCodeSDKProvider({
        config: { working_dir: source, copy_working_dir: true },
      });

      const response = await provider.callApi('Edit the file', workspaceContext(workspace.dir));

      expect(response.output).toBe('edited');
      expect(mocks.createOpencode).toHaveBeenCalledTimes(1);
      await provider.cleanup();
    });

    it('does not apply the local-server restriction to an external OpenCode server', async () => {
      restoreEnv = mockProcessEnv(repositoryEnv());
      const provider = new OpenCodeSDKProvider({
        config: {
          baseUrl: 'http://localhost:1234',
          working_dir: source,
          copy_working_dir: true,
        },
      });

      const response = await provider.callApi('Edit the file', workspaceContext(workspace.dir));

      expect(response.output).toBe('edited');
      expect(mocks.createOpencode).not.toHaveBeenCalled();
      expect(mocks.createOpencodeClient).toHaveBeenCalledWith({ baseUrl: 'http://localhost:1234' });
      await provider.cleanup();
    });
  });
});
