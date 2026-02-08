/**
 * Main Entry Point Tests
 *
 * Tests for the GitHub Action main entry point, specifically the CLI args construction
 */

import * as core from '@actions/core';
import * as exec from '@actions/exec';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock @actions/core
vi.mock('@actions/core', () => ({
  getInput: vi.fn(),
  getIDToken: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  setFailed: vi.fn(),
}));

// Mock @actions/exec
vi.mock('@actions/exec', () => ({
  exec: vi.fn(),
}));

// Mock @actions/github
vi.mock('@actions/github', () => ({
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
}));

// Mock the github module from code-scan-action
vi.mock('../../code-scan-action/src/github', () => ({
  getGitHubContext: vi.fn().mockReturnValue({
    owner: 'test-owner',
    repo: 'test-repo',
    number: 123,
    sha: 'abc123',
  }),
  getPRFiles: vi.fn().mockResolvedValue([{ path: 'src/index.ts', status: 'modified' }]),
}));

// Mock the config module
vi.mock('../../code-scan-action/src/config', () => ({
  generateConfigFile: vi.fn().mockReturnValue('/tmp/test-config.yaml'),
}));

// Mock fs
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    unlinkSync: vi.fn(),
  };
});

// Store original env
const originalEnv = { ...process.env };

describe('code-scan-action main', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment
    process.env = { ...originalEnv };
    process.env.GITHUB_WORKSPACE = '/test/workspace';

    // Default mock implementations
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'github-token') {
        return 'fake-token';
      }
      if (name === 'min-severity' || name === 'minimum-severity') {
        return 'medium';
      }
      return '';
    });

    vi.mocked(core.getIDToken).mockResolvedValue('fake-oidc-token');

    // Mock exec to simulate successful CLI run with empty results
    vi.mocked(exec.exec).mockImplementation(async (command, _args, options) => {
      if (command === 'promptfoo' && options?.listeners?.stdout) {
        const response = JSON.stringify({
          success: true,
          comments: [],
          commentsPosted: false,
        });
        options.listeners.stdout(Buffer.from(response));
      }
      return 0;
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('CLI args construction', () => {
    it('should pass --base with GITHUB_BASE_REF when set', async () => {
      process.env.GITHUB_BASE_REF = 'feat/my-feature-branch';

      vi.resetModules();

      vi.doMock('@actions/core', () => ({
        getInput: vi.fn().mockImplementation((name: string) => {
          if (name === 'github-token') {
            return 'fake-token';
          }
          if (name === 'min-severity' || name === 'minimum-severity') {
            return 'medium';
          }
          return '';
        }),
        getIDToken: vi.fn().mockResolvedValue('fake-oidc-token'),
        info: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
        setFailed: vi.fn(),
      }));

      vi.doMock('@actions/exec', () => ({
        exec: vi.fn().mockImplementation(async (command: string, _args: string[], options: any) => {
          if (command === 'promptfoo' && options?.listeners?.stdout) {
            const response = JSON.stringify({
              success: true,
              comments: [],
              commentsPosted: false,
            });
            options.listeners.stdout(Buffer.from(response));
          }
          return 0;
        }),
      }));

      vi.doMock('@actions/github', () => ({
        context: {
          repo: { owner: 'test-owner', repo: 'test-repo' },
          payload: { pull_request: { number: 123, head: { sha: 'abc123' } } },
        },
        getOctokit: vi.fn(),
      }));

      vi.doMock('../../code-scan-action/src/github', () => ({
        getGitHubContext: vi.fn().mockReturnValue({
          owner: 'test-owner',
          repo: 'test-repo',
          number: 123,
          sha: 'abc123',
        }),
        getPRFiles: vi.fn().mockResolvedValue([{ path: 'src/index.ts', status: 'modified' }]),
      }));

      vi.doMock('../../code-scan-action/src/config', () => ({
        generateConfigFile: vi.fn().mockReturnValue('/tmp/test-config.yaml'),
      }));

      const execMock = (await import('@actions/exec')).exec;

      // Import fresh module (this triggers run() as a side effect)
      await import('../../code-scan-action/src/main');

      const execCalls = vi.mocked(execMock).mock.calls;
      const promptfooCalls = execCalls.filter(
        (call) => call[0] === 'promptfoo' && Array.isArray(call[1]),
      );

      expect(promptfooCalls.length).toBeGreaterThan(0);

      const cliArgs = promptfooCalls[0][1] as string[];
      const baseIndex = cliArgs.indexOf('--base');

      expect(baseIndex).toBeGreaterThan(-1);
      expect(cliArgs[baseIndex + 1]).toBe('feat/my-feature-branch');
    });

    it('should pass --base with "main" when GITHUB_BASE_REF is not set', async () => {
      delete process.env.GITHUB_BASE_REF;

      // Reset module cache to re-run with new env
      vi.resetModules();

      // Re-mock dependencies after reset
      vi.doMock('@actions/core', () => ({
        getInput: vi.fn().mockImplementation((name: string) => {
          if (name === 'github-token') {
            return 'fake-token';
          }
          if (name === 'min-severity' || name === 'minimum-severity') {
            return 'medium';
          }
          return '';
        }),
        getIDToken: vi.fn().mockResolvedValue('fake-oidc-token'),
        info: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
        setFailed: vi.fn(),
      }));

      vi.doMock('@actions/exec', () => ({
        exec: vi.fn().mockImplementation(async (command: string, _args: string[], options: any) => {
          if (command === 'promptfoo' && options?.listeners?.stdout) {
            const response = JSON.stringify({
              success: true,
              comments: [],
              commentsPosted: false,
            });
            options.listeners.stdout(Buffer.from(response));
          }
          return 0;
        }),
      }));

      vi.doMock('@actions/github', () => ({
        context: {
          repo: { owner: 'test-owner', repo: 'test-repo' },
          payload: { pull_request: { number: 123, head: { sha: 'abc123' } } },
        },
        getOctokit: vi.fn().mockReturnValue({
          rest: {
            pulls: {
              get: vi.fn().mockResolvedValue({
                data: { base: { ref: 'main' } },
              }),
            },
          },
        }),
      }));

      vi.doMock('../../code-scan-action/src/github', () => ({
        getGitHubContext: vi.fn().mockReturnValue({
          owner: 'test-owner',
          repo: 'test-repo',
          number: 123,
          sha: 'abc123',
        }),
        getPRFiles: vi.fn().mockResolvedValue([{ path: 'src/index.ts', status: 'modified' }]),
      }));

      vi.doMock('../../code-scan-action/src/config', () => ({
        generateConfigFile: vi.fn().mockReturnValue('/tmp/test-config.yaml'),
      }));

      const execMock = (await import('@actions/exec')).exec;

      // Import fresh module
      await import('../../code-scan-action/src/main');

      const execCalls = vi.mocked(execMock).mock.calls;
      const promptfooCalls = execCalls.filter(
        (call) => call[0] === 'promptfoo' && Array.isArray(call[1]),
      );

      expect(promptfooCalls.length).toBeGreaterThan(0);

      const cliArgs = promptfooCalls[0][1] as string[];
      const baseIndex = cliArgs.indexOf('--base');

      expect(baseIndex).toBeGreaterThan(-1);
      expect(cliArgs[baseIndex + 1]).toBe('main');
    });

    it('should pass --base for stacked PR base branches', async () => {
      // Simulate a stacked PR where base is another feature branch
      process.env.GITHUB_BASE_REF = 'feat/openai-sora-video-provider';

      vi.resetModules();

      vi.doMock('@actions/core', () => ({
        getInput: vi.fn().mockImplementation((name: string) => {
          if (name === 'github-token') {
            return 'fake-token';
          }
          if (name === 'min-severity' || name === 'minimum-severity') {
            return 'medium';
          }
          return '';
        }),
        getIDToken: vi.fn().mockResolvedValue('fake-oidc-token'),
        info: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
        setFailed: vi.fn(),
      }));

      vi.doMock('@actions/exec', () => ({
        exec: vi.fn().mockImplementation(async (command: string, _args: string[], options: any) => {
          if (command === 'promptfoo' && options?.listeners?.stdout) {
            const response = JSON.stringify({
              success: true,
              comments: [],
              commentsPosted: false,
            });
            options.listeners.stdout(Buffer.from(response));
          }
          return 0;
        }),
      }));

      vi.doMock('@actions/github', () => ({
        context: {
          repo: { owner: 'test-owner', repo: 'test-repo' },
          payload: { pull_request: { number: 123, head: { sha: 'abc123' } } },
        },
        getOctokit: vi.fn(),
      }));

      vi.doMock('../../code-scan-action/src/github', () => ({
        getGitHubContext: vi.fn().mockReturnValue({
          owner: 'test-owner',
          repo: 'test-repo',
          number: 123,
          sha: 'abc123',
        }),
        getPRFiles: vi.fn().mockResolvedValue([{ path: 'src/index.ts', status: 'modified' }]),
      }));

      vi.doMock('../../code-scan-action/src/config', () => ({
        generateConfigFile: vi.fn().mockReturnValue('/tmp/test-config.yaml'),
      }));

      const execMock = (await import('@actions/exec')).exec;

      await import('../../code-scan-action/src/main');

      const execCalls = vi.mocked(execMock).mock.calls;
      const promptfooCalls = execCalls.filter(
        (call) => call[0] === 'promptfoo' && Array.isArray(call[1]),
      );

      expect(promptfooCalls.length).toBeGreaterThan(0);

      const cliArgs = promptfooCalls[0][1] as string[];
      const baseIndex = cliArgs.indexOf('--base');

      expect(baseIndex).toBeGreaterThan(-1);
      expect(cliArgs[baseIndex + 1]).toBe('feat/openai-sora-video-provider');
    });
  });
});
