import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { Router } from 'express';
import { z } from 'zod';
import { checkModelAuditInstalled } from '../../commands/modelScan';
import logger from '../../logger';
import ModelAudit from '../../models/modelAudit';
import telemetry from '../../telemetry';
import { ModelAuditSchemas } from '../../types/api/modelAudit';
import { parseModelAuditArgs } from '../../util/modelAuditCliParser';
import type { Request, Response } from 'express';

import type { ModelAuditScanResults } from '../../types/modelAudit';

export const modelAuditRouter = Router();

// Check if modelaudit is installed
modelAuditRouter.get('/check-installed', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { installed, version } = await checkModelAuditInstalled();
    res.json(
      ModelAuditSchemas.CheckInstalled.Response.parse({ installed, version, cwd: process.cwd() }),
    );
  } catch {
    res.json(
      ModelAuditSchemas.CheckInstalled.Response.parse({
        installed: false,
        version: null,
        cwd: process.cwd(),
      }),
    );
  }
});

// Check path type
modelAuditRouter.post('/check-path', async (req: Request, res: Response): Promise<void> => {
  const bodyResult = ModelAuditSchemas.CheckPath.Request.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: z.prettifyError(bodyResult.error) });
    return;
  }

  try {
    const { path: inputPath } = bodyResult.data;

    // Handle home directory expansion
    let expandedPath = inputPath;
    if (expandedPath.startsWith('~/')) {
      expandedPath = path.join(os.homedir(), expandedPath.slice(2));
    }

    const absolutePath = path.isAbsolute(expandedPath)
      ? expandedPath
      : path.resolve(process.cwd(), expandedPath);

    // Check if path exists
    if (!fs.existsSync(absolutePath)) {
      res.json(ModelAuditSchemas.CheckPath.Response.parse({ exists: false, type: null }));
      return;
    }

    // Get path stats
    const stats = fs.statSync(absolutePath);
    const type = stats.isDirectory() ? 'directory' : 'file';

    res.json(
      ModelAuditSchemas.CheckPath.Response.parse({
        exists: true,
        type,
        absolutePath,
        name: path.basename(absolutePath),
      }),
    );
  } catch (error) {
    logger.error(`Error checking path: ${error}`);
    res.status(500).json({ error: String(error) });
  }
});

interface StderrErrorInfo {
  message: string;
  details: Record<string, string>;
}

/**
 * Parses stderr output to identify known error patterns and return helpful messages.
 */
function parseStderrError(stderr: string, exitCode: number | null): StderrErrorInfo {
  const defaultMessage = `Model scan failed with exit code ${exitCode}`;
  if (!stderr) {
    return { message: defaultMessage, details: {} };
  }

  const s = stderr.toLowerCase();

  if (s.includes('permission denied') || s.includes('access denied')) {
    return {
      message: 'Permission denied: Unable to access the specified files or directories',
      details: {
        type: 'permission_error',
        suggestion: 'Check that the files exist and you have read permissions',
      },
    };
  }
  if (s.includes('file not found') || s.includes('no such file')) {
    return {
      message: 'Files or directories not found',
      details: {
        type: 'file_not_found',
        suggestion: 'Verify the file paths are correct and the files exist',
      },
    };
  }
  if (s.includes('out of memory') || s.includes('memory')) {
    return {
      message: 'Insufficient memory to complete the scan',
      details: {
        type: 'memory_error',
        suggestion: 'Try scanning smaller files or reducing the number of files scanned at once',
      },
    };
  }
  if (s.includes('timeout') || s.includes('timed out')) {
    return {
      message: 'Scan operation timed out',
      details: {
        type: 'timeout_error',
        suggestion: 'Try increasing the timeout value or scanning fewer files',
      },
    };
  }
  if (s.includes('invalid') || s.includes('malformed')) {
    return {
      message: 'Invalid or malformed model files detected',
      details: {
        type: 'invalid_model',
        suggestion: 'Ensure the files are valid model files and not corrupted',
      },
    };
  }
  if (s.includes('unsupported')) {
    return {
      message: 'Unsupported model format or file type',
      details: {
        type: 'unsupported_format',
        suggestion: 'Check the modelaudit documentation for supported file formats',
      },
    };
  }
  if (s.includes('connection') || s.includes('network')) {
    return {
      message: 'Network or connection error during scan',
      details: {
        type: 'network_error',
        suggestion:
          'Check your internet connection if the scan requires downloading external resources',
      },
    };
  }
  if (s.includes('disk space') || s.includes('no space')) {
    return {
      message: 'Insufficient disk space',
      details: { type: 'disk_space_error', suggestion: 'Free up disk space and try again' },
    };
  }
  if (s.includes('python') && s.includes('version')) {
    return {
      message: 'Python version compatibility issue',
      details: {
        type: 'python_version_error',
        suggestion: 'Check that you have a supported Python version installed',
      },
    };
  }
  if (s.includes('no such option') || s.includes('unrecognized option')) {
    return {
      message: 'Invalid command line option provided to modelaudit',
      details: {
        type: 'invalid_option_error',
        suggestion:
          'Check that all command line options are supported by the current modelaudit version',
      },
    };
  }
  if (s.includes('usage:') && s.includes('try')) {
    return {
      message: 'Invalid command syntax or arguments',
      details: {
        type: 'usage_error',
        suggestion: 'Review the command arguments. The modelaudit usage help is shown in stderr.',
      },
    };
  }

  return { message: defaultMessage, details: {} };
}

