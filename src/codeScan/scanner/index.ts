/**
 * Core Scan Execution Logic
 *
 * Main entry point for scanner module - orchestrates the complete scan process.
 */

import path from 'path';
import type { ChildProcess } from 'child_process';

import cliState from '../../cliState';
import logger, { getLogLevel } from '../../logger';
import { type AgentClient, createAgentClient } from '../../util/agent/agentClient';
import {
  loadConfigOrDefault,
  mergeConfigWithOptions,
  resolveApiHost,
  resolveGuidance,
} from '../config/loader';
import { validateOnBranch } from '../git/diff';
import { processDiff } from '../git/diffProcessor';
import { extractMetadata } from '../git/metadata';
import { stopFilesystemMcpServer } from '../mcp/filesystem';
import { setupMcpBridge } from '../mcp/index';
import { resolveAuthCredentials } from '../util/auth';
import { parseGitHubPr } from '../util/github';
import { type CleanupRefs, registerCleanupHandlers } from './cleanup';
import { createSpinner, displayScanResults } from './output';
import { buildScanRequest, executeScanRequest } from './request';

import type { PullRequestContext, ScanResponse } from '../../types/codeScan';
import type { Config } from '../config/schema';
import type { SocketIoMcpBridge } from '../mcp/transport';

/**
 * Options for executing a scan
 * These are the CLI options that get passed in
 */
export interface ScanOptions {
  config?: string;
  apiHost?: string;
  apiKey?: string;
  diffsOnly?: boolean;
  base?: string;
  compare?: string;
  json?: boolean;
  githubPr?: string;
  minimumSeverity?: string;
  minSeverity?: string;
  guidance?: string;
  guidanceFile?: string;
}

function logStartupMessages(config: Config, options: ScanOptions): void {
  if (options.json) {
    return;
  }
  logger.info('Beginning scan for LLM-related vulnerabilities in your code.');
  logger.info(`  Minimum severity: ${config.minimumSeverity}`);
  if (config.diffsOnly) {
    logger.info(`  Mode: diffs only`);
  } else {
    logger.info(`  Mode: diffs + tracing into repo`);
  }
  logger.info('');
}

async function detectBaseBranch(
  git: Awaited<ReturnType<typeof import('simple-git').default>>,
  options: ScanOptions,
): Promise<string> {
  if (options.base) {
    return options.base;
  }
  const branches = await git.branch();
  if (branches.all.includes('main') || branches.all.includes('origin/main')) {
    return 'main';
  }
  if (branches.all.includes('master') || branches.all.includes('origin/master')) {
    return 'master';
  }
  return 'main';
}

function handleNoFilesToScan(
  options: ScanOptions,
  showSpinner: boolean,
  spinner: ReturnType<typeof createSpinner>,
): void {
  const msg = 'No files to scan';
  if (options.json) {
    const response: ScanResponse = { success: true, comments: [], review: msg };
    logger.info(JSON.stringify(response, null, 2));
  } else if (showSpinner && spinner) {
    spinner.succeed(msg);
  } else {
    logger.info(msg);
  }
  cliState.postActionCallback = async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    process.exitCode = 0;
  };
}

async function buildPullRequestContext(
  parsedPR: { owner: string; repo: string; number: number } | undefined,
  git: Awaited<ReturnType<typeof import('simple-git').default>>,
): Promise<PullRequestContext | undefined> {
  if (!parsedPR) {
    return undefined;
  }
  const currentCommit = await git.revparse(['HEAD']);
  const pullRequest: PullRequestContext = {
    owner: parsedPR.owner,
    repo: parsedPR.repo,
    number: parsedPR.number,
    sha: currentCommit.trim(),
  };
  logger.debug(
    `GitHub PR context: ${parsedPR.owner}/${parsedPR.repo}#${parsedPR.number} (${pullRequest.sha.substring(0, 7)})`,
  );
  return pullRequest;
}

function parsePullRequestOption(
  githubPr: string | undefined,
): { owner: string; repo: string; number: number } | undefined {
  if (!githubPr) {
    return undefined;
  }
  const parsed = parseGitHubPr(githubPr);
  if (!parsed) {
    throw new Error(
      `Invalid --github-pr format: "${githubPr}". Expected format: owner/repo#number (e.g., promptfoo/promptfoo#123)`,
    );
  }
  return parsed;
}

function handleScanError(
  error: unknown,
  showSpinner: boolean,
  spinner: ReturnType<typeof createSpinner>,
): void {
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (errorMessage.includes('Fork PR scanning not authorized')) {
    const msg = 'Fork PR scanning requires maintainer approval. See PR comment for options.';
    if (showSpinner && spinner) {
      spinner.succeed(msg);
    } else {
      logger.info(msg);
    }
    cliState.postActionCallback = async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      process.exitCode = 0;
    };
    return;
  }

  const msg = `Scan failed: ${errorMessage}`;
  if (showSpinner && spinner) {
    spinner.fail(msg);
  } else {
    logger.error(msg);
  }

  cliState.postActionCallback = async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (error instanceof Error && error.message === 'cancelled by user') {
      process.exitCode = 130;
    } else {
      process.exitCode = 1;
    }
  };
}

