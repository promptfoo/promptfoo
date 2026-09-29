/**
 * Filesystem MCP Server Management
 *
 * Spawns and manages the @modelcontextprotocol/server-filesystem child process.
 */

import { type ChildProcess, execFile, spawn } from 'child_process';
import { realpathSync } from 'fs';
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'path';
import { promisify } from 'util';

import logger from '../../logger';
import { FilesystemMcpError } from '../../types/codeScan';

const FILESYSTEM_MCP_READY_MARKER = 'running on stdio';
const FILESYSTEM_MCP_READY_TIMEOUT_MS = 30000;
const execFileAsync = promisify(execFile);

function formatFilesystemMcpExitReason(code: number | null, signal: NodeJS.Signals | null): string {
  return code === null ? (signal ? `signal ${signal}` : 'unknown reason') : `code ${code}`;
}

function createFilesystemMcpEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };

  delete env.NPM_CONFIG_BEFORE;
  delete env.npm_config_before;

  if (process.platform === 'win32') {
    // npm's generated server shim invokes node through PATH. Prefer this runtime and
    // remove duplicate case variants, since Windows environment keys are case-insensitive.
    for (const key of Object.keys(env)) {
      if (key.toLowerCase() === 'path') {
        delete env[key];
      }
    }
    env.PATH = [dirname(process.execPath), process.env.PATH].filter(Boolean).join(delimiter);
  }

  return env;
}

/**
 * Windows npm shims are .cmd files, which spawn() cannot run without a shell. Run npm's
 * npx-cli.js under this Node instead, preferring its bundled npm; a bare node.exe (such as
 * the GitHub Actions runtime) falls back to PATH.
 */
function getNpxLaunch(rootDir: string): { command: string; args: string[]; cwd: string } {
  if (process.platform !== 'win32') {
    return { command: 'npx', args: [], cwd: rootDir };
  }
  const canonicalRoot = realpathSync(rootDir);
  // Read process.env directly so PATH lookup stays case-insensitive on Windows.
  const searchDirs = (process.env.PATH ?? '').split(delimiter).filter(isAbsolute);
  for (const dir of [dirname(process.execPath), ...searchDirs]) {
    try {
      const npxCli = realpathSync(join(dir, 'node_modules', 'npm', 'bin', 'npx-cli.js'));
      const relativePath = relative(canonicalRoot, npxCli);
      if (
        relativePath !== '..' &&
        !relativePath.startsWith(`..${sep}`) &&
        !isAbsolute(relativePath)
      ) {
        continue;
      }
      // npm invokes the server through a shell, so its cwd must also stay outside the repo.
      return { command: process.execPath, args: [npxCli], cwd: dirname(npxCli) };
    } catch {
      // Skip missing or inaccessible npm installations.
    }
  }
  throw new Error(
    'npx not found outside the scanned repository: install npm alongside Node.js or on PATH',
  );
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
    // Spawn the filesystem MCP server
    // Using npx to run @modelcontextprotocol/server-filesystem
    const { command, args, cwd } = getNpxLaunch(absoluteRootDir);
    const mcpProcess = spawn(
      command,
      [...args, '-y', '@modelcontextprotocol/server-filesystem', absoluteRootDir],
      {
        stdio: ['pipe', 'pipe', 'pipe'], // stdin/stdout/stderr all piped
        cwd,
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
 * The child process is started through npx, which can spend time resolving or
 * installing the package before the MCP server takes over stdin. Announcing the
 * runner before that point lets the cloud side send initialize too early.
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
    // SIGTERM force-kills only npm on Windows. taskkill also stops its shell and server.
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

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      // Force kill if graceful shutdown takes too long
      logger.debug('MCP server did not exit gracefully, force killing...');
      mcpProcess.kill('SIGKILL');
      resolve();
    }, 5000); // 5 second timeout

    mcpProcess.on('exit', () => {
      clearTimeout(timeout);
      logger.debug('MCP server stopped');
      resolve();
    });

    // Try graceful shutdown first
    mcpProcess.kill('SIGTERM');
  });
}