interface ScanPersistOptions {
  name?: string;
  author?: string | null;
  blacklist?: unknown;
  timeout?: number;
  maxFileSize?: number | string;
  maxTotalSize?: number | string;
  verbose?: boolean;
  [key: string]: unknown;
}

/**
 * Attempts to persist scan results to the database and returns the audit ID if successful.
 */
async function persistScanResults(
  scanResults: ModelAuditScanResults,
  jsonOutput: string,
  resolvedPaths: string[],
  paths: string[],
  options: ScanPersistOptions,
): Promise<string | undefined> {
  try {
    const audit = await ModelAudit.create({
      name: options.name || `API scan ${new Date().toISOString()}`,
      author: options.author ?? undefined,
      modelPath: resolvedPaths.join(', '),
      results: {
        ...scanResults,
        rawOutput: jsonOutput,
      },
      metadata: {
        paths: resolvedPaths,
        originalPaths: paths,
        options: {
          blacklist: options.blacklist,
          timeout: options.timeout,
          maxFileSize: options.maxFileSize,
          maxTotalSize: options.maxTotalSize,
          verbose: options.verbose,
        },
      },
    });
    logger.info(`Model scan results saved to database with ID: ${audit.id}`);
    return audit.id;
  } catch (dbError) {
    logger.error(`Failed to save scan results to database: ${dbError}`);
    return undefined;
  }
}

