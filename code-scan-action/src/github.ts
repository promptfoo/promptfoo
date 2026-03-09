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
  CodeScanSeverity,
  type Comment,
  type FileChange,
  FileChangeStatus,
  type PullRequestContext,
} from '../../src/types/codeScan';

function createOctokit(token: string): Octokit {
  return new Octokit({ auth: token });
}

/**
 * Get GitHub context from the current workflow.
 * Supports both pull_request events and workflow_dispatch (with pr_number input).
 * @param token GitHub token (required for workflow_dispatch to fetch PR details)
 * @returns GitHub PR context
 */
export async function getGitHubContext(
  token: string,
  octokit?: Octokit,
  context = github.context,
): Promise<PullRequestContext> {
  // For workflow_dispatch, read pr_number from event inputs
  if (context.eventName === 'workflow_dispatch') {
    const prNumberInput = (context.payload.inputs as Record<string, string> | undefined)?.pr_number;
    if (!prNumberInput) {
      throw new Error(
        'workflow_dispatch requires a pr_number input. Add inputs: { pr_number: { required: true } } to your workflow.',
      );
    }

    if (!/^\d+$/.test(prNumberInput)) {
      throw new Error(`Invalid pr_number input: "${prNumberInput}"`);
    }
    const prNumber = Number(prNumberInput);

    const { data: pr } = await (octokit ?? createOctokit(token)).pulls.get({
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
  octokit?: Octokit,
): Promise<FileChange[]> {
  const octokitClient = octokit ?? createOctokit(token);
  const files = await octokitClient.paginate(octokitClient.pulls.listFiles, {
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

function buildCommentBody(comment: Comment): string {
  let body = comment.finding;
  if (comment.fix) {
    body += `\n\n<details>\n<summary>Suggested Fix</summary>\n\n${comment.fix}\n</details>`;
  }
  return body;
}

function buildIssueCommentBody(comment: Comment): string {
  const body = buildCommentBody(comment);
  if (!comment.file) {
    return body;
  }

  return `**${formatCommentLineRange(comment)}**\n\n${body}`;
}

function formatCommentLineRange(comment: Comment): string {
  if (!comment.file) {
    return 'PR summary';
  }

  if (comment.startLine && comment.line && comment.startLine !== comment.line) {
    return `${comment.file}:${comment.startLine}-${comment.line}`;
  }

  if (comment.line) {
    return `${comment.file}:${comment.line}`;
  }

  return comment.file;
}

function splitCommentsByPlacement(comments: Comment[], validRanges: FileLineRanges) {
  const processedComments: Comment[] = [];
  const invalidLineComments: Comment[] = [];

  for (const comment of comments) {
    if (!comment.file || comment.line == null) {
      processedComments.push(comment);
      continue;
    }

    const clamped = clampCommentToValidRange(comment, validRanges);
    if (clamped) {
      processedComments.push(clamped);
      continue;
    }

    core.warning(
      `Comment on ${comment.file}:${comment.line} could not be placed in diff - converting to general comment`,
    );
    invalidLineComments.push(comment);
  }

  return { processedComments, invalidLineComments };
}

function toInlineReviewComment(comment: Comment) {
  const hasRange = Boolean(comment.startLine && comment.line && comment.startLine < comment.line);

  return {
    path: comment.file!,
    line: comment.line ?? undefined,
    start_line: hasRange && comment.startLine != null ? comment.startLine : undefined,
    side: 'RIGHT' as const,
    start_side: hasRange ? ('RIGHT' as const) : undefined,
    body: buildCommentBody(comment),
  };
}

async function postInlineReviewComments(
  octokit: Octokit,
  context: PullRequestContext,
  lineComments: Comment[],
): Promise<void> {
  if (lineComments.length === 0) {
    return;
  }

  core.info(`Posting ${lineComments.length} line-specific review comments...`);

  try {
    await octokit.pulls.createReview({
      owner: context.owner,
      repo: context.repo,
      pull_number: context.number,
      event: 'COMMENT',
      comments: lineComments.map(toInlineReviewComment),
    });

    core.info(`✅ Posted ${lineComments.length} line comments successfully`);
  } catch (error) {
    core.warning(
      `Failed to post inline comments: ${error instanceof Error ? error.message : String(error)}`,
    );
    core.info('Posting as summary comment instead...');

    const summaryBody = lineComments
      .map((comment) => `**${formatCommentLineRange(comment)}**\n\n${buildCommentBody(comment)}`)
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
  generalComments: Comment[],
): Promise<void> {
  if (generalComments.length === 0) {
    return;
  }

  core.info(`Posting ${generalComments.length} general PR comment(s)...`);

  for (const comment of generalComments) {
    try {
      await octokit.issues.createComment({
        owner: context.owner,
        repo: context.repo,
        issue_number: context.number,
        body: buildIssueCommentBody(comment),
      });
    } catch (error) {
      core.warning(
        `Failed to post general comment: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  core.info(`✅ Posted ${generalComments.length} general comment(s) successfully`);
}

async function postFallbackComments(
  octokit: Octokit,
  context: PullRequestContext,
  invalidLineComments: Comment[],
): Promise<void> {
  if (invalidLineComments.length === 0) {
    return;
  }

  core.info(
    `Posting ${invalidLineComments.length} comment(s) that couldn't be placed in diff as general comments...`,
  );

  let successCount = 0;
  for (const comment of invalidLineComments) {
    try {
      const body = `**${formatCommentLineRange(comment)}**\n\n> *This comment references code outside the visible diff context*\n\n${buildCommentBody(comment)}`;

      await octokit.issues.createComment({
        owner: context.owner,
        repo: context.repo,
        issue_number: context.number,
        body,
      });
      successCount++;
    } catch (error) {
      core.warning(
        `Failed to post fallback comment: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (successCount === invalidLineComments.length) {
    core.info(`✅ Posted ${successCount} fallback comment(s)`);
    return;
  }

  core.warning(
    `Posted ${successCount}/${invalidLineComments.length} fallback comment(s) successfully`,
  );
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
  octokit?: Octokit,
): Promise<void> {
  if (comments.length === 0) {
    core.info('No comments to post');
    return;
  }

  const octokitClient = octokit ?? createOctokit(token);

  // Fetch PR diff to validate line numbers
  const validRanges = await getPRDiffRanges(octokitClient, context);
  const { processedComments, invalidLineComments } = splitCommentsByPlacement(
    comments,
    validRanges,
  );

  // Separate line-specific comments from general PR comments
  const lineComments = processedComments.filter(
    (comment) =>
      comment.file &&
      comment.line != null &&
      comment.finding &&
      comment.severity !== CodeScanSeverity.NONE,
  );
  const generalComments = processedComments.filter(
    (comment) => (!comment.file || comment.line == null) && comment.finding,
  );

  await postInlineReviewComments(octokitClient, context, lineComments);
  await postGeneralComments(octokitClient, context, generalComments);
  await postFallbackComments(octokitClient, context, invalidLineComments);

  if (
    lineComments.length === 0 &&
    generalComments.length === 0 &&
    invalidLineComments.length === 0
  ) {
    core.warning('No valid comments to post');
  }
}
