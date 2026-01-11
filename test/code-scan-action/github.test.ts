/**
 * GitHub API Client Tests
 */

import * as github from '@actions/github';
import { Octokit } from '@octokit/rest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getGitHubContext, postReviewComments } from '../../code-scan-action/src/github';

// Mock @actions/core
vi.mock('@actions/core', () => ({
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
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
}));

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

// Mock Octokit
vi.mock('@octokit/rest', () => {
  return {
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

describe('GitHub API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  describe('postReviewComments', () => {
    const mockContext = {
      owner: 'test-owner',
      repo: 'test-repo',
      number: 123,
      sha: 'abc123',
    };

    it('should post review comments with Octokit', async () => {
      const mockCreateReview = vi.fn().mockResolvedValue({});
      vi.mocked(Octokit).mockImplementation(function () {
        return {
          pulls: {
            createReview: mockCreateReview,
            get: vi.fn().mockResolvedValue({ data: mockDiff }),
          },
        } as unknown as Octokit;
      });

      const comments = [
        {
          file: 'src/auth.ts',
          line: 42,
          finding: 'SQL injection vulnerability',
        },
      ];

      await postReviewComments('fake-token', mockContext, comments);

      expect(mockCreateReview).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        pull_number: 123,
        event: 'COMMENT',
        comments: [
          {
            path: 'src/auth.ts',
            line: 42,
            start_line: undefined,
            side: 'RIGHT',
            start_side: undefined,
            body: 'SQL injection vulnerability',
          },
        ],
      });
    });

    it('should handle single line comments when startLine equals line', async () => {
      const mockCreateReview = vi.fn().mockResolvedValue({});
      vi.mocked(Octokit).mockImplementation(function () {
        return {
          pulls: {
            createReview: mockCreateReview,
            get: vi.fn().mockResolvedValue({ data: mockDiff }),
          },
        } as unknown as Octokit;
      });

      const comments = [
        {
          file: 'src/auth.ts',
          line: 42,
          startLine: 42, // Same as line - should be treated as single line
          finding: 'Security issue',
        },
      ];

      await postReviewComments('fake-token', mockContext, comments);

      expect(mockCreateReview).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        pull_number: 123,
        event: 'COMMENT',
        comments: [
          {
            path: 'src/auth.ts',
            line: 42,
            start_line: undefined, // Should be undefined when startLine === line
            side: 'RIGHT',
            start_side: undefined, // Should be undefined when startLine === line
            body: 'Security issue',
          },
        ],
      });
    });

    it('should handle line range comments when startLine differs from line', async () => {
      const mockCreateReview = vi.fn().mockResolvedValue({});
      vi.mocked(Octokit).mockImplementation(function () {
        return {
          pulls: {
            createReview: mockCreateReview,
            get: vi.fn().mockResolvedValue({ data: mockDiff }),
          },
        } as unknown as Octokit;
      });

      const comments = [
        {
          file: 'src/auth.ts',
          line: 45,
          startLine: 40, // Different from line - should be included
          finding: 'Multi-line issue',
        },
      ];

      await postReviewComments('fake-token', mockContext, comments);

      expect(mockCreateReview).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        pull_number: 123,
        event: 'COMMENT',
        comments: [
          {
            path: 'src/auth.ts',
            line: 45,
            start_line: 40, // Should be included when startLine < line
            side: 'RIGHT',
            start_side: 'RIGHT', // Should be included when startLine < line
            body: 'Multi-line issue',
          },
        ],
      });
    });

    it('should handle mixed single line and range comments', async () => {
      const mockCreateReview = vi.fn().mockResolvedValue({});
      vi.mocked(Octokit).mockImplementation(function () {
        return {
          pulls: {
            createReview: mockCreateReview,
            get: vi.fn().mockResolvedValue({ data: mockDiff }),
          },
        } as unknown as Octokit;
      });

      const comments = [
        {
          file: 'src/auth.ts',
          line: 42,
          startLine: 42, // Same line
          finding: 'Issue 1',
        },
        {
          file: 'src/auth.ts',
          line: 50,
          startLine: 45, // Range
          finding: 'Issue 2',
        },
        {
          file: 'src/auth.ts',
          line: 60,
          // No startLine
          finding: 'Issue 3',
        },
      ];

      await postReviewComments('fake-token', mockContext, comments);

      expect(mockCreateReview).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        pull_number: 123,
        event: 'COMMENT',
        comments: [
          {
            path: 'src/auth.ts',
            line: 42,
            start_line: undefined,
            side: 'RIGHT',
            start_side: undefined,
            body: 'Issue 1',
          },
          {
            path: 'src/auth.ts',
            line: 50,
            start_line: 45,
            side: 'RIGHT',
            start_side: 'RIGHT',
            body: 'Issue 2',
          },
          {
            path: 'src/auth.ts',
            line: 60,
            start_line: undefined,
            side: 'RIGHT',
            start_side: undefined,
            body: 'Issue 3',
          },
        ],
      });
    });

    it('should filter out comments without files', async () => {
      const mockCreateReview = vi.fn().mockResolvedValue({});
      vi.mocked(Octokit).mockImplementation(function () {
        return {
          pulls: {
            createReview: mockCreateReview,
            get: vi.fn().mockResolvedValue({ data: mockDiff }),
          },
        } as unknown as Octokit;
      });

      const comments = [
        {
          file: 'src/auth.ts',
          line: 42,
          finding: 'Valid comment',
        },
        {
          file: null,
          line: null,
          finding: 'Invalid comment - no file',
        },
      ];

      await postReviewComments('fake-token', mockContext, comments);

      expect(mockCreateReview).toHaveBeenCalledWith(
        expect.objectContaining({
          comments: [
            {
              path: 'src/auth.ts',
              line: 42,
              start_line: undefined,
              side: 'RIGHT',
              start_side: undefined,
              body: 'Valid comment',
            },
          ],
        }),
      );
    });

    it('should post summary comment on error', async () => {
      const mockCreateReview = vi.fn().mockRejectedValue(new Error('API error'));
      const mockCreateComment = vi.fn().mockResolvedValue({});
      vi.mocked(Octokit).mockImplementation(function () {
        return {
          pulls: {
            createReview: mockCreateReview,
            get: vi.fn().mockResolvedValue({ data: mockDiff }),
          },
          issues: {
            createComment: mockCreateComment,
          },
        } as unknown as Octokit;
      });

      const comments = [
        {
          file: 'src/auth.ts',
          line: 42,
          finding: 'SQL injection',
        },
      ];

      await postReviewComments('fake-token', mockContext, comments);

      expect(mockCreateComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
        body: expect.stringContaining('## LLM Security Scan Results'),
      });
      expect(mockCreateComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
        body: expect.stringContaining('src/auth.ts:42'),
      });
    });
  });
});