// Run model scan
modelAuditRouter.post('/scan', async (req: Request, res: Response): Promise<void> => {
  const bodyResult = ModelAuditSchemas.Scan.Request.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: z.prettifyError(bodyResult.error) });
    return;
  }

  try {
    const { paths, options } = bodyResult.data;

    // Check if modelaudit is installed
    const { installed } = await checkModelAuditInstalled();
    if (!installed) {
      res.status(400).json({
        error: 'ModelAudit is not installed. Please install it using: pip install modelaudit',
      });
      return;
    }

    // Resolve paths to absolute paths
    const resolvedPaths: string[] = [];
    for (const inputPath of paths) {
      // Skip empty paths
      if (!inputPath || inputPath.trim() === '') {
        continue;
      }

      // Handle home directory expansion
      let expandedPath = inputPath;
      if (expandedPath.startsWith('~/')) {
        expandedPath = path.join(os.homedir(), expandedPath.slice(2));
      }

      const absolutePath = path.isAbsolute(expandedPath)
        ? expandedPath
        : path.resolve(process.cwd(), expandedPath);

      // Check if path exists
      if (!fs.existsSync(absolutePath)) {
        res
          .status(400)
          .json({ error: `Path does not exist: ${inputPath} (resolved to: ${absolutePath})` });
        return;
      }

      resolvedPaths.push(absolutePath);
    }

    if (resolvedPaths.length === 0) {
      res.status(400).json({ error: 'No valid paths to scan' });
      return;
    }

    // Use the centralized CLI parser to build command arguments
    const { args } = parseModelAuditArgs(resolvedPaths, {
      ...options,
      // Force JSON format for API responses (required for parsing)
      format: 'json',
      // Enable verbose mode by default for better debugging information
      verbose: options.verbose !== false, // Allow explicit false to disable
      // Set default timeout to 1 hour for large model scans
      timeout: options.timeout || 3600,
      // Note: We handle persistence ourselves in this server route
    });

    logger.info(`Running model scan on: ${resolvedPaths.join(', ')}`);

    // Default to persisting results unless explicitly disabled
    const persist = options.persist !== false;

    // Track the scan
    telemetry.record('webui_api', {
      event: 'model_scan',
      pathCount: paths.length,
      hasBlacklist: (options.blacklist?.length ?? 0) > 0,
      timeout: options.timeout ?? 0,
      verbose: options.verbose ?? false,
      persist,
    });

    // Run the scan
    const modelAudit = spawn('modelaudit', args);
    let stdout = '';
    let stderr = '';
    let responded = false; // Prevent double-response

    // Helper to safely send response (prevents double-response if both error and close fire)
    const safeRespond = (statusCode: number, body: object) => {
      if (responded) {
        return;
      }
      responded = true;
      res.status(statusCode).json(body);
    };

    // Clean up child process if client disconnects
    const cleanup = () => {
      if (!modelAudit.killed) {
        logger.debug('Client disconnected, killing modelaudit process');
        modelAudit.kill('SIGTERM');
      }
    };

    // Handle client disconnect (request abort)
    req.on('close', () => {
      if (!responded) {
        cleanup();
      }
    });

    modelAudit.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    modelAudit.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    modelAudit.on('error', (error) => {
      logger.error(`Failed to start modelaudit: ${error.message}`);

      let errorMessage = 'Failed to start model scan';
      let suggestion = 'Make sure Python and modelaudit are installed and available in your PATH.';

      if (error.message.includes('ENOENT') || error.message.includes('not found')) {
        errorMessage = 'ModelAudit command not found';
        suggestion = 'Install modelaudit using: pip install modelaudit';
      } else if (error.message.includes('EACCES')) {
        errorMessage = 'Permission denied when trying to execute modelaudit';
        suggestion = 'Check that modelaudit is executable and you have the necessary permissions';
      }

      safeRespond(500, {
        error: errorMessage,
        originalError: error.message,
        suggestion: suggestion,
        debug: {
          command: 'modelaudit',
          args: args,
          paths: resolvedPaths,
          cwd: process.cwd(),
        },
      });
    });

    modelAudit.on('close', async (code) => {
      // If client already disconnected, don't process results
      if (responded) {
        return;
      }

      const debugInfo = { command: 'modelaudit', args, paths: resolvedPaths, cwd: process.cwd() };

      // ModelAudit returns exit code 1 when it finds issues, which is expected
      if (code !== null && code !== 0 && code !== 1) {
        logger.error(`Model scan process exited with code ${code}`);
        const { message, details } = parseStderrError(stderr, code);
        safeRespond(500, {
          error: message,
          exitCode: code,
          stderr: stderr || undefined,
          stdout: stdout || undefined,
          ...details,
          debug: debugInfo,
        });
        return;
      }

      try {
        const jsonOutput = stdout.trim();
        if (!jsonOutput) {
          safeRespond(500, {
            error: 'No output received from model scan',
            stderr: stderr || undefined,
            suggestion:
              'The scan may have failed silently. Check that the model files are valid and accessible.',
            debug: { ...debugInfo, exitCode: code },
          });
          return;
        }

        let scanResults: ModelAuditScanResults;
        try {
          scanResults = JSON.parse(jsonOutput);
        } catch (parseError) {
          logger.error(`Failed to parse model scan output: ${parseError}`);
          safeRespond(500, {
            error: 'Failed to parse scan results - invalid JSON output',
            parseError: String(parseError),
            output: jsonOutput.substring(0, 1000),
            stderr: stderr || undefined,
            suggestion:
              'The model scan may have produced invalid output. Check the raw output for error messages.',
            debug: { ...debugInfo, exitCode: code },
          });
          return;
        }

        // Persist to database by default
        const auditId = persist
          ? await persistScanResults(scanResults, jsonOutput, resolvedPaths, paths, options)
          : undefined;

        // Return the scan results along with audit ID if saved
        safeRespond(200, {
          ...scanResults,
          rawOutput: jsonOutput,
          ...(auditId && { auditId }),
          persisted: persist && !!auditId,
        });
      } catch (error) {
        logger.error(`Error processing model scan results: ${error}`);
        safeRespond(500, {
          error: 'Error processing scan results',
          details: String(error),
        });
      }
    });
  } catch (error) {
    logger.error(`Error in model scan endpoint: ${error}`);
    res.status(500).json({ error: String(error) });
  }
});

