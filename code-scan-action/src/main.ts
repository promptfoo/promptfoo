/**
 * GitHub Action Entry Point
 *
 * Main entry point for the promptfoo code-scan GitHub Action
 */

import * as fs from 'fs';
import * as path from 'path';

import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as github from '@actions/github';
import { prepareComments } from '../../src/codeScan/util/github';
import { scanResponseToSarif } from '../../src/codeScan/util/sarif';
import {
  CodeScanSeverity,
  type Comment,
  type FileChange,
  FileChangeStatus,
  formatSeverity,
  type PullRequestContext,
  type ScanResponse,
} from '../../src/types/codeScan';
import { getGitHubOIDCToken } from './auth';
import { generateConfigFile } from './config';
import { getGitHubContext, getPRFiles } from './github';

interface ActionInputs {
  apiHost: string;
  minimumSeverity: string;
  minimumSeverityInputProvided: boolean;
  configPath: string;
  diffsOnly: boolean;
  diffsOnlyInputProvided: boolean;
  guidanceText: string;
  guidanceFile: string;
  githubToken: string;
  enableForkPrs: boolean;
  sarifOutputPath: string | undefined;
}

interface PullRequestForkPayload {
  head?: {
    repo?: {
      full_name?: string | null;
    } | null;
  } | null;
  base?: {
    repo?: {
      full_name?: string | null;
    } | null;
  } | null;
}

const FORK_PR_AUTH_SKIP_REASON =
  'Fork PR scanning requires maintainer approval. See PR comment for options.';

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const DEFAULT_MINIMUM_SEVERITY = 'medium';

interface MinimumSeverityInput {
  value: string;
  provided: boolean;
}

/**
 * Resolve the effective minimum severity from the two supported inputs.
 *
 * The two inputs do NOT carry defaults in `action.yml`. That keeps
 * `core.getInput()` returning `''` when a workflow has not set the input,
 * which is what lets a workflow that only sets the alias (`minimum-severity`)
 * actually take effect. Precedence is:
 *
 *   1. `min-severity` if set
 *   2. `minimum-severity` if set
 *   3. fallback to `DEFAULT_MINIMUM_SEVERITY`
 *
 * If both are set to different values, `min-severity` wins and a warning is
 * emitted so the workflow author can collapse the inputs. The `provided` flag
 * lets callers (e.g. fallback-comment footer) distinguish a user-supplied
 * severity from the default, which matters when `config-path` is set and the
 * scan's effective severity comes from the YAML rather than these inputs.
 */
function resolveMinimumSeverityInput(): MinimumSeverityInput {
  const primary = core.getInput('min-severity').trim();
  const alias = core.getInput('minimum-severity').trim();

  if (primary && alias && primary !== alias) {
    core.warning(
      `Both min-severity (${primary}) and minimum-severity (${alias}) are set; using min-severity. minimum-severity is an alias and should only be set when min-severity is unset.`,
    );
  }

  return {
    value: primary || alias || DEFAULT_MINIMUM_SEVERITY,
    provided: Boolean(primary || alias),
  };
}

function getActionInputs(): ActionInputs {
  const minimumSeverity = resolveMinimumSeverityInput();
  // `diffs-only` carries no default in action.yml so we can distinguish
  // "workflow set it" from "workflow omitted it" (a default would surface
  // as a non-empty `core.getInput` value and trip warnIgnoredInputsWhenConfigPathSet).
  // Treat absent as `false` ourselves so getBooleanInput's strict parser
  // is only invoked on an explicit value.
  const diffsOnlyRaw = core.getInput('diffs-only').trim();

  return {
    apiHost: core.getInput('api-host'),
    minimumSeverity: minimumSeverity.value,
    minimumSeverityInputProvided: minimumSeverity.provided,
    configPath: core.getInput('config-path'),
    diffsOnly: diffsOnlyRaw ? core.getBooleanInput('diffs-only') : false,
    diffsOnlyInputProvided: Boolean(diffsOnlyRaw),
    guidanceText: core.getInput('guidance'),
    guidanceFile: core.getInput('guidance-file'),
    githubToken: core.getInput('github-token', { required: true }),
    enableForkPrs: core.getBooleanInput('enable-fork-prs'),
    // core.getInput returns '' when unset; normalize so a falsy check at the call site
    // doesn't have to special-case the empty-string sentinel.
    sarifOutputPath: core.getInput('sarif-output-path').trim() || undefined,
  };
}

