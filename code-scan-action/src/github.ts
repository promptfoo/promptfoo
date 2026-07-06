/**
 * GitHub API Client
 *
 * Handles posting review comments via Octokit
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import { Octokit } from '@octokit/rest';
import {
  extractValidLineRanges,
  type FileLineRanges,
  isLineInDiff,
} from '../../src/codeScan/util/diffLineRanges';
import {
  type Comment,
  type FileChange,
  FileChangeStatus,
  type PullRequestContext,
} from '../../src/types/codeScan';

/**
 * Get GitHub context from the current workflow.
 * Supports both pull_request events and workflow_dispatch (with pr_number input).
 * @param token GitHub token (required for workflow_dispatch to fetch PR details)
 * @returns GitHub PR context
 */
export async function getGitHubContext(token: string): Promise<PullRequestContext> {
  const context = github.context;

  // For workflow_dispatch, read pr_number from event inputs
  if (context.eventName === 'workflow_dispatch') {
    const prNumberInput = (context.payload.inputs as Record<string, string> | undefined)?.pr_number;
    if (!prNumberInput) {
      throw new Error(
        'workflow_dispatch requires a pr_number input. Add inputs: { pr_number: { required: true } } to your workflow.',
      );
    }

    const prNumber = parseInt(prNumberInput, 10);
    if (isNaN(prNumber)) {
      throw new Error(`Invalid pr_number input: "${prNumberInput}"`);
    }

    const octokit = new Octokit({ auth: token });
    const { data: pr } = await octokit.pulls.get({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: prNumber,
    });

    return {
      owner: context.repo.owner,
      repo: context.repo.repo,
      number: pr.number,
      sha: pr.head.sha,
    };
  }

  // Otherwise, get context from pull_request event
  if (!context.payload.pull_request) {
    throw new Error(
      'This action requires a pull_request event or workflow_dispatch with pr_number input',
    );
  }

  return {
    owner: context.repo.owner,
    repo: context.repo.repo,
    number: context.payload.pull_request.number,
    sha: context.payload.pull_request.head.sha,
  };
}

/**
 * Get list of files changed in the PR
 * @param token GitHub token
 * @param context GitHub PR context
 * @returns Array of file changes
 */
export async function getPRFiles(
  token: string,
  context: PullRequestContext,
): Promise<FileChange[]> {
  const octokit = new Octokit({ auth: token });

  const { data: files } = await octokit.pulls.listFiles({
    owner: context.owner,
    repo: context.repo,
    pull_number: context.number,
  });

  return files.map((file) => ({
    path: file.filename,
    status: file.status as FileChangeStatus,
  }));
}

/**
 * Fetch PR diff and extract valid line ranges for each file.
 * This is used to validate and clamp comment line numbers.
 */
async function getPRDiffRanges(
  octokit: Octokit,
  context: PullRequestContext,
): Promise<FileLineRanges> {
  try {
    const { data: diff } = await octokit.pulls.get({
      owner: context.owner,
      repo: context.repo,
      pull_number: context.number,
      mediaType: { format: 'diff' },
    });

    // The diff is returned as a string when using mediaType: { format: 'diff' }
    return extractValidLineRanges(diff as unknown as string);
  } catch (error) {
    core.warning(
      `Failed to fetch PR diff for line validation: ${error instanceof Error ? error.message : String(error)}`,
    );
    return new Map();
  }
}

/**
 * Whether a comment's exact line(s) can be placed as an inline review comment.
 *
 * GitHub only accepts review comments anchored to lines that appear in the reviewed
 * diff. We intentionally do NOT clamp an out-of-diff line to the nearest visible hunk:
 * default full-repository tracing routinely reports findings on unchanged lines, and
 * clamping would silently re-point the comment at unrelated code, destroying the true
 * location. A finding is inline-eligible only when its exact `file:line` is in the diff;
 * for multi-line findings both endpoints must be in the diff. Everything else is routed
 * to a general comment that preserves the original location in text.
 */
function isInlineCommentInDiff(comment: Comment, validRanges: FileLineRanges): boolean {
  if (!comment.file || comment.line == null) {
    return false;
  }

  if (!isLineInDiff(comment.file, comment.line, validRanges)) {
    return false;
  }

  // Multi-line comment: GitHub requires start_line to be in the diff too. When startLine
  // is absent or not strictly less than line, toReviewComment posts it single-line, so the
  // end line is the only anchor that must be present.
  if (comment.startLine != null && comment.startLine < comment.line) {
    return isLineInDiff(comment.file, comment.startLine, validRanges);
  }

  return true;
}

/**
 * Validate review-comment locations against the current PR diff.
 * Comments that cannot be placed inline are returned separately for general posting with
 * their original locations preserved.
 */
async function partitionReviewCommentsWithOctokit(
  octokit: Octokit,
  context: PullRequestContext,
  comments: Comment[],
): Promise<{
  lineComments: Comment[];
  generalComments: Comment[];
  invalidLineComments: Comment[];
}> {
  const validRanges = await getPRDiffRanges(octokit, context);
  const lineComments: Comment[] = [];
  const generalComments: Comment[] = [];
  const invalidLineComments: Comment[] = [];

  for (const comment of comments) {
    if (!comment.file || comment.line == null) {
      generalComments.push(comment);
      continue;
    }

    if (isInlineCommentInDiff(comment, validRanges)) {
      // Exact location is in the diff - keep it inline, unmodified.
      lineComments.push(comment);
    } else {
      core.warning(
        `Comment on ${comment.file}:${comment.line} is not on a line in the reviewed diff - posting as a general comment to preserve its location`,
      );
      invalidLineComments.push(comment);
    }
  }

  return { lineComments, generalComments, invalidLineComments };
}

export async function partitionReviewCommentsByDiff(
  token: string,
  context: PullRequestContext,
  comments: Comment[],
) {
  const octokit = new Octokit({ auth: token });
  return partitionReviewCommentsWithOctokit(octokit, context, comments);
}
