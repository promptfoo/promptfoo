/**
 * Filesystem MCP Server Management
 *
 * Spawns and manages the @modelcontextprotocol/server-filesystem child process.
 */

import { type ChildProcess, execFile, spawn } from 'child_process';
import { createRequire } from 'module';
import { isAbsolute, join, resolve } from 'path';
import { promisify } from 'util';

import logger from '../../logger';
import { FilesystemMcpError } from '../../types/codeScan';

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);

const FILESYSTEM_MCP_READY_MARKER = 'running on stdio';
const FILESYSTEM_MCP_READY_TIMEOUT_MS = 30000;

function formatFilesystemMcpExitReason(code: number | null, signal: NodeJS.Signals | null): string {
  return code === null ? (signal ? `signal ${signal}` : 'unknown reason') : `code ${code}`;
}

// The server reads no configuration from the environment; pass only what Node needs.
const FILESYSTEM_MCP_ENV_KEYS = new Set([
  'HOME',
  'PATH',
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'TMPDIR',
  'USERPROFILE',
]);

function createFilesystemMcpEnv(): NodeJS.ProcessEnv {
  // Match case-insensitively: Windows keeps names such as Path and SystemRoot.
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => FILESYSTEM_MCP_ENV_KEYS.has(key.toUpperCase())),
  );
}

function resolveFilesystemMcpServerEntry(): string {
  try {
    return require.resolve('@modelcontextprotocol/server-filesystem/dist/index.js');
  } catch {
    throw new Error(
      'The @modelcontextprotocol/server-filesystem package is required to scan beyond the diff. Reinstall promptfoo with optional dependencies or use --diffs-only.',
    );
  }
}

/**
 * Start the filesystem MCP server as a child process
 * @param rootDir Absolute path to root directory for filesystem access
 * @returns Child process handle
 */