const SUBPROCESS_ENV_EXCLUSIONS = [
  'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
  'ACTIONS_ID_TOKEN_REQUEST_URL',
  'GH_TOKEN',
  'GITHUB_OIDC_TOKEN',
  'GITHUB_TOKEN',
  'INPUT_GITHUB-TOKEN',
  'INPUT_GITHUB_TOKEN',
] as const;

function createSubprocessEnv(): Record<string, string> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => {
      return typeof entry[1] === 'string';
    }),
  );

  delete env.NPM_CONFIG_BEFORE;
  delete env.npm_config_before;

  for (const key of SUBPROCESS_ENV_EXCLUSIONS) {
    delete env[key];
  }

  return env;
}

function createScanEnv(oidcToken: string | undefined): Record<string, string> {
  const env = createSubprocessEnv();
  if (oidcToken) {
    env.GITHUB_OIDC_TOKEN = oidcToken;
  }
  return env;
}

/**
 * Warn when the workflow supplies action inputs that `config-path` will
 * silently ignore. The CLI only receives `--config <path>` (and optionally
 * `--api-host`) when `config-path` is set, so any `diffs-only` /
 * `min-severity` / `minimum-severity` input is dropped on the floor. Surface
 * the divergence so a workflow author notices instead of misreading the
 * scan as honoring those inputs.
 */
function warnIgnoredInputsWhenConfigPathSet(inputs: ActionInputs): void {
  if (!inputs.configPath) {
    return;
  }
  const ignored: string[] = [];
  if (inputs.minimumSeverityInputProvided) {
    ignored.push('min-severity / minimum-severity');
  }
  if (inputs.diffsOnlyInputProvided) {
    ignored.push('diffs-only');
  }
  if (ignored.length === 0) {
    return;
  }
  core.warning(
    `The following action input(s) are ignored when config-path is set: ${ignored.join(', ')}. The YAML config supplies these settings.`,
  );
}

function loadGuidance(inputs: ActionInputs): string | undefined {
  // When `config-path` is set, action inputs (guidance, guidance-file,
  // min-severity, diffs-only) are documented as ignored — the YAML config
  // is authoritative. Skip reading the guidance file so a stale/missing
  // path on disk does not fail the scan. Warn if the user supplied an
  // input that will be ignored so the divergence is visible.
  if (inputs.configPath) {
    if (inputs.guidanceText || inputs.guidanceFile) {
      core.warning(
        'guidance and guidance-file inputs are ignored when config-path is set; the YAML config supplies guidance.',
      );
    }
    return undefined;
  }

  if (inputs.guidanceText && inputs.guidanceFile) {
    throw new Error('Cannot specify both guidance and guidance-file inputs');
  }

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
    throw new Error(`Failed to read guidance file: ${formatError(error)}`);
  }
}

function isSetupPR(files: FileChange[]): boolean {
  const setupWorkflowPath = '.github/workflows/promptfoo-code-scan.yml';
  return (
    files.length === 1 &&
    files[0].path === setupWorkflowPath &&
    files[0].status === FileChangeStatus.ADDED
  );
}

function getCurrentRepositoryFullName(): string {
  const repository = github.context.payload.repository as { full_name?: string } | undefined;
  return repository?.full_name || `${github.context.repo.owner}/${github.context.repo.repo}`;
}

function isPullRequestFromFork(): boolean {
  const pullRequest = github.context.payload.pull_request as PullRequestForkPayload | undefined;
  if (!pullRequest) {
    return false;
  }

  const headRepoFullName = pullRequest?.head?.repo?.full_name;
  const baseRepoFullName = pullRequest?.base?.repo?.full_name || getCurrentRepositoryFullName();

  if (!headRepoFullName || !baseRepoFullName) {
    core.warning(
      'Unable to determine PR source repository from GitHub event payload; treating it as a fork PR',
    );
    return true;
  }

  return headRepoFullName !== baseRepoFullName;
}

function shouldSkipForkPullRequest(enableForkPrs: boolean): boolean {
  return !enableForkPrs && isPullRequestFromFork();
}

