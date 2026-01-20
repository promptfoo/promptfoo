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

  // Fetch PR diff to validate line numbers
  const validRanges = await getPRDiffRanges(octokit, context);

  // Process comments: clamp line numbers and handle invalid ones
  const processedComments: Comment[] = [];
  const invalidLineComments: Comment[] = [];

  for (const comment of comments) {
    if (!comment.file || comment.line == null) {
      // Already a general comment
      processedComments.push(comment);
      continue;
    }

    const clamped = clampCommentToValidRange(comment, validRanges);
    if (clamped) {
      processedComments.push(clamped);
    } else {
      // File not in diff - convert to general comment
      core.warning(
        `Comment on ${comment.file}:${comment.line} could not be placed in diff - converting to general comment`,
      );
      invalidLineComments.push(comment);
    }
  }

  // Separate line-specific comments from general PR comments
  const lineComments = processedComments.filter((c) => c.file && c.finding);
  const generalComments = processedComments.filter((c) => !c.file && c.finding);

  // Post line-specific review comments
  if (lineComments.length > 0) {
    core.info(`Posting ${lineComments.length} line-specific review comments...`);

    try {
      await octokit.pulls.createReview({
        owner: context.owner,
        repo: context.repo,
        pull_number: context.number,
        event: 'COMMENT',
        comments: lineComments.map((c) => {
          // Combine finding and fix into comment body
          let body = c.finding;
          if (c.fix) {
            body += `\n\n<details>\n<summary>Suggested Fix</summary>\n\n${c.fix}\n</details>`;
          }

          return {
            path: c.file!,
            line: c.line || undefined,
            start_line: c.startLine && c.line && c.startLine < c.line ? c.startLine : undefined,
            side: 'RIGHT' as const,
            start_side:
              c.startLine && c.line && c.startLine < c.line ? ('RIGHT' as const) : undefined,
            body,
          };
        }),
      });

      core.info(`✅ Posted ${lineComments.length} line comments successfully`);
    } catch (error) {
      core.warning(
        `Failed to post inline comments: ${error instanceof Error ? error.message : String(error)}`,
      );
      core.info('Posting as summary comment instead...');

      const summaryBody = lineComments
        .map((c) => {
          const lineRange =
            c.startLine && c.line && c.startLine !== c.line
              ? `${c.file}:${c.startLine}-${c.line}`
              : c.line
                ? `${c.file}:${c.line}`
                : c.file;

          let commentText = c.finding;
          if (c.fix) {
            commentText += `\n\n<details>\n<summary>Suggested Fix</summary>\n\n${c.fix}\n</details>`;
          }

          return `**${lineRange}**\n\n${commentText}`;
        })
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

  // Post general PR comments
  if (generalComments.length > 0) {
    core.info(`Posting ${generalComments.length} general PR comment(s)...`);

    for (const comment of generalComments) {
      try {
        // Combine finding and fix for general comments too
        let body = comment.finding;
        if (comment.fix) {
          body += `\n\n<details>\n<summary>Suggested Fix</summary>\n\n${comment.fix}\n</details>`;
        }

        await octokit.issues.createComment({
          owner: context.owner,
          repo: context.repo,
          issue_number: context.number,
          body,
        });
      } catch (error) {
        core.warning(
          `Failed to post general comment: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    core.info(`✅ Posted ${generalComments.length} general comment(s) successfully`);
  }

  // Post comments that couldn't be placed in diff as general comments with a note
  if (invalidLineComments.length > 0) {
    core.info(
      `Posting ${invalidLineComments.length} comment(s) that couldn't be placed in diff as general comments...`,
    );

    for (const comment of invalidLineComments) {
      try {
        const lineRange =
          comment.startLine && comment.line && comment.startLine !== comment.line
            ? `${comment.file}:${comment.startLine}-${comment.line}`
            : comment.line
              ? `${comment.file}:${comment.line}`
              : comment.file;

        let body = `**${lineRange}**\n\n> *This comment references code outside the visible diff context*\n\n${comment.finding}`;
        if (comment.fix) {
          body += `\n\n<details>\n<summary>Suggested Fix</summary>\n\n${comment.fix}\n</details>`;
        }

        await octokit.issues.createComment({
          owner: context.owner,
          repo: context.repo,
          issue_number: context.number,
          body,
        });
      } catch (error) {
        core.warning(
          `Failed to post fallback comment: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    core.info(`✅ Posted ${invalidLineComments.length} fallback comment(s)`);
  }

  if (
    lineComments.length === 0 &&
    generalComments.length === 0 &&
    invalidLineComments.length === 0
  ) {
    core.warning('No valid comments to post');
  }
}
