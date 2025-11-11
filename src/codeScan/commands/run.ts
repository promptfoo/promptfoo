/**
 * Scan Command Implementation
 *
 * Main command that orchestrates the scanning process.
 */

import path from 'path';
import type { ChildProcess } from 'child_process';
import type { Socket } from 'socket.io-client';
import type { Command } from 'commander';

import cliState from '../../cliState';
import logger, { getLogLevel } from '../../logger';
import telemetry from '../../telemetry';
import { resolveAuthCredentials } from '../util/auth';
import { parseGitHubPr } from '../util/github';
import type { Config } from '../config/schema';
import {
  loadConfigOrDefault,
  mergeConfigWithOptions,
  resolveGuidance,
  resolveApiHost,
} from '../config/loader';
import { validateOnBranch } from '../git/diff';
import { processDiff } from '../git/diffProcessor';
import { extractMetadata } from '../git/metadata';
import { setupMcpBridge } from '../mcp';
import { stopFilesystemMcpServer } from '../mcp/filesystem';
import type { SocketIoMcpBridge } from '../mcp/transport';
import { createSocketConnection } from '../scanner/socket';
import { type CleanupRefs, registerCleanupHandlers } from '../scanner/cleanup';
import { createSpinner, displayScanResults } from '../scanner/output';
import { buildScanRequest, executeScanRequest } from '../scanner';

import type { PullRequestContext } from '../../types/codeScan';

export interface ScanOptions {
  config?: string;
  apiHost?: string; // Promptfoo API host URL
  apiKey?: string; // Promptfoo API key for authentication
  diffsOnly?: boolean; // Only scan PR diffs, skip filesystem exploration
  base?: string; // Base branch or commit to compare against
  compare?: string; // Compare branch or commit
  json?: boolean; // Output results as JSON
  githubPr?: string; // GitHub PR to post comments to (format: owner/repo#number)
  minimumSeverity?: string; // Minimum severity level to report
  minSeverity?: string; // Alias for minimumSeverity
  guidance?: string; // Custom guidance for the security scan
  guidanceFile?: string; // Path to file containing custom guidance
}

