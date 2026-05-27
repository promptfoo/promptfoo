/**
 * Main Entry Point Tests
 *
 * Tests for the GitHub Action main entry point, specifically the CLI args construction.
 */

import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import type { Stats } from 'node:fs';

import yaml from 'js-yaml';
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
    existsSync: vi.fn(),
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
    existsSync: mocks.fs.existsSync,
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
    if (name === 'github-token') {
      return 'fake-token';
    }
    return '';
  });
  mocks.core.getBooleanInput.mockReturnValue(false);
  mocks.core.getIDToken.mockResolvedValue('fake-oidc-token');

  mocks.fs.existsSync.mockReturnValue(false);
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

function mockOctokitForFallbackPost() {
  const createReview = vi.fn().mockResolvedValue({});
  const createComment = vi.fn().mockResolvedValue({});

  mocks.github.getOctokit.mockReturnValue({
    rest: {
      pulls: {
        get: vi.fn().mockResolvedValue({
          data: { base: { ref: 'main' } },
        }),
        createReview,
      },
      issues: {
        createComment,
      },
    },
  });

  return { createComment, createReview };
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
    it('should not declare an api-host metadata default that overrides config-path', () => {
      const actionDefinition = yaml.load(
        readFileSync(path.resolve('code-scan-action/action.yml'), 'utf8'),
      ) as {
        inputs: Record<string, { default?: string }>;
      };

      expect(actionDefinition.inputs['api-host']).not.toHaveProperty('default');
    });

    it('should not declare metadata defaults that mask "was this input supplied?"', () => {
      // Regression for codex P3 on 3d435a5b5d: when an input carries
      // `default:` in action.yml, the runner injects that value into
      // `INPUT_<NAME>` even when the workflow does not set it. That makes
      // `core.getInput()` return a non-empty string on every run, which in
      // turn makes any "was this input supplied by the workflow?" detection
      // (used by warnIgnoredInputsWhenConfigPathSet + resolveMinimumSeverityInput)
      // light up unconditionally. Keep these inputs metadata-default-free so
      // the action code can carry the canonical default while still detecting
      // "supplied vs unset".
      const actionDefinition = yaml.load(
        readFileSync(path.resolve('code-scan-action/action.yml'), 'utf8'),
      ) as {
        inputs: Record<string, { default?: string }>;
      };

      for (const input of ['min-severity', 'minimum-severity', 'diffs-only']) {
        expect(actionDefinition.inputs[input]).not.toHaveProperty('default');
      }
    });

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

    it('should generate and clean up a temporary config when config-path is omitted', async () => {
      mocks.core.getInput.mockImplementation((name: string) => {
        if (name === 'github-token') {
          return 'fake-token';
        }
        if (name === 'min-severity') {
          return 'high';
        }
        if (name === 'guidance') {
          return 'Review auth flows closely';
        }
        return '';
      });

      const { args } = await importActionAndGetPromptfooCall();

      expect(mocks.config.generateConfigFile).toHaveBeenCalledWith(
        'high',
        'Review auth flows closely',
        false,
      );
      expectCliArg(args, '--config', '/tmp/test-config.yaml');
      await vi.waitFor(() => {
        expect(mocks.fs.unlinkSync).toHaveBeenCalledWith('/tmp/test-config.yaml');
      });
    });

    it('should thread diffs-only through to the generated action-input config', async () => {
      mocks.core.getInput.mockImplementation((name: string) => {
        if (name === 'github-token') {
          return 'fake-token';
        }
        if (name === 'diffs-only') {
          return 'true';
        }
        return '';
      });
      mocks.core.getBooleanInput.mockImplementation((name: string) => {
        return name === 'diffs-only';
      });

      const { args } = await importActionAndGetPromptfooCall();

      expect(mocks.config.generateConfigFile).toHaveBeenCalledWith('medium', undefined, true);
      expectCliArg(args, '--config', '/tmp/test-config.yaml');
    });

    it('should ignore diffs-only when config-path is set', async () => {
      mocks.core.getInput.mockImplementation((name: string) => {
        if (name === 'github-token') {
          return 'fake-token';
        }
        if (name === 'config-path') {
          return 'configs/code-scan.yaml';
        }
        if (name === 'diffs-only') {
          return 'true';
        }
        return '';
      });
      mocks.core.getBooleanInput.mockImplementation((name: string) => {
        return name === 'diffs-only';
      });

      const { args } = await importActionAndGetPromptfooCall();

      expectCliArg(args, '--config', 'configs/code-scan.yaml');
      expect(mocks.config.generateConfigFile).not.toHaveBeenCalled();
      expect(args).not.toContain('--diffs-only');
      // The workflow set diffs-only AND config-path; warn so the divergence is visible.
      expect(mocks.core.warning).toHaveBeenCalledWith(
        expect.stringContaining('ignored when config-path is set'),
      );
    });

    it('should not warn about ignored inputs when config-path is set alone', async () => {
      mocks.core.getInput.mockImplementation((name: string) => {
        if (name === 'github-token') {
          return 'fake-token';
        }
        if (name === 'config-path') {
          return 'configs/code-scan.yaml';
        }
        return '';
      });

      await importActionAndGetPromptfooCall();

      expect(mocks.core.warning).not.toHaveBeenCalledWith(
        expect.stringContaining('ignored when config-path is set'),
      );
    });

    it('should not strictly parse diffs-only when config-path is set (regression for codex P2 on 43858c7292)', async () => {
      // When `config-path` is set, the YAML supplies scan settings and the
      // action ignores diffs-only. Workflows can set diffs-only to an
      // expression-derived or stale value (e.g. `0`, `'yes'`) that
      // core.getBooleanInput rejects with TypeError. The action must not
      // fail input parsing for a setting the scan never reads.
      mocks.core.getInput.mockImplementation((name: string) => {
        if (name === 'github-token') {
          return 'fake-token';
        }
        if (name === 'config-path') {
          return 'configs/code-scan.yaml';
        }
        if (name === 'diffs-only') {
          return 'yes'; // not a valid boolean per @actions/core; would throw if parsed
        }
        return '';
      });
      // If the action did call getBooleanInput here, the real one would
      // throw — make this mock fail loudly to lock that down.
      mocks.core.getBooleanInput.mockImplementation((name: string) => {
        if (name === 'diffs-only') {
          throw new TypeError(
            "Input does not meet YAML 1.2 'Core Schema' specification: diffs-only",
          );
        }
        return false;
      });

      const { args } = await importActionAndGetPromptfooCall();

      expectCliArg(args, '--config', 'configs/code-scan.yaml');
      expect(mocks.core.warning).toHaveBeenCalledWith(
        expect.stringContaining('ignored when config-path is set'),
      );
    });

    it('should not read guidance-file from disk when config-path is set', async () => {
      mocks.core.getInput.mockImplementation((name: string) => {
        if (name === 'github-token') {
          return 'fake-token';
        }
        if (name === 'config-path') {
          return 'configs/code-scan.yaml';
        }
        if (name === 'guidance-file') {
          // Even a non-existent path must not break the run — config-path is
          // authoritative, so the action should never reach the filesystem.
          // If loadGuidance tried to read this path, the real fs would throw
          // ENOENT and the scan command would never be issued.
          return '/tmp/this-file-does-not-exist-12345.md';
        }
        return '';
      });

      const { args } = await importActionAndGetPromptfooCall();

      expectCliArg(args, '--config', 'configs/code-scan.yaml');
      expect(mocks.core.warning).toHaveBeenCalledWith(
        expect.stringContaining(
          'guidance and guidance-file inputs are ignored when config-path is set',
        ),
      );
    });

    it('should keep using generated action-input config even when the workspace contains a repo config', async () => {
      const repositoryConfigPath = path.resolve('/test/workspace', '.promptfoo-code-scan.yaml');
      mocks.fs.existsSync.mockImplementation((candidatePath: string) => {
        return candidatePath === repositoryConfigPath;
      });

      const { args } = await importActionAndGetPromptfooCall();

      expectCliArg(args, '--config', '/tmp/test-config.yaml');
      expect(mocks.config.generateConfigFile).toHaveBeenCalledWith('medium', undefined, false);
      await vi.waitFor(() => {
        expect(mocks.fs.unlinkSync).toHaveBeenCalledWith('/tmp/test-config.yaml');
      });
    });

    it('should pass an explicit config-path through without generating or deleting a temp config', async () => {
      mocks.core.getInput.mockImplementation((name: string) => {
        if (name === 'github-token') {
          return 'fake-token';
        }
        if (name === 'minimum-severity') {
          return 'critical';
        }
        if (name === 'config-path') {
          return 'configs/code-scan.yaml';
        }
        return '';
      });

      const { args } = await importActionAndGetPromptfooCall();

      expectCliArg(args, '--config', 'configs/code-scan.yaml');
      expect(mocks.config.generateConfigFile).not.toHaveBeenCalled();
      expect(mocks.fs.unlinkSync).not.toHaveBeenCalled();
    });

    it('should let an explicit config-path supply apiHost when api-host is omitted', async () => {
      mocks.core.getInput.mockImplementation((name: string) => {
        if (name === 'github-token') {
          return 'fake-token';
        }
        if (name === 'config-path') {
          return 'configs/code-scan.yaml';
        }
        return '';
      });

      const { args } = await importActionAndGetPromptfooCall();

      expect(args).not.toContain('--api-host');
      expectCliArg(args, '--config', 'configs/code-scan.yaml');
    });

    it('should pass an explicitly supplied api-host override alongside config-path', async () => {
      mocks.core.getInput.mockImplementation((name: string) => {
        if (name === 'github-token') {
          return 'fake-token';
        }
        if (name === 'config-path') {
          return 'configs/code-scan.yaml';
        }
        if (name === 'api-host') {
          return 'https://enterprise.promptfoo.example';
        }
        return '';
      });

      const { args } = await importActionAndGetPromptfooCall();

      expectCliArg(args, '--config', 'configs/code-scan.yaml');
      expectCliArg(args, '--api-host', 'https://enterprise.promptfoo.example');
    });

    it('should prefer min-severity and warn when both severity aliases conflict', async () => {
      mocks.core.getInput.mockImplementation((name: string) => {
        if (name === 'github-token') {
          return 'fake-token';
        }
        if (name === 'min-severity') {
          return 'high';
        }
        if (name === 'minimum-severity') {
          return 'low';
        }
        return '';
      });

      await importActionAndGetPromptfooCall();

      expect(mocks.core.warning).toHaveBeenCalledWith(
        expect.stringContaining('Both min-severity (high) and minimum-severity (low) are set'),
      );
      expect(mocks.config.generateConfigFile).toHaveBeenCalledWith('high', undefined, false);
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

  describe('fallback review comments', () => {
    it('omits the severity footer when an explicit config path controls severity', async () => {
      const { createReview } = mockOctokitForFallbackPost();
      mockPromptfooScanResponse({
        success: true,
        comments: [],
        commentsPosted: false,
        review: 'Fallback review from scan server',
      });
      mocks.core.getInput.mockImplementation((name: string) => {
        if (name === 'github-token') {
          return 'fake-token';
        }
        if (name === 'config-path') {
          return 'configs/code-scan.yaml';
        }
        return '';
      });

      await import('../../code-scan-action/src/main');

      await vi.waitFor(() => {
        expect(createReview).toHaveBeenCalled();
      });
      expect(createReview.mock.calls[0][0].body).toBe('Fallback review from scan server');
      expect(createReview.mock.calls[0][0].body).not.toContain('Minimum severity threshold');
    });

    it('omits the severity footer even when config-path is paired with a min-severity input (input is ignored by the scan)', async () => {
      const { createReview } = mockOctokitForFallbackPost();
      mockPromptfooScanResponse({
        success: true,
        comments: [],
        commentsPosted: false,
        review: 'Fallback review from scan server',
      });
      mocks.core.getInput.mockImplementation((name: string) => {
        if (name === 'github-token') {
          return 'fake-token';
        }
        if (name === 'config-path') {
          return 'configs/code-scan.yaml';
        }
        if (name === 'min-severity') {
          return 'high';
        }
        return '';
      });

      await import('../../code-scan-action/src/main');

      await vi.waitFor(() => {
        expect(createReview).toHaveBeenCalled();
      });
      // buildCliArgs only passes --config when config-path is set, so the YAML's
      // severity drove the scan — not the action's min-severity input. The footer
      // must omit a threshold rather than misreport the ignored input value.
      expect(createReview.mock.calls[0][0].body).toBe('Fallback review from scan server');
      expect(createReview.mock.calls[0][0].body).not.toContain('Minimum severity threshold');
      // The workflow author should still be told the input is being ignored.
      expect(mocks.core.warning).toHaveBeenCalledWith(
        expect.stringContaining('ignored when config-path is set'),
      );
    });

    it('shows the severity footer with the input value when no config-path is set', async () => {
      const { createReview } = mockOctokitForFallbackPost();
      mockPromptfooScanResponse({
        success: true,
        comments: [],
        commentsPosted: false,
        review: 'Fallback review from scan server',
      });
      mocks.core.getInput.mockImplementation((name: string) => {
        if (name === 'github-token') {
          return 'fake-token';
        }
        if (name === 'min-severity') {
          return 'critical';
        }
        return '';
      });

      await import('../../code-scan-action/src/main');

      await vi.waitFor(() => {
        expect(createReview).toHaveBeenCalled();
      });
      expect(createReview.mock.calls[0][0].body).toContain('Fallback review from scan server');
      expect(createReview.mock.calls[0][0].body).toContain('Minimum severity threshold:');
      expect(createReview.mock.calls[0][0].body).toContain('Critical');
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

    it('trims whitespace from severity inputs', async () => {
      mockSeverityInputs({ 'minimum-severity': '  critical  ' });

      await importActionAndGetPromptfooCall();

      expect(mocks.config.generateConfigFile).toHaveBeenCalledWith('critical', undefined, false);
    });
  });
});
