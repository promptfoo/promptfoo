import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { Router } from 'express';
import { checkModelAuditInstalled } from '../../commands/modelScan';
import logger from '../../logger';
import ModelAudit from '../../models/modelAudit';
import telemetry from '../../telemetry';
import { parseModelAuditArgs } from '../../util/modelAuditCliParser';
import type { Request, Response } from 'express';

import type { ModelAuditScanResults } from '../../types/modelAudit';

export const modelAuditRouter = Router();

// Check if modelaudit is installed
modelAuditRouter.get('/check-installed', async (_req: Request, res: Response): Promise<void> => {
  try {
    // First try to check if the modelaudit CLI is available
    const { installed, version } = await checkModelAuditInstalled();
    res.json({ installed, version, cwd: process.cwd() });
  } catch {
    res.json({ installed: false, version: null, cwd: process.cwd() });
  }
});

// Check path type
modelAuditRouter.post('/check-path', async (req: Request, res: Response): Promise<void> => {
  try {
    const { path: inputPath } = req.body;

    if (!inputPath) {
      res.status(400).json({ error: 'No path provided' });
      return;
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
      res.json({ exists: false, type: null });
      return;
    }

    // Get path stats
    const stats = fs.statSync(absolutePath);
    const type = stats.isDirectory() ? 'directory' : 'file';

    res.json({
      exists: true,
      type,
      absolutePath,
      name: path.basename(absolutePath),
    });
  } catch (error) {
    logger.error(`Error checking path: ${error}`);
    res.status(500).json({ error: String(error) });
  }
});

