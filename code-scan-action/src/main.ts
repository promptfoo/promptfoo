/**
 * GitHub Action Entry Point
 *
 * Main entry point for the promptfoo code-scan GitHub Action
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as github from '@actions/github';
// esbuild inlines (and tree-shakes) this named JSON import at build time, so each
// action release ships with the promptfoo CLI version that was current in the
// monorepo when the release was built — the runtime install below is pinned to it
// instead of resolving a mutable dist-tag like `latest`.
import { version as defaultPromptfooVersion } from '../../package.json';
import { hasPrPostableFindings, prepareComments } from '../../src/codeScan/util/github';
import { hasSarifReportableFindings, scanResponseToSarif } from '../../src/codeScan/util/sarif';
import {
  CodeScanSeverity,
  type Comment,
  FileChangeStatus,
  formatSeverity,
  type PullRequestContext,
  type ScanResponse,
} from '../../src/types/codeScan';
import { generateConfigFile } from './config';
import { getGitHubContext, getPRFiles, partitionReviewCommentsByDiff } from './github';

interface ActionInputs {
  apiHost: string;
  minimumSeverity: string;
  configPath: string;
  guidanceText: string;
  guidanceFile: string;
  githubToken: string;
  enableForkPrs: boolean;
  sarifOutputPath: string | undefined;
  promptfooVersion: string;
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

// Exact versions only (optionally with a prerelease suffix). Anything looser — a range,
// a dist-tag, a git/URL spec, or an extra npm flag — must be rejected because the value
// is passed straight into `npm install` and controls which code scans the repository.
// Numeric components are capped at 15 digits so they always stay below
// Number.MAX_SAFE_INTEGER, node-semver's actual component limit: an oversized
// component makes the spec invalid semver, which npm reclassifies as a mutable
// dist-tag lookup, defeating the exact-version contract. Leading zeros are rejected
// as invalid strict semver (npm loose-parses them rather than resolving exactly).
const SEMVER_NUMERIC = String.raw`(?:0|[1-9]\d{0,14})`;
const SEMVER_PRERELEASE_ID = String.raw`(?:0|[1-9]\d{0,14}|\d*[A-Za-z-][0-9A-Za-z-]*)`;
const EXACT_SEMVER_PATTERN = new RegExp(
  `^${SEMVER_NUMERIC}\\.${SEMVER_NUMERIC}\\.${SEMVER_NUMERIC}` +
    `(?:-${SEMVER_PRERELEASE_ID}(?:\\.${SEMVER_PRERELEASE_ID})*)?$`,
);
// semver's own MAX_LENGTH; also bounds regex work on hostile input.
const MAX_VERSION_LENGTH = 256;

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

  // A PR-controlled step running earlier in the workflow can persist
  // NODE_OPTIONS=--require=/path/to/payload.cjs via $GITHUB_ENV; Node preloads that
  // module into every child node process — npm during the install and promptfoo during
  // the scan (when the OIDC token / API key are in scope). Strip it from all
  // subprocesses; the action does not rely on caller-provided NODE_OPTIONS.
  delete env.NODE_OPTIONS;

  for (const key of SUBPROCESS_ENV_EXCLUSIONS) {
    delete env[key];
  }

  return env;
}

async function getBaseBranch(githubToken: string, context: PullRequestContext): Promise<string> {
  if (process.env.GITHUB_BASE_REF) {
    return process.env.GITHUB_BASE_REF;
  }

  // For workflow_dispatch, fetch PR details to get actual base branch
  core.info('📥 Fetching PR details to determine base branch...');
  const { data: pr } = await github.getOctokit(githubToken).rest.pulls.get({
    owner: context.owner,
    repo: context.repo,
    pull_number: context.number,
  });

  core.info(`✅ PR targets base branch: ${pr.base.ref}`);
  return pr.base.ref;
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

// Owns every hardening decision for the scanner install as one unit so a future npm
// invocation cannot accidentally drop one of them:
// - exact release-pinned version, never a mutable spec like `latest`
// - --ignore-scripts: the scanner tree must not execute arbitrary code before the
//   scan starts (promptfoo and its dependency tree work without lifecycle scripts)
// - sanitized env (createSubprocessEnv) with tokens stripped, plus every env-level
//   npm config override removed (see below)
// - cwd and local install prefix outside the checked-out workspace: the workspace
//   holds the untrusted PR being scanned, so no cwd-derived npm config (registry,
//   proxy, strict-ssl, ignore-scripts…) may ever be in scope
// - both npm and the scanner run under the action runtime, not a possibly unsupported
//   Node version selected by the calling workflow
// Distinct from isPathWithinOrEqualTo below, which stays string-prefix based on purpose:
// path.relative() case-folds on win32, and that function documents a deliberate
// case-sensitive comparison. Do not collapse the two.
function isPathWithinDirectory(directory: string, candidate: string): boolean {
  const relativePath = path.relative(directory, candidate);
  return (
    !relativePath ||
    (relativePath !== '..' &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath))
  );
}

/** Containment that excludes the directory itself, for paths that must name a file inside it. */
function isFileWithinDirectory(directory: string, candidate: string): boolean {
  return (
    Boolean(path.relative(directory, candidate)) && isPathWithinDirectory(directory, candidate)
  );
}

