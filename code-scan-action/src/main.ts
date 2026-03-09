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
  type ScanResponse,
} from '../../src/types/codeScan';
import { generateConfigFile } from './config';
import { getGitHubContext, getPRFiles } from './github';
import { buildCliArgs, buildRichIssueCommentBody, toReviewComment } from './mainUtils';

interface ActionInputs {
  apiHost: string;
  minimumSeverity: string;
  configPath: string;
  guidanceText: string;
  guidanceFile: string;
  githubToken: string;
}

const SETUP_WORKFLOW_PATH = '.github/workflows/promptfoo-code-scan.yml';

function getActionInputs(): ActionInputs {
  const inputs = {
    apiHost: core.getInput('api-host'),
    minimumSeverity: core.getInput('min-severity') || core.getInput('minimum-severity'),
    configPath: core.getInput('config-path'),
    guidanceText: core.getInput('guidance'),
    guidanceFile: core.getInput('guidance-file'),
    githubToken: core.getInput('github-token', { required: true }),
  };

  if (inputs.guidanceText && inputs.guidanceFile) {
    throw new Error('Cannot specify both guidance and guidance-file inputs');
  }

  return inputs;
}

function loadGuidance(inputs: ActionInputs): string | undefined {
  if (inputs.guidanceText) {
    return inputs.guidanceText;
  }

  if (!inputs.guidanceFile) {
    return undefined;
  }

  try {
    const guidance = fs.readFileSync(inputs.guidanceFile, 'utf-8');
    core.info(`📖 Loaded guidance from: ${inputs.guidanceFile}`);
    return guidance;
  } catch (error) {
    throw new Error(
      `Failed to read guidance file: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function isSetupPullRequest(files: Awaited<ReturnType<typeof getPRFiles>>): boolean {
  return (
    files.length === 1 &&
    files[0].path === SETUP_WORKFLOW_PATH &&
    files[0].status === FileChangeStatus.ADDED
  );
}

async function maybeSetOidcToken(): Promise<void> {
  try {
    const oidcToken = await core.getIDToken('promptfoo');
    core.info('🔐 Got OIDC token for server authentication');
    process.env.GITHUB_OIDC_TOKEN = oidcToken;
  } catch (error) {
    core.info(
      `OIDC token not available: ${error instanceof Error ? error.message : String(error)}`,
    );
    core.info('For fork PRs, this is expected. Authentication will use PR context instead.');
  }
}

function getFinalConfigPath(
  configPath: string,
  minimumSeverity: string,
  guidance: string | undefined,
): { finalConfigPath: string; generatedConfigPath?: string } {
  if (configPath) {
    return { finalConfigPath: configPath };
  }

  const generatedConfigPath = generateConfigFile(minimumSeverity, guidance);
  core.info(`📝 Generated temporary config at ${generatedConfigPath}`);
  return { finalConfigPath: generatedConfigPath, generatedConfigPath };
}

async function determineBaseBranch(
  githubToken: string,
  context: Awaited<ReturnType<typeof getGitHubContext>>,
): Promise<string> {
  if (process.env.GITHUB_BASE_REF) {
    return process.env.GITHUB_BASE_REF;
  }

  core.info('📥 Fetching PR details to determine base branch...');
  const octokit = github.getOctokit(githubToken);
  const { data: pr } = await octokit.rest.pulls.get({
    owner: context.owner,
    repo: context.repo,
    pull_number: context.number,
  });
  core.info(`✅ PR targets base branch: ${pr.base.ref}`);
  return pr.base.ref;
}

async function fetchBaseBranch(baseBranch: string): Promise<void> {
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
}

function getMockScanResponse(): ScanResponse {
  core.info('🧪 Running in ACT mode - using mock scan data for testing');
  core.info('📊 Mock scan simulates finding 2 security issues');

  return {
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
}

function parseScanResponse(scanOutput: string): ScanResponse {
  try {
    return JSON.parse(scanOutput);
  } catch (error) {
    throw new Error(
      `Failed to parse CLI output as JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function runPromptfooScan(cliArgs: string[]): Promise<ScanResponse | null> {
  if (process.env.ACT === 'true') {
    const scanResponse = getMockScanResponse();
    core.info('✅ Mock scan completed successfully');
    return scanResponse;
  }

  core.info('📦 Installing promptfoo...');
  await exec.exec('npm', ['install', '-g', 'promptfoo']);
  core.info('✅ Promptfoo installed successfully');
  core.info('🚀 Running promptfoo code-scans run...');

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
    if (scanOutput.includes('Fork PR scanning not authorized')) {
      core.info('🔀 Fork PR detected - see PR comment for scan options');
      return null;
    }

    core.error(`CLI exited with code ${exitCode}`);
    core.error(`Error output: ${scanError}`);
    throw new Error(`Code scan failed with exit code ${exitCode}`);
  }

  core.info('✅ Scan completed successfully');
  return parseScanResponse(scanOutput);
}

function buildReviewFallbackBody(
  reviewBody: ScanResponse['review'],
  lineComments: Comment[],
): string {
  const sections = [];
  if (reviewBody) {
    sections.push(reviewBody);
  }
  if (lineComments.length > 0) {
    sections.push(
      lineComments.map((comment) => buildRichIssueCommentBody(comment)).join('\n\n---\n\n'),
    );
  }
  return sections.join('\n\n---\n\n');
}

async function postFallbackReview({
  octokit,
  context,
  lineComments,
  reviewBody,
}: {
  octokit: ReturnType<typeof github.getOctokit>;
  context: Awaited<ReturnType<typeof getGitHubContext>>;
  lineComments: Comment[];
  reviewBody: ScanResponse['review'];
}): Promise<void> {
  if (lineComments.length === 0 && !reviewBody) {
    return;
  }

  core.info(
    `📌 Posting PR review${lineComments.length > 0 ? ` with ${lineComments.length} line-specific comments` : ''}...`,
  );

  try {
    await octokit.rest.pulls.createReview({
      owner: context.owner,
      repo: context.repo,
      pull_number: context.number,
      event: 'COMMENT',
      body: reviewBody || undefined,
      comments: lineComments.length > 0 ? lineComments.map(toReviewComment) : undefined,
    });

    core.info('✅ PR review posted successfully');
  } catch (error) {
    core.warning(
      `Failed to post PR review: ${error instanceof Error ? error.message : String(error)}`,
    );

    const fallbackBody = buildReviewFallbackBody(reviewBody, lineComments);
    if (!fallbackBody) {
      return;
    }

    try {
      await octokit.rest.issues.createComment({
        owner: context.owner,
        repo: context.repo,
        issue_number: context.number,
        body: fallbackBody,
      });
      core.info('✅ Posted PR review content as a fallback issue comment');
    } catch (fallbackError) {
      core.warning(
        `Failed to post PR review fallback comment: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
      );
    }
  }
}

async function postFallbackGeneralComments({
  octokit,
  context,
  generalComments,
}: {
  octokit: ReturnType<typeof github.getOctokit>;
  context: Awaited<ReturnType<typeof getGitHubContext>>;
  generalComments: Comment[];
}): Promise<void> {
  if (generalComments.length === 0) {
    return;
  }

  core.info(`💬 Posting ${generalComments.length} general comments...`);

  let successCount = 0;
  for (const comment of generalComments) {
    try {
      await octokit.rest.issues.createComment({
        owner: context.owner,
        repo: context.repo,
        issue_number: context.number,
        body: buildRichIssueCommentBody(comment),
      });
      successCount++;
    } catch (error) {
      core.warning(
        `Failed to post general comment: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (successCount === generalComments.length) {
    core.info('✅ General comments posted successfully');
  } else {
    core.warning(`Posted ${successCount}/${generalComments.length} general comments`);
  }
}

async function postFallbackCommentsToPr({
  githubToken,
  context,
  comments,
  review,
  minimumSeverity,
}: {
  githubToken: string;
  context: Awaited<ReturnType<typeof getGitHubContext>>;
  comments: Comment[];
  review: ScanResponse['review'];
  minimumSeverity: string;
}): Promise<void> {
  core.info('📝 Server could not post comments - posting as fallback...');

  const octokit = github.getOctokit(githubToken);
  const { lineComments, generalComments, reviewBody } = prepareComments(
    comments,
    review,
    minimumSeverity,
  );

  await postFallbackReview({ octokit, context, lineComments, reviewBody });
  await postFallbackGeneralComments({ octokit, context, generalComments });
}

async function handleScanResults({
  comments,
  commentsPosted,
  review,
  githubToken,
  context,
  minimumSeverity,
}: {
  comments: Comment[];
  commentsPosted: ScanResponse['commentsPosted'];
  review: ScanResponse['review'];
  githubToken: string;
  context: Awaited<ReturnType<typeof getGitHubContext>>;
  minimumSeverity: string;
}): Promise<void> {
  core.info(`📊 Found ${comments.length} comments${review ? ' and review summary' : ''}`);

  if ((comments.length > 0 || review) && commentsPosted === false) {
    await postFallbackCommentsToPr({
      githubToken,
      context,
      comments,
      review,
      minimumSeverity,
    });
    return;
  }

  if (comments.length > 0 && commentsPosted === true) {
    core.info('✅ Comments posted to PR by scan server');
    return;
  }

  if (comments.length > 0) {
    core.info('✅ Comments returned (server version does not indicate if posted)');
    return;
  }

  core.info('✨ No vulnerabilities found!');
}

function logActPreview(comments: Comment[]): void {
  if (process.env.ACT !== 'true' || comments.length === 0) {
    return;
  }

  core.info('🧪 Running in act - showing comment preview:');
  comments.forEach((comment, index) => {
    core.info(`  ${index + 1}. ${comment.file}:${comment.line}`);
    const preview = comment.fix
      ? `${comment.finding.substring(0, 80)}... [+ suggested fix]`
      : comment.finding.substring(0, 100);
    core.info(`     ${preview}${comment.finding.length > 100 ? '...' : ''}`);
  });
}

export async function run(): Promise<void> {
  let generatedConfigPath: string | undefined;

  try {
    const inputs = getActionInputs();
    const guidance = loadGuidance(inputs);

    core.info('🔍 Starting Promptfoo Code Scan...');

    const context = await getGitHubContext(inputs.githubToken);
    core.info(`📋 Scanning PR #${context.number} in ${context.owner}/${context.repo}`);

    core.info('🔎 Checking if this is a setup PR...');
    const files = await getPRFiles(inputs.githubToken, context);
    if (isSetupPullRequest(files)) {
      core.info('✅ Setup PR detected - workflow file will be added on merge');
      return;
    }

    core.info('✅ Not a setup PR - proceeding with security scan');
    await maybeSetOidcToken();

    const configPaths = getFinalConfigPath(inputs.configPath, inputs.minimumSeverity, guidance);
    generatedConfigPath = configPaths.generatedConfigPath;

    const baseBranch = await determineBaseBranch(inputs.githubToken, context);
    await fetchBaseBranch(baseBranch);

    const scanResponse = await runPromptfooScan(
      buildCliArgs({
        apiHost: inputs.apiHost,
        baseBranch,
        context,
        finalConfigPath: configPaths.finalConfigPath,
      }),
    );

    if (!scanResponse) {
      return;
    }

    await handleScanResults({
      comments: scanResponse.comments,
      commentsPosted: scanResponse.commentsPosted,
      review: scanResponse.review,
      githubToken: inputs.githubToken,
      context,
      minimumSeverity: inputs.minimumSeverity,
    });

    logActPreview(scanResponse.comments);
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  } finally {
    if (generatedConfigPath) {
      try {
        fs.unlinkSync(generatedConfigPath);
      } catch (error) {
        core.warning(
          `Failed to remove temporary config ${generatedConfigPath}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