// Run model scan
modelAuditRouter.post('/scan', async (req: Request, res: Response): Promise<void> => {
  try {
    const { paths, options = {} } = req.body;

    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      res.status(400).json({ error: 'No paths provided' });
      return;
    }

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
      hasBlacklist: options.blacklist?.length > 0,
      timeout: options.timeout,
      verbose: options.verbose,
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
      // ModelAudit returns exit code 1 when it finds issues, which is expected
      if (code !== null && code !== 0 && code !== 1) {
        logger.error(`Model scan process exited with code ${code}`);

        // Provide more detailed error information to the frontend
        let errorMessage = `Model scan failed with exit code ${code}`;
        let errorDetails = {};

        // Parse stderr for common error patterns and provide helpful messages
        if (stderr) {
          const stderrLower = stderr.toLowerCase();

          if (stderrLower.includes('permission denied') || stderrLower.includes('access denied')) {
            errorMessage = 'Permission denied: Unable to access the specified files or directories';
            errorDetails = {
              type: 'permission_error',
              suggestion: 'Check that the files exist and you have read permissions',
            };
          } else if (
            stderrLower.includes('file not found') ||
            stderrLower.includes('no such file')
          ) {
            errorMessage = 'Files or directories not found';
            errorDetails = {
              type: 'file_not_found',
              suggestion: 'Verify the file paths are correct and the files exist',
            };
          } else if (stderrLower.includes('out of memory') || stderrLower.includes('memory')) {
            errorMessage = 'Insufficient memory to complete the scan';
            errorDetails = {
              type: 'memory_error',
              suggestion:
                'Try scanning smaller files or reducing the number of files scanned at once',
            };
          } else if (stderrLower.includes('timeout') || stderrLower.includes('timed out')) {
            errorMessage = 'Scan operation timed out';
            errorDetails = {
              type: 'timeout_error',
              suggestion: 'Try increasing the timeout value or scanning fewer files',
            };
          } else if (stderrLower.includes('invalid') || stderrLower.includes('malformed')) {
            errorMessage = 'Invalid or malformed model files detected';
            errorDetails = {
              type: 'invalid_model',
              suggestion: 'Ensure the files are valid model files and not corrupted',
            };
          } else if (stderrLower.includes('unsupported')) {
            errorMessage = 'Unsupported model format or file type';
            errorDetails = {
              type: 'unsupported_format',
              suggestion: 'Check the modelaudit documentation for supported file formats',
            };
          } else if (stderrLower.includes('connection') || stderrLower.includes('network')) {
            errorMessage = 'Network or connection error during scan';
            errorDetails = {
              type: 'network_error',
              suggestion:
                'Check your internet connection if the scan requires downloading external resources',
            };
          } else if (stderrLower.includes('disk space') || stderrLower.includes('no space')) {
            errorMessage = 'Insufficient disk space';
            errorDetails = {
              type: 'disk_space_error',
              suggestion: 'Free up disk space and try again',
            };
          } else if (stderrLower.includes('python') && stderrLower.includes('version')) {
            errorMessage = 'Python version compatibility issue';
            errorDetails = {
              type: 'python_version_error',
              suggestion: 'Check that you have a supported Python version installed',
            };
          } else if (
            stderrLower.includes('no such option') ||
            stderrLower.includes('unrecognized option')
          ) {
            errorMessage = 'Invalid command line option provided to modelaudit';
            errorDetails = {
              type: 'invalid_option_error',
              suggestion:
                'Check that all command line options are supported by the current modelaudit version',
            };
          } else if (stderrLower.includes('usage:') && stderrLower.includes('try')) {
            errorMessage = 'Invalid command syntax or arguments';
            errorDetails = {
              type: 'usage_error',
              suggestion:
                'Review the command arguments. The modelaudit usage help is shown in stderr.',
            };
          }
        }

        safeRespond(500, {
          error: errorMessage,
          exitCode: code,
          stderr: stderr || undefined,
          stdout: stdout || undefined,
          ...errorDetails,
          debug: {
            command: 'modelaudit',
            args: args,
            paths: resolvedPaths,
            cwd: process.cwd(),
          },
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
            debug: {
              command: 'modelaudit',
              args: args,
              paths: resolvedPaths,
              cwd: process.cwd(),
              exitCode: code,
            },
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
            output: jsonOutput.substring(0, 1000), // Include first 1000 chars for debugging
            stderr: stderr || undefined,
            suggestion:
              'The model scan may have produced invalid output. Check the raw output for error messages.',
            debug: {
              command: 'modelaudit',
              args: args,
              paths: resolvedPaths,
              cwd: process.cwd(),
              exitCode: code,
            },
          });
          return;
        }

        // Persist to database by default
        let auditId: string | undefined;
        if (persist) {
          try {
            const audit = await ModelAudit.create({
              name: options.name || `API scan ${new Date().toISOString()}`,
              author: options.author || null,
              modelPath: resolvedPaths.join(', '),
              results: {
                ...scanResults,
                rawOutput: jsonOutput, // Include raw output in persisted results
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
            auditId = audit.id;
            logger.info(`Model scan results saved to database with ID: ${auditId}`);
          } catch (dbError) {
            logger.error(`Failed to save scan results to database: ${dbError}`);
            // Continue - we'll still return the results even if DB save failed
          }
        }

        // Return the scan results along with audit ID if saved
        safeRespond(200, {
          ...scanResults,
          rawOutput: jsonOutput, // Include the raw output from the scanner
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

// Valid sort fields and order values for the /scans endpoint
const VALID_SORT_FIELDS = ['createdAt', 'name', 'modelPath'] as const;
const VALID_SORT_ORDERS = ['asc', 'desc'] as const;
type SortField = (typeof VALID_SORT_FIELDS)[number];
type SortOrder = (typeof VALID_SORT_ORDERS)[number];

// Get all model scans with pagination support
modelAuditRouter.get('/scans', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 100), 100);
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
    const sortParam = (req.query.sort as string) || 'createdAt';
    const orderParam = (req.query.order as string) || 'desc';
    const search = req.query.search as string | undefined;

    // Validate sort field against allowlist
    const sort: SortField = VALID_SORT_FIELDS.includes(sortParam as SortField)
      ? (sortParam as SortField)
      : 'createdAt';

    // Validate order against allowlist
    const order: SortOrder = VALID_SORT_ORDERS.includes(orderParam as SortOrder)
      ? (orderParam as SortOrder)
      : 'desc';

    const audits = await ModelAudit.getMany(limit, offset, sort, order, search);
    const total = await ModelAudit.count(search);

    res.json({
      scans: audits.map((audit) => audit.toJSON()),
      total,
      limit,
      offset,
    });
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

    res.json(audits[0].toJSON());
  } catch (error) {
    logger.error(`Error fetching latest model audit: ${error}`);
    res.status(500).json({ error: String(error) });
  }
});

// Get specific model scan by ID (must be after /scans/latest)
modelAuditRouter.get('/scans/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const audit = await ModelAudit.findById(req.params.id as string);

    if (!audit) {
      res.status(404).json({ error: 'Model scan not found' });
      return;
    }

    res.json(audit.toJSON());
  } catch (error) {
    logger.error(`Error fetching model audit: ${error}`);
    res.status(500).json({ error: String(error) });
  }
});

// Delete model scan
modelAuditRouter.delete('/scans/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const audit = await ModelAudit.findById(req.params.id as string);

    if (!audit) {
      res.status(404).json({ error: 'Model scan not found' });
      return;
    }

    await audit.delete();
    res.json({ success: true, message: 'Model scan deleted successfully' });
  } catch (error) {
    logger.error(`Error deleting model audit: ${error}`);
    res.status(500).json({ error: String(error) });
  }
});
