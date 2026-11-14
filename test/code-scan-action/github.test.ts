/**
 * GitHub API Client Tests
 */

import * as github from '@actions/github';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getGitHubContext,
  getPRFiles,
  partitionReviewCommentsByDiff,
} from '../../code-scan-action/src/github';

const mocks = vi.hoisted(() => {
  // Mock diff that includes src/auth.ts with lines 40-100 in scope
  const mockDiff = `diff --git a/src/auth.ts b/src/auth.ts
index abc123..def456 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -40,60 +40,60 @@
 context line 40
 context line 41
 context line 42
+added line 43
 context line 44
 context line 45
 context line 46
 context line 47
 context line 48
 context line 49
 context line 50
 context line 51
 context line 52
 context line 53
 context line 54
 context line 55
 context line 56
 context line 57
 context line 58
 context line 59
 context line 60
`;

  return {
    core: {
      info: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
    },
    github: {
      getOctokit: vi.fn(),
      context: {
        eventName: 'pull_request',
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
    },
    mockDiff,
    pulls: {
      get: vi.fn(),
      listFiles: vi.fn(),
    },
  };
});

// Mock @actions/core
vi.mock('@actions/core', () => mocks.core);
vi.mock('../../code-scan-action/node_modules/@actions/core/lib/core.js', () => mocks.core);

// Mock both the root specifiers and the nested package entries resolved from code-scan-action.
vi.mock('@actions/github', () => mocks.github);
vi.mock('../../code-scan-action/node_modules/@actions/github/lib/github.js', () => mocks.github);

const mockDiff = mocks.mockDiff;

describe('GitHub API Client', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.github.context.eventName = 'pull_request';
    mocks.github.context.repo = {
      owner: 'test-owner',
      repo: 'test-repo',
    };
    mocks.github.context.payload = {
      pull_request: {
        number: 123,
        head: {
          sha: 'abc123',
        },
      },
    };
    mocks.pulls.get.mockResolvedValue({ data: mockDiff });
    mocks.github.getOctokit.mockReturnValue({
      rest: { pulls: mocks.pulls },
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getGitHubContext', () => {
    it('should extract context from github.context', async () => {
      const context = await getGitHubContext('test-token');

      expect(context).toEqual({
        owner: 'test-owner',
        repo: 'test-repo',
        number: 123,
        sha: 'abc123',
      });
      expect(mocks.github.getOctokit).not.toHaveBeenCalled();
    });

    it('uses the authenticated Actions client for workflow dispatch', async () => {
      github.context.eventName = 'workflow_dispatch';
      github.context.payload = { inputs: { pr_number: '456' } };
      mocks.pulls.get.mockResolvedValue({ data: { number: 456, head: { sha: 'head-sha' } } });

      await expect(getGitHubContext('dispatch-token')).resolves.toEqual({
        owner: 'test-owner',
        repo: 'test-repo',
        number: 456,
        sha: 'head-sha',
      });
      expect(mocks.github.getOctokit).toHaveBeenCalledWith('dispatch-token');
      expect(mocks.pulls.get).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        pull_number: 456,
      });
    });

    it('preserves workflow dispatch API failures', async () => {
      github.context.eventName = 'workflow_dispatch';
      github.context.payload = { inputs: { pr_number: '456' } };
      mocks.pulls.get.mockRejectedValue(new Error('Not Found'));

      await expect(getGitHubContext('dispatch-token')).rejects.toThrow('Not Found');
    });

    it('should throw error when not in PR context', async () => {
      const originalPayload = github.context.payload;
      github.context.payload = {};

      await expect(getGitHubContext('test-token')).rejects.toThrow(
        'This action requires a pull_request event or workflow_dispatch with pr_number input',
      );

      github.context.payload = originalPayload;
    });
  });

  describe('getPRFiles', () => {
    const context = { owner: 'owner', repo: 'repo', number: 12, sha: 'head-sha' };

    it('maps filenames and statuses from the Actions REST client', async () => {
      mocks.pulls.listFiles.mockResolvedValue({
        data: [{ filename: 'src/file with spaces.ts', status: 'modified' }],
      });

      await expect(getPRFiles('files-token', context)).resolves.toEqual([
        { path: 'src/file with spaces.ts', status: 'modified' },
      ]);
      expect(mocks.github.getOctokit).toHaveBeenCalledWith('files-token');
      expect(mocks.pulls.listFiles).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        pull_number: 12,
      });
    });

    it('preserves list-files API failures', async () => {
      mocks.pulls.listFiles.mockRejectedValue(new Error('Forbidden'));
      await expect(getPRFiles('files-token', context)).rejects.toThrow('Forbidden');
    });
  });

  describe('partitionReviewCommentsByDiff', () => {
    const mockContext = {
      owner: 'test-owner',
      repo: 'test-repo',
      number: 123,
      sha: 'abc123',
    };

    it('clamps comments to visible diff lines and routes unmapped files to general comments', async () => {
      const result = await partitionReviewCommentsByDiff('fake-token', mockContext, [
        {
          file: 'src/auth.ts',
          line: 500,
          finding: 'Finding in a changed file',
        },
        {
          file: 'src/outside-diff.ts',
          line: 12,
          finding: 'Finding outside the diff',
        },
      ]);

      expect(result.lineComments).toEqual([
        expect.objectContaining({
          file: 'src/auth.ts',
          line: 60,
        }),
      ]);
      expect(result.generalComments).toEqual([]);
      expect(result.invalidLineComments).toEqual([
        expect.objectContaining({
          file: 'src/outside-diff.ts',
          line: 12,
        }),
      ]);
      expect(mocks.github.getOctokit).toHaveBeenCalledWith('fake-token');
      expect(mocks.pulls.get).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        pull_number: 123,
        mediaType: { format: 'diff' },
      });
    });

    it('falls back to general comments when fetching the diff fails', async () => {
      mocks.pulls.get.mockRejectedValue(new Error('Unavailable'));
      const comment = { file: 'src/auth.ts', line: 43, finding: 'Finding' };

      const result = await partitionReviewCommentsByDiff('fake-token', mockContext, [comment]);

      expect(result.lineComments).toEqual([]);
      expect(result.invalidLineComments).toEqual([comment]);
      expect(mocks.core.warning).toHaveBeenCalledWith(
        'Failed to fetch PR diff for line validation: Unavailable',
      );
    });

    it('keeps quoted paths inline and does not mistake added content for a file header', async () => {
      const diff = String.raw`diff --git "a/src/tab\tfile.ts" "b/src/tab\tfile.ts"
--- "a/src/tab\tfile.ts"
+++ "b/src/tab\tfile.ts"
@@ -1 +1,2 @@
-old
+++ b/not-a-file.ts
+new
diff --git "a/src/caf\303\251.ts" "b/src/caf\303\251.ts"
--- "a/src/caf\303\251.ts"
+++ "b/src/caf\303\251.ts"
@@ -1 +1 @@
-old
+new
`;
      mocks.pulls.get.mockResolvedValue({ data: diff });

      const result = await partitionReviewCommentsByDiff('fake-token', mockContext, [
        { file: 'src/tab\tfile.ts', line: 99, finding: 'Tab filename' },
        { file: 'src/café.ts', line: 99, finding: 'UTF-8 filename' },
      ]);

      expect(result.lineComments).toEqual([
        { file: 'src/tab\tfile.ts', line: 2, startLine: null, finding: 'Tab filename' },
        { file: 'src/café.ts', line: 1, startLine: null, finding: 'UTF-8 filename' },
      ]);
      expect(result.invalidLineComments).toEqual([]);
      expect(result.generalComments).toEqual([]);
      expect(mocks.pulls.get).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        pull_number: 123,
        mediaType: { format: 'diff' },
      });
    });
  });
});
