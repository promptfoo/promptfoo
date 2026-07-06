/**
 * Main Entry Point Tests
 *
 * Tests for the GitHub Action main entry point, specifically the CLI args construction.
 */

import * as path from 'node:path';
import type { Stats } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileChangeStatus } from '../../src/types/codeScan';
import { mockProcessEnv } from '../util/utils';

interface PullRequestPayload {
  repository: {
    full_name: string;
  };
  pull_request: {
    number: number;
    head: {
      sha: string;
      repo: {
        full_name: string;
      };
    };
    base: {
      repo: {
        full_name: string;
      };
    };
  };
}

interface WorkflowDispatchPayload {
  repository: {
    full_name: string;
  };
  inputs: {
    pr_number: string;
  };
}

type MockGitHubPayload = PullRequestPayload | WorkflowDispatchPayload;

const mocks = vi.hoisted(() => {
  const core = {
    getInput: vi.fn(),
    getBooleanInput: vi.fn(),
    getIDToken: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    setOutput: vi.fn(),
    setFailed: vi.fn(),
  };

  const exec = {
    exec: vi.fn(),
  };

  const github = {
    context: {
      eventName: 'pull_request',
      repo: {
        owner: 'test-owner',
        repo: 'test-repo',
      },
      payload: {
        repository: {
          full_name: 'test-owner/test-repo',
        },
        pull_request: {
          number: 123,
          head: {
            sha: 'abc123',
            repo: {
              full_name: 'test-owner/test-repo',
            },
          },
          base: {
            repo: {
              full_name: 'test-owner/test-repo',
            },
          },
        },
      } as MockGitHubPayload,
    },
    getOctokit: vi.fn(),
  };

  const actionGithub = {
    getGitHubContext: vi.fn(),
    getPRFiles: vi.fn(),
    partitionReviewCommentsByDiff: vi.fn(),
  };

  const config = {
    generateConfigFile: vi.fn(),
  };

  const fs = {
    readFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    realpathSync: vi.fn(),
    lstatSync: vi.fn(),
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
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    readFileSync: mocks.fs.readFileSync,
    unlinkSync: mocks.fs.unlinkSync,
    writeFileSync: mocks.fs.writeFileSync,
    mkdirSync: mocks.fs.mkdirSync,
    realpathSync: mocks.fs.realpathSync,
    lstatSync: mocks.fs.lstatSync,
    // Strip O_NOFOLLOW so writeSarifFile takes the writeFileSync fallback path that the
    // tests are written against. The O_NOFOLLOW branch is straightforward fs plumbing
    // (open/write/close); the user-visible defenses (lstat refusal, parent-realpath
    // refusal, traversal refusal) are exercised by dedicated tests.
    constants: { ...actual.constants, O_NOFOLLOW: undefined },
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

interface PromptfooAndNpmExecCalls {
  npmInstall: NpmExecCall;
  promptfoo: PromptfooExecCall;
}

function setupMocks() {
  mocks.github.context.eventName = 'pull_request';
  mocks.github.context.repo = {
    owner: 'test-owner',
    repo: 'test-repo',
  };
  mocks.github.context.payload = {
    repository: {
      full_name: 'test-owner/test-repo',
    },
    pull_request: {
      number: 123,
      head: {
        sha: 'abc123',
        repo: {
          full_name: 'test-owner/test-repo',
        },
      },
      base: {
        repo: {
          full_name: 'test-owner/test-repo',
        },
      },
    },
  };

  mocks.core.getInput.mockImplementation((name: string) => {
    if (name === 'api-host') {
      return 'https://api.promptfoo.app';
    }
    if (name === 'github-token') {
      return 'fake-token';
    }
    if (name === 'min-severity' || name === 'minimum-severity') {
      return 'medium';
    }
    return '';
  });
  mocks.core.getBooleanInput.mockReturnValue(false);
  mocks.core.getIDToken.mockResolvedValue('fake-oidc-token');

  mocks.fs.realpathSync.mockImplementation((p: string) => p);
  // Default: target file does not exist yet, so writeSarifFile won't trip the symlink check.
  mocks.fs.lstatSync.mockImplementation(() => {
    const error = new Error('ENOENT') as NodeJS.ErrnoException;
    error.code = 'ENOENT';
    throw error;
  });

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
  mocks.actionGithub.partitionReviewCommentsByDiff.mockImplementation(
    async (_token: string, _context: unknown, comments: unknown[]) => ({
      lineComments: comments,
      generalComments: [],
      invalidLineComments: [],
    }),
  );
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

async function importActionAndGetPromptfooAndNpmCalls(): Promise<PromptfooAndNpmExecCalls> {
  await import('../../code-scan-action/src/main');

  const calls = await vi.waitFor(() => {
    const promptfooCall = mocks.exec.exec.mock.calls.find(
      ([command, args]) => command === 'promptfoo' && Array.isArray(args),
    );
    const npmCall = mocks.exec.exec.mock.calls.find(
      ([command, args]) =>
        command === 'npm' &&
        Array.isArray(args) &&
        args[0] === 'install' &&
        args[1] === '-g' &&
        args[2] === 'promptfoo',
    );

    if (!promptfooCall || !Array.isArray(promptfooCall[1]) || !npmCall) {
      throw new Error('expected promptfoo and npm install exec calls not found');
    }

    return { npmCall, promptfooCall };
  });

  return {
    npmInstall: {
      options: calls.npmCall[2] as NpmExecCall['options'],
    },
    promptfoo: {
      args: calls.promptfooCall[1],
      options: calls.promptfooCall[2] as PromptfooExecCall['options'],
    },
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

function mockInheritedActionAuthEnv() {
  mockProcessEnv({
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'inherited-id-token-request-token',
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://token.actions.example/request',
    GH_TOKEN: 'inherited-gh-token',
    GITHUB_OIDC_TOKEN: 'stale-oidc-token',
    GITHUB_TOKEN: 'inherited-github-token',
    'INPUT_GITHUB-TOKEN': 'input-github-token',
    INPUT_GITHUB_TOKEN: 'input-github-token-compat',
  });
}

function expectNoActionAuthEnv(options: PromptfooExecCall['options'] | NpmExecCall['options']) {
  expect(options?.env?.ACTIONS_ID_TOKEN_REQUEST_TOKEN).toBeUndefined();
  expect(options?.env?.ACTIONS_ID_TOKEN_REQUEST_URL).toBeUndefined();
  expect(options?.env?.GH_TOKEN).toBeUndefined();
  expect(options?.env?.GITHUB_TOKEN).toBeUndefined();
  expect(options?.env?.['INPUT_GITHUB-TOKEN']).toBeUndefined();
  expect(options?.env?.INPUT_GITHUB_TOKEN).toBeUndefined();
}

function setPullRequestRepos(headRepoFullName: string, baseRepoFullName = 'test-owner/test-repo') {
  if (!('pull_request' in mocks.github.context.payload)) {
    throw new Error('Expected a pull_request payload');
  }

  mocks.github.context.payload.pull_request.head.repo.full_name = headRepoFullName;
  mocks.github.context.payload.pull_request.base.repo.full_name = baseRepoFullName;
}

function mockActionInputs(
  values: Record<string, string> = {},
  booleanValues: Record<string, boolean> = {},
): void {
  mocks.core.getInput.mockImplementation((name: string) => {
    if (Object.hasOwn(values, name)) {
      return values[name];
    }
    if (name === 'api-host') {
      return 'https://api.promptfoo.app';
    }
    if (name === 'github-token') {
      return 'fake-token';
    }
    return '';
  });
  mocks.core.getBooleanInput.mockImplementation((name: string) => booleanValues[name] ?? false);
}

describe('code-scan-action main', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    // Use path.resolve so this test works on Windows too — path.resolve converts the
    // POSIX-style literal to a drive-prefixed Windows path that path.resolve will
    // then re-produce identically when the action does its own resolution.
    restoreEnv = mockProcessEnv(
      { ...originalEnv, GITHUB_WORKSPACE: path.resolve('/test/workspace') },
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
      mockProcessEnv({ GITHUB_BASE_REF: 'feat/my-feature-branch' });

      const { args } = await importActionAndGetPromptfooCall();

      expectCliArg(args, '--base', 'feat/my-feature-branch');
    });

    it('should pass --base with "main" when GITHUB_BASE_REF is not set', async () => {
      mockProcessEnv({ GITHUB_BASE_REF: undefined });

      const { args } = await importActionAndGetPromptfooCall();

      expectCliArg(args, '--base', 'main');
    });

    it('should pass --base for stacked PR base branches', async () => {
      mockProcessEnv({ GITHUB_BASE_REF: 'feat/openai-sora-video-provider' });

      const { args } = await importActionAndGetPromptfooCall();

      expectCliArg(args, '--base', 'feat/openai-sora-video-provider');
    });

    it('passes untrusted-looking refs and paths as single argv values', async () => {
      const base = 'main; echo injected';
      const configPath = './policy $(touch pwned).yaml';
      const apiHost = 'https://api.promptfoo.app/$(echo injected)';
      mockProcessEnv({ GITHUB_BASE_REF: base });
      mockActionInputs({ 'api-host': apiHost, 'config-path': configPath });

      const { args } = await importActionAndGetPromptfooCall();

      expectCliArg(args, '--base', base);
      expectCliArg(args, '--config', configPath);
      expectCliArg(args, '--api-host', apiHost);
      expect(args).not.toContain('echo');
      expect(args).not.toContain('touch');
    });

    it('should not pass NPM_CONFIG_BEFORE to the promptfoo scan command', async () => {
      mockProcessEnv({ GITHUB_BASE_REF: 'main' });
      mockProcessEnv({ NPM_CONFIG_BEFORE: '2026-03-29T00:00:00.000Z' });
      mockProcessEnv({ npm_config_before: '2026-03-29T00:00:00.000Z' });

      const { options } = await importActionAndGetPromptfooCall();

      expectSanitizedExecEnv(options);
    });

    it('should not pass NPM_CONFIG_BEFORE to npm install', async () => {
      mockProcessEnv({ GITHUB_BASE_REF: 'main' });
      mockProcessEnv({ NPM_CONFIG_BEFORE: '2026-03-29T00:00:00.000Z' });
      mockProcessEnv({ npm_config_before: '2026-03-29T00:00:00.000Z' });

      const { options } = await importActionAndGetNpmInstallCall();

      expectSanitizedExecEnv(options);
    });

    it('should pass the OIDC token only to the scan command if token minting succeeds', async () => {
      mockProcessEnv({ GITHUB_BASE_REF: 'main' });
      mockInheritedActionAuthEnv();

      const { npmInstall, promptfoo } = await importActionAndGetPromptfooAndNpmCalls();

      expect(npmInstall.options?.env?.GITHUB_OIDC_TOKEN).toBeUndefined();
      expectNoActionAuthEnv(npmInstall.options);
      expect(promptfoo.options?.env?.GITHUB_OIDC_TOKEN).toBe('fake-oidc-token');
      expectNoActionAuthEnv(promptfoo.options);
      expect(process.env.GITHUB_OIDC_TOKEN).toBe('stale-oidc-token');
    });

    it('should not pass stale OIDC credentials to subprocesses if token minting fails', async () => {
      mockProcessEnv({ GITHUB_BASE_REF: 'main' });
      mockInheritedActionAuthEnv();
      mocks.core.getIDToken.mockRejectedValue(new Error('OIDC not configured'));

      const { npmInstall, promptfoo } = await importActionAndGetPromptfooAndNpmCalls();

      expect(npmInstall.options?.env?.GITHUB_OIDC_TOKEN).toBeUndefined();
      expectNoActionAuthEnv(npmInstall.options);
      expect(promptfoo.options?.env?.GITHUB_OIDC_TOKEN).toBeUndefined();
      expectNoActionAuthEnv(promptfoo.options);
      expect(mocks.core.info).toHaveBeenCalledWith(
        'OIDC token not available: Failed to get GitHub OIDC token: OIDC not configured',
      );
    });
  });

  describe('fork PR controls', () => {
    it('should skip fork pull_request scans by default before fetching files or starting auth', async () => {
      setPullRequestRepos('external-contributor/test-repo');
      mocks.core.getInput.mockImplementation((name: string) => {
        if (name === 'api-host') {
          return 'https://api.promptfoo.app';
        }
        if (name === 'github-token') {
          return 'fake-token';
        }
        if (name === 'min-severity' || name === 'minimum-severity') {
          return 'medium';
        }
        if (name === 'guidance-file') {
          return '/tmp/missing-guidance.md';
        }
        return '';
      });

      await import('../../code-scan-action/src/main');

      await vi.waitFor(() => {
        expect(mocks.core.info).toHaveBeenCalledWith(
          '🔀 Fork PR detected and enable-fork-prs is false; skipping Promptfoo Code Scan',
        );
      });

      expect(mocks.actionGithub.getPRFiles).not.toHaveBeenCalled();
      expect(mocks.core.getIDToken).not.toHaveBeenCalled();
      expect(mocks.config.generateConfigFile).not.toHaveBeenCalled();
      expect(mocks.exec.exec).not.toHaveBeenCalled();
      expect(mocks.core.setFailed).not.toHaveBeenCalled();
    });

    it('should skip fork pull_request_target scans by default', async () => {
      mocks.github.context.eventName = 'pull_request_target';
      setPullRequestRepos('external-contributor/test-repo');

      await import('../../code-scan-action/src/main');

      await vi.waitFor(() => {
        expect(mocks.core.info).toHaveBeenCalledWith(
          '🔀 Fork PR detected and enable-fork-prs is false; skipping Promptfoo Code Scan',
        );
      });

      expect(mocks.actionGithub.getPRFiles).not.toHaveBeenCalled();
      expect(mocks.core.getIDToken).not.toHaveBeenCalled();
      expect(mocks.exec.exec).not.toHaveBeenCalled();
      expect(mocks.core.setFailed).not.toHaveBeenCalled();
    });

    it('fails closed when the PR source repository is missing from the event payload', async () => {
      if (!('pull_request' in mocks.github.context.payload)) {
        throw new Error('Expected a pull_request payload');
      }
      mocks.github.context.payload.pull_request.head.repo = null as never;

      await import('../../code-scan-action/src/main');

      await vi.waitFor(() => {
        expect(mocks.core.warning).toHaveBeenCalledWith(
          'Unable to determine PR source repository from GitHub event payload; treating it as a fork PR',
        );
      });
      expect(mocks.exec.exec).not.toHaveBeenCalled();
      expect(mocks.core.setFailed).not.toHaveBeenCalled();
    });

    it('should scan fork pull_request events when enable-fork-prs is true', async () => {
      setPullRequestRepos('external-contributor/test-repo');
      mocks.core.getBooleanInput.mockImplementation((name: string) => name === 'enable-fork-prs');

      const { args } = await importActionAndGetPromptfooCall();

      expectCliArg(args, '--github-pr', 'test-owner/test-repo#123');
      expect(mocks.actionGithub.getPRFiles).toHaveBeenCalled();
      expect(mocks.core.getIDToken).toHaveBeenCalled();
    });

    it('should allow workflow_dispatch scans when enable-fork-prs is false', async () => {
      mocks.github.context.eventName = 'workflow_dispatch';
      mocks.github.context.payload = {
        repository: {
          full_name: 'test-owner/test-repo',
        },
        inputs: {
          pr_number: '123',
        },
      };

      const { args } = await importActionAndGetPromptfooCall();

      expectCliArg(args, '--github-pr', 'test-owner/test-repo#123');
      expect(mocks.actionGithub.getPRFiles).toHaveBeenCalled();
      expect(mocks.core.getIDToken).toHaveBeenCalled();
    });

    it('should surface skipReason when fork PR scanning awaits maintainer approval', async () => {
      mockProcessEnv({ GITHUB_BASE_REF: 'main' });
      const skipMessage =
        'Fork PR scanning requires maintainer approval. See PR comment for options.';
      mocks.exec.exec.mockImplementation(
        async (
          command: string,
          _args: string[] | undefined,
          options: { listeners?: { stdout?: (data: Buffer) => void } } | undefined,
        ) => {
          if (command === 'promptfoo' && options?.listeners?.stdout) {
            options.listeners.stdout(
              Buffer.from(
                JSON.stringify({
                  success: true,
                  comments: [],
                  skipReason: skipMessage,
                }),
              ),
            );
          }
          return 0;
        },
      );

      await import('../../code-scan-action/src/main');

      await vi.waitFor(() => {
        expect(mocks.core.info).toHaveBeenCalledWith(`🔀 Scan skipped: ${skipMessage}`);
      });

      // The generic "Comments posted to PR by scan server" log should NOT fire for skips —
      // that message was misleading because no scan findings were actually posted.
      expect(mocks.core.info).not.toHaveBeenCalledWith('✅ Comments posted to PR by scan server');
      expect(mocks.core.setFailed).not.toHaveBeenCalled();
    });

    it('should preserve legacy text fork-authorization skips during CLI rollout', async () => {
      mockProcessEnv({ GITHUB_BASE_REF: 'main' });
      mocks.exec.exec.mockImplementation(
        async (
          command: string,
          _args: string[] | undefined,
          options:
            | { listeners?: { stdout?: (data: Buffer) => void; stderr?: (data: Buffer) => void } }
            | undefined,
        ) => {
          if (command === 'promptfoo' && options?.listeners?.stderr) {
            options.listeners.stderr(Buffer.from('Fork PR scanning not authorized'));
            return 1;
          }
          return 0;
        },
      );

      await import('../../code-scan-action/src/main');

      await vi.waitFor(() => {
        expect(mocks.core.info).toHaveBeenCalledWith(
          '🔀 Scan skipped: Fork PR scanning requires maintainer approval. See PR comment for options.',
        );
      });
      expect(mocks.core.setFailed).not.toHaveBeenCalled();
    });
  });

  describe('SARIF output', () => {
    function mockFallbackPosting() {
      const createReview = vi.fn().mockResolvedValue({});
      const createComment = vi.fn().mockResolvedValue({});
      mocks.github.getOctokit.mockReturnValue({
        rest: {
          pulls: {
            createReview,
            get: vi.fn().mockResolvedValue({
              data: { base: { ref: 'main' } },
            }),
          },
          issues: {
            createComment,
          },
        },
      });
      return { createComment, createReview };
    }

    function mockPromptfooScanResponse(response: unknown) {
      mocks.exec.exec.mockImplementation(
        async (
          command: string,
          _args: string[] | undefined,
          options: { listeners?: { stdout?: (data: Buffer) => void } } | undefined,
        ) => {
          if (command === 'promptfoo' && options?.listeners?.stdout) {
            options.listeners.stdout(Buffer.from(JSON.stringify(response)));
          }
          return 0;
        },
      );
    }

    async function triggerSarifAction(rawPath: string) {
      mocks.core.getInput.mockImplementation((name: string) => {
        if (name === 'github-token') {
          return 'fake-token';
        }
        if (name === 'min-severity' || name === 'minimum-severity') {
          return 'medium';
        }
        if (name === 'sarif-output-path') {
          return rawPath;
        }
        return '';
      });
      await import('../../code-scan-action/src/main');
    }

    it('resolves the path against GITHUB_WORKSPACE, creates parent dirs, and exposes the resolved path', async () => {
      await triggerSarifAction('reports/promptfoo-code-scan.sarif');

      const expectedPath = path.resolve('/test/workspace', 'reports/promptfoo-code-scan.sarif');
      const expectedDir = path.dirname(expectedPath);

      await vi.waitFor(() => {
        expect(mocks.fs.writeFileSync).toHaveBeenCalledWith(expectedPath, expect.any(String));
      });

      expect(mocks.fs.mkdirSync).toHaveBeenCalledWith(expectedDir, { recursive: true });
      const [, sarifJson] = mocks.fs.writeFileSync.mock.calls[0];
      expect(sarifJson).toEqual(expect.stringMatching(/\n$/));
      expect(JSON.parse(sarifJson as string)).toMatchObject({
        $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
        version: '2.1.0',
      });
      expect(mocks.core.setOutput).toHaveBeenCalledWith('sarif-path', expectedPath);
      expect(mocks.core.warning).not.toHaveBeenCalled();
    });

    it('accepts an absolute SARIF path inside GITHUB_WORKSPACE', async () => {
      const absolutePath = path.resolve('/test/workspace/reports/absolute.sarif');

      await triggerSarifAction(absolutePath);

      await vi.waitFor(() => {
        expect(mocks.fs.writeFileSync).toHaveBeenCalledWith(absolutePath, expect.any(String));
      });
      expect(mocks.core.setOutput).toHaveBeenCalledWith('sarif-path', absolutePath);
      expect(mocks.core.warning).not.toHaveBeenCalled();
    });

    it('does not write SARIF when a fork PR scan is skipped', async () => {
      setPullRequestRepos('external-contributor/test-repo');

      await triggerSarifAction('reports/promptfoo-code-scan.sarif');

      await vi.waitFor(() => {
        expect(mocks.core.info).toHaveBeenCalledWith(
          '🔀 Fork PR detected and enable-fork-prs is false; skipping Promptfoo Code Scan',
        );
      });

      expect(mocks.fs.writeFileSync).not.toHaveBeenCalled();
      expect(mocks.core.setOutput).not.toHaveBeenCalledWith('sarif-path', expect.anything());
      expect(mocks.actionGithub.getPRFiles).not.toHaveBeenCalled();
    });

    it('does not write SARIF when the scanner returns a skipReason without completing a scan', async () => {
      mocks.exec.exec.mockImplementation(
        async (
          command: string,
          _args: string[] | undefined,
          options: { listeners?: { stdout?: (data: Buffer) => void } } | undefined,
        ) => {
          if (command === 'promptfoo' && options?.listeners?.stdout) {
            options.listeners.stdout(
              Buffer.from(
                JSON.stringify({
                  success: true,
                  comments: [],
                  skipReason: 'Fork PR scanning requires maintainer approval.',
                }),
              ),
            );
          }
          return 0;
        },
      );

      await triggerSarifAction('reports/promptfoo-code-scan.sarif');

      await vi.waitFor(() => {
        expect(mocks.core.info).toHaveBeenCalledWith(
          '🔀 Scan skipped: Fork PR scanning requires maintainer approval.',
        );
      });

      expect(mocks.fs.writeFileSync).not.toHaveBeenCalled();
      expect(mocks.core.setOutput).not.toHaveBeenCalledWith('sarif-path', expect.anything());
    });

    it('posts file-only findings from ordinary scan responses as general fallback comments', async () => {
      const { createComment, createReview } = mockFallbackPosting();
      mockPromptfooScanResponse({
        success: true,
        comments: [
          {
            file: 'src/file-only.ts',
            line: null,
            finding: 'This file configures an unsafe model tool.',
            severity: 'high',
          },
        ],
        commentsPosted: false,
      });

      await triggerSarifAction('reports/promptfoo-code-scan.sarif');

      await vi.waitFor(() => {
        expect(createComment).toHaveBeenCalled();
      });

      expect(createReview).not.toHaveBeenCalled();
      expect(createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('**src/file-only.ts**'),
        }),
      );
    });

    it('posts line-level mixed-skip findings as fallback comments but withholds SARIF', async () => {
      const { createComment, createReview } = mockFallbackPosting();
      mockPromptfooScanResponse({
        success: true,
        comments: [
          {
            file: 'src/handler.ts',
            line: 12,
            finding: 'User input reaches the model prompt without sanitization.',
            severity: 'high',
          },
        ],
        commentsPosted: false,
        skipReason: 'Unexpected mixed response.',
      });

      await triggerSarifAction('reports/promptfoo-code-scan.sarif');

      await vi.waitFor(() => {
        expect(createReview).toHaveBeenCalled();
      });

      expect(mocks.core.warning).toHaveBeenCalledWith(
        'Scan response included findings alongside a skipReason ("Unexpected mixed response."); processing findings.',
      );
      expect(createReview).toHaveBeenCalledWith(
        expect.objectContaining({
          comments: [
            expect.objectContaining({
              path: 'src/handler.ts',
              line: 12,
            }),
          ],
        }),
      );
      expect(createComment).not.toHaveBeenCalled();
      // A skipReason means the scan did not complete: withhold SARIF entirely so a partial
      // run cannot close prior Code Scanning alerts under the same category.
      expect(mocks.fs.writeFileSync).not.toHaveBeenCalled();
      expect(mocks.core.setOutput).not.toHaveBeenCalledWith('sarif-path', expect.anything());
    });

    it('routes mixed-skip findings that cannot be placed in the diff to general comments', async () => {
      const { createComment, createReview } = mockFallbackPosting();
      mocks.actionGithub.partitionReviewCommentsByDiff.mockImplementation(
        async (_token: string, _context: unknown, comments: unknown[]) => ({
          lineComments: [],
          generalComments: [],
          invalidLineComments: comments,
        }),
      );
      mockPromptfooScanResponse({
        success: true,
        comments: [
          {
            file: 'src/outside-diff.ts',
            line: 500,
            finding: 'This finding cannot be placed on the visible PR diff.',
            severity: 'high',
          },
        ],
        commentsPosted: false,
        skipReason: 'Unexpected mixed response.',
      });

      await triggerSarifAction('reports/promptfoo-code-scan.sarif');

      await vi.waitFor(() => {
        expect(createComment).toHaveBeenCalled();
      });

      expect(createReview).not.toHaveBeenCalled();
      expect(createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('**src/outside-diff.ts:500**'),
        }),
      );
    });

    it('posts file-only mixed-skip findings as general fallback comments but withholds SARIF', async () => {
      const { createComment, createReview } = mockFallbackPosting();
      mockPromptfooScanResponse({
        success: true,
        comments: [
          {
            file: 'src/file-only.ts',
            line: null,
            finding: 'This file configures an unsafe model tool.',
            severity: 'high',
          },
        ],
        commentsPosted: false,
        skipReason: 'Unexpected mixed response.',
      });

      await triggerSarifAction('reports/promptfoo-code-scan.sarif');

      await vi.waitFor(() => {
        expect(createComment).toHaveBeenCalled();
      });

      expect(createReview).not.toHaveBeenCalled();
      expect(createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('**src/file-only.ts**'),
        }),
      );
      // skipReason present: findings still reach the PR, but no SARIF is written.
      expect(mocks.fs.writeFileSync).not.toHaveBeenCalled();
      expect(mocks.core.setOutput).not.toHaveBeenCalledWith('sarif-path', expect.anything());
    });

    it('posts fileless mixed-skip findings as general fallback comments without empty SARIF', async () => {
      const { createComment, createReview } = mockFallbackPosting();
      mockPromptfooScanResponse({
        success: true,
        comments: [
          {
            file: null,
            line: null,
            finding: 'The scan found a PR-wide unsafe agent behavior.',
            severity: 'high',
          },
        ],
        commentsPosted: false,
        skipReason: 'Unexpected mixed response.',
      });

      await triggerSarifAction('reports/promptfoo-code-scan.sarif');

      await vi.waitFor(() => {
        expect(createComment).toHaveBeenCalled();
      });

      expect(createReview).not.toHaveBeenCalled();
      expect(createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('The scan found a PR-wide unsafe agent behavior.'),
        }),
      );
      expect(mocks.fs.writeFileSync).not.toHaveBeenCalled();
      expect(mocks.core.setOutput).not.toHaveBeenCalledWith('sarif-path', expect.anything());
    });

    it('does not process mixed skips with findings that are neither SARIF-reportable nor PR-postable', async () => {
      mockPromptfooScanResponse({
        success: true,
        comments: [
          {
            file: 'src/handler.ts',
            line: 12,
            finding: 'No issue found on this line.',
            severity: 'none',
          },
          {
            file: null,
            line: null,
            finding: 'General advisory not pinned to a file.',
            severity: 'none',
          },
        ],
        skipReason: 'Fork PR scanning requires maintainer approval.',
      });

      await triggerSarifAction('reports/promptfoo-code-scan.sarif');

      await vi.waitFor(() => {
        expect(mocks.core.info).toHaveBeenCalledWith(
          '🔀 Scan skipped: Fork PR scanning requires maintainer approval.',
        );
      });

      expect(mocks.core.warning).not.toHaveBeenCalledWith(
        expect.stringContaining('processing findings'),
      );
      expect(mocks.fs.writeFileSync).not.toHaveBeenCalled();
      expect(mocks.core.setOutput).not.toHaveBeenCalledWith('sarif-path', expect.anything());
    });

    it('does not write SARIF when a setup PR is skipped', async () => {
      mocks.actionGithub.getPRFiles.mockResolvedValue([
        {
          path: '.github/workflows/promptfoo-code-scan.yml',
          status: FileChangeStatus.ADDED,
        },
      ]);

      await triggerSarifAction('reports/promptfoo-code-scan.sarif');

      await vi.waitFor(() => {
        expect(mocks.core.info).toHaveBeenCalledWith(
          '✅ Setup PR detected - workflow file will be added on merge',
        );
      });

      expect(mocks.fs.writeFileSync).not.toHaveBeenCalled();
      expect(mocks.core.setOutput).not.toHaveBeenCalledWith('sarif-path', expect.anything());
      expect(mocks.exec.exec).not.toHaveBeenCalledWith(
        'promptfoo',
        expect.anything(),
        expect.anything(),
      );
    });

    it('refuses to write when sarif-output-path escapes GITHUB_WORKSPACE', async () => {
      await triggerSarifAction('../escape.sarif');

      await vi.waitFor(() => {
        expect(mocks.core.warning).toHaveBeenCalledWith(
          expect.stringContaining('resolves outside GITHUB_WORKSPACE'),
        );
      });

      expect(mocks.fs.writeFileSync).not.toHaveBeenCalled();
      expect(mocks.fs.mkdirSync).not.toHaveBeenCalled();
      expect(mocks.core.setOutput).not.toHaveBeenCalledWith('sarif-path', expect.anything());
      expect(mocks.core.setFailed).not.toHaveBeenCalled();
    });

    it('walks up through ENOENT ancestors to find a real symlink when the immediate parent does not exist yet', async () => {
      // Simulate: `reports/` is a symlink to /etc, the new sub-directory `reports/today` doesn't
      // exist yet. realpath of the not-yet-created leaf throws ENOENT and we walk up to the
      // existing symlink, which canonicalizes outside the workspace.
      const escapeDir = path.resolve('/test/workspace', 'reports');
      const newSubdir = path.resolve('/test/workspace', 'reports/today');
      mocks.fs.realpathSync.mockImplementation((p: string) => {
        if (p === newSubdir) {
          const error = new Error('ENOENT') as NodeJS.ErrnoException;
          error.code = 'ENOENT';
          throw error;
        }
        if (p === escapeDir) {
          return '/etc';
        }
        return p;
      });

      await triggerSarifAction('reports/today/x.sarif');

      await vi.waitFor(() => {
        expect(mocks.core.warning).toHaveBeenCalledWith(expect.stringContaining('via symlink'));
      });

      expect(mocks.fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('refuses to write when the parent directory resolves outside the workspace via symlink', async () => {
      // Match the trailing `escape` segment regardless of platform path separator so this works on Windows.
      mocks.fs.realpathSync.mockImplementation((p: string) =>
        /[/\\]escape$/.test(p) ? '/etc' : p,
      );

      await triggerSarifAction('escape/result.sarif');

      await vi.waitFor(() => {
        expect(mocks.core.warning).toHaveBeenCalledWith(expect.stringContaining('via symlink'));
      });

      expect(mocks.fs.writeFileSync).not.toHaveBeenCalled();
      expect(mocks.core.setOutput).not.toHaveBeenCalledWith('sarif-path', expect.anything());
    });

    it('refuses to overwrite an existing symlink at the target path', async () => {
      mocks.fs.lstatSync.mockReturnValue({ isSymbolicLink: () => true } as Stats);

      await triggerSarifAction('promptfoo-code-scan.sarif');

      await vi.waitFor(() => {
        expect(mocks.core.warning).toHaveBeenCalledWith(
          expect.stringContaining('existing symlink'),
        );
      });

      expect(mocks.fs.writeFileSync).not.toHaveBeenCalled();
      expect(mocks.core.setOutput).not.toHaveBeenCalledWith('sarif-path', expect.anything());
    });

    it('warns and continues when the SARIF write fails', async () => {
      mocks.fs.writeFileSync.mockImplementationOnce(() => {
        throw new Error('disk full');
      });

      await triggerSarifAction('promptfoo-code-scan.sarif');

      await vi.waitFor(() => {
        expect(mocks.core.warning).toHaveBeenCalledWith(
          expect.stringContaining('Failed to write SARIF output'),
        );
      });

      expect(mocks.core.setOutput).not.toHaveBeenCalledWith('sarif-path', expect.anything());
      expect(mocks.core.setFailed).not.toHaveBeenCalled();
    });

    it('degrades line findings to general comments when the PR review write fails', async () => {
      const { createComment, createReview } = mockFallbackPosting();
      // createReview can reject the whole review (e.g. GitHub 422 after the PR diff moves).
      createReview.mockRejectedValue(new Error('GitHub API: 422 Unprocessable Entity'));
      mockPromptfooScanResponse({
        success: true,
        comments: [
          {
            file: 'src/handler.ts',
            line: 12,
            finding: 'User input reaches the model prompt without sanitization.',
            severity: 'high',
          },
        ],
        commentsPosted: false,
      });

      await triggerSarifAction('reports/promptfoo-code-scan.sarif');

      await vi.waitFor(() => {
        expect(createComment).toHaveBeenCalled();
      });

      // The rejected review must not silently drop the finding: it is re-posted as a general
      // comment that preserves the original file:line location.
      expect(createReview).toHaveBeenCalled();
      expect(mocks.core.warning).toHaveBeenCalledWith(
        expect.stringContaining('Failed to post PR review'),
      );
      expect(createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('**src/handler.ts:12**'),
        }),
      );
      expect(mocks.core.setFailed).not.toHaveBeenCalled();
    });

    it('fails the Action when both the PR review and the general-comment fallback fail', async () => {
      const { createComment, createReview } = mockFallbackPosting();
      createReview.mockRejectedValue(new Error('GitHub API: 422 Unprocessable Entity'));
      createComment.mockRejectedValue(new Error('GitHub API: 403 Forbidden'));
      mockPromptfooScanResponse({
        success: true,
        comments: [
          {
            file: 'src/handler.ts',
            line: 12,
            finding: 'User input reaches the model prompt without sanitization.',
            severity: 'high',
          },
        ],
        commentsPosted: false,
      });

      await triggerSarifAction('reports/promptfoo-code-scan.sarif');

      await vi.waitFor(() => {
        expect(mocks.core.setFailed).toHaveBeenCalled();
      });
      expect(mocks.core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('could not be posted to the PR'),
      );
    });

    it('degrades all line findings to general comments when diff validation fails', async () => {
      const { createComment, createReview } = mockFallbackPosting();
      // Fetching/validating the diff throws; every prepared line comment must still be
      // surfaced as a general comment rather than dropped.
      mocks.actionGithub.partitionReviewCommentsByDiff.mockRejectedValue(
        new Error('GitHub API: 500 fetching diff'),
      );
      mockPromptfooScanResponse({
        success: true,
        comments: [
          {
            file: 'src/handler.ts',
            line: 12,
            finding: 'User input reaches the model prompt without sanitization.',
            severity: 'high',
          },
        ],
        commentsPosted: false,
      });

      await triggerSarifAction('reports/promptfoo-code-scan.sarif');

      await vi.waitFor(() => {
        expect(createComment).toHaveBeenCalled();
      });

      expect(createReview).not.toHaveBeenCalled();
      expect(createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('**src/handler.ts:12**'),
        }),
      );
      expect(mocks.core.setFailed).not.toHaveBeenCalled();
    });
  });

  describe('config-path precedence', () => {
    it('uses only trusted workflow inputs outside the selected config policy', async () => {
      const configPath = './trusted/policy.yaml';
      mockActionInputs({
        'config-path': configPath,
        'min-severity': 'not-a-severity',
        'diffs-only': 'not-a-boolean',
        guidance: 'ignored guidance',
        'guidance-file': '/tmp/missing-guidance.md',
      });
      mocks.core.getBooleanInput.mockImplementation((name: string) => {
        if (name === 'diffs-only') {
          throw new Error('diffs-only must not be parsed with config-path');
        }
        return false;
      });

      const { args } = await importActionAndGetPromptfooCall();

      expectCliArg(args, '--config', configPath);
      expectCliArg(args, '--api-host', 'https://api.promptfoo.app');
      expect(mocks.config.generateConfigFile).not.toHaveBeenCalled();
      expect(mocks.fs.readFileSync).not.toHaveBeenCalled();
      expect(mocks.fs.unlinkSync).not.toHaveBeenCalled();
      expect(mocks.core.getBooleanInput).not.toHaveBeenCalledWith('diffs-only');
      expect(mocks.core.warning).toHaveBeenCalledWith(
        'config-path supplies scan policy; ignoring Action inputs: min-severity, diffs-only, guidance, guidance-file',
      );
      expect(mocks.core.setFailed).not.toHaveBeenCalled();
    });

    it('uses the trusted default host when api-host is explicitly empty', async () => {
      mockActionInputs({ 'api-host': '', 'config-path': './trusted/policy.yaml' });

      const { args } = await importActionAndGetPromptfooCall();

      expectCliArg(args, '--api-host', 'https://api.promptfoo.app');
    });

    it.each([
      'relative/policy.yaml',
      path.resolve('/test/workspace/policy.yaml'),
    ])('passes the selected config path to the CLI without rewriting it: %s', async (configPath) => {
      mockActionInputs({ 'config-path': configPath });

      const { args } = await importActionAndGetPromptfooCall();

      expectCliArg(args, '--config', configPath);
      expect(mocks.config.generateConfigFile).not.toHaveBeenCalled();
    });

    it('keeps fallback operational links while omitting an unknown config severity', async () => {
      const createReview = vi.fn().mockResolvedValue({});
      mocks.github.getOctokit.mockReturnValue({
        rest: {
          pulls: {
            createReview,
            get: vi.fn().mockResolvedValue({ data: { base: { ref: 'main' } } }),
          },
          issues: { createComment: vi.fn().mockResolvedValue({}) },
        },
      });
      mockActionInputs({ 'config-path': './trusted/policy.yaml' });
      mocks.exec.exec.mockImplementation(
        async (
          command: string,
          _args: string[] | undefined,
          options: { listeners?: { stdout?: (data: Buffer) => void } } | undefined,
        ) => {
          if (command === 'promptfoo' && options?.listeners?.stdout) {
            options.listeners.stdout(
              Buffer.from(
                JSON.stringify({
                  success: true,
                  comments: [],
                  commentsPosted: false,
                  review: 'Fallback review from scan server',
                }),
              ),
            );
          }
          return 0;
        },
      );

      await import('../../code-scan-action/src/main');

      await vi.waitFor(() => expect(createReview).toHaveBeenCalled());
      const body = createReview.mock.calls[0][0].body as string;
      expect(body).toContain('Fallback review from scan server');
      expect(body).toContain('@promptfoo-scanner');
      expect(body).toContain('[Learn more]');
      expect(body).not.toContain('Minimum severity threshold');
    });
  });

  describe('diffs-only input resolution', () => {
    it.each([
      ['omitted', '', false],
      ['explicit false', 'false', false],
      ['explicit true', 'true', true],
    ])('generates config for %s', async (_label, rawValue, parsedValue) => {
      mockActionInputs({ 'diffs-only': rawValue }, { 'diffs-only': parsedValue });

      await importActionAndGetPromptfooCall();

      expect(mocks.config.generateConfigFile).toHaveBeenCalledWith(
        'medium',
        undefined,
        parsedValue,
      );
      if (rawValue) {
        expect(mocks.core.getBooleanInput).toHaveBeenCalledWith('diffs-only');
      } else {
        expect(mocks.core.getBooleanInput).not.toHaveBeenCalledWith('diffs-only');
      }
    });

    it('propagates malformed active boolean inputs as Action failures', async () => {
      mockActionInputs({ 'diffs-only': 'yes' });
      mocks.core.getBooleanInput.mockImplementation((name: string) => {
        if (name === 'diffs-only') {
          throw new Error('Invalid boolean input: yes');
        }
        return false;
      });

      await import('../../code-scan-action/src/main');

      await vi.waitFor(() => {
        expect(mocks.core.setFailed).toHaveBeenCalledWith('Invalid boolean input: yes');
      });
      expect(mocks.config.generateConfigFile).not.toHaveBeenCalled();
    });
  });

  describe('input and subprocess failure propagation', () => {
    it('fails when both active guidance inputs are supplied', async () => {
      mockActionInputs({ guidance: 'inline', 'guidance-file': '/tmp/guidance.md' });

      await import('../../code-scan-action/src/main');

      await vi.waitFor(() => {
        expect(mocks.core.setFailed).toHaveBeenCalledWith(
          'Cannot specify both guidance and guidance-file inputs',
        );
      });
      expect(mocks.exec.exec).not.toHaveBeenCalled();
    });

    it('fails when an active guidance file cannot be read', async () => {
      mockActionInputs({ 'guidance-file': '/tmp/missing-guidance.md' });
      mocks.fs.readFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      await import('../../code-scan-action/src/main');

      await vi.waitFor(() => {
        expect(mocks.core.setFailed).toHaveBeenCalledWith('Failed to read guidance file: ENOENT');
      });
      expect(mocks.exec.exec).not.toHaveBeenCalled();
    });

    it('cleans up generated config when npm installation fails', async () => {
      mocks.exec.exec.mockImplementation(async (command: string) => {
        if (command === 'npm') {
          throw new Error('npm install failed');
        }
        return 0;
      });

      await import('../../code-scan-action/src/main');

      await vi.waitFor(() => {
        expect(mocks.core.setFailed).toHaveBeenCalledWith('npm install failed');
      });
      expect(mocks.fs.unlinkSync).toHaveBeenCalledWith('/tmp/test-config.yaml');
    });

    it('propagates scanner exit failures and cleans up generated config', async () => {
      mocks.exec.exec.mockImplementation(
        async (
          command: string,
          _args: string[] | undefined,
          options: { listeners?: { stderr?: (data: Buffer) => void } } | undefined,
        ) => {
          if (command === 'promptfoo') {
            options?.listeners?.stderr?.(Buffer.from('scanner failed'));
            return 17;
          }
          return 0;
        },
      );

      await import('../../code-scan-action/src/main');

      await vi.waitFor(() => {
        expect(mocks.core.setFailed).toHaveBeenCalledWith('Code scan failed with exit code 17');
      });
      expect(mocks.core.error).toHaveBeenCalledWith('CLI exited with code 17');
      expect(mocks.fs.unlinkSync).toHaveBeenCalledWith('/tmp/test-config.yaml');
    });

    it('propagates invalid scanner JSON and cleans up generated config', async () => {
      mocks.exec.exec.mockImplementation(
        async (
          command: string,
          _args: string[] | undefined,
          options: { listeners?: { stdout?: (data: Buffer) => void } } | undefined,
        ) => {
          if (command === 'promptfoo') {
            options?.listeners?.stdout?.(Buffer.from('{invalid'));
          }
          return 0;
        },
      );

      await import('../../code-scan-action/src/main');

      await vi.waitFor(() => {
        expect(mocks.core.setFailed).toHaveBeenCalledWith(
          expect.stringContaining('Failed to parse CLI output as JSON'),
        );
      });
      expect(mocks.fs.unlinkSync).toHaveBeenCalledWith('/tmp/test-config.yaml');
    });
  });

  describe('minimum severity input resolution', () => {
    function mockSeverityInputs(values: {
      'min-severity'?: string;
      'minimum-severity'?: string;
    }): void {
      mocks.core.getInput.mockImplementation((name: string) => {
        if (name === 'github-token') {
          return 'fake-token';
        }
        if (name === 'min-severity') {
          return values['min-severity'] ?? '';
        }
        if (name === 'minimum-severity') {
          return values['minimum-severity'] ?? '';
        }
        return '';
      });
    }

    it('uses min-severity when only min-severity is set', async () => {
      mockSeverityInputs({ 'min-severity': 'critical' });

      await importActionAndGetPromptfooCall();

      expect(mocks.config.generateConfigFile).toHaveBeenCalledWith('critical', undefined, false);
      expect(mocks.core.warning).not.toHaveBeenCalledWith(expect.stringContaining('min-severity'));
    });

    it('uses minimum-severity when only the alias is set (regression test for #9427)', async () => {
      mockSeverityInputs({ 'minimum-severity': 'critical' });

      await importActionAndGetPromptfooCall();

      expect(mocks.config.generateConfigFile).toHaveBeenCalledWith('critical', undefined, false);
      expect(mocks.core.warning).not.toHaveBeenCalledWith(expect.stringContaining('min-severity'));
    });

    it('falls back to medium when neither input is set', async () => {
      mockSeverityInputs({});

      await importActionAndGetPromptfooCall();

      expect(mocks.config.generateConfigFile).toHaveBeenCalledWith('medium', undefined, false);
      expect(mocks.core.warning).not.toHaveBeenCalledWith(expect.stringContaining('min-severity'));
    });

    it('prefers min-severity and warns when both inputs disagree', async () => {
      mockSeverityInputs({ 'min-severity': 'high', 'minimum-severity': 'critical' });

      await importActionAndGetPromptfooCall();

      expect(mocks.config.generateConfigFile).toHaveBeenCalledWith('high', undefined, false);
      expect(mocks.core.warning).toHaveBeenCalledWith(
        expect.stringContaining('Both min-severity (high) and minimum-severity (critical) are set'),
      );
    });

    it('does not warn when both inputs are set to the same value', async () => {
      mockSeverityInputs({ 'min-severity': 'high', 'minimum-severity': 'high' });

      await importActionAndGetPromptfooCall();

      expect(mocks.config.generateConfigFile).toHaveBeenCalledWith('high', undefined, false);
      expect(mocks.core.warning).not.toHaveBeenCalledWith(expect.stringContaining('min-severity'));
    });

    it('normalizes case before comparing severity aliases', async () => {
      mockSeverityInputs({ 'min-severity': ' High ', 'minimum-severity': 'high' });

      await importActionAndGetPromptfooCall();

      expect(mocks.config.generateConfigFile).toHaveBeenCalledWith('high', undefined, false);
      expect(mocks.core.warning).not.toHaveBeenCalledWith(expect.stringContaining('min-severity'));
    });

    it('normalizes whitespace and case in severity inputs', async () => {
      mockSeverityInputs({ 'minimum-severity': '  CRITICAL  ' });

      await importActionAndGetPromptfooCall();

      expect(mocks.config.generateConfigFile).toHaveBeenCalledWith('critical', undefined, false);
    });

    it('propagates invalid active severity inputs as Action failures', async () => {
      mockSeverityInputs({ 'min-severity': 'high!' });
      mocks.config.generateConfigFile.mockImplementation(() => {
        throw new Error('Invalid severity: high!');
      });

      await import('../../code-scan-action/src/main');

      await vi.waitFor(() => {
        expect(mocks.core.setFailed).toHaveBeenCalledWith('Invalid severity: high!');
      });
      expect(mocks.exec.exec).not.toHaveBeenCalledWith(
        'promptfoo',
        expect.anything(),
        expect.anything(),
      );
    });
  });
});
