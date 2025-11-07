/**
 * Scan Command Implementation
 *
 * Main command that orchestrates the scanning process.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { ChildProcess } from 'child_process';

import chalk from 'chalk';
import ora from 'ora';
import { io, type Socket } from 'socket.io-client';
import cliState from '../../cliState';
import logger, { getLogLevel } from '../../logger';
import telemetry from '../../telemetry';
import { formatDuration } from '../../util/formatDuration';
import { TERMINAL_MAX_WIDTH } from '../../constants';
import { printBorder } from '../../util/index';
import { resolveAuthCredentials } from './auth';
import { type Config, loadConfigOrDefault } from './config/loader';
import { validateOnBranch } from './git/diff';
import { processDiff } from './git/diffProcessor';
import { extractMetadata } from './git/metadata';
import { startFilesystemMcpServer, stopFilesystemMcpServer } from './mcp/filesystem';
import { SocketIoMcpBridge } from './mcp/transport';
import type { Command } from 'commander';

import type {
  ParsedGitHubPR,
  PullRequestContext,
  ScanRequest,
  ScanResponse,
  SocketAuthCredentials,
} from '../../types/codeScan';
import {
  CodeScanSeverity,
  formatSeverity,
  countBySeverity,
  getSeverityRank,
  validateSeverity,
} from '../../types/codeScan';

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

/**
 * Mutable references for cleanup handlers
 * Allows signal handlers to access updated MCP resources
 */
interface CleanupRefs {
  repoPath: string;
  socket: Socket | null;
  mcpBridge: SocketIoMcpBridge | null;
  mcpProcess: ChildProcess | null;
}

/**
 * Parse GitHub PR string
 * Format: owner/repo#number (e.g., promptfoo/promptfoo#123)
 */