async function cleanupScanResources(
  client: AgentClient | null,
  mcpBridge: SocketIoMcpBridge | null,
  mcpProcess: ChildProcess | null,
): Promise<void> {
  if (mcpBridge) {
    await mcpBridge.disconnect().catch(() => {
      logger.debug('MCP bridge cleanup completed');
    });
  }
  if (mcpProcess) {
    await stopFilesystemMcpServer(mcpProcess).catch(() => {
      logger.debug('MCP server cleanup completed');
    });
  }
  if (client) {
    client.disconnect();
    logger.debug('Agent client disconnected');
  }
}

/**
 * Execute a complete security scan
 *
 * This is the main entry point for the scanner - it orchestrates:
 * - Configuration loading
 * - Agent client connection (shared Socket.IO layer)
 * - MCP bridge setup (if not diffs-only)
 * - Git diff processing
 * - Scan request execution
 * - Result display
 * - Cleanup
 *
 * @param repoPath - Path to repository to scan
 * @param options - Scan options from CLI
 */
export async function executeScan(repoPath: string, options: ScanOptions): Promise<void> {
  let client: AgentClient | null = null;
  let mcpProcess: ChildProcess | null = null;
  let mcpBridge: SocketIoMcpBridge | null = null;
  let sessionId: string | undefined = undefined;

  const startTime = Date.now();

  const baseConfig: Config = loadConfigOrDefault(options.config);
  const config = mergeConfigWithOptions(baseConfig, options);
  const guidance = resolveGuidance(options, config);
  const absoluteRepoPath = path.resolve(repoPath);

  logStartupMessages(config, options);
  logger.debug(`Repository: ${absoluteRepoPath}`);

  const cleanupRefs: CleanupRefs = {
    repoPath: absoluteRepoPath,
    socket: null,
    mcpBridge: null,
    mcpProcess: null,
    spinner: null,
    abortController: null,
  };

  registerCleanupHandlers(cleanupRefs);

  const isWebUI = Boolean(cliState.webUI);
  const spinner = createSpinner({
    json: options.json || false,
    isWebUI,
    logLevel: getLogLevel(),
  });

  if (spinner) {
    cleanupRefs.spinner = spinner;
  }

  const showSpinner = Boolean(spinner);

  try {
    const abortController = new AbortController();
    cleanupRefs.abortController = abortController;

    const parsedPR = parsePullRequestOption(options.githubPr);

    if (!showSpinner) {
      logger.debug('Connecting to server...');
    }

    client = await createAgentClient({
      agent: 'code-scan',
      host: resolveApiHost(options, config),
      auth: resolveAuthCredentials(options.apiKey, parsedPR),
    });
    sessionId = client.sessionId;
    cleanupRefs.socket = client.socket;

    if (!config.diffsOnly) {
      const mcpSetup = await setupMcpBridge(client.socket, absoluteRepoPath, sessionId);
      mcpProcess = mcpSetup.mcpProcess;
      mcpBridge = mcpSetup.mcpBridge;
      cleanupRefs.mcpProcess = mcpProcess;
      cleanupRefs.mcpBridge = mcpBridge;
    }

    logger.debug('Processing git diff...');

    const simpleGit = (await import('simple-git')).default;
    const git = simpleGit(absoluteRepoPath);

    if (!options.compare) {
      await validateOnBranch(git);
    }

    const baseBranch = await detectBaseBranch(git, options);
    const compareRef = options.compare || 'HEAD';

    logger.debug(`Comparing: ${baseBranch}...${compareRef}`);

    const files = await processDiff(absoluteRepoPath, baseBranch, compareRef);
    const includedFiles = files.filter((f) => !f.skipReason && f.patch);
    const skippedFiles = files.filter((f) => f.skipReason);

    logger.debug(
      `Files changed: ${files.length} (${includedFiles.length} included, ${skippedFiles.length} skipped)`,
    );

    if (includedFiles.length === 0) {
      handleNoFilesToScan(options, showSpinner, spinner);
      return;
    }

    const metadata = await extractMetadata(absoluteRepoPath, baseBranch, compareRef);
    logger.debug(`Compare ref: ${metadata.branch}`);
    logger.debug(`Commits: ${metadata.commitMessages.length}`);

    const pullRequest = await buildPullRequestContext(parsedPR, git);

    if (!showSpinner) {
      logger.debug('Scanning code...');
    }

    const scanRequest = buildScanRequest(files, metadata, config, sessionId, pullRequest, guidance);

    const scanResponse = await executeScanRequest(client, scanRequest, {
      showSpinner,
      spinner,
      abortController,
    });

    if (showSpinner && spinner) {
      spinner.stop();
    }

    const duration = Date.now() - startTime;

    displayScanResults(scanResponse, duration, {
      json: options.json || false,
      githubPr: options.githubPr,
    });
  } catch (error) {
    handleScanError(error, showSpinner, spinner);
  } finally {
    await cleanupScanResources(client, mcpBridge, mcpProcess);
  }
}
