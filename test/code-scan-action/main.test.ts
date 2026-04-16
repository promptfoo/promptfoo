/**
 * Main Entry Point Tests
 *
 * Tests for the GitHub Action main entry point, specifically the CLI args construction.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockProcessEnv } from '../util/utils';

const mocks = vi.hoisted(() => {
  const core = {
    getInput: vi.fn(),
    getIDToken: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    setFailed: vi.fn(),
  };

  const exec = {
    exec: vi.fn(),
  };

  const github = {
    context: {
      repo: {
        owner: 'test-owner',
        repo: 'test-repo',
      },
      payload: {
        pull_request: {
          number: 123,
          head: {
            sha: 'abc123',
          },
        },
      },
    },
    getOctokit: vi.fn(),
  };

  const actionGithub = {
    getGitHubContext: vi.fn(),
    getPRFiles: vi.fn(),
  };

  const config = {
    generateConfigFile: vi.fn(),
  };

  const fs = {
    unlinkSync: vi.fn(),
  };

  return {
    actionGithub,
    config,
    core,
    exec,
    fs,
    github,
  };
});

// The action package owns its @actions/* dependencies outside the root test resolver,
// so mock both the bare specifiers and the nested ESM entrypoints used by main.ts.
vi.mock('@actions/core', () => mocks.core);
vi.mock('../../code-scan-action/node_modules/@actions/core/lib/core.js', () => mocks.core);

vi.mock('@actions/exec', () => mocks.exec);
vi.mock('../../code-scan-action/node_modules/@actions/exec/lib/exec.js', () => mocks.exec);

vi.mock('@actions/github', () => mocks.github);
vi.mock('../../code-scan-action/node_modules/@actions/github/lib/github.js', () => mocks.github);

vi.mock('../../code-scan-action/src/github', () => mocks.actionGithub);
vi.mock('../../code-scan-action/src/config', () => mocks.config);

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    unlinkSync: mocks.fs.unlinkSync,
  };
});

const originalEnv = { ...process.env };

interface PromptfooExecCall {
  args: string[];
  options?: { env?: Record<string, string> };
}

interface NpmExecCall {
  options?: { env?: Record<string, string> };
}

function setupMocks() {
  mocks.core.getInput.mockImplementation((name: string) => {
    if (name === 'github-token') {
      return 'fake-token';
    }
    if (name === 'min-severity' || name === 'minimum-severity') {
      return 'medium';
    }
    return '';
  });
  mocks.core.getIDToken.mockResolvedValue('fake-oidc-token');

  mocks.exec.exec.mockImplementation(
    async (
      command: string,
      _args: string[] | undefined,
      options: { listeners?: { stdout?: (data: Buffer) => void } } | undefined,
    ) => {
      if (command === 'promptfoo' && options?.listeners?.stdout) {
        const response = JSON.stringify({
          success: true,
          comments: [],
          commentsPosted: false,
        });
        options.listeners.stdout(Buffer.from(response));
      }
      return 0;
    },
  );

  mocks.github.getOctokit.mockReturnValue({
    rest: {
      pulls: {
        get: vi.fn().mockResolvedValue({
          data: { base: { ref: 'main' } },
        }),
      },
    },
  });

  mocks.actionGithub.getGitHubContext.mockResolvedValue({
    owner: 'test-owner',
    repo: 'test-repo',
    number: 123,
    sha: 'abc123',
  });
  mocks.actionGithub.getPRFiles.mockResolvedValue([{ path: 'src/index.ts', status: 'modified' }]);
  mocks.config.generateConfigFile.mockReturnValue('/tmp/test-config.yaml');
}

async function importActionAndGetPromptfooCall(): Promise<PromptfooExecCall> {
  await import('../../code-scan-action/src/main');

  const call = await vi.waitFor(() => {
    const promptfooCall = mocks.exec.exec.mock.calls.find(
      ([command, args]) => command === 'promptfoo' && Array.isArray(args),
    );

    if (!promptfooCall || !Array.isArray(promptfooCall[1])) {
      throw new Error('promptfoo exec call not found');
    }

    return promptfooCall;
  });

  return {
    args: call[1],
    options: call[2] as PromptfooExecCall['options'],
  };
}

async function importActionAndGetNpmInstallCall(): Promise<NpmExecCall> {
  await import('../../code-scan-action/src/main');

  const call = await vi.waitFor(() => {
    const npmCall = mocks.exec.exec.mock.calls.find(
      ([command, args]) =>
        command === 'npm' &&
        Array.isArray(args) &&
        args[0] === 'install' &&
        args[1] === '-g' &&
        args[2] === 'promptfoo',
    );

    if (!npmCall) {
      throw new Error('npm install exec call not found');
    }

    return npmCall;
  });

  return {
    options: call[2] as NpmExecCall['options'],
  };
}

function expectCliArg(args: string[], name: string, value: string): void {
  const argIndex = args.indexOf(name);
  expect(argIndex).toBeGreaterThan(-1);
  expect(args[argIndex + 1]).toBe(value);
}

function expectSanitizedExecEnv(options: PromptfooExecCall['options'] | NpmExecCall['options']) {
  expect(options?.env).toEqual(expect.any(Object));
  expect(options?.env?.NPM_CONFIG_BEFORE).toBeUndefined();
  expect(options?.env?.npm_config_before).toBeUndefined();
}

describe('code-scan-action main', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    restoreEnv = mockProcessEnv(
      { ...originalEnv, GITHUB_WORKSPACE: '/test/workspace' },
      { clear: true },
    );
    setupMocks();
  });

  afterEach(() => {
    restoreEnv();
    vi.clearAllMocks();
  });

  describe('CLI args construction', () => {
    it('should pass --base with GITHUB_BASE_REF when set', async () => {
      process.env.GITHUB_BASE_REF = 'feat/my-feature-branch';

      const { args } = await importActionAndGetPromptfooCall();

      expectCliArg(args, '--base', 'feat/my-feature-branch');
    });

    it('should pass --base with "main" when GITHUB_BASE_REF is not set', async () => {
      delete process.env.GITHUB_BASE_REF;

      const { args } = await importActionAndGetPromptfooCall();

      expectCliArg(args, '--base', 'main');
    });

    it('should pass --base for stacked PR base branches', async () => {
      process.env.GITHUB_BASE_REF = 'feat/openai-sora-video-provider';

      const { args } = await importActionAndGetPromptfooCall();

      expectCliArg(args, '--base', 'feat/openai-sora-video-provider');
    });

    it('should not pass NPM_CONFIG_BEFORE to the promptfoo scan command', async () => {
      process.env.GITHUB_BASE_REF = 'main';
      process.env.NPM_CONFIG_BEFORE = '2026-03-29T00:00:00.000Z';
      process.env.npm_config_before = '2026-03-29T00:00:00.000Z';

      const { options } = await importActionAndGetPromptfooCall();

      expectSanitizedExecEnv(options);
    });

    it('should not pass NPM_CONFIG_BEFORE to npm install', async () => {
      process.env.GITHUB_BASE_REF = 'main';
      process.env.NPM_CONFIG_BEFORE = '2026-03-29T00:00:00.000Z';
      process.env.npm_config_before = '2026-03-29T00:00:00.000Z';

      const { options } = await importActionAndGetNpmInstallCall();

      expectSanitizedExecEnv(options);
    });
  });
});