function parseGitHubPr(prString: string): ParsedGitHubPR | null {
  const match = prString.match(/^([^/]+)\/([^#]+)#(\d+)$/);
  if (!match) {
    return null;
  }

  const [, owner, repo, prNumber] = match;
  return {
    owner,
    repo,
    number: parseInt(prNumber, 10),
  };
}

async function createSocketConnection(
  apiHost: string,
  auth: SocketAuthCredentials,
): Promise<Socket> {
  return new Promise((resolve, reject) => {
    logger.debug(`Connecting to ${apiHost}...`);

    const socket = io(apiHost, {
      // Use websocket-only transport (polling requires sticky sessions)
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 10000,
      auth,
    });

    // Connection success
    socket.on('connect', () => {
      logger.debug(`Socket.io connected (id: ${socket.id})`);
      resolve(socket);
    });

    // Connection error
    socket.on('connect_error', (error) => {
      logger.error(`Socket.io connection error: ${error.message}`);
      reject(new Error(`Failed to connect to server: ${error.message}`));
    });

    // Disconnection
    socket.on('disconnect', (reason) => {
      logger.debug(`Socket.io disconnected: ${reason}`);
    });

    // Error handling
    socket.on('error', (error) => {
      logger.error(`Socket.io error: ${String(error)}`);
    });

    // Connection timeout
    setTimeout(() => {
      if (!socket.connected) {
        reject(new Error('Socket.io connection timeout after 10 seconds'));
      }
    }, 10000);
  });
}

function registerCleanupHandlers(refs: CleanupRefs): void {
  const cleanup = async (signal: string) => {
    logger.info(`\n\n⚠️  Received ${signal}, cleaning up...`);

    // Cleanup MCP resources
    if (refs.mcpBridge) {
      await refs.mcpBridge.disconnect().catch(() => {});
    }
    if (refs.mcpProcess) {
      await stopFilesystemMcpServer(refs.mcpProcess).catch(() => {});
    }
    // Cleanup socket
    if (refs.socket) {
      refs.socket.disconnect();
    }

    // don't force exit, let global cleanup run if needed
  };

  // Register handlers for common termination signals
  process.on('SIGINT', () => cleanup('SIGINT')); // Ctrl+C
  process.on('SIGTERM', () => cleanup('SIGTERM')); // Termination signal
  process.on('SIGQUIT', () => cleanup('SIGQUIT')); // Quit signal
}

async function executeScan(repoPath: string, options: ScanOptions): Promise<void> {
  let socket: Socket | null = null;
  let mcpProcess: ChildProcess | null = null;
  let mcpBridge: SocketIoMcpBridge | null = null;
  let sessionId: string | undefined = undefined;

  const startTime = Date.now();

  // Load configuration
  const config: Config = loadConfigOrDefault(options.config);

  // Allow options to override config file settings
  if (options.diffsOnly !== undefined) {
    config.diffsOnly = options.diffsOnly;
  }

  // Allow CLI flags to override config severity (minSeverity takes precedence over minimumSeverity)
  if (options.minSeverity || options.minimumSeverity) {
    const cliSeverity = (options.minSeverity || options.minimumSeverity) as string;
    // Validate severity input (throws ZodError if invalid)
    config.minimumSeverity = validateSeverity(cliSeverity);
  }

  // Handle guidance options (mutually exclusive)
  let guidance: string | undefined = undefined;
  if (options.guidance && options.guidanceFile) {
    throw new Error('Cannot specify both --guidance and --guidance-file options');
  }

  // CLI options take precedence over config
  if (options.guidance) {
    guidance = options.guidance;
  } else if (options.guidanceFile) {
    const absoluteGuidancePath = path.resolve(options.guidanceFile);
    try {
      guidance = fs.readFileSync(absoluteGuidancePath, 'utf-8');
      logger.debug(`Loaded guidance from: ${absoluteGuidancePath}`);
    } catch (error) {
      throw new Error(
        `Failed to read guidance file: ${absoluteGuidancePath} - ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } else if (config.guidance) {
    // Config loader already read guidanceFile and populated guidance field
    guidance = config.guidance;
  }

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
  };

  // Register cleanup handlers for signals (SIGINT, SIGTERM, etc.)
  registerCleanupHandlers(cleanupRefs);

  // Initialize spinner (hide in JSON mode, but still show logger.info status)
  const isWebUI = Boolean(cliState.webUI);
  const showSpinner = !isWebUI && !options.json && getLogLevel() !== 'debug';

  let spinner: ReturnType<typeof ora> | undefined;
  if (showSpinner) {
    spinner = ora({ text: '', color: 'green' }).start();
  }

  try {
    // Determine API key for authentication (waterfall: CLI arg → config file)
    const apiKey = options.apiKey || config.apiKey;

    // Resolve auth credentials for socket.io
    const auth = resolveAuthCredentials(apiKey);

    // Determine API host URL
    const apiHost = options.apiHost || config.apiHost || 'https://api.promptfoo.dev';

    logger.debug(`Promptfoo API host URL: ${apiHost}`);

    // Create Socket.IO connection
    if (!showSpinner) {
      logger.debug('Connecting to server...');
    }

    socket = await createSocketConnection(apiHost, auth);
    cleanupRefs.socket = socket; // Update ref for signal handlers

    // Optionally start MCP filesystem server + bridge
    if (!config.diffsOnly) {
      logger.debug('Setting up repo MCP access...');

      // Generate unique session ID
      sessionId = crypto.randomUUID();
      logger.debug(`Session ID: ${sessionId}`);

      // Start filesystem MCP server
      mcpProcess = startFilesystemMcpServer(absoluteRepoPath);
      cleanupRefs.mcpProcess = mcpProcess; // Update ref for signal handlers

      // Create MCP bridge using existing socket
      mcpBridge = new SocketIoMcpBridge(mcpProcess, socket, sessionId);
      cleanupRefs.mcpBridge = mcpBridge; // Update ref for signal handlers
      await mcpBridge.connect();

      // Announce as runner with repository root for MCP roots/list
      socket.emit('runner:hello', {
        session_id: sessionId,
        repo_root: absoluteRepoPath,
      });
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
      const git = simpleGit(absoluteRepoPath);
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
    if (showSpinner && spinner) {
      spinner.text = 'Scanning...';
    } else {
      logger.debug('Scanning code...');
    }

    // Add heartbeat to show progress during long scans
    let heartbeatInterval: NodeJS.Timeout | undefined;
    let firstPulseTimeout: NodeJS.Timeout | undefined;
    if (showSpinner) {
      const pulse = () => {
        // Show "Still scanning..." for 4 seconds
        spinner!.text = 'Still scanning...';
        setTimeout(() => {
          if (spinner?.isSpinning) {
            spinner.text = 'Scanning...';
          }
        }, 4000);
      };

      // First pulse at 8 seconds
      firstPulseTimeout = setTimeout(() => {
        pulse();
        // Then pulse every 12 seconds (8s "Scanning..." + 4s "Still scanning...")
        heartbeatInterval = setInterval(pulse, 12000);
      }, 8000);
    }

    const scanRequest: ScanRequest = {
      files,
      metadata,
      config: {
        minimumSeverity: config.minimumSeverity,
        diffsOnly: config.diffsOnly,
        guidance,
      },
      sessionId, // Include session ID if MCP is enabled
      pullRequest, // Include PR context if --github-pr flag provided
    };

    // Send scan request and wait for response
    const scanResponse: ScanResponse = await new Promise((resolve, reject) => {
      // Set up event listeners
      const onComplete = (response: ScanResponse) => {
        socket?.off('scan:complete', onComplete);
        socket?.off('scan:error', onError);
        if (firstPulseTimeout) {
          clearTimeout(firstPulseTimeout);
        }
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
        }
        resolve(response);
      };

      const onError = (error: { success: false; error: string; message: string }) => {
        socket?.off('scan:complete', onComplete);
        socket?.off('scan:error', onError);
        if (firstPulseTimeout) {
          clearTimeout(firstPulseTimeout);
        }
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
        }
        reject(new Error(error.message || error.error));
      };

      socket?.on('scan:complete', onComplete);
      socket?.on('scan:error', onError);

      // Emit scan request
      socket?.emit('scan:start', scanRequest);
    });

    // Stop spinner silently
    if (showSpinner) {
      spinner!.stop();
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Display results
    if (options.json) {
      // Output full scan response to stdout for programmatic consumption
      console.log(JSON.stringify(scanResponse, null, 2));
    } else {
      // Pretty-print results for human consumption
      const { comments, review } = scanResponse;
      const severityCounts = countBySeverity(comments || []);

      // 1. Completion message and issue summary
      printBorder();
      logger.info(`${chalk.green('✓')} Scan complete (${formatDuration(duration / 1000)})`);
      if (severityCounts.total > 0) {
        logger.info(
          chalk.yellow(
            `⚠ Found ${severityCounts.total} issue${severityCounts.total === 1 ? '' : 's'}`,
          ),
        );
      }
      printBorder();

      // 3. Review summary - shown even when no issues
      // If no review field, check for severity="none" comment to use as review
      let reviewText = review;
      if (!reviewText && comments && comments.length > 0) {
        const noneComment = comments.find((c) => c.severity === CodeScanSeverity.NONE);
        if (noneComment) {
          reviewText = noneComment.finding;
        }
      }

      if (reviewText) {
        logger.info('');
        logger.info(reviewText);
        logger.info('');
        printBorder();
      }

      // 4. Detailed findings (only show issues with valid severity)
      if (severityCounts.total > 0) {
        const validSeverities = [
          CodeScanSeverity.CRITICAL,
          CodeScanSeverity.HIGH,
          CodeScanSeverity.MEDIUM,
          CodeScanSeverity.LOW,
        ];
        const issuesWithSeverity = (comments || []).filter(
          (c) => c.severity && validSeverities.includes(c.severity),
        );

        // Sort by severity (descending)
        const sortedComments = [...issuesWithSeverity].sort((a, b) => {
          const rankA = a.severity ? getSeverityRank(a.severity) : 0;
          const rankB = b.severity ? getSeverityRank(b.severity) : 0;
          return rankB - rankA;
        });

        logger.info('');
        for (let i = 0; i < sortedComments.length; i++) {
          const comment = sortedComments[i];
          const severity = formatSeverity(comment.severity);
          const location = comment.line ? `${comment.file}:${comment.line}` : comment.file || '';

          logger.info(`${severity} ${chalk.gray(location)}`);
          logger.info('');
          logger.info(comment.finding);

          if (comment.fix) {
            logger.info('');
            logger.info(chalk.bold('Suggested Fix:'));
            logger.info(comment.fix);
          }

          if (comment.aiAgentPrompt) {
            logger.info('');
            logger.info(chalk.bold('AI Agent Prompt:'));
            logger.info(comment.aiAgentPrompt);
          }

          // Add separator between comments (but not after the last one)
          if (i < sortedComments.length - 1) {
            logger.info('');
            logger.info(chalk.gray('─'.repeat(TERMINAL_MAX_WIDTH)));
            logger.info('');
          }
        }
        printBorder();

        // 5. Next steps (only if there are issues)
        if (options.githubPr) {
          logger.info(`» Comments posted to PR: ${chalk.cyan(options.githubPr)}`);
          printBorder();
        }
      }
    }
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