function getNpmCliCandidates(directory: string): string[] {
  return [
    // Windows Node distributions install npm alongside node.exe.
    path.join(directory, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    // Linux/macOS Node distributions install npm under the sibling lib directory.
    path.join(directory, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
}

async function installPromptfooCli(promptfooVersion: string, installDir: string): Promise<string> {
  const installCwd = process.env.RUNNER_TEMP || os.tmpdir();

  // Isolate npm configuration from the checkout and runner. Separate empty user
  // and global config paths prevent npm from reading either config file.
  // Keep workflow npm settings available to the scanner's nested npx calls.
  const env = createSubprocessEnv();
  // The isolated install always uses the public registry; inherited private-registry
  // credentials are unnecessary here but remain available to the scanner's nested npx.
  delete env.NODE_AUTH_TOKEN;
  delete env.NPM_TOKEN;
  for (const key of Object.keys(env)) {
    if (key.toLowerCase().startsWith('npm_config_')) {
      delete env[key];
    }
  }
  const npmCliPath = resolveNpmCliPath();

  core.info(`📦 Installing promptfoo@${promptfooVersion}...`);
  await exec.exec(
    process.execPath,
    [
      npmCliPath,
      'install',
      '--prefix',
      installDir,
      `promptfoo@${promptfooVersion}`,
      '--ignore-scripts',
      '--registry=https://registry.npmjs.org/',
      '--userconfig',
      path.join(installDir, 'user'),
      '--globalconfig',
      path.join(installDir, 'global'),
    ],
    { env, cwd: installCwd },
  );
  core.info('✅ Promptfoo installed successfully');

  const packageDir = path.join(installDir, 'node_modules', 'promptfoo');
  const packageManifest = JSON.parse(
    fs.readFileSync(path.join(packageDir, 'package.json'), 'utf-8'),
  ) as {
    bin?: string | Record<string, unknown>;
  };
  const relativeEntrypoint =
    typeof packageManifest.bin === 'string' ? packageManifest.bin : packageManifest.bin?.promptfoo;

  if (typeof relativeEntrypoint !== 'string' || !relativeEntrypoint) {
    throw new Error('Installed promptfoo package does not declare a promptfoo executable');
  }

  const entrypoint = path.resolve(packageDir, relativeEntrypoint);
  if (!isFileWithinDirectory(packageDir, entrypoint)) {
    throw new Error('Installed promptfoo executable must remain within its package directory');
  }

  // npm generally rejects unsafe tar entries, but canonicalizing also prevents a
  // package-internal symlink from redirecting the OIDC-bearing scanner elsewhere.
  const canonicalPackageDir = fs.realpathSync(packageDir);
  const canonicalEntrypoint = fs.realpathSync(entrypoint);
  if (!isFileWithinDirectory(canonicalPackageDir, canonicalEntrypoint)) {
    throw new Error('Installed promptfoo executable must remain within its package directory');
  }

  return canonicalEntrypoint;
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
  // GitHub's createReview API requires start_line < line for multi-line comments and
  // rejects the entire review (422) otherwise. Comments routed here are clamped upstream
  // by partitionReviewCommentsByDiff, but guard explicitly so this never depends on a
  // caller having run that clamp. The ternary also narrows startLine to `number`,
  // dropping the null/undefined the API type rejects.
  const startLine =
    comment.startLine && comment.line && comment.startLine < comment.line
      ? comment.startLine
      : undefined;
  return {
    path: comment.file!,
    line: comment.line || undefined,
    start_line: startLine,
    side: 'RIGHT' as const,
    start_side: startLine ? ('RIGHT' as const) : undefined,
    body: buildCommentBody(comment),
  };
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
  // emitSarifOutput canonicalizes against the actual filesystem, which is the right place
  // to handle case folding if the underlying volume does it.
  const pWithSep = parent.endsWith(path.sep) ? parent : parent + path.sep;
  return child === parent || child.startsWith(pWithSep);
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

function emitSarifOutput(scanResponse: ScanResponse, rawPath: string): void {
  // SARIF output is supplementary — never sink an otherwise-successful scan over a write failure.
  let resolved: string;
  try {
    // runCodeScan input normalization maps empty/whitespace to undefined, and the call site
    // skips emitSarifOutput entirely in that case, so we don't repeat the empty check here.
    const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
    resolved = path.resolve(workspace, rawPath);
    if (resolved === workspace || !isPathWithinOrEqualTo(resolved, workspace)) {
      throw new Error(
        `sarif-output-path "${rawPath}" resolves outside GITHUB_WORKSPACE; refusing to write`,
      );
    }
  } catch (error) {
    core.warning(formatError(error));
    return;
  }

  try {
    // Trailing newline for POSIX-text-file friendliness; some downstream tools require it.
    const body = `${JSON.stringify(scanResponseToSarif(scanResponse), null, 2)}\n`;
    const parent = path.dirname(resolved);

    // Defense before mkdir: if any existing ancestor of `parent` is a symlink that
    // resolves outside the workspace, mkdir -p would follow it and create directories
    // outside the sandbox. Refuse before mutating the filesystem.
    const realWorkspace = fs.realpathSync(process.env.GITHUB_WORKSPACE || process.cwd());
    let realAncestor: string;
    // Walk up from `parent` until realpathSync resolves successfully, returning the canonical
    // path of the deepest existing ancestor. Used to detect symlinks anywhere in the parent
    // chain *before* mkdir -p has a chance to follow them out of the workspace.
    let current = parent;
    while (true) {
      try {
        realAncestor = fs.realpathSync(current);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
          throw error;
        }
        const next = path.dirname(current);
        if (next === current) {
          throw new Error(`No existing ancestor for "${parent}"`);
        }
        current = next;
      }
    }
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
    core.setOutput('sarif-path', resolved);
    core.info(`📝 Wrote SARIF output to ${resolved}`);
  } catch (error) {
    core.warning(`Failed to write SARIF output to "${resolved}": ${formatError(error)}`);
  }
}

function resolveNpmCliPath(): string {
  for (const candidate of getNpmCliCandidates(path.dirname(process.execPath))) {
    if (fs.existsSync(candidate)) {
      return fs.realpathSync(candidate);
    }
  }

  const workspace = path.resolve(process.env.GITHUB_WORKSPACE || process.cwd());
  const canonicalWorkspace = fs.realpathSync(workspace);
  const executableNames = process.platform === 'win32' ? ['npm.cmd', 'npm.exe', 'npm'] : ['npm'];
  const visited = new Set<string>();

  for (const directory of (process.env.PATH || '').split(path.delimiter)) {
    if (!directory || !path.isAbsolute(directory) || visited.has(directory)) {
      continue;
    }
    visited.add(directory);

    // PATH often contains checkout-derived bins. A PR must not gain npm-code
    // execution merely by placing a lookalike npm-cli.js under one of them.
    if (isPathWithinDirectory(workspace, directory)) {
      continue;
    }

    const npmExecutable = executableNames
      .map((executableName) => path.join(directory, executableName))
      .find((candidate) => fs.existsSync(candidate));
    if (!npmExecutable) {
      continue;
    }

    let canonicalDirectory: string;
    let canonicalExecutable: string;
    try {
      canonicalDirectory = fs.realpathSync(directory);
      canonicalExecutable = fs.realpathSync(npmExecutable);
    } catch {
      continue;
    }

    if (
      isPathWithinDirectory(canonicalWorkspace, canonicalDirectory) ||
      isPathWithinDirectory(canonicalWorkspace, canonicalExecutable)
    ) {
      continue;
    }

    // Unix npm shims are normally symlinks directly to npm-cli.js.
    if (path.basename(canonicalExecutable) === 'npm-cli.js') {
      return canonicalExecutable;
    }

    for (const candidate of getNpmCliCandidates(directory)) {
      if (!fs.existsSync(candidate)) {
        continue;
      }

      try {
        const canonicalCandidate = fs.realpathSync(candidate);
        if (!isPathWithinDirectory(canonicalWorkspace, canonicalCandidate)) {
          return canonicalCandidate;
        }
      } catch {
        // A disappearing or inaccessible PATH entry is not a usable npm install.
      }
    }
  }

  throw new Error('npm CLI not found; install npm or configure Node.js with actions/setup-node');
}

async function authenticateWithOidc(): Promise<string | undefined> {
  try {
    const oidcToken = await getGitHubOIDCToken();
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

async function getGitHubOIDCToken(): Promise<string> {
  try {
    return await core.getIDToken('promptfoo');
  } catch (error) {
    throw new Error(`Failed to get GitHub OIDC token: ${formatError(error)}`);
  }
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

function buildGeneralCommentBody(comment: Comment): string {
  const body = buildCommentBody(comment);
  const location =
    comment.file && comment.line
      ? comment.startLine && comment.startLine !== comment.line
        ? `${comment.file}:${comment.startLine}-${comment.line}`
        : `${comment.file}:${comment.line}`
      : comment.file;
  return location ? `**${location}**\n\n${body}` : body;
}

async function run(): Promise<void> {
  try {
    await runCodeScan();
  } catch (error) {
    core.setFailed(formatError(error));
  }
}

async function runCodeScan(): Promise<void> {
  const apiHostInput = core.getInput('api-host');
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
   * emitted so the workflow author can collapse the inputs.
   */

  const primary = core.getInput('min-severity').trim();
  const alias = core.getInput('minimum-severity').trim();

  if (primary && alias && primary !== alias) {
    core.warning(
      `Both min-severity (${primary}) and minimum-severity (${alias}) are set; using min-severity. minimum-severity is an alias and should only be set when min-severity is unset.`,
    );
  }

  const inputs: ActionInputs = {
    apiHost: apiHostInput,
    minimumSeverity: primary || alias || DEFAULT_MINIMUM_SEVERITY,
    configPath: core.getInput('config-path'),
    guidanceText: core.getInput('guidance'),
    guidanceFile: core.getInput('guidance-file'),
    githubToken: core.getInput('github-token', { required: true }),
    enableForkPrs: core.getBooleanInput('enable-fork-prs'),
    // core.getInput returns '' when unset; normalize so a falsy check at the call site
    // doesn't have to special-case the empty-string sentinel.
    sarifOutputPath: core.getInput('sarif-output-path').trim() || undefined,
    promptfooVersion: defaultPromptfooVersion,
  };

  const override = core.getInput('promptfoo-version').trim();
  if (override) {
    if (override.length > MAX_VERSION_LENGTH || !EXACT_SEMVER_PATTERN.test(override)) {
      throw new Error(
        `Invalid promptfoo-version "${override}": expected an exact version like 0.121.0`,
      );
    }
    inputs.promptfooVersion = override;
  }

  if (!inputs.enableForkPrs) {
    const pullRequest = github.context.payload.pull_request as PullRequestForkPayload | undefined;
    if (pullRequest) {
      const headRepoFullName = pullRequest?.head?.repo?.full_name;
      const baseRepoFullName =
        pullRequest?.base?.repo?.full_name ||
        (github.context.payload.repository as { full_name?: string } | undefined)?.full_name ||
        `${github.context.repo.owner}/${github.context.repo.repo}`;

      if (!headRepoFullName || !baseRepoFullName) {
        core.warning(
          'Unable to determine PR source repository from GitHub event payload; treating it as a fork PR',
        );
      }
      if (!headRepoFullName || !baseRepoFullName || headRepoFullName !== baseRepoFullName) {
        core.info('🔀 Fork PR detected and enable-fork-prs is false; skipping Promptfoo Code Scan');
        core.info(
          'A maintainer can trigger a scan by commenting @promptfoo-scanner, or enable fork PR scans with enable-fork-prs: true',
        );
        return;
      }
    }
  }

  let guidance: string | undefined;
  if (inputs.guidanceText && inputs.guidanceFile) {
    throw new Error('Cannot specify both guidance and guidance-file inputs');
  }
  if (inputs.guidanceText) {
    guidance = inputs.guidanceText;
  } else if (inputs.guidanceFile) {
    try {
      guidance = fs.readFileSync(inputs.guidanceFile, 'utf-8');
      core.info(`📖 Loaded guidance from: ${inputs.guidanceFile}`);
    } catch (error) {
      throw new Error(`Failed to read guidance file: ${formatError(error)}`);
    }
  }

  core.info('🔍 Starting Promptfoo Code Scan...');

  const context = await getGitHubContext(inputs.githubToken);
  core.info(`📋 Scanning PR #${context.number} in ${context.owner}/${context.repo}`);

  core.info('🔎 Checking if this is a setup PR...');
  const files = await getPRFiles(inputs.githubToken, context);

  const setupWorkflowPath = '.github/workflows/promptfoo-code-scan.yml';
  if (
    files.length === 1 &&
    files[0].path === setupWorkflowPath &&
    files[0].status === FileChangeStatus.ADDED
  ) {
    core.info('✅ Setup PR detected - workflow file will be added on merge');
    return;
  }

  core.info('✅ Not a setup PR - proceeding with security scan');

  let finalConfigPath = inputs.configPath;
  const minimumSeverity = inputs.minimumSeverity;
  if (!finalConfigPath) {
    finalConfigPath = generateConfigFile(minimumSeverity, guidance);
    core.info(`📝 Generated temporary config at ${finalConfigPath}`);
  }

  try {
    const baseBranch = await getBaseBranch(inputs.githubToken, context);
    await fetchBaseBranch(baseBranch);

    const apiHost = inputs.apiHost;
    const cliArgs = [
      'code-scans',
      'run',
      process.env.GITHUB_WORKSPACE || process.cwd(),
      ...(apiHost ? ['--api-host', apiHost] : []),
      '--config',
      finalConfigPath,
      '--base',
      baseBranch,
      '--compare',
      'HEAD',
      '--json',
      '--github-pr',
      `${context.owner}/${context.repo}#${context.number}`,
    ];

    const promptfooVersion = inputs.promptfooVersion;
    async function runPromptfooScan(): Promise<ScanResponse> {
      const installCwd = process.env.RUNNER_TEMP || os.tmpdir();
      const installDir = fs.mkdtempSync(path.join(installCwd, 'promptfoo-install-'));
      try {
        const promptfooEntrypoint = await installPromptfooCli(promptfooVersion, installDir);
        // OIDC tokens are short-lived; installation must not consume their authentication window.
        const oidcToken = await authenticateWithOidc();

        core.info('🚀 Running promptfoo code-scans run...');

        let scanOutput = '';
        let scanError = '';
        const scanEnv = createSubprocessEnv();
        if (oidcToken) {
          scanEnv.GITHUB_OIDC_TOKEN = oidcToken;
        }

        const exitCode = await exec.exec(process.execPath, [promptfooEntrypoint, ...cliArgs], {
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

          try {
            return JSON.parse(scanOutput);
          } catch (error) {
            throw new Error(`Failed to parse CLI output as JSON: ${formatError(error)}`);
          }
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
      } finally {
        try {
          fs.rmSync(installDir, { recursive: true, force: true });
        } catch (error) {
          core.warning(`Failed to remove temporary Promptfoo CLI install: ${formatError(error)}`);
        }
      }
    }

    const scanResponse = await (process.env.ACT === 'true'
      ? Promise.resolve(createMockScanResponse())
      : runPromptfooScan());

    async function handleScanResponse(): Promise<void> {
      const { comments, commentsPosted, review, skipReason } = scanResponse;
      const hasSarifFindings = hasSarifReportableFindings(scanResponse);
      const hasPrFindings = hasPrPostableFindings(comments);

      // A skipped scan is not a clean scan. Do not upload empty SARIF results that could clear
      // existing Code Scanning findings or imply that authorization-gated work ran. Mixed
      // responses still need processing when a finding can be surfaced through SARIF or PR
      // comments, because those output channels intentionally support different locations.
      if (skipReason && !hasSarifFindings && !hasPrFindings) {
        core.info(`🔀 Scan skipped: ${skipReason}`);
        return;
      }

      if (skipReason) {
        // Carry the skipReason into the warning: a contradictory response (skip + real
        // findings) signals a server-side bug, and the reason text is the operator's only
        // clue to which path produced it.
        core.warning(
          `Scan response included findings alongside a skipReason ("${skipReason}"); processing findings.`,
        );
      }

      core.info(`📊 Found ${comments.length} comments${review ? ' and review summary' : ''}`);

      // A mixed skip with only PR-postable findings must not upload an empty SARIF run.
      if ((!skipReason || hasSarifFindings) && inputs.sarifOutputPath) {
        emitSarifOutput(scanResponse, inputs.sarifOutputPath);
      }

      if ((hasPrFindings || review) && commentsPosted === false) {
        const githubToken = inputs.githubToken;
        const minimumSeverity = inputs.minimumSeverity;
        async function postFallbackComments(): Promise<void> {
          core.info('📝 Server could not post comments - posting as fallback...');

          try {
            const octokit = github.getOctokit(githubToken);
            const {
              lineComments: preparedLineComments,
              generalComments,
              reviewBody,
            } = prepareComments(comments, review, minimumSeverity);
            const { lineComments, invalidLineComments } = await partitionReviewCommentsByDiff(
              githubToken,
              context,
              preparedLineComments,
            );

            async function postReview(): Promise<void> {
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

            await postReview();
            async function postGeneralComments(generalComments: Comment[]): Promise<void> {
              if (generalComments.length === 0) {
                return;
              }

              core.info(`💬 Posting ${generalComments.length} general comments...`);

              for (const comment of generalComments) {
                await octokit.rest.issues.createComment({
                  owner: context.owner,
                  repo: context.repo,
                  issue_number: context.number,
                  body: buildGeneralCommentBody(comment),
                });
              }

              core.info('✅ General comments posted successfully');
            }

            await postGeneralComments([...generalComments, ...invalidLineComments]);

            core.info('✅ All comments posted to PR by action');
          } catch (error) {
            core.error(`Failed to post comments: ${formatError(error)}`);
            core.warning('Comments could not be posted to PR');
          }
        }

        await postFallbackComments();
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

    await handleScanResponse();
    const comments = scanResponse.comments;
    if (process.env.ACT === 'true' && comments.length !== 0) {
      core.info('🧪 Running in act - showing comment preview:');
      comments.forEach((comment: Comment, index: number) => {
        core.info(`  ${index + 1}. ${comment.file}:${comment.line}`);
        const preview = comment.fix
          ? `${comment.finding.substring(0, 80)}... [+ suggested fix]`
          : comment.finding.substring(0, 100);
        core.info(`     ${preview}${comment.finding.length > 100 ? '...' : ''}`);
      });
    }
  } finally {
    if (!inputs.configPath) {
      fs.unlinkSync(finalConfigPath);
    }
  }
}

// biome-ignore lint/nursery/noFloatingPromises: FIXME
run();
