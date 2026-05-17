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
  };

  const config = {
    generateConfigFile: vi.fn(),
  };

  const fs = {
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

function setPullRequestRepos(headRepoFullName: string, baseRepoFullName = 'test-owner/test-repo') {
  if (!('pull_request' in mocks.github.context.payload)) {
    throw new Error('Expected a pull_request payload');
  }

  mocks.github.context.payload.pull_request.head.repo.full_name = headRepoFullName;
  mocks.github.context.payload.pull_request.base.repo.full_name = baseRepoFullName;
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
  });

  describe('fork PR controls', () => {
    it('should skip fork pull_request scans by default before fetching files or starting auth', async () => {
      setPullRequestRepos('external-contributor/test-repo');
      mocks.core.getInput.mockImplementation((name: string) => {
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

    it('should scan fork pull_request events when enable-fork-prs is true', async () => {
      setPullRequestRepos('external-contributor/test-repo');
      mocks.core.getBooleanInput.mockReturnValue(true);

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
  });

  describe('SARIF output', () => {
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

    it('does not write SARIF when fork PR scanning awaits maintainer approval', async () => {
      mocks.exec.exec.mockImplementation(
        async (
          command: string,
          _args: string[] | undefined,
          options: { listeners?: { stdout?: (data: Buffer) => void } } | undefined,
        ) => {
          if (command === 'promptfoo' && options?.listeners?.stdout) {
            options.listeners.stdout(Buffer.from('Fork PR scanning not authorized'));
            return 1;
          }
          return 0;
        },
      );

      await triggerSarifAction('reports/promptfoo-code-scan.sarif');

      await vi.waitFor(() => {
        expect(mocks.exec.exec).toHaveBeenCalledWith(
          'promptfoo',
          expect.anything(),
          expect.anything(),
        );
      });

      expect(mocks.fs.writeFileSync).not.toHaveBeenCalled();
      expect(mocks.core.setOutput).not.toHaveBeenCalledWith('sarif-path', expect.anything());
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
  });
});