// Get all model scans with pagination support
modelAuditRouter.get('/scans', async (req: Request, res: Response): Promise<void> => {
  const queryResult = ModelAuditSchemas.ListScans.Query.safeParse(req.query);
  if (!queryResult.success) {
    res.status(400).json({ error: z.prettifyError(queryResult.error) });
    return;
  }

  try {
    const { limit, offset, sort, order, search } = queryResult.data;

    const audits = await ModelAudit.getMany(limit, offset, sort, order, search);
    const total = await ModelAudit.count(search);

    res.json(
      ModelAuditSchemas.ListScans.Response.parse({
        scans: audits.map((audit) => audit.toJSON()),
        total,
        limit,
        offset,
      }),
    );
  } catch (error) {
    logger.error(`Error fetching model audits: ${error}`);
    res.status(500).json({ error: String(error) });
  }
});

// IMPORTANT: /scans/latest must be defined BEFORE /scans/:id to prevent
// "latest" from being matched as an :id parameter
// Get the latest/most recent model scan
modelAuditRouter.get('/scans/latest', async (_req: Request, res: Response): Promise<void> => {
  try {
    const audits = await ModelAudit.getMany(1, 0, 'createdAt', 'desc');

    if (audits.length === 0) {
      res.status(404).json({ error: 'No scans found' });
      return;
    }

    res.json(ModelAuditSchemas.GetLatestScan.Response.parse(audits[0].toJSON()));
  } catch (error) {
    logger.error(`Error fetching latest model audit: ${error}`);
    res.status(500).json({ error: String(error) });
  }
});

// Get specific model scan by ID (must be after /scans/latest)
modelAuditRouter.get('/scans/:id', async (req: Request, res: Response): Promise<void> => {
  const paramsResult = ModelAuditSchemas.GetScan.Params.safeParse(req.params);
  if (!paramsResult.success) {
    res.status(400).json({ error: z.prettifyError(paramsResult.error) });
    return;
  }

  try {
    const audit = await ModelAudit.findById(paramsResult.data.id);

    if (!audit) {
      res.status(404).json({ error: 'Model scan not found' });
      return;
    }

    res.json(ModelAuditSchemas.GetScan.Response.parse(audit.toJSON()));
  } catch (error) {
    logger.error(`Error fetching model audit: ${error}`);
    res.status(500).json({ error: String(error) });
  }
});

// Delete model scan
modelAuditRouter.delete('/scans/:id', async (req: Request, res: Response): Promise<void> => {
  const paramsResult = ModelAuditSchemas.DeleteScan.Params.safeParse(req.params);
  if (!paramsResult.success) {
    res.status(400).json({ error: z.prettifyError(paramsResult.error) });
    return;
  }

  try {
    const audit = await ModelAudit.findById(paramsResult.data.id);

    if (!audit) {
      res.status(404).json({ error: 'Model scan not found' });
      return;
    }

    await audit.delete();
    res.json(
      ModelAuditSchemas.DeleteScan.Response.parse({
        success: true,
        message: 'Model scan deleted successfully',
      }),
    );
  } catch (error) {
    logger.error(`Error deleting model audit: ${error}`);
    res.status(500).json({ error: String(error) });
  }
});
