/**
 * Scan Command Implementation
 *
 * Main command that orchestrates the scanning process.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { ChildProcess } from 'node:child_process';

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

import type { PullRequestContext, ScanRequest, ScanResponse } from '../../types/codeScan';

interface ParsedGitHubPR {
  owner: string;
  repo: string;
  number: number;
}

interface SocketAuthCredentials {
  apiKey?: string;
  oidcToken?: string;
}

function getSeverityEmoji(severity?: string): string {
  switch (severity?.toLowerCase()) {
    case 'critical':
      return '🔴';
    case 'high':
      return '🟠';
    case 'medium':
      return '🟡';
    case 'low':
      return '🔵';
    default:
      return '⚪';
  }
}

function formatSeverity(severity?: string): string {
  if (!severity) {
    return '';
  }
  const emoji = getSeverityEmoji(severity);
  const capitalizedSeverity = severity.charAt(0).toUpperCase() + severity.slice(1);
  return `${emoji} ${capitalizedSeverity}`;
}

function countBySeverity(comments: Array<{ severity?: string }>) {
  // Filter out comments without severity or with severity="none" (review-only comments)
  const validSeverities = ['critical', 'high', 'medium', 'low'];
  const issuesOnly = comments.filter(
    (c) => c.severity && validSeverities.includes(c.severity.toLowerCase()),
  );

  return {
    total: issuesOnly.length,
    critical: issuesOnly.filter((c) => c.severity?.toLowerCase() === 'critical').length,
    high: issuesOnly.filter((c) => c.severity?.toLowerCase() === 'high').length,
    medium: issuesOnly.filter((c) => c.severity?.toLowerCase() === 'medium').length,
    low: issuesOnly.filter((c) => c.severity?.toLowerCase() === 'low').length,
  };
}

export interface ScanOptions {
  config?: string;
  serverUrl?: string;
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
  serverUrl: string,
  auth: SocketAuthCredentials,
): Promise<Socket> {
  return new Promise((resolve, reject) => {
    logger.debug(`Connecting to ${serverUrl}...`);

    const socket = io(serverUrl, {
      // Use websocket-only transport (polling requires sticky sessions)
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 10000,
      auth: {
        token: auth.apiKey,
        oidcToken: auth.oidcToken,
      },
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

    process.exit(130); // Standard exit code for SIGINT
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

  // Step 1: Load configuration
  const config: Config = loadConfigOrDefault(options.config);

  // Allow options to override config file settings
  if (options.diffsOnly !== undefined) {
    config.diffsOnly = options.diffsOnly;
  }

  // Allow CLI flags to override config severity (minSeverity takes precedence over minimumSeverity)
  if (options.minSeverity || options.minimumSeverity) {
    const cliSeverity = (options.minSeverity || options.minimumSeverity) as string;
    config.minimumSeverity = cliSeverity as Config['minimumSeverity'];
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

  // Step 2: Resolve repository path
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
    const authResult = resolveAuthCredentials(apiKey);
    const auth: SocketAuthCredentials = {
      apiKey: authResult.apiKey,
      oidcToken: authResult.oidcToken,
    };

    logger.debug(
      `Server URL: ${options.serverUrl || config.serverUrl || 'https://api.promptfoo.dev'}`,
    );

    // Determine server URL
    const serverUrl = options.serverUrl || config.serverUrl || 'https://api.promptfoo.dev';

    // Step 3: Create Socket.IO connection
    if (!showSpinner) {
      logger.debug('Connecting to server...');
    }

    socket = await createSocketConnection(serverUrl, auth);
    cleanupRefs.socket = socket; // Update ref for signal handlers

    // Step 4: Optionally start MCP filesystem server + bridge
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

    // Step 5: Validate branch and determine base branch
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

    // Step 6: Extract git metadata
    const metadata = await extractMetadata(absoluteRepoPath, baseBranch, compareRef);
    logger.debug(`Compare ref: ${metadata.branch}`);
    logger.debug(`Commits: ${metadata.commitMessages.length}`);

    // Step 7: Build pull request context if --github-pr flag provided
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

    // Step 8: Send scan request via Socket.IO
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

    // // TODO: Remove this
    // console.log(JSON.stringify(scanResponse, null, 2));
    // process.exit(0);

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
        const noneComment = comments.find((c) => c.severity?.toLowerCase() === 'none');
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
        const validSeverities = ['critical', 'high', 'medium', 'low'];
        const issuesWithSeverity = (comments || []).filter(
          (c) => c.severity && validSeverities.includes(c.severity.toLowerCase()),
        );

        // Sort by severity (descending)
        const sortedComments = [...issuesWithSeverity].sort((a, b) => {
          const severityRank = { critical: 4, high: 3, medium: 2, low: 1 };
          const rankA = severityRank[a.severity?.toLowerCase() as keyof typeof severityRank] || 0;
          const rankB = severityRank[b.severity?.toLowerCase() as keyof typeof severityRank] || 0;
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
    process.exit(1);
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
    .option('--server-url <url>', 'Server URL (default: https://api.promptfoo.dev)')
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