async function authenticateWithOidc(): Promise<string | undefined> {
  try {
    const oidcToken = await getGitHubOIDCToken('promptfoo');
    core.info('🔐 Got OIDC token for server authentication');
    return oidcToken;
  } catch (error) {
    // OIDC tokens are not available for fork PRs (GitHub security restriction)
    // For fork PRs, the server will use PR-based authentication instead
    core.info(`OIDC token not available: ${formatError(error)}`);
    core.info('For fork PRs, this is expected. Authentication will use PR context instead.');
    return undefined;
  }
}

interface ResolvedConfigPath {
  path: string;
  shouldCleanup: boolean;
}

function resolveConfigPath(
  configPath: string,
  minimumSeverity: string,
  diffsOnly: boolean,
  guidance?: string,
): ResolvedConfigPath {
  if (configPath) {
    return { path: configPath, shouldCleanup: false };
  }

  const generatedConfigPath = generateConfigFile(minimumSeverity, guidance, diffsOnly);
  core.info(`📝 Generated temporary config at ${generatedConfigPath}`);
  return { path: generatedConfigPath, shouldCleanup: true };
}

async function getBaseBranch(githubToken: string, context: PullRequestContext): Promise<string> {
  if (process.env.GITHUB_BASE_REF) {
    return process.env.GITHUB_BASE_REF;
  }

  // For workflow_dispatch, fetch PR details to get actual base branch
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
    core.warning(`Failed to fetch base branch ${baseBranch}: ${formatError(error)}`);
    core.warning('Git diff may fail if base branch is not available');
  }
}

function buildCliArgs(
  apiHost: string,
  configPath: string,
  baseBranch: string,
  context: PullRequestContext,
): string[] {
  const repoPath = process.env.GITHUB_WORKSPACE || process.cwd();
  return [
    'code-scans',
    'run',
    repoPath,
    ...(apiHost ? ['--api-host', apiHost] : []),
    '--config',
    configPath,
    '--base',
    baseBranch,
    '--compare',
    'HEAD',
    '--json',
    '--github-pr',
    `${context.owner}/${context.repo}#${context.number}`,
  ];
}

