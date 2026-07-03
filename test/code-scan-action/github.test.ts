/**
 * GitHub API Client Tests
 */

import * as github from '@actions/github';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getGitHubContext, partitionReviewCommentsByDiff } from '../../code-scan-action/src/github';
import type { Octokit } from '@octokit/rest';

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
    },
    mockDiff,
    Octokit: vi.fn().mockImplementation(() => ({
      pulls: {
        createReview: vi.fn().mockResolvedValue({}),
        get: vi.fn().mockResolvedValue({ data: mockDiff }),
      },
      issues: {
        createComment: vi.fn().mockResolvedValue({}),
      },
    })),
  };
});

// Mock @actions/core
vi.mock('@actions/core', () => mocks.core);
vi.mock('../../code-scan-action/node_modules/@actions/core/lib/core.js', () => mocks.core);

// Mock both the root specifiers and the nested package entries resolved from code-scan-action.
vi.mock('@actions/github', () => mocks.github);
vi.mock('../../code-scan-action/node_modules/@actions/github/lib/github.js', () => mocks.github);

// Mock Octokit
vi.mock('@octokit/rest', () => ({ Octokit: mocks.Octokit }));
vi.mock('../../code-scan-action/node_modules/@octokit/rest/dist-src/index.js', () => ({
  Octokit: mocks.Octokit,
}));

const mockDiff = mocks.mockDiff;

describe('GitHub API Client', () => {
  beforeEach(() => {
    vi.resetAllMocks();
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
    mocks.Octokit.mockImplementation(function () {
      return {
        pulls: {
          createReview: vi.fn().mockResolvedValue({}),
          get: vi.fn().mockResolvedValue({ data: mockDiff }),
        },
        issues: {
          createComment: vi.fn().mockResolvedValue({}),
        },
      } as unknown as Octokit;
    });
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

  describe('partitionReviewCommentsByDiff', () => {
    const mockContext = {
      owner: 'test-owner',
      repo: 'test-repo',
      number: 123,
      sha: 'abc123',
    };

    it('keeps a comment inline only when its exact line is in the diff', async () => {
      // The mock diff covers src/auth.ts lines 40-60. Line 50 is inside that range.
      const result = await partitionReviewCommentsByDiff('fake-token', mockContext, [
        {
          file: 'src/auth.ts',
          line: 50,
          finding: 'Finding on a changed line',
        },
      ]);

      // Location is preserved exactly - never clamped/moved to a different line.
      expect(result.lineComments).toEqual([
        expect.objectContaining({
          file: 'src/auth.ts',
          line: 50,
        }),
      ]);
      expect(result.generalComments).toEqual([]);
      expect(result.invalidLineComments).toEqual([]);
    });

    it('routes an out-of-diff line to a general comment preserving its original location (no clamping)', async () => {
      // src/auth.ts is in the diff but line 500 is far outside the 40-60 hunk. The previous
      // behavior clamped this to line 61 (nearest visible line), silently re-pointing the
      // finding at unrelated code. It must now be preserved at line 500 as a general comment.
      const result = await partitionReviewCommentsByDiff('fake-token', mockContext, [
        {
          file: 'src/auth.ts',
          line: 500,
          finding: 'Finding on an unchanged line reported by full-repo tracing',
        },
      ]);

      expect(result.lineComments).toEqual([]);
      expect(result.generalComments).toEqual([]);
      expect(result.invalidLineComments).toEqual([
        expect.objectContaining({
          file: 'src/auth.ts',
          line: 500,
        }),
      ]);
    });

    it('routes a comment on a file absent from the diff to a general comment', async () => {
      const result = await partitionReviewCommentsByDiff('fake-token', mockContext, [
        {
          file: 'src/outside-diff.ts',
          line: 12,
          finding: 'Finding outside the diff',
        },
      ]);

      expect(result.lineComments).toEqual([]);
      expect(result.invalidLineComments).toEqual([
        expect.objectContaining({
          file: 'src/outside-diff.ts',
          line: 12,
        }),
      ]);
    });

    it('keeps a multi-line comment inline only when both endpoints are in the diff', async () => {
      const result = await partitionReviewCommentsByDiff('fake-token', mockContext, [
        {
          file: 'src/auth.ts',
          startLine: 45,
          line: 50,
          finding: 'Multi-line finding fully inside the hunk',
        },
        {
          file: 'src/auth.ts',
          startLine: 30,
          line: 50,
          finding: 'Multi-line finding whose start is outside the hunk',
        },
      ]);

      expect(result.lineComments).toEqual([
        expect.objectContaining({
          file: 'src/auth.ts',
          startLine: 45,
          line: 50,
        }),
      ]);
      expect(result.invalidLineComments).toEqual([
        expect.objectContaining({
          file: 'src/auth.ts',
          startLine: 30,
          line: 50,
        }),
      ]);
    });

    it('routes comments with no line number to general comments', async () => {
      const result = await partitionReviewCommentsByDiff('fake-token', mockContext, [
        {
          file: 'src/auth.ts',
          line: null,
          finding: 'File-only finding',
        },
      ]);

      expect(result.generalComments).toEqual([
        expect.objectContaining({
          file: 'src/auth.ts',
        }),
      ]);
      expect(result.lineComments).toEqual([]);
      expect(result.invalidLineComments).toEqual([]);
    });
  });
});
