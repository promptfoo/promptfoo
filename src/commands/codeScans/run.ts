/**
 * Scan Command Implementation
 *
 * Main command that orchestrates the scanning process.
 */

import path from 'path';
import crypto from 'crypto';
import type { ChildProcess } from 'node:child_process';
import type { Command } from 'commander';
import { io, type Socket } from 'socket.io-client';
import telemetry from '../../telemetry';
import { formatDuration } from '../../util/formatDuration';
import type { PullRequestContext, ScanRequest, ScanResponse } from '../../types/codeScan';
import { loadConfigOrDefault, type Config } from './config/loader';
import { validateOnBranch } from './git/diff';
import { extractMetadata } from './git/metadata';
import { processDiff } from './git/diffProcessor';
import { startFilesystemMcpServer, stopFilesystemMcpServer } from './mcp/filesystem';
import { SocketIoMcpBridge } from './mcp/transport';
import { resolveAuthCredentials } from './auth';

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
  if (!severity) return '';
  const emoji = getSeverityEmoji(severity);
  const capitalizedSeverity = severity.charAt(0).toUpperCase() + severity.slice(1);
  return `${emoji} ${capitalizedSeverity}`;
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
    console.error(`   Connecting to ${serverUrl}...`);

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
      console.error(`   ✓ Socket.io connected (id: ${socket.id})`);
      resolve(socket);
    });

    // Connection error
    socket.on('connect_error', (error) => {
      console.error('   ❌ Socket.io connection error:', error.message);
      reject(new Error(`Failed to connect to server: ${error.message}`));
    });

    // Disconnection
    socket.on('disconnect', (reason) => {
      console.error(`   ℹ️  Socket.io disconnected: ${reason}`);
    });

    // Error handling
    socket.on('error', (error) => {
      console.error('   ❌ Socket.io error:', error);
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
    console.error(`\n\n⚠️  Received ${signal}, cleaning up...`);

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
  process.on('SIGINT', () => cleanup('SIGINT'));  // Ctrl+C
  process.on('SIGTERM', () => cleanup('SIGTERM')); // Termination signal
  process.on('SIGQUIT', () => cleanup('SIGQUIT')); // Quit signal
}

async function executeScan(repoPath: string, options: ScanOptions): Promise<void> {
  let socket: Socket | null = null;
  let mcpProcess: ChildProcess | null = null;
  let mcpBridge: SocketIoMcpBridge | null = null;
  let sessionId: string | undefined = undefined;

  const startTime = Date.now();

  // NOTE: Using console.error for progress/info logs to keep stdout clean for JSON output
  console.error('🔍 Code Scan: Analyzing PR for LLM security vulnerabilities...\n');

  // Step 1: Load configuration
  console.error('📋 Loading configuration...');
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

  console.error(`   Minimum severity: ${config.minimumSeverity}`);
  console.error(`   Scan mode: ${config.diffsOnly ? 'diffs-only' : 'full repo exploration'}\n`);

  // Step 2: Resolve repository path
  const absoluteRepoPath = path.resolve(repoPath);
  console.error(`📁 Repository: ${absoluteRepoPath}\n`);

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

  try {
    // Determine API key for authentication (waterfall: CLI arg → config file)
    const apiKey = options.apiKey || config.apiKey;

    // Resolve auth credentials for socket.io
    const authResult = resolveAuthCredentials(apiKey);
    const auth: SocketAuthCredentials = {
      apiKey: authResult.apiKey,
      oidcToken: authResult.oidcToken,
    };

    // Determine server URL
    const serverUrl = options.serverUrl || config.serverUrl || 'https://api.promptfoo.dev';

    // Step 3: Create Socket.IO connection
    console.error('🔌 Establishing connection...');
    socket = await createSocketConnection(serverUrl, auth);
    cleanupRefs.socket = socket; // Update ref for signal handlers
    console.error();

    // Step 4: Optionally start MCP filesystem server + bridge
    if (!config.diffsOnly) {
      console.error('🔌 Setting up MCP filesystem access...');

      // Generate unique session ID
      sessionId = crypto.randomUUID();
      console.error(`   Session ID: ${sessionId}`);

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
        repo_root: absoluteRepoPath
      });

      console.error(`   ✓ MCP filesystem ready\n`);
    }

    // Step 5: Validate branch and determine base branch
    console.error('🔄 Processing git diff...');
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

    console.error(`   Comparing: ${baseBranch}...${compareRef}`);

    // Process diff with focused pipeline
    const files = await processDiff(absoluteRepoPath, baseBranch, compareRef);


    const includedFiles = files.filter((f) => !f.skipReason && f.patch);
    const skippedFiles = files.filter((f) => f.skipReason);

    console.error(`   Total files changed: ${files.length}`);
    console.error(`   Files included: ${includedFiles.length}`);
    console.error(`   Files skipped: ${skippedFiles.length}`);

    // Step 6: Extract git metadata
    console.error('\n📝 Extracting git metadata...');
    const metadata = await extractMetadata(absoluteRepoPath, baseBranch, compareRef);
    console.error(`   Compare ref: ${metadata.branch}`);
    console.error(`   Commits: ${metadata.commitMessages.length}\n`);

    // Step 7: Build pull request context if --github-pr flag provided
    let pullRequest: PullRequestContext | undefined = undefined;
    if (options.githubPr) {
      const parsed = parseGitHubPr(options.githubPr);
      if (!parsed) {
        throw new Error(
          `Invalid --github-pr format: "${options.githubPr}". Expected format: owner/repo#number (e.g., promptfoo/promptfoo#123)`
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

      console.error(`\n📝 GitHub PR context: ${parsed.owner}/${parsed.repo}#${parsed.number} (${pullRequest.sha.substring(0, 7)})`);
    }

    // Step 8: Send scan request via Socket.IO
    console.error('\n🌐 Sending scan request...');

    const scanRequest: ScanRequest = {
      files,
      metadata,
      config: {
        minimumSeverity: config.minimumSeverity,
        diffsOnly: config.diffsOnly,
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
        resolve(response);
      };

      const onError = (error: { success: false; error: string; message: string }) => {
        socket?.off('scan:complete', onComplete);
        socket?.off('scan:error', onError);
        reject(new Error(error.message || error.error));
      };

      socket?.on('scan:complete', onComplete);
      socket?.on('scan:error', onError);

      // Emit scan request
      socket?.emit('scan:start', scanRequest);
    });

    console.error('   ✓ Scan completed successfully\n');
    const endTime = Date.now();
    const duration = endTime - startTime;
    console.error(`   Duration: ${formatDuration(duration / 1000)}\n`);

    // Display results
    if (options.json) {
      // Output full scan response to stdout for programmatic consumption
      console.log(JSON.stringify(scanResponse, null, 2));
    } else {
      // Pretty-print results for human consumption
      console.error('='.repeat(80));
      console.error('SCAN RESULTS');
      console.error('='.repeat(80));
      console.error();

      const { comments, review } = scanResponse;

      // Display review summary if present
      if (review) {
        console.error('📋 REVIEW:\n');
        console.error(review);

        // Append minimum severity threshold
        if (config.minimumSeverity) {
          const capitalizedSeverity = config.minimumSeverity.charAt(0).toUpperCase() + config.minimumSeverity.slice(1);
          console.error(`\nMinimum severity threshold for this scan: ${capitalizedSeverity}`);
        }

        console.error('\n' + '='.repeat(80) + '\n');
      }

      if (comments && comments.length > 0) {
        // Sort by severity (descending)
        const sortedComments = [...comments].sort((a, b) => {
          const severityRank = { critical: 4, high: 3, medium: 2, low: 1 };
          const rankA = severityRank[a.severity?.toLowerCase() as keyof typeof severityRank] || 0;
          const rankB = severityRank[b.severity?.toLowerCase() as keyof typeof severityRank] || 0;
          return rankB - rankA;
        });

        for (const comment of sortedComments) {
          // Display severity
          const severityDisplay = formatSeverity(comment.severity);
          if (severityDisplay) {
            console.error(`\n${severityDisplay}`);
          }

          // Display location
          if (comment.file) {
            const location = comment.line ? `${comment.file}:${comment.line}` : comment.file;
            console.error(`📍 ${location}\n`);
          } else {
            console.error();
          }

          // Display finding
          console.error(comment.finding);

          // Display fix
          if (comment.fix) {
            console.error('\n💡 Suggested Fix:');
            console.error(comment.fix);
          }

          // Display AI agent prompt
          if (comment.aiAgentPrompt) {
            console.error('\n🤖 AI Agent Prompt:');
            console.error(comment.aiAgentPrompt);
          }
          console.error();
        }
      } else {
        console.error('✨ No vulnerabilities found!\n');
      }

      console.error('='.repeat(80));
    }
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    // Cleanup: Stop MCP bridge and server, disconnect socket
    if (mcpBridge) {
      await mcpBridge.disconnect().catch((err) => {
        console.error('   ⚠️  Error stopping MCP bridge:', err.message);
      });
    }

    if (mcpProcess) {
      await stopFilesystemMcpServer(mcpProcess).catch((err) => {
        console.error('   ⚠️  Error stopping MCP server:', err.message);
      });
    }

    if (socket) {
      socket.disconnect();
      console.error('   ✓ Socket disconnected');
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
    .action(async (repoPath: string, cmdObj: ScanOptions) => {
      telemetry.record('command_used', {
        name: 'code-scans run',
        diffsOnly: cmdObj.diffsOnly ?? false,
        hasGithubPr: !!cmdObj.githubPr,
      });

      await executeScan(repoPath, cmdObj);
    });
}
