/**
 * Filesystem MCP Server Management
 *
 * Spawns and manages the @modelcontextprotocol/server-filesystem child process.
 */

import { type ChildProcess, spawn } from 'child_process';
import { isAbsolute, resolve } from 'path';

import logger from '../../logger';
import { FilesystemMcpError } from '../../types/codeScan';

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
    const mcpProcess = spawn(
      'npx',
      ['-y', '@modelcontextprotocol/server-filesystem', absoluteRootDir],
      {
        stdio: ['pipe', 'pipe', 'pipe'], // stdin/stdout/stderr all piped
        cwd: absoluteRootDir,
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
 * Stop the filesystem MCP server process
 * @param process Child process to terminate
 */
export async function stopFilesystemMcpServer(process: ChildProcess): Promise<void> {
  if (!process.pid) {
    logger.debug('MCP server already stopped');
    return;
  }

  logger.debug(`Stopping MCP server (pid: ${process.pid})...`);

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      // Force kill if graceful shutdown takes too long
      logger.debug('MCP server did not exit gracefully, force killing...');
      process.kill('SIGKILL');
      resolve();
    }, 5000); // 5 second timeout

    process.on('exit', () => {
      clearTimeout(timeout);
      logger.debug('MCP server stopped');
      resolve();
    });

    // Try graceful shutdown first
    process.kill('SIGTERM');
  });
}
