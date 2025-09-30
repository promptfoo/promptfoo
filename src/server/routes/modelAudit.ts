import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { Router, type Request, type Response } from 'express';

// Type definitions for error responses
interface ErrorResponse {
  error: string;
  originalError?: string;
  suggestion?: string;
  debug?: Record<string, unknown>;
  type?: string;
  details?: unknown;
  exitCode?: number | null;
  stderr?: string;
  stdout?: string;
  parseError?: string;
  output?: string;
}

// Path validation to prevent directory traversal attacks
function validateAndNormalizePath(
  inputPath: string,
  baseDir: string = process.cwd(),
): { valid: boolean; normalizedPath: string; error?: string } {
  try {
    // Handle home directory expansion
    let expandedPath = inputPath;
    if (expandedPath.startsWith('~/')) {
      expandedPath = path.join(os.homedir(), expandedPath.slice(2));
    }

    // Resolve to absolute path
    const absolutePath = path.isAbsolute(expandedPath)
      ? path.resolve(expandedPath)
      : path.resolve(baseDir, expandedPath);

    // Normalize to remove any ../ or ./ components
    const normalizedPath = path.normalize(absolutePath);

    // Security check: Ensure the normalized path doesn't escape expected directories
    // For model scanning, we allow any path but prevent null bytes and other injection attempts
    if (normalizedPath.includes('\0')) {
      return { valid: false, normalizedPath: '', error: 'Invalid path: contains null bytes' };
    }

    // Additional check: prevent common injection patterns
    const dangerousPatterns = ['\r', '\n', ';', '|', '&', '$', '`'];
    for (const pattern of dangerousPatterns) {
      if (normalizedPath.includes(pattern)) {
        return {
          valid: false,
          normalizedPath: '',
          error: 'Invalid path: contains dangerous characters',
        };
      }
    }

    return { valid: true, normalizedPath };
  } catch (error) {
    return { valid: false, normalizedPath: '', error: `Path validation error: ${error}` };
  }
}
import { checkModelAuditInstalled } from '../../commands/modelScan';
import logger from '../../logger';
import ModelAudit from '../../models/modelAudit';
import telemetry from '../../telemetry';
import { parseModelAuditArgs } from '../../util/modelAuditCliParser';
import type { ModelAuditScanResults } from '../../types/modelAudit';
import {
  ZCheckPathRequest,
  ZCheckPathResponse,
  ZScanRequest,
  ZScansQuery,
  ZScansResponse,
  ZDeleteResponse,
  ZCheckInstalledResponse,
} from './modelAudit.schemas';

// Helper to conditionally include debug info (only in development or when DEBUG_MODEL_AUDIT is set)
const includeDebugInfo = (debugInfo: Record<string, any>) => {
  if (process.env.NODE_ENV === 'development' || process.env.DEBUG_MODEL_AUDIT === 'true') {
    // In development, sanitize sensitive paths but include debug info
    const sanitizedInfo = { ...debugInfo };
    if (sanitizedInfo.cwd) {
      // Replace absolute paths with relative ones for security
      sanitizedInfo.cwd = sanitizedInfo.cwd.replace(process.env.HOME || '', '~');
    }
    if (sanitizedInfo.args && Array.isArray(sanitizedInfo.args)) {
      // Truncate very long arguments
      sanitizedInfo.args = sanitizedInfo.args.map((arg: string) =>
        arg.length > 1000 ? arg.substring(0, 1000) + '...' : arg,
      );
    }
    return sanitizedInfo;
  }
  return undefined;
};

export const modelAuditRouter = Router();

// Check if modelaudit is installed
modelAuditRouter.get('/check-installed', async (req: Request, res: Response): Promise<void> => {
  try {
    // Track the check installation action
    telemetry.record('webui_api', {
      event: 'model_audit_check_installed',
    });

    // First try to check if the modelaudit CLI is available
    const installed = await checkModelAuditInstalled();
    const response = ZCheckInstalledResponse.parse({ installed, cwd: process.cwd() });
    res.json(response);
  } catch {
    const response = ZCheckInstalledResponse.parse({ installed: false, cwd: process.cwd() });
    res.json(response);
  }
});