export function startFilesystemMcpServer(rootDir: string): ChildProcess {
  // Validate rootDir is absolute
  if (!isAbsolute(rootDir)) {
    throw new FilesystemMcpError(`Root directory must be an absolute path, got: ${rootDir}`);
  }

  // Normalize the absolute path for consistent usage
  const absoluteRootDir = resolve(rootDir);

  logger.debug('Starting filesystem MCP server...');
  logger.debug(`Root directory: ${absoluteRootDir}`);

  try {
    // Run the installed server under this Node rather than through npx, so the scanned
    // repository's npm context does not affect how it is resolved or launched.
    const mcpProcess = spawn(
      process.execPath,
      [resolveFilesystemMcpServerEntry(), absoluteRootDir],
      {
        stdio: ['pipe', 'pipe', 'pipe'], // stdin/stdout/stderr all piped
        cwd: absoluteRootDir,
        env: createFilesystemMcpEnv(),
      },
    );

    // Filter stderr to suppress expected timeout warnings
    mcpProcess.stderr?.on('data', (chunk: Buffer) => {
      const message = chunk.toString('utf8');

      // Suppress "Failed to request initial roots" warnings - these are expected
      // when using HTTP MCP transport which cannot service bidirectional requests
      if (message.includes('Failed to request initial roots from client')) {
        return;
      }

      // Log other stderr messages as debug
      logger.debug(`MCP server stderr: ${message.trim()}`);
    });

    // Handle process errors
    mcpProcess.on('error', (error) => {
      logger.error(`MCP server process error: ${error.message}`);
    });

    mcpProcess.on('exit', (code, signal) => {
      if (code !== null && code !== 0) {
        logger.debug(`MCP server exited with code ${code}`);
      } else if (signal) {
        logger.debug(`MCP server terminated by signal ${signal}`);
      }
    });

    logger.debug(`MCP server started (pid: ${mcpProcess.pid})`);

    return mcpProcess;
  } catch (error) {
    throw new FilesystemMcpError(
      `Failed to start filesystem MCP server: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Wait until the filesystem MCP server is ready to accept JSON-RPC messages.
 *
 * The server starts reading stdin only after it validates its root directory.
 * Announcing the runner before that point lets the cloud side send initialize too early.
 */
export function waitForFilesystemMcpServerReady(
  mcpProcess: ChildProcess,
  timeoutMs = FILESYSTEM_MCP_READY_TIMEOUT_MS,
): Promise<void> {
  if (mcpProcess.exitCode !== null || mcpProcess.signalCode !== null || mcpProcess.killed) {
    return Promise.reject(
      new FilesystemMcpError(
        `Filesystem MCP server exited before ready: ${formatFilesystemMcpExitReason(
          mcpProcess.exitCode,
          mcpProcess.signalCode,
        )}`,
      ),
    );
  }

  const stderr = mcpProcess.stderr;

  if (!stderr) {
    return Promise.reject(new FilesystemMcpError('Filesystem MCP server stderr pipe unavailable'));
  }

  return new Promise((resolve, reject) => {
    let stderrBuffer = '';
    let settled = false;

    const cleanup = () => {
      clearTimeout(timeout);
      stderr.off('data', onStderr);
      mcpProcess.off('error', onError);
      mcpProcess.off('exit', onExit);
    };

    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      callback();
    };

    const onStderr = (chunk: Buffer) => {
      stderrBuffer += chunk.toString('utf8');

      if (stderrBuffer.includes(FILESYSTEM_MCP_READY_MARKER)) {
        settle(resolve);
        return;
      }

      if (stderrBuffer.length > 4096) {
        stderrBuffer = stderrBuffer.slice(-4096);
      }
    };

    const onError = (error: Error) => {
      settle(() => {
        reject(
          new FilesystemMcpError(`Filesystem MCP server error before ready: ${error.message}`),
        );
      });
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      settle(() => {
        const reason = formatFilesystemMcpExitReason(code, signal);
        reject(new FilesystemMcpError(`Filesystem MCP server exited before ready: ${reason}`));
      });
    };

    const timeout = setTimeout(() => {
      settle(() => {
        reject(
          new FilesystemMcpError(
            `Timed out waiting for filesystem MCP server to be ready after ${timeoutMs}ms`,
          ),
        );
      });
    }, timeoutMs);

    stderr.on('data', onStderr);
    mcpProcess.once('error', onError);
    mcpProcess.once('exit', onExit);
  });
}

/**
 * Stop the filesystem MCP server process
 * @param mcpProcess Child process to terminate
 */
export async function stopFilesystemMcpServer(mcpProcess: ChildProcess): Promise<void> {
  if (!mcpProcess.pid || mcpProcess.exitCode !== null || mcpProcess.signalCode !== null) {
    logger.debug('MCP server already stopped');
    return;
  }

  logger.debug(`Stopping MCP server (pid: ${mcpProcess.pid})...`);

  if (process.platform === 'win32') {
    // Stop the complete process tree on Windows, including any server subprocesses.
    const windowsDir = process.env.SystemRoot;
    if (!windowsDir || !isAbsolute(windowsDir)) {
      throw new FilesystemMcpError('Cannot locate the Windows system directory for MCP cleanup');
    }
    try {
      await execFileAsync(
        join(windowsDir, 'System32', 'taskkill.exe'),
        ['/PID', String(mcpProcess.pid), '/T', '/F'],
        { windowsHide: true, timeout: 5000 },
      );
    } catch (error) {
      throw new FilesystemMcpError(
        `Failed to stop filesystem MCP process tree: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return;
  }

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      clearTimeout(timeout);
      mcpProcess.off('exit', onExit);
      mcpProcess.off('error', onError);
    };

    const onExit = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      logger.debug('MCP server stopped');
      resolve();
    };

    const onError = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(new FilesystemMcpError(`Failed to stop filesystem MCP server: ${error.message}`));
    };

    const sendSignal = (signal: NodeJS.Signals) => {
      try {
        if (!mcpProcess.kill(signal)) {
          onError(new Error(`Could not send ${signal} to process ${mcpProcess.pid}`));
        }
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    };

    const timeout = setTimeout(() => {
      logger.debug('MCP server did not exit gracefully, force killing...');
      // Signal delivery does not confirm termination; keep waiting for the exit event.
      sendSignal('SIGKILL');
    }, 5000);

    mcpProcess.once('exit', onExit);
    mcpProcess.once('error', onError);
    sendSignal('SIGTERM');
  });
}
