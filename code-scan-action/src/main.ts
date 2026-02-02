/**
 * GitHub Action Entry Point
 *
 * Main entry point for the promptfoo code-scan GitHub Action
 */

import * as fs from 'fs';

import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as github from '@actions/github';
import { prepareComments } from '../../src/codeScan/util/github';
import {
  CodeScanSeverity,
  type Comment,
  FileChangeStatus,
  formatSeverity,
  type ScanResponse,
} from '../../src/types/codeScan';
import { generateConfigFile } from './config';
import { getGitHubContext, getPRFiles } from './github';

async function run(): Promise<void> {
  try {
    // Get action inputs
    const apiHost = core.getInput('api-host');
    const minimumSeverity = core.getInput('min-severity') || core.getInput('minimum-severity');
    const configPath = core.getInput('config-path');
    const guidanceText = core.getInput('guidance');
    const guidanceFile = core.getInput('guidance-file');
    const githubToken = core.getInput('github-token', { required: true });

    // Validate guidance inputs are mutually exclusive
    if (guidanceText && guidanceFile) {
      throw new Error('Cannot specify both guidance and guidance-file inputs');
    }

    // Read guidance file if provided
    let guidance: string | undefined = undefined;
    if (guidanceText) {
      guidance = guidanceText;
    } else if (guidanceFile) {
      try {
        guidance = fs.readFileSync(guidanceFile, 'utf-8');
        core.info(`📖 Loaded guidance from: ${guidanceFile}`);
      } catch (error) {
        throw new Error(
          `Failed to read guidance file: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    core.info('🔍 Starting Promptfoo Code Scan...');

    // Validate we're in a PR context
    const context = await getGitHubContext(githubToken);
    core.info(`📋 Scanning PR #${context.number} in ${context.owner}/${context.repo}`);

    // Check if this is a setup PR (workflow file addition) - detect early to skip CLI installation
    core.info('🔎 Checking if this is a setup PR...');
    const files = await getPRFiles(githubToken, context);

    // Detect if this is a setup PR (single file adding the workflow)
    const SETUP_WORKFLOW_PATH = '.github/workflows/promptfoo-code-scan.yml';
    const isSetupPR =
      files.length === 1 &&
      files[0].path === SETUP_WORKFLOW_PATH &&
      files[0].status === FileChangeStatus.ADDED;

    if (isSetupPR) {
      core.info('✅ Setup PR detected - workflow file will be added on merge');
      return;
    }

    core.info('✅ Not a setup PR - proceeding with security scan');

    // Get OIDC token from GitHub to prove workflow identity
    try {
      const oidcToken = await core.getIDToken('promptfoo');
      core.info('🔐 Got OIDC token for server authentication');

      // Set as environment variable for CLI to use
      process.env.GITHUB_OIDC_TOKEN = oidcToken;
    } catch (error) {
      // OIDC tokens are not available for fork PRs (GitHub security restriction)
      // For fork PRs, the server will use PR-based authentication instead
      core.info(
        `OIDC token not available: ${error instanceof Error ? error.message : String(error)}`,
      );
      core.info('For fork PRs, this is expected. Authentication will use PR context instead.');
    }

    // Generate config file if not provided
    let finalConfigPath = configPath;
    if (!configPath) {
      finalConfigPath = generateConfigFile(minimumSeverity, guidance);
      core.info(`📝 Generated temporary config at ${finalConfigPath}`);
    }

    // Determine base branch for git diff
    // GITHUB_BASE_REF is set for pull_request events, but not for workflow_dispatch
    let baseBranch: string;
    if (process.env.GITHUB_BASE_REF) {
      baseBranch = process.env.GITHUB_BASE_REF;
    } else {
      // For workflow_dispatch, fetch PR details to get actual base branch
      core.info('📥 Fetching PR details to determine base branch...');
      const octokit = github.getOctokit(githubToken);
      const { data: pr } = await octokit.rest.pulls.get({
        owner: context.owner,
        repo: context.repo,
        pull_number: context.number,
      });
      baseBranch = pr.base.ref;
      core.info(`✅ PR targets base branch: ${baseBranch}`);
    }

    // Fetch base branch to ensure it exists for git diff
    // In GitHub Actions, even with fetch-depth: 0, the base branch might not exist as a local ref
    core.info(`📥 Fetching base branch: ${baseBranch}...`);
    try {
      await exec.exec('git', ['fetch', 'origin', `${baseBranch}:${baseBranch}`]);
      core.info(`✅ Base branch ${baseBranch} fetched successfully`);
    } catch (error) {
      core.warning(
        `Failed to fetch base branch ${baseBranch}: ${error instanceof Error ? error.message : String(error)}`,
      );
      core.warning('Git diff may fail if base branch is not available');
    }

    // Build CLI command
    const repoPath = process.env.GITHUB_WORKSPACE || process.cwd();
    const cliArgs = [
      'code-scans',
      'run',
      repoPath,
      ...(apiHost ? ['--api-host', apiHost] : []),
      '--config',
      finalConfigPath!,
      '--base',
      baseBranch, // Use determined base branch (from GITHUB_BASE_REF or PR API)
      '--compare',
      'HEAD', // Use HEAD to handle detached HEAD state in GitHub Actions
      '--json', // JSON output for parsing
      '--github-pr',
      `${context.owner}/${context.repo}#${context.number}`, // Pass PR context for server-side comment posting
    ];

    // Parse JSON output from CLI (full ScanResponse object)
    let scanResponse: ScanResponse;

    if (process.env.ACT === 'true') {
      // In ACT mode, use mock data to test action logic without running real scans
      core.info('🧪 Running in ACT mode - using mock scan data for testing');
      core.info('📊 Mock scan simulates finding 2 security issues');

      // Mock scan response with sample findings
      scanResponse = {
        success: true,
        comments: [
          {
            file: 'src/example.ts',
            line: 42,
            finding: 'Potential security issue: API key hardcoded in source code',
            severity: CodeScanSeverity.HIGH,
            fix: 'Move API key to environment variable and use process.env.API_KEY instead',
            aiAgentPrompt: 'Review the API key storage and suggest secure alternatives',
          },
          {
            file: 'src/auth.ts',
            line: 15,
            startLine: 10,
            finding: 'SQL injection vulnerability: User input not sanitized before query',
            severity: CodeScanSeverity.CRITICAL,
            fix: 'Use parameterized queries or an ORM to prevent SQL injection',
          },
        ],
        commentsPosted: false,
        review:
          '🔍 **Security Scan Results**\n\nFound 2 potential security issues. Please review the inline comments for details.',
      };

      core.info('✅ Mock scan completed successfully');
    } else {
      // Run real scan in production
      core.info('📦 Installing promptfoo...');
      await exec.exec('npm', ['install', '-g', 'promptfoo']);
      core.info('✅ Promptfoo installed successfully');

      core.info(`🚀 Running promptfoo code-scans run...`);

      // Run promptfoo CLI and capture output
      let scanOutput = '';
      let scanError = '';

      const exitCode = await exec.exec('promptfoo', cliArgs, {
        listeners: {
          stdout: (data: Buffer) => {
            scanOutput += data.toString();
          },
          stderr: (data: Buffer) => {
            scanError += data.toString();
          },
        },
        ignoreReturnCode: true,
      });

      if (exitCode !== 0) {
        // Fork PR auth rejection is expected - server posts helpful comment to PR
        if (scanOutput.includes('Fork PR scanning not authorized')) {
          core.info('🔀 Fork PR detected - see PR comment for scan options');
          return;
        }
        core.error(`CLI exited with code ${exitCode}`);
        core.error(`Error output: ${scanError}`);
        throw new Error(`Code scan failed with exit code ${exitCode}`);
      }

      core.info('✅ Scan completed successfully');

      // Parse JSON output from CLI
      try {
        scanResponse = JSON.parse(scanOutput);
      } catch (error) {
        throw new Error(
          `Failed to parse CLI output as JSON: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const { comments, commentsPosted, review } = scanResponse;
    core.info(`📊 Found ${comments.length} comments${review ? ' and review summary' : ''}`);

    // If server didn't post comments, post them as fallback
    if ((comments.length > 0 || review) && commentsPosted === false) {
      core.info('📝 Server could not post comments - posting as fallback...');

      try {
        const octokit = github.getOctokit(githubToken);

        // Prepare comments and review body for posting
        const { lineComments, generalComments, reviewBody } = prepareComments(
          comments,
          review,
          minimumSeverity,
        );

        // Post review with line-specific comments
        if (lineComments.length > 0 || reviewBody) {
          core.info(
            `📌 Posting PR review${lineComments.length > 0 ? ` with ${lineComments.length} line-specific comments` : ''}...`,
          );

          await octokit.rest.pulls.createReview({
            owner: context.owner,
            repo: context.repo,
            pull_number: context.number,
            event: 'COMMENT',
            body: reviewBody || undefined,
            comments:
              lineComments.length > 0
                ? lineComments.map((c) => {
                    // Combine severity, finding, fix, and AI agent prompt into comment body
                    let body = formatSeverity(c.severity) + c.finding;
                    if (c.fix) {
                      body += `\n\n<details>\n<summary>💡 Suggested Fix</summary>\n\n${c.fix}\n</details>`;
                    }
                    if (c.aiAgentPrompt) {
                      body += `\n\n<details>\n<summary>🤖 AI Agent Prompt</summary>\n\n${c.aiAgentPrompt}\n</details>`;
                    }
                    return {
                      path: c.file!,
                      line: c.line || undefined,
                      start_line: c.startLine || undefined,
                      side: 'RIGHT' as const,
                      start_side: c.startLine ? ('RIGHT' as const) : undefined,
                      body,
                    };
                  })
                : undefined,
          });

          core.info('✅ PR review posted successfully');
        }

        // Post general PR comments
        if (generalComments.length > 0) {
          core.info(`💬 Posting ${generalComments.length} general comments...`);

          for (const comment of generalComments) {
            // Combine severity, finding, fix, and AI agent prompt for general comments
            let body = formatSeverity(comment.severity) + comment.finding;
            if (comment.fix) {
              body += `\n\n<details>\n<summary>💡 Suggested Fix</summary>\n\n${comment.fix}\n</details>`;
            }
            if (comment.aiAgentPrompt) {
              body += `\n\n<details>\n<summary>🤖 AI Agent Prompt</summary>\n\n${comment.aiAgentPrompt}\n</details>`;
            }

            await octokit.rest.issues.createComment({
              owner: context.owner,
              repo: context.repo,
              issue_number: context.number,
              body,
            });
          }

          core.info('✅ General comments posted successfully');
        }

        core.info('✅ All comments posted to PR by action');
      } catch (error) {
        core.error(
          `Failed to post comments: ${error instanceof Error ? error.message : String(error)}`,
        );
        core.warning('Comments could not be posted to PR');
      }
    } else if (comments.length > 0 && commentsPosted === true) {
      core.info('✅ Comments posted to PR by scan server');
    } else if (comments.length > 0) {
      // commentsPosted is undefined - old server version
      core.info('✅ Comments returned (server version does not indicate if posted)');
    } else {
      core.info('✨ No vulnerabilities found!');
    }

    if (process.env.ACT === 'true' && comments.length > 0) {
      core.info('🧪 Running in act - showing comment preview:');
      comments.forEach((comment: Comment, index: number) => {
        core.info(`  ${index + 1}. ${comment.file}:${comment.line}`);
        const preview = comment.fix
          ? `${comment.finding.substring(0, 80)}... [+ suggested fix]`
          : comment.finding.substring(0, 100);
        core.info(`     ${preview}${comment.finding.length > 100 ? '...' : ''}`);
      });
    }

    // Cleanup temp config if we generated one
    if (!configPath && finalConfigPath) {
      fs.unlinkSync(finalConfigPath);
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed(String(error));
    }
  }
}

// biome-ignore lint/nursery/noFloatingPromises: FIXME
run();