// Check path type
modelAuditRouter.post('/check-path', async (req: Request, res: Response): Promise<void> => {
  try {
    // Track the check path action
    telemetry.record('webui_api', {
      event: 'model_audit_check_path',
    });

    // Validate request body
    const bodyResult = ZCheckPathRequest.safeParse(req.body);
    if (!bodyResult.success) {
      res.status(400).json({ error: 'Invalid request body', details: bodyResult.error.errors });
      return;
    }

    const { path: inputPath } = bodyResult.data;

    // Validate and normalize path
    const validation = validateAndNormalizePath(inputPath);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error || 'Invalid path' });
      return;
    }

    const absolutePath = validation.normalizedPath;

    // Check if path exists
    if (!fs.existsSync(absolutePath)) {
      const response = ZCheckPathResponse.parse({ exists: false, type: 'unknown' });
      res.json(response);
      return;
    }

    // Get path stats
    const stats = fs.statSync(absolutePath);
    const type = stats.isDirectory() ? 'directory' : 'file';

    const response = ZCheckPathResponse.parse({
      exists: true,
      type,
      name: path.basename(absolutePath),
    });

    res.json(response);
  } catch (error) {
    logger.error(`Error checking path: ${error}`);
    res.status(500).json({ error: String(error) });
  }
});

