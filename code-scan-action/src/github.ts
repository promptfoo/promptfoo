/**
 * GitHub API Client
 *
 * Handles posting review comments via Octokit
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import { Octokit } from '@octokit/rest';
import {
  type Comment,
  type FileChange,
  FileChangeStatus,
  type PullRequestContext,
} from '../../src/types/codeScan';

/**
 * Get GitHub context from the current workflow
 * @returns GitHub PR context
 */
export function getGitHubContext(): PullRequestContext {
  const context = github.context;

  if (!context.payload.pull_request) {
    throw new Error('This action can only be run on pull_request events');
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

  // Separate line-specific comments from general PR comments
  const lineComments = comments.filter((c) => c.file && c.finding);
  const generalComments = comments.filter((c) => !c.file && c.finding);

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
            start_line: c.startLine && c.startLine < c.line ? c.startLine : undefined,
            side: 'RIGHT' as const,
            start_side: c.startLine && c.startLine < c.line ? ('RIGHT' as const) : undefined,
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

  if (lineComments.length === 0 && generalComments.length === 0) {
    core.warning('No valid comments to post');
  }
}
