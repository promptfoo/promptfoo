/**
 * Core Scan Execution Logic
 *
 * Main entry point for scanner module - orchestrates the complete scan process.
 */

import path from 'path';
import type { ChildProcess } from 'child_process';

import cliState from '../../cliState';
import logger, { getLogLevel } from '../../logger';
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
import { type AgentClient, createAgentClient } from '../../util/agent/agentClient';

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

  // Load and merge configuration
  const baseConfig: Config = loadConfigOrDefault(options.config);
  const config = mergeConfigWithOptions(baseConfig, options);

  // Resolve guidance (CLI options take precedence)
  const guidance = resolveGuidance(options, config);

  // Resolve repository path
  const absoluteRepoPath = path.resolve(repoPath);

  // Display startup messages (skip in JSON mode to keep stdout clean for parsing)
  if (!options.json) {
    logger.info('Beginning scan for LLM-related vulnerabilities in your code.');
    logger.info(`  Minimum severity: ${config.minimumSeverity}`);
    if (config.diffsOnly) {
      logger.info(`  Mode: diffs only`);
    } else {
      logger.info(`  Mode: diffs + tracing into repo`);
    }
    logger.info('');
  }

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

    // Parse PR context early for auth (if --github-pr provided)
    // This is needed for fork PR authentication where OIDC is unavailable
    let parsedPR: { owner: string; repo: string; number: number } | undefined;
    if (options.githubPr) {
      const parsed = parseGitHubPr(options.githubPr);
      if (!parsed) {
        throw new Error(
          `Invalid --github-pr format: "${options.githubPr}". Expected format: owner/repo#number (e.g., promptfoo/promptfoo#123)`,
        );
      }
      parsedPR = parsed;
    }

    // Create agent client connection (uses shared Socket.IO layer)
    // Host and base auth are resolved automatically; code scanning overrides
    // with custom auth (OIDC + fork PR) and config-driven host.
    if (!showSpinner) {
      logger.debug('Connecting to server...');
    }

    client = await createAgentClient({
      agent: 'code-scan',
      host: resolveApiHost(options, config),
      auth: resolveAuthCredentials(options.apiKey, parsedPR),
    });
    sessionId = client.sessionId;
    cleanupRefs.socket = client.socket; // Update ref for signal handlers

    // Optionally start MCP filesystem server + bridge
    if (!config.diffsOnly) {
      const mcpSetup = await setupMcpBridge(client.socket, absoluteRepoPath, sessionId);
      mcpProcess = mcpSetup.mcpProcess;
      mcpBridge = mcpSetup.mcpBridge;

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

    // Check if there are no files to scan
    if (includedFiles.length === 0) {
      const msg = 'No files to scan';

      // In JSON mode, output a proper JSON response for programmatic consumption
      if (options.json) {
        const response: ScanResponse = { success: true, comments: [], review: msg };
        logger.info(JSON.stringify(response, null, 2));
      } else if (showSpinner && spinner) {
        spinner.succeed(msg);
      } else {
        logger.info(msg);
      }

      // Exit with code 0 (success) when no files to scan
      cliState.postActionCallback = async () => {
        await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for output to be flushed
        process.exitCode = 0;
      };

      return;
    }

    // Extract git metadata
    const metadata = await extractMetadata(absoluteRepoPath, baseBranch, compareRef);
    logger.debug(`Compare ref: ${metadata.branch}`);
    logger.debug(`Commits: ${metadata.commitMessages.length}`);

    // Build pull request context if --github-pr flag provided
    // Reuse parsedPR from earlier (already validated for auth)
    let pullRequest: PullRequestContext | undefined = undefined;
    if (parsedPR) {
      // Get current commit SHA
      const currentCommit = await git.revparse(['HEAD']);

      pullRequest = {
        owner: parsedPR.owner,
        repo: parsedPR.repo,
        number: parsedPR.number,
        sha: currentCommit.trim(),
      };

      logger.debug(
        `GitHub PR context: ${parsedPR.owner}/${parsedPR.repo}#${parsedPR.number} (${pullRequest.sha.substring(0, 7)})`,
      );
    }

    // Send scan request via agent client
    if (!showSpinner) {
      logger.debug('Scanning code...');
    }

    const scanRequest = buildScanRequest(files, metadata, config, sessionId, pullRequest, guidance);

    const scanResponse = await executeScanRequest(client, scanRequest, {
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
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Handle fork PR auth rejection as success (helpful comment posted to PR)
    if (errorMessage.includes('Fork PR scanning not authorized')) {
      const msg = 'Fork PR scanning requires maintainer approval. See PR comment for options.';
      if (showSpinner && spinner) {
        spinner.succeed(msg);
      } else {
        logger.info(msg);
      }

      cliState.postActionCallback = async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        process.exitCode = 0; // Success - not an error condition
      };
      return;
    }

    const msg = `Scan failed: ${errorMessage}`;
    if (showSpinner && spinner) {
      spinner.fail(msg);
    } else {
      logger.error(msg);
    }

    // Store exit code to be set after all output is flushed (in main.ts finally block)
    cliState.postActionCallback = async () => {
      await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for output to be flushed
      if (error instanceof Error && error.message === 'cancelled by user') {
        process.exitCode = 130; // Standard exit code for SIGINT
      } else {
        process.exitCode = 1; // Error exit code
      }
    };
  } finally {
    // Cleanup: Stop MCP bridge and server, disconnect client
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
}
