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
          line: 61,
        }),
      ]);
      expect(result.generalComments).toEqual([]);
      expect(result.invalidLineComments).toEqual([
        expect.objectContaining({
          file: 'src/outside-diff.ts',
          line: 12,
        }),
      ]);
    });
  });
});