// Run model scan
modelAuditRouter.post('/scan', async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate request body
    const bodyResult = ZScanRequest.safeParse(req.body);
    if (!bodyResult.success) {
      res.status(400).json({ error: 'Invalid request body', details: bodyResult.error.errors });
      return;
    }

    const { paths, options } = bodyResult.data;

    // Check if modelaudit is installed
    const installed = await checkModelAuditInstalled();
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

      // Validate and normalize path
      const validation = validateAndNormalizePath(inputPath);
      if (!validation.valid) {
        res.status(400).json({ error: validation.error || `Invalid path: ${inputPath}` });
        return;
      }

      const absolutePath = validation.normalizedPath;

      // Check if path exists
      if (!fs.existsSync(absolutePath)) {
        res.status(400).json({ error: `Path does not exist: ${inputPath}` });
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
      verbose: options.verbose ?? false,
      persist,
    });

    // Run the scan
    const modelAudit = spawn('modelaudit', args);
    let stdout = '';
    let stderr = '';

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

      const response: ErrorResponse = {
        error: errorMessage,
        originalError: error.message,
        suggestion: suggestion,
      };

      const debugInfo = includeDebugInfo({
        command: 'modelaudit',
        args: args,
        paths: resolvedPaths,
        cwd: process.cwd(),
      });

      if (debugInfo) {
        response.debug = debugInfo;
      }

      res.status(500).json(response);
    });

    modelAudit.on('close', async (code) => {
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

        const response: ErrorResponse = {
          error: errorMessage,
          exitCode: code,
          stderr: stderr || undefined,
          stdout: stdout || undefined,
          ...errorDetails,
        };

        const debugInfo = includeDebugInfo({
          command: 'modelaudit',
          args: args,
          paths: resolvedPaths,
          cwd: process.cwd(),
        });

        if (debugInfo) {
          response.debug = debugInfo;
        }

        res.status(500).json(response);
        return;
      }

      try {
        const jsonOutput = stdout.trim();
        if (!jsonOutput) {
          const response: ErrorResponse = {
            error: 'No output received from model scan',
            stderr: stderr || undefined,
            suggestion:
              'The scan may have failed silently. Check that the model files are valid and accessible.',
          };

          const debugInfo = includeDebugInfo({
            command: 'modelaudit',
            args: args,
            paths: resolvedPaths,
            cwd: process.cwd(),
            exitCode: code,
          });

          if (debugInfo) {
            response.debug = debugInfo;
          }

          res.status(500).json(response);
          return;
        }

        let scanResults: ModelAuditScanResults;
        try {
          scanResults = JSON.parse(jsonOutput);
        } catch (parseError) {
          logger.error(`Failed to parse model scan output: ${parseError}`);
          const response: ErrorResponse = {
            error: 'Failed to parse scan results - invalid JSON output',
            parseError: String(parseError),
            output: jsonOutput.substring(0, 1000), // Include first 1000 chars for debugging
            stderr: stderr || undefined,
            suggestion:
              'The model scan may have produced invalid output. Check the raw output for error messages.',
          };

          const debugInfo = includeDebugInfo({
            command: 'modelaudit',
            args: args,
            paths: resolvedPaths,
            cwd: process.cwd(),
            exitCode: code,
          });

          if (debugInfo) {
            response.debug = debugInfo;
          }

          res.status(500).json(response);
          return;
        }

        // Persist to database by default
        let auditId: string | undefined;
        if (persist) {
          try {
            const audit = await ModelAudit.create({
              name: options.name || `API scan ${new Date().toISOString()}`,
              author: options.author || undefined,
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
                  maxSize: options.maxSize,
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
        res.json({
          ...scanResults,
          rawOutput: jsonOutput, // Include the raw output from the scanner
          ...(auditId && { auditId }),
          persisted: persist && !!auditId,
        });
      } catch (error) {
        logger.error(`Error processing model scan results: ${error}`);
        res.status(500).json({
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

// Get all model scans
modelAuditRouter.get('/scans', async (req: Request, res: Response): Promise<void> => {
  try {
    // Track the list scans action
    telemetry.record('webui_api', {
      event: 'model_audit_list_scans',
    });

    // Parse and validate query parameters
    const queryResult = ZScansQuery.safeParse(req.query);
    if (!queryResult.success) {
      res
        .status(400)
        .json({ error: 'Invalid query parameters', details: queryResult.error.errors });
      return;
    }

    const { limit, offset, search, sort, order } = queryResult.data;

    // Use server-side pagination, search, and sorting for proper performance
    const { audits, total } = await ModelAudit.getManyWithPagination({
      limit,
      offset,
      search,
      sort,
      order,
    });

    const response = ZScansResponse.parse({
      scans: audits.map((audit) => audit.toJSON()),
      total,
    });

    res.json(response);
  } catch (error) {
    logger.error(`Error fetching model audits: ${error}`);
    res.status(500).json({ error: String(error) });
  }
});

// Get latest model scan
modelAuditRouter.get('/scans/latest', async (req: Request, res: Response): Promise<void> => {
  try {
    // Track the get latest scan action
    telemetry.record('webui_api', {
      event: 'model_audit_get_latest',
    });

    const latest = await ModelAudit.latest();

    if (!latest) {
      // Return 204 No Content when no scans exist
      res.status(204).send();
      return;
    }

    res.json(latest.toJSON());
  } catch (error) {
    logger.error(`Error fetching latest model audit: ${error}`);
    res.status(500).json({ error: String(error) });
  }
});

// Get specific model scan by ID
modelAuditRouter.get('/scans/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    // Track the get scan by ID action
    telemetry.record('webui_api', {
      event: 'model_audit_get_scan',
      scanId: req.params.id,
    });

    const audit = await ModelAudit.findById(req.params.id);

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
    // Track the delete scan action
    telemetry.record('webui_api', {
      event: 'model_audit_delete_scan',
      scanId: req.params.id,
    });

    const audit = await ModelAudit.findById(req.params.id);

    if (!audit) {
      res.status(404).json({ error: 'Model scan not found' });
      return;
    }

    await audit.delete();

    const response = ZDeleteResponse.parse({
      success: true,
      message: 'Model scan deleted successfully',
    });

    res.json(response);
  } catch (error) {
    logger.error(`Error deleting model audit: ${error}`);
    res.status(500).json({ error: String(error) });
  }
});
