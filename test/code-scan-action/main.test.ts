/**
 * Main Entry Point Utility Tests
 */

import * as fs from 'fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCliArgs, toReviewComment } from '../../code-scan-action/src/mainUtils';

// ---------------------------------------------------------------------------
// Mocks for behavioral / control-flow tests
// ---------------------------------------------------------------------------

vi.mock('@actions/core', () => ({
  getInput: vi.fn(),
  getIDToken: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  setFailed: vi.fn(),
}));

vi.mock('@actions/exec', () => ({
  exec: vi.fn(),
}));

vi.mock('@actions/github', () => ({
  getOctokit: vi.fn(),
  context: {
    eventName: 'pull_request',
    repo: { owner: 'test-owner', repo: 'test-repo' },
    payload: {
      pull_request: { number: 42, head: { sha: 'abc123' } },
    },
  },
}));

vi.mock('../../code-scan-action/src/github', () => ({
  getGitHubContext: vi.fn(),
  getPRFiles: vi.fn(),
}));

vi.mock('../../code-scan-action/src/config', () => ({
  generateConfigFile: vi.fn(),
}));

vi.mock('../../src/codeScan/util/github', () => ({
  prepareComments: vi.fn(),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    unlinkSync: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Shared test state
// ---------------------------------------------------------------------------

const originalEnv = { ...process.env };

describe('code-scan-action main utilities', () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetAllMocks();
  });

  // -------------------------------------------------------------------------
  // buildCliArgs
  // -------------------------------------------------------------------------

  describe('buildCliArgs', () => {
    it('should include the provided base branch in CLI args', () => {
      process.env.GITHUB_WORKSPACE = '/test/workspace';

      const cliArgs = buildCliArgs({
        apiHost: '',
        baseBranch: 'feat/my-feature-branch',
        context: {
          owner: 'test-owner',
          repo: 'test-repo',
          number: 123,
          sha: 'abc123',
        },
        finalConfigPath: '/tmp/test-config.yaml',
      });

      const baseIndex = cliArgs.indexOf('--base');

      expect(baseIndex).toBeGreaterThan(-1);
      expect(cliArgs[baseIndex + 1]).toBe('feat/my-feature-branch');
    });

    it('should support stacked PR base branches', () => {
      process.env.GITHUB_WORKSPACE = '/test/workspace';

      const cliArgs = buildCliArgs({
        apiHost: '',
        baseBranch: 'feat/openai-sora-video-provider',
        context: {
          owner: 'test-owner',
          repo: 'test-repo',
          number: 123,
          sha: 'abc123',
        },
        finalConfigPath: '/tmp/test-config.yaml',
      });

      const baseIndex = cliArgs.indexOf('--base');

      expect(baseIndex).toBeGreaterThan(-1);
      expect(cliArgs[baseIndex + 1]).toBe('feat/openai-sora-video-provider');
    });
  });

  // -------------------------------------------------------------------------
  // toReviewComment
  // -------------------------------------------------------------------------

  describe('toReviewComment', () => {
    it('should separate the severity label from the finding text', () => {
      expect(
        toReviewComment({
          file: 'src/auth.ts',
          line: 42,
          finding: 'Security issue',
          severity: 'high',
        }).body,
      ).toContain('High\n\nSecurity issue');
    });

    it('should treat startLine equal to line as a single-line review comment', () => {
      expect(
        toReviewComment({
          file: 'src/auth.ts',
          line: 42,
          startLine: 42,
          finding: 'Security issue',
          severity: 'high',
        }),
      ).toEqual({
        path: 'src/auth.ts',
        line: 42,
        start_line: undefined,
        side: 'RIGHT',
        start_side: undefined,
        body: expect.stringContaining('Security issue'),
      });
    });

    it('should include a range for multi-line review comments', () => {
      expect(
        toReviewComment({
          file: 'src/auth.ts',
          line: 45,
          startLine: 40,
          finding: 'Multi-line issue',
          severity: 'high',
        }),
      ).toEqual({
        path: 'src/auth.ts',
        line: 45,
        start_line: 40,
        side: 'RIGHT',
        start_side: 'RIGHT',
        body: expect.stringContaining('Multi-line issue'),
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Behavioral / control-flow tests for run() and handleScanResults()
// ---------------------------------------------------------------------------

describe('code-scan-action run() control flow', () => {
  // Lazily-imported mocked modules so vi.mock() factories have already run.
  let core: typeof import('@actions/core');
  let execModule: typeof import('@actions/exec');
  let githubModule: typeof import('@actions/github');
  let actionGithub: typeof import('../../code-scan-action/src/github');
  let configModule: typeof import('../../code-scan-action/src/config');
  let codeScanGithub: typeof import('../../src/codeScan/util/github');
  let run: () => Promise<void>;

  const mockContext = {
    owner: 'test-owner',
    repo: 'test-repo',
    number: 42,
    sha: 'abc123',
  };

  // A minimal octokit double used for fallback comment tests.
  const mockCreateReview = vi.fn().mockResolvedValue({});
  const mockCreateIssueComment = vi.fn().mockResolvedValue({});

  beforeEach(async () => {
    // Import mocked modules and the module-under-test inside beforeEach so
    // each test starts with the mocked module already wired up.
    core = await import('@actions/core');
    execModule = await import('@actions/exec');
    githubModule = await import('@actions/github');
    actionGithub = await import('../../code-scan-action/src/github');
    configModule = await import('../../code-scan-action/src/config');
    codeScanGithub = await import('../../src/codeScan/util/github');
    ({ run } = await import('../../code-scan-action/src/main'));

    // Default happy-path stubs shared across tests —
    // individual tests override only what they need.

    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'github-token': 'fake-token',
        'api-host': '',
        'min-severity': 'medium',
        'minimum-severity': '',
        'config-path': '/fake/config.yaml',
        guidance: '',
        'guidance-file': '',
      };
      return inputs[name] ?? '';
    });

    vi.mocked(core.getIDToken).mockResolvedValue('oidc-token');

    vi.mocked(actionGithub.getGitHubContext).mockResolvedValue(mockContext);

    // By default, not a setup PR.
    vi.mocked(actionGithub.getPRFiles).mockResolvedValue([
      { path: 'src/foo.ts', status: 'modified' as any },
    ]);

    // Pretend git fetch succeeds.
    vi.mocked(execModule.exec).mockResolvedValue(0);

    // Default: scan returns zero comments, commentsPosted=true.
    // Individual tests override this.
    vi.mocked(execModule.exec).mockImplementation(async (cmd, _args, options) => {
      if (cmd === 'promptfoo' && options?.listeners?.stdout) {
        const response = JSON.stringify({
          success: true,
          comments: [],
          commentsPosted: true,
        });
        options.listeners.stdout(Buffer.from(response));
      }
      return 0;
    });

    process.env.GITHUB_BASE_REF = 'main';

    // Default prepareComments stub returns empty buckets.
    vi.mocked(codeScanGithub.prepareComments).mockReturnValue({
      lineComments: [],
      generalComments: [],
      reviewBody: '',
    });

    // Default octokit mock.
    vi.mocked(githubModule.getOctokit).mockReturnValue({
      rest: {
        pulls: { createReview: mockCreateReview, get: vi.fn() },
        issues: { createComment: mockCreateIssueComment },
      },
    } as any);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetAllMocks();
    vi.resetModules();
  });

  // -------------------------------------------------------------------------
  // handleScanResults branches (exercised through run())
  // -------------------------------------------------------------------------

  describe('handleScanResults', () => {
    it('calls postFallbackCommentsToPr when commentsPosted is false', async () => {
      const comments = [
        { file: 'src/auth.ts', line: 10, finding: 'Hardcoded secret', severity: 'high' },
      ];
      const review = 'Found 1 issue.';

      vi.mocked(execModule.exec).mockImplementation(async (cmd, _args, options) => {
        if (cmd === 'promptfoo' && options?.listeners?.stdout) {
          const response = JSON.stringify({
            success: true,
            comments,
            commentsPosted: false,
            review,
          });
          options.listeners.stdout(Buffer.from(response));
        }
        return 0;
      });

      vi.mocked(codeScanGithub.prepareComments).mockReturnValue({
        lineComments: [comments[0]] as any,
        generalComments: [],
        reviewBody: review,
      });

      await run();

      // The fallback path calls getOctokit to build its own octokit instance
      // and calls prepareComments to split comments.
      expect(vi.mocked(githubModule.getOctokit)).toHaveBeenCalledWith('fake-token');
      expect(vi.mocked(codeScanGithub.prepareComments)).toHaveBeenCalledWith(
        comments,
        review,
        'medium',
      );
      // A PR review should have been posted via the octokit double.
      expect(mockCreateReview).toHaveBeenCalledOnce();
    });

    it('logs success when commentsPosted is true and there are line comments', async () => {
      const comments = [
        { file: 'src/auth.ts', line: 10, finding: 'Hardcoded secret', severity: 'high' },
      ];

      vi.mocked(execModule.exec).mockImplementation(async (cmd, _args, options) => {
        if (cmd === 'promptfoo' && options?.listeners?.stdout) {
          const response = JSON.stringify({
            success: true,
            comments,
            commentsPosted: true,
          });
          options.listeners.stdout(Buffer.from(response));
        }
        return 0;
      });

      await run();

      // No fallback posting should occur.
      expect(vi.mocked(githubModule.getOctokit)).not.toHaveBeenCalled();
      // Success info message should be logged.
      const infoCalls = vi.mocked(core.info).mock.calls.map((c) => c[0]);
      expect(infoCalls.some((msg) => msg.includes('Comments posted to PR by scan server'))).toBe(
        true,
      );
    });

    it('logs success when commentsPosted is true and there is a review summary but no line comments', async () => {
      // This is the "review-only" bug that was recently fixed.
      vi.mocked(execModule.exec).mockImplementation(async (cmd, _args, options) => {
        if (cmd === 'promptfoo' && options?.listeners?.stdout) {
          const response = JSON.stringify({
            success: true,
            comments: [],
            commentsPosted: true,
            review: 'Overall the code looks secure.',
          });
          options.listeners.stdout(Buffer.from(response));
        }
        return 0;
      });

      await run();

      // No fallback posting.
      expect(vi.mocked(githubModule.getOctokit)).not.toHaveBeenCalled();
      const infoCalls = vi.mocked(core.info).mock.calls.map((c) => c[0]);
      expect(infoCalls.some((msg) => msg.includes('Comments posted to PR by scan server'))).toBe(
        true,
      );
    });

    it('logs "no vulnerabilities" when there are no comments and no review', async () => {
      vi.mocked(execModule.exec).mockImplementation(async (cmd, _args, options) => {
        if (cmd === 'promptfoo' && options?.listeners?.stdout) {
          const response = JSON.stringify({
            success: true,
            comments: [],
            commentsPosted: true,
          });
          options.listeners.stdout(Buffer.from(response));
        }
        return 0;
      });

      await run();

      const infoCalls = vi.mocked(core.info).mock.calls.map((c) => c[0]);
      expect(infoCalls.some((msg) => msg.includes('No vulnerabilities found'))).toBe(true);
    });

    it('logs "server version does not indicate" when commentsPosted is undefined (old server)', async () => {
      const comments = [
        { file: 'src/auth.ts', line: 10, finding: 'Hardcoded secret', severity: 'high' },
      ];

      vi.mocked(execModule.exec).mockImplementation(async (cmd, _args, options) => {
        if (cmd === 'promptfoo' && options?.listeners?.stdout) {
          // Old server omits commentsPosted entirely.
          const response = JSON.stringify({
            success: true,
            comments,
          });
          options.listeners.stdout(Buffer.from(response));
        }
        return 0;
      });

      await run();

      // No fallback posting for the undefined case.
      expect(vi.mocked(githubModule.getOctokit)).not.toHaveBeenCalled();
      const infoCalls = vi.mocked(core.info).mock.calls.map((c) => c[0]);
      expect(infoCalls.some((msg) => msg.includes('server version does not indicate'))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // run() finally-block cleanup
  // -------------------------------------------------------------------------

  describe('run() cleanup', () => {
    it('removes generated config file in the finally block even when the scan throws', async () => {
      // Force run() to use a generated (temporary) config by returning no
      // user-supplied config-path.
      vi.mocked(core.getInput).mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'github-token': 'fake-token',
          'api-host': '',
          'min-severity': 'medium',
          'minimum-severity': '',
          'config-path': '', // <-- no user config → generateConfigFile is called
          guidance: '',
          'guidance-file': '',
        };
        return inputs[name] ?? '';
      });

      const tempConfigPath = '/tmp/code-scan-config-test-uuid.yaml';
      vi.mocked(configModule.generateConfigFile).mockReturnValue(tempConfigPath);

      // Make exec throw after the config is generated to force the error path.
      vi.mocked(execModule.exec).mockImplementation(async (cmd) => {
        if (cmd === 'git') {
          return 0; // git fetch is fine
        }
        throw new Error('Simulated scan failure');
      });

      await run();

      // run() should have called setFailed (error swallowed internally).
      expect(vi.mocked(core.setFailed)).toHaveBeenCalled();
      // The temp file should always be cleaned up via the finally block.
      expect(vi.mocked(fs.unlinkSync)).toHaveBeenCalledWith(tempConfigPath);
    });

    it('does not attempt to remove the config file when a user-supplied config was used', async () => {
      // config-path is provided → generateConfigFile should NOT be called →
      // no cleanup of a temp file.
      vi.mocked(execModule.exec).mockImplementation(async (cmd, _args, options) => {
        if (cmd === 'promptfoo' && options?.listeners?.stdout) {
          options.listeners.stdout(
            Buffer.from(JSON.stringify({ success: true, comments: [], commentsPosted: true })),
          );
        }
        return 0;
      });

      await run();

      expect(vi.mocked(configModule.generateConfigFile)).not.toHaveBeenCalled();
      expect(vi.mocked(fs.unlinkSync)).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Fork PR handling
  // -------------------------------------------------------------------------

  describe('Fork PR handling', () => {
    it('exits gracefully when the scan reports "Fork PR scanning not authorized"', async () => {
      // Simulate promptfoo exiting non-zero with the fork message in stdout.
      vi.mocked(execModule.exec).mockImplementation(async (cmd, _args, options) => {
        if (cmd === 'git') {
          return 0;
        }
        if (cmd === 'promptfoo' && options?.listeners?.stdout) {
          options.listeners.stdout(Buffer.from('Fork PR scanning not authorized'));
        }
        return 1; // Non-zero exit code
      });

      await run();

      // Should NOT call setFailed — the fork rejection is a graceful exit.
      expect(vi.mocked(core.setFailed)).not.toHaveBeenCalled();
      // An info message should mention the fork.
      const infoCalls = vi.mocked(core.info).mock.calls.map((c) => c[0]);
      expect(infoCalls.some((msg) => msg.includes('Fork PR'))).toBe(true);
    });

    it('calls setFailed for a non-zero exit code that is not a fork rejection', async () => {
      vi.mocked(execModule.exec).mockImplementation(async (cmd, _args, options) => {
        if (cmd === 'git') {
          return 0;
        }
        if (cmd === 'promptfoo' && options?.listeners?.stderr) {
          options.listeners.stderr(Buffer.from('Internal server error'));
        }
        return 1;
      });

      await run();

      expect(vi.mocked(core.setFailed)).toHaveBeenCalled();
    });
  });
});
