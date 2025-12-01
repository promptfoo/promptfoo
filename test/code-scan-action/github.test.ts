/**
 * GitHub API Client Tests
 */

import * as github from '@actions/github';
import { getGitHubContext, postReviewComments } from '../../code-scan-action/src/github';

// Mock @actions/core
jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
}));

// Mock @actions/github
jest.mock('@actions/github', () => ({
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

// Mock Octokit
jest.mock('@octokit/rest', () => {
  return {
    Octokit: jest.fn().mockImplementation(() => ({
      pulls: {
        createReview: jest.fn().mockResolvedValue({}),
      },
      issues: {
        createComment: jest.fn().mockResolvedValue({}),
      },
    })),
  };
});

describe('GitHub API Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getGitHubContext', () => {
    it('should extract context from github.context', () => {
      const context = getGitHubContext();

      expect(context).toEqual({
        owner: 'test-owner',
        repo: 'test-repo',
        number: 123,
        sha: 'abc123',
      });
    });

    it('should throw error when not in PR context', () => {
      const originalPayload = github.context.payload;
      github.context.payload = {};

      expect(() => getGitHubContext()).toThrow(
        'This action can only be run on pull_request events',
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
      const { Octokit } = require('@octokit/rest');
      const mockCreateReview = jest.fn().mockResolvedValue({});
      Octokit.mockImplementation(() => ({
        pulls: {
          createReview: mockCreateReview,
        },
      }));

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
      const { Octokit } = require('@octokit/rest');
      const mockCreateReview = jest.fn().mockResolvedValue({});
      Octokit.mockImplementation(() => ({
        pulls: {
          createReview: mockCreateReview,
        },
      }));

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
      const { Octokit } = require('@octokit/rest');
      const mockCreateReview = jest.fn().mockResolvedValue({});
      Octokit.mockImplementation(() => ({
        pulls: {
          createReview: mockCreateReview,
        },
      }));

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
      const { Octokit } = require('@octokit/rest');
      const mockCreateReview = jest.fn().mockResolvedValue({});
      Octokit.mockImplementation(() => ({
        pulls: {
          createReview: mockCreateReview,
        },
      }));

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
      const { Octokit } = require('@octokit/rest');
      const mockCreateReview = jest.fn().mockResolvedValue({});
      Octokit.mockImplementation(() => ({
        pulls: {
          createReview: mockCreateReview,
        },
      }));

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
      const { Octokit } = require('@octokit/rest');
      const mockCreateReview = jest.fn().mockRejectedValue(new Error('API error'));
      const mockCreateComment = jest.fn().mockResolvedValue({});
      Octokit.mockImplementation(() => ({
        pulls: {
          createReview: mockCreateReview,
        },
        issues: {
          createComment: mockCreateComment,
        },
      }));

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