async function executeScan(repoPath: string, options: ScanOptions): Promise<void> {
  let socket: Socket | null = null;
  let mcpProcess: ChildProcess | null = null;
  let mcpBridge: SocketIoMcpBridge | null = null;
  let sessionId: string | undefined = undefined;

  const startTime = Date.now();

  // Load and merge configuration
  const baseConfig: Config = loadConfigOrDefault(options.config);
  const config = mergeConfigWithOptions(baseConfig, options);

  // Resolve guidance (CLI options take precedence)
  const guidance = resolveGuidance(options, config);

  // Resolve repository path
  const absoluteRepoPath = path.resolve(repoPath);

  // Display startup messages (always shown via logger.info, goes to stderr for CI-friendliness)
  logger.info('Beginning scan for LLM-related vulnerabilities in your code.');
  logger.info(`  Minimum severity: ${config.minimumSeverity}`);
  if (config.diffsOnly) {
    logger.info(`  Mode: diffs only`);
  } else {
    logger.info(`  Mode: diffs + tracing into repo`);
  }
  logger.info('');

  logger.debug(`Repository: ${absoluteRepoPath}`);

  // Create mutable refs for cleanup handlers
  // This allows signal handlers to access resources even if created later
  const cleanupRefs: CleanupRefs = {
    repoPath: absoluteRepoPath,
    socket: null,
    mcpBridge: null,
    mcpProcess: null,
    spinner: null,
    abortController: null,
  };

  // Register cleanup handlers for signals (SIGINT, SIGTERM, etc.)
  registerCleanupHandlers(cleanupRefs);

  // Initialize spinner (hide in JSON mode, but still show logger.info status)
  const isWebUI = Boolean(cliState.webUI);
  const spinner = createSpinner({
    json: options.json || false,
    isWebUI,
    logLevel: getLogLevel(),
  });

  if (spinner) {
    cleanupRefs.spinner = spinner; // Update ref for signal handlers
  }

  const showSpinner = Boolean(spinner);

  try {
    // Create AbortController for cancelling the scan
    const abortController = new AbortController();
    cleanupRefs.abortController = abortController; // Update ref for signal handlers

    // Resolve auth credentials for socket.io
    const auth = resolveAuthCredentials(config.apiKey);

    // Determine API host URL
    const apiHost = resolveApiHost(options, config);

    logger.debug(`Promptfoo API host URL: ${apiHost}`);

    // Create Socket.IO connection
    if (!showSpinner) {
      logger.debug('Connecting to server...');
    }

    socket = await createSocketConnection(apiHost, auth);
    cleanupRefs.socket = socket; // Update ref for signal handlers

    // Optionally start MCP filesystem server + bridge
    if (!config.diffsOnly) {
      const mcpSetup = await setupMcpBridge(socket, absoluteRepoPath);
      mcpProcess = mcpSetup.mcpProcess;
      mcpBridge = mcpSetup.mcpBridge;
      sessionId = mcpSetup.sessionId;

      cleanupRefs.mcpProcess = mcpProcess; // Update ref for signal handlers
      cleanupRefs.mcpBridge = mcpBridge; // Update ref for signal handlers
    }

    // Validate branch and determine base branch
    logger.debug('Processing git diff...');

    const simpleGit = (await import('simple-git')).default;
    const git = simpleGit(absoluteRepoPath);

    // Validate we're on a branch (only if compare ref not specified)
    if (!options.compare) {
      await validateOnBranch(git);
    }

    // Determine base branch (use provided or auto-detect)
    let baseBranch: string;
    if (options.base) {
      baseBranch = options.base;
    } else {
      const branches = await git.branch();
      baseBranch =
        branches.all.includes('main') || branches.all.includes('origin/main')
          ? 'main'
          : branches.all.includes('master') || branches.all.includes('origin/master')
            ? 'master'
            : 'main';
    }

    // Determine compare ref (use provided or default to HEAD)
    const compareRef = options.compare || 'HEAD';

    logger.debug(`Comparing: ${baseBranch}...${compareRef}`);

    // Process diff with focused pipeline
    const files = await processDiff(absoluteRepoPath, baseBranch, compareRef);

    const includedFiles = files.filter((f) => !f.skipReason && f.patch);
    const skippedFiles = files.filter((f) => f.skipReason);

    logger.debug(
      `Files changed: ${files.length} (${includedFiles.length} included, ${skippedFiles.length} skipped)`,
    );

    // Extract git metadata
    const metadata = await extractMetadata(absoluteRepoPath, baseBranch, compareRef);
    logger.debug(`Compare ref: ${metadata.branch}`);
    logger.debug(`Commits: ${metadata.commitMessages.length}`);

    // Build pull request context if --github-pr flag provided
    let pullRequest: PullRequestContext | undefined = undefined;
    if (options.githubPr) {
      const parsed = parseGitHubPr(options.githubPr);
      if (!parsed) {
        throw new Error(
          `Invalid --github-pr format: "${options.githubPr}". Expected format: owner/repo#number (e.g., promptfoo/promptfoo#123)`,
        );
      }

      // Get current commit SHA
      const currentCommit = await git.revparse(['HEAD']);

      pullRequest = {
        owner: parsed.owner,
        repo: parsed.repo,
        number: parsed.number,
        sha: currentCommit.trim(),
      };

      logger.debug(
        `GitHub PR context: ${parsed.owner}/${parsed.repo}#${parsed.number} (${pullRequest.sha.substring(0, 7)})`,
      );
    }

    // Send scan request via Socket.IO
    if (!showSpinner) {
      logger.debug('Scanning code...');
    }

    const scanRequest = buildScanRequest(files, metadata, config, sessionId, pullRequest, guidance);

    const scanResponse = await executeScanRequest(socket, scanRequest, {
      showSpinner,
      spinner,
      abortController,
    });

    // Stop spinner silently
    if (showSpinner && spinner) {
      spinner.stop();
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Display results
    displayScanResults(scanResponse, duration, {
      json: options.json || false,
      githubPr: options.githubPr,
    });
  } catch (error) {
    if (showSpinner && spinner) {
      spinner.fail('Scan failed');
    }
    logger.error(`Scan failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1; // set exit code to 1 to indicate failure, but don't force exit, let global cleanup run if needed
  } finally {
    // Cleanup: Stop MCP bridge and server, disconnect socket
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

    if (socket) {
      socket.disconnect();
      logger.debug('Socket disconnected');
    }
  }
}

/**
 * Register the run subcommand with Commander
 */
export function runCommand(program: Command): void {
  program
    .command('run')
    .description('Scan code changes for LLM security vulnerabilities')
    .argument('[repo-path]', 'Repository path to scan', '.')
    .option('--api-key <key>', 'Promptfoo API key for authentication')
    .option('--base <ref>', 'Base branch or commit to compare against')
    .option('--compare <ref>', 'Compare branch or commit')
    .option('-c, --config <path>', 'Path to config file')
    .option('--api-host <url>', 'Promptfoo API host URL (default: https://api.promptfoo.dev)')
    .option('--diffs-only', 'Scan only PR diffs, skip filesystem exploration')
    .option('--json', 'Output results as JSON')
    .option('--github-pr <owner/repo#number>', 'GitHub PR to post comments to')
    .option('--min-severity <level>', 'Minimum severity level (low|medium|high|critical)')
    .option('--minimum-severity <level>', 'Alias for min-severity (low|medium|high|critical)')
    .option('--guidance <text>', 'Custom guidance for the security scan')
    .option('--guidance-file <path>', 'Path to file containing custom guidance')
    .action(async (repoPath: string, cmdObj: ScanOptions) => {
      telemetry.record('command_used', {
        name: 'code-scans run',
        diffsOnly: cmdObj.diffsOnly ?? false,
        hasGithubPr: !!cmdObj.githubPr,
        hasGuidance: !!(cmdObj.guidance || cmdObj.guidanceFile),
      });

      await executeScan(repoPath, cmdObj);
    });
}
