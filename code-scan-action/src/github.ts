/**
 * GitHub API Client
 *
 * Handles posting review comments via Octokit
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import { Octokit } from '@octokit/rest';
import {
  clampCommentLines,
  extractValidLineRanges,
  type FileLineRanges,
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
 * Clamp a comment's line numbers to valid diff ranges.
 * Returns the adjusted comment, or null if lines cannot be clamped.
 */
function clampCommentToValidRange(comment: Comment, validRanges: FileLineRanges): Comment | null {
  if (!comment.file || comment.line == null) {
    return comment;
  }

  const clamped = clampCommentLines(comment.file, comment.startLine, comment.line, validRanges);

  if (!clamped) {
    // File not in diff - return null to convert to general comment
    return null;
  }

  return {
    ...comment,
    startLine: clamped.startLine,
    line: clamped.line,
  };
}

/**
 * Validate review-comment locations against the current PR diff.
 * Comments that cannot be placed inline are returned separately for general posting.
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

    const clamped = clampCommentToValidRange(comment, validRanges);
    if (clamped) {
      lineComments.push(clamped);
    } else {
      core.warning(
        `Comment on ${comment.file}:${comment.line} could not be placed in diff - converting to general comment`,
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

function buildCommentBody(comment: Comment): string {
  return comment.fix
    ? `${comment.finding}\n\n<details>\n<summary>Suggested Fix</summary>\n\n${comment.fix}\n</details>`
    : comment.finding;
}

function formatCommentLocation(comment: Comment): string | undefined {
  if (comment.startLine && comment.line && comment.startLine !== comment.line) {
    return `${comment.file}:${comment.startLine}-${comment.line}`;
  }
  return comment.line ? `${comment.file}:${comment.line}` : (comment.file ?? undefined);
}

async function postLineComments(
  octokit: Octokit,
  context: PullRequestContext,
  comments: Comment[],
): Promise<void> {
  if (comments.length === 0) {
    return;
  }

  core.info(`Posting ${comments.length} line-specific review comments...`);

  try {
    await octokit.pulls.createReview({
      owner: context.owner,
      repo: context.repo,
      pull_number: context.number,
      event: 'COMMENT',
      comments: comments.map((comment) => ({
        path: comment.file!,
        line: comment.line || undefined,
        start_line:
          comment.startLine && comment.line && comment.startLine < comment.line
            ? comment.startLine
            : undefined,
        side: 'RIGHT' as const,
        start_side:
          comment.startLine && comment.line && comment.startLine < comment.line
            ? ('RIGHT' as const)
            : undefined,
        body: buildCommentBody(comment),
      })),
    });

    core.info(`✅ Posted ${comments.length} line comments successfully`);
  } catch (error) {
    core.warning(
      `Failed to post inline comments: ${error instanceof Error ? error.message : String(error)}`,
    );
    core.info('Posting as summary comment instead...');

    const summaryBody = comments
      .map((comment) => `**${formatCommentLocation(comment)}**\n\n${buildCommentBody(comment)}`)
      .join('\n\n---\n\n');

    await octokit.issues.createComment({
      owner: context.owner,
      repo: context.repo,
      issue_number: context.number,
      body: `## LLM Security Scan Results\n\n${summaryBody}`,
    });

    core.info('✅ Posted summary comment');
  }
}

async function postGeneralComments(
  octokit: Octokit,
  context: PullRequestContext,
  comments: Comment[],
): Promise<void> {
  if (comments.length === 0) {
    return;
  }

  core.info(`Posting ${comments.length} general PR comment(s)...`);

  for (const comment of comments) {
    try {
      await octokit.issues.createComment({
        owner: context.owner,
        repo: context.repo,
        issue_number: context.number,
        body: buildCommentBody(comment),
      });
    } catch (error) {
      core.warning(
        `Failed to post general comment: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  core.info(`✅ Posted ${comments.length} general comment(s) successfully`);
}

async function postInvalidLineComments(
  octokit: Octokit,
  context: PullRequestContext,
  comments: Comment[],
): Promise<void> {
  if (comments.length === 0) {
    return;
  }

  core.info(
    `Posting ${comments.length} comment(s) that couldn't be placed in diff as general comments...`,
  );

  for (const comment of comments) {
    try {
      await octokit.issues.createComment({
        owner: context.owner,
        repo: context.repo,
        issue_number: context.number,
        body: `**${formatCommentLocation(comment)}**\n\n> *This comment references code outside the visible diff context*\n\n${buildCommentBody(comment)}`,
      });
    } catch (error) {
      core.warning(
        `Failed to post fallback comment: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  core.info(`✅ Posted ${comments.length} fallback comment(s)`);
}

/**
 * Post review comments on the PR
 * @param token GitHub token
 * @param context GitHub PR context
 * @param comments Structured comments to post
 */
export async function postReviewComments(
  token: string,
  context: PullRequestContext,
  comments: Comment[],
): Promise<void> {
  if (comments.length === 0) {
    core.info('No comments to post');
    return;
  }

  const octokit = new Octokit({ auth: token });

  const partitionedComments = await partitionReviewCommentsWithOctokit(octokit, context, comments);
  const lineComments = partitionedComments.lineComments.filter((comment) => comment.finding);
  const generalComments = partitionedComments.generalComments.filter((comment) => comment.finding);
  const invalidLineComments = partitionedComments.invalidLineComments.filter(
    (comment) => comment.finding,
  );

  await postLineComments(octokit, context, lineComments);
  await postGeneralComments(octokit, context, generalComments);
  await postInvalidLineComments(octokit, context, invalidLineComments);

  if (
    lineComments.length === 0 &&
    generalComments.length === 0 &&
    invalidLineComments.length === 0
  ) {
    core.warning('No valid comments to post');
  }
}
