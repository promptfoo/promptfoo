/**
 * Setup PR Detection and Handling
 *
 * Detects when a PR is adding the workflow file (setup PR)
 * and handles posting welcome comments
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import { FileChangeStatus, type FileChange } from '../../src/types/codeScan';

// Constants
export const SETUP_WORKFLOW_PATH = '.github/workflows/promptfoo-code-scan.yml';

export const WELCOME_MESSAGE = `You're almost finished installing the Promptfoo Scanner in your repo 👍 Just merge this PR to add the scan action to your GitHub workflows. It will then automatically run on all PRs in this repo.`;

/**
 * Check if this is a setup PR (single file adding workflow)
 */
export function detectSetupPR(files: FileChange[]): boolean {
  return (
    files.length === 1 &&
    files[0].path === SETUP_WORKFLOW_PATH &&
    files[0].status === FileChangeStatus.ADDED
  );
}

/**
 * Handle setup PR - post welcome comment
 * If OIDC token exists, call server to post branded comment
 * Otherwise, post comment directly via Octokit (GitHub Actions bot)
 */
export async function handleSetupPR(
  githubToken: string,
  apiHost: string | undefined,
  oidcToken: string | undefined,
): Promise<void> {
  const context = github.context;

  // Ensure we're in a PR context
  if (!context.payload.pull_request) {
    throw new Error('Not in a pull request context');
  }

  const owner = context.payload.pull_request.base.repo.owner.login;
  const repo = context.payload.pull_request.base.repo.name;
  const prNumber = context.payload.pull_request.number;

  core.info('🎉 Detected setup PR - posting welcome comment...');

  // If OIDC token exists, try to post via server (branded comment)
  if (oidcToken) {
    core.info('🔐 OIDC token available - posting via server for branded comment...');

    try {
      const serverUrl = apiHost || 'https://www.promptfoo.app';
      const response = await fetch(`${serverUrl}/api/v1/code-scan/setup-pr-comment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-github-oidc-token': oidcToken,
        },
        body: JSON.stringify({
          owner,
          repo,
          prNumber,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server returned ${response.status}: ${errorText}`);
      }

      core.info('✅ Welcome comment posted via server (branded)');
      return;
    } catch (error) {
      core.warning(
        `Failed to post via server: ${error instanceof Error ? error.message : String(error)}`,
      );
      core.info('⚠️ Falling back to direct comment posting...');
    }
  }

  // Fallback: Post comment directly via Octokit (GitHub Actions bot)
  try {
    const octokit = github.getOctokit(githubToken);

    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: WELCOME_MESSAGE,
    });

    core.info('✅ Welcome comment posted via GitHub Actions bot');
  } catch (error) {
    core.error(
      `Failed to post welcome comment: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}