function createMockScanResponse(): ScanResponse {
  core.info('🧪 Running in ACT mode - using mock scan data for testing');
  core.info('📊 Mock scan simulates finding 2 security issues');

  const scanResponse: ScanResponse = {
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
  return scanResponse;
}

function parseScanOutput(scanOutput: string): ScanResponse {
  try {
    return JSON.parse(scanOutput);
  } catch (error) {
    throw new Error(`Failed to parse CLI output as JSON: ${formatError(error)}`);
  }
}

async function runPromptfooScan(
  cliArgs: string[],
  oidcToken: string | undefined,
): Promise<ScanResponse> {
  const installEnv = createSubprocessEnv();

  core.info('📦 Installing promptfoo...');
  await exec.exec('npm', ['install', '-g', 'promptfoo'], { env: installEnv });
  core.info('✅ Promptfoo installed successfully');

  core.info('🚀 Running promptfoo code-scans run...');

  let scanOutput = '';
  let scanError = '';
  const scanEnv = createScanEnv(oidcToken);

  const exitCode = await exec.exec('promptfoo', cliArgs, {
    env: scanEnv,
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

  if (exitCode === 0) {
    core.info('✅ Scan completed successfully');
    return parseScanOutput(scanOutput);
  }

  // Keep compatibility with CLI releases that reported an authorized fork skip as text
  // while the action and CLI roll out independently.
  if (`${scanOutput}\n${scanError}`.includes('Fork PR scanning not authorized')) {
    return {
      success: true,
      comments: [],
      skipReason: FORK_PR_AUTH_SKIP_REASON,
    };
  }

  core.error(`CLI exited with code ${exitCode}`);
  core.error(`Error output: ${scanError}`);
  throw new Error(`Code scan failed with exit code ${exitCode}`);
}

function getScanResponse(cliArgs: string[], oidcToken: string | undefined): Promise<ScanResponse> {
  if (process.env.ACT === 'true') {
    return Promise.resolve(createMockScanResponse());
  }
  return runPromptfooScan(cliArgs, oidcToken);
}

function buildCommentBody(comment: Comment): string {
  let body = formatSeverity(comment.severity) + comment.finding;

  if (comment.fix) {
    body += `\n\n<details>\n<summary>💡 Suggested Fix</summary>\n\n${comment.fix}\n</details>`;
  }

  if (comment.aiAgentPrompt) {
    body += `\n\n<details>\n<summary>🤖 AI Agent Prompt</summary>\n\n${comment.aiAgentPrompt}\n</details>`;
  }

  return body;
}

function toReviewComment(comment: Comment) {
  return {
    path: comment.file!,
    line: comment.line || undefined,
    start_line: comment.startLine || undefined,
    side: 'RIGHT' as const,
    start_side: comment.startLine ? ('RIGHT' as const) : undefined,
    body: buildCommentBody(comment),
  };
}

async function postReview(
  octokit: ReturnType<typeof github.getOctokit>,
  context: PullRequestContext,
  lineComments: Comment[],
  reviewBody: string,
): Promise<void> {
  if (lineComments.length === 0 && !reviewBody) {
    return;
  }

  core.info(
    `📌 Posting PR review${lineComments.length > 0 ? ` with ${lineComments.length} line-specific comments` : ''}...`,
  );

  await octokit.rest.pulls.createReview({
    owner: context.owner,
    repo: context.repo,
    pull_number: context.number,
    event: 'COMMENT',
    body: reviewBody || undefined,
    comments: lineComments.length > 0 ? lineComments.map(toReviewComment) : undefined,
  });

  core.info('✅ PR review posted successfully');
}

async function postGeneralComments(
  octokit: ReturnType<typeof github.getOctokit>,
  context: PullRequestContext,
  generalComments: Comment[],
): Promise<void> {
  if (generalComments.length === 0) {
    return;
  }

  core.info(`💬 Posting ${generalComments.length} general comments...`);

  for (const comment of generalComments) {
    await octokit.rest.issues.createComment({
      owner: context.owner,
      repo: context.repo,
      issue_number: context.number,
      body: buildCommentBody(comment),
    });
  }

  core.info('✅ General comments posted successfully');
}

async function postFallbackComments(
  githubToken: string,
  context: PullRequestContext,
  comments: Comment[],
  review: string | undefined,
  minimumSeverity: string | undefined,
): Promise<void> {
  core.info('📝 Server could not post comments - posting as fallback...');

  try {
    const octokit = github.getOctokit(githubToken);
    const { lineComments, generalComments, reviewBody } = prepareComments(
      comments,
      review,
      minimumSeverity,
    );

    await postReview(octokit, context, lineComments, reviewBody);
    await postGeneralComments(octokit, context, generalComments);

    core.info('✅ All comments posted to PR by action');
  } catch (error) {
    core.error(`Failed to post comments: ${formatError(error)}`);
    core.warning('Comments could not be posted to PR');
  }
}

function getFallbackMinimumSeverity(
  inputs: ActionInputs,
  configPath: ResolvedConfigPath,
): string | undefined {
  // Only report the action-input severity when the generated action-input
  // config actually carried it into the scan. When `config-path` is set the
  // CLI receives only `--config`, so the effective threshold lives in the
  // YAML and the input value is not what produced the findings.
  if (configPath.shouldCleanup) {
    return inputs.minimumSeverity;
  }

  return undefined;
}

// The shared symlink-safe containment check lives at src/util/isPathWithinDir.ts, but
// importing it transitively pulls src/logger.ts (and the winston stack) into this bundle,
// adding ~800KB to every action download. The inline check below covers the same threat
// model — path-traversal via `..` plus symlink escape via post-mkdir realpath — without
// the bundle cost.
function isPathWithinOrEqualTo(child: string, parent: string): boolean {
  // Case-sensitive comparison. Both `child` and `parent` are produced by path.resolve on
  // the same workspace prefix in real use, so casing always matches. An earlier version
  // lowercased on darwin/win32 to handle hypothetical case-mismatched user input, but
  // that opened a bypass on case-sensitive APFS volumes (where /Path/A and /path/a are
  // distinct on disk yet would compare equal here). The post-mkdir realpath check in
  // writeSarifFile canonicalizes against the actual filesystem, which is the right place
  // to handle case folding if the underlying volume does it.
  const pWithSep = parent.endsWith(path.sep) ? parent : parent + path.sep;
  return child === parent || child.startsWith(pWithSep);
}

function resolveSarifOutputPath(rawPath: string): string {
  // getActionInputs normalizes empty/whitespace input to undefined and the call site
  // skips emitSarifOutput entirely in that case, so we don't repeat the empty check here.
  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
  const resolved = path.resolve(workspace, rawPath);
  if (resolved === workspace || !isPathWithinOrEqualTo(resolved, workspace)) {
    throw new Error(
      `sarif-output-path "${rawPath}" resolves outside GITHUB_WORKSPACE; refusing to write`,
    );
  }
  return resolved;
}

function serializeSarif(scanResponse: ScanResponse): string {
  // Trailing newline for POSIX-text-file friendliness; some downstream tools require it.
  return `${JSON.stringify(scanResponseToSarif(scanResponse), null, 2)}\n`;
}

// Walk up from `p` until realpathSync resolves successfully, returning the canonical
// path of the deepest existing ancestor. Used to detect symlinks anywhere in the parent
// chain *before* mkdir -p has a chance to follow them out of the workspace.
function realpathDeepestExisting(p: string): string {
  let current = p;
  while (true) {
    try {
      return fs.realpathSync(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        throw error;
      }
      const next = path.dirname(current);
      if (next === current) {
        throw new Error(`No existing ancestor for "${p}"`);
      }
      current = next;
    }
  }
}

function lstatOrNull(p: string): fs.Stats | null {
  try {
    return fs.lstatSync(p);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function writeSarifFile(resolved: string, body: string): void {
  const parent = path.dirname(resolved);
  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();

  // Defense before mkdir: if any existing ancestor of `parent` is a symlink that
  // resolves outside the workspace, mkdir -p would follow it and create directories
  // outside the sandbox. Refuse before mutating the filesystem.
  const realWorkspace = fs.realpathSync(workspace);
  const realAncestor = realpathDeepestExisting(parent);
  if (!isPathWithinOrEqualTo(realAncestor, realWorkspace)) {
    throw new Error(
      `sarif-output-path "${resolved}" resolves outside GITHUB_WORKSPACE via symlink; refusing to write`,
    );
  }

  fs.mkdirSync(parent, { recursive: true });

  // Defense before write: if `resolved` already exists as a symlink, refuse —
  // writeFileSync follows symlinks and would write through to the link target.
  if (lstatOrNull(resolved)?.isSymbolicLink()) {
    throw new Error(
      `sarif-output-path "${resolved}" is an existing symlink; refusing to overwrite`,
    );
  }

  // Close the TOCTOU window between the lstat check and the write: on POSIX, opening with
  // O_NOFOLLOW makes the call fail atomically if `resolved` was raced into a symlink. On
  // Windows O_NOFOLLOW is not exposed, so we fall back to plain writeFileSync (the lstat
  // check above is the only defense there — acceptable given the Actions threat model).
  const noFollow = (fs.constants as { O_NOFOLLOW?: number }).O_NOFOLLOW;
  if (typeof noFollow === 'number') {
    const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | noFollow;
    const fd = fs.openSync(resolved, flags, 0o644);
    try {
      fs.writeSync(fd, body);
    } finally {
      fs.closeSync(fd);
    }
  } else {
    fs.writeFileSync(resolved, body);
  }
}

function emitSarifOutput(scanResponse: ScanResponse, rawPath: string): void {
  // SARIF output is supplementary — never sink an otherwise-successful scan over a write failure.
  let resolved: string;
  try {
    resolved = resolveSarifOutputPath(rawPath);
  } catch (error) {
    core.warning(formatError(error));
    return;
  }

  try {
    writeSarifFile(resolved, serializeSarif(scanResponse));
    core.setOutput('sarif-path', resolved);
    core.info(`📝 Wrote SARIF output to ${resolved}`);
  } catch (error) {
    core.warning(`Failed to write SARIF output to "${resolved}": ${formatError(error)}`);
  }
}

function emitConfiguredSarifOutput(scanResponse: ScanResponse, inputs: ActionInputs): void {
  if (inputs.sarifOutputPath) {
    emitSarifOutput(scanResponse, inputs.sarifOutputPath);
  }
}

async function handleScanResponse(
  scanResponse: ScanResponse,
  inputs: ActionInputs,
  finalConfigPath: ResolvedConfigPath,
  context: PullRequestContext,
): Promise<void> {
  const { comments, commentsPosted, review, skipReason } = scanResponse;

  // A skipped scan is not a clean scan. Do not upload empty SARIF results that could clear
  // existing Code Scanning findings or imply that authorization-gated work ran.
  if (skipReason) {
    core.info(`🔀 Scan skipped: ${skipReason}`);
    return;
  }

  core.info(`📊 Found ${comments.length} comments${review ? ' and review summary' : ''}`);

  emitConfiguredSarifOutput(scanResponse, inputs);

  if ((comments.length > 0 || review) && commentsPosted === false) {
    await postFallbackComments(
      inputs.githubToken,
      context,
      comments,
      review,
      getFallbackMinimumSeverity(inputs, finalConfigPath),
    );
    return;
  }

  if (comments.length > 0 && commentsPosted === true) {
    core.info('✅ Comments posted to PR by scan server');
    return;
  }

  if (comments.length > 0) {
    // commentsPosted is undefined - old server version
    core.info('✅ Comments returned (server version does not indicate if posted)');
    return;
  }

  core.info('✨ No vulnerabilities found!');
}

function logActCommentPreview(comments: Comment[]): void {
  if (process.env.ACT !== 'true' || comments.length === 0) {
    return;
  }

  core.info('🧪 Running in act - showing comment preview:');
  comments.forEach((comment: Comment, index: number) => {
    core.info(`  ${index + 1}. ${comment.file}:${comment.line}`);
    const preview = comment.fix
      ? `${comment.finding.substring(0, 80)}... [+ suggested fix]`
      : comment.finding.substring(0, 100);
    core.info(`     ${preview}${comment.finding.length > 100 ? '...' : ''}`);
  });
}

function cleanupConfig(configPath: ResolvedConfigPath): void {
  if (configPath.shouldCleanup) {
    fs.unlinkSync(configPath.path);
  }
}

async function runCodeScan(): Promise<void> {
  const inputs = getActionInputs();

  if (shouldSkipForkPullRequest(inputs.enableForkPrs)) {
    core.info('🔀 Fork PR detected and enable-fork-prs is false; skipping Promptfoo Code Scan');
    core.info(
      'A maintainer can trigger a scan by commenting @promptfoo-scanner, or enable fork PR scans with enable-fork-prs: true',
    );
    return;
  }

  warnIgnoredInputsWhenConfigPathSet(inputs);
  const guidance = loadGuidance(inputs);

  core.info('🔍 Starting Promptfoo Code Scan...');

  const context = await getGitHubContext(inputs.githubToken);
  core.info(`📋 Scanning PR #${context.number} in ${context.owner}/${context.repo}`);

  core.info('🔎 Checking if this is a setup PR...');
  const files = await getPRFiles(inputs.githubToken, context);

  if (isSetupPR(files)) {
    core.info('✅ Setup PR detected - workflow file will be added on merge');
    return;
  }

  core.info('✅ Not a setup PR - proceeding with security scan');

  const oidcToken = await authenticateWithOidc();

  const finalConfigPath = resolveConfigPath(
    inputs.configPath,
    inputs.minimumSeverity,
    inputs.diffsOnly,
    guidance,
  );

  try {
    const baseBranch = await getBaseBranch(inputs.githubToken, context);
    await fetchBaseBranch(baseBranch);

    const cliArgs = buildCliArgs(inputs.apiHost, finalConfigPath.path, baseBranch, context);
    const scanResponse = await getScanResponse(cliArgs, oidcToken);

    await handleScanResponse(scanResponse, inputs, finalConfigPath, context);
    logActCommentPreview(scanResponse.comments);
  } finally {
    cleanupConfig(finalConfigPath);
  }
}

async function run(): Promise<void> {
  try {
    await runCodeScan();
  } catch (error) {
    core.setFailed(formatError(error));
  }
}

// biome-ignore lint/nursery/noFloatingPromises: FIXME
run();
