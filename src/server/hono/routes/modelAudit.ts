import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { Hono } from 'hono';

import { checkModelAuditInstalled } from '../../../commands/modelScan';
import logger from '../../../logger';
import ModelAudit from '../../../models/modelAudit';
import telemetry from '../../../telemetry';
import { parseModelAuditArgs } from '../../../util/modelAuditCliParser';

import type { ModelAuditScanResults } from '../../../types/modelAudit';

export const modelAuditRouter = new Hono();

// Check if modelaudit is installed
modelAuditRouter.get('/check-installed', async (c) => {
  try {
    const { installed, version } = await checkModelAuditInstalled();
    return c.json({ installed, version, cwd: process.cwd() });
  } catch {
    return c.json({ installed: false, version: null, cwd: process.cwd() });
  }
});

// Check path type
modelAuditRouter.post('/check-path', async (c) => {
  try {
    const { path: inputPath } = await c.req.json();

    if (!inputPath) {
      return c.json({ error: 'No path provided' }, 400);
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
      return c.json({ exists: false, type: null });
    }

    // Get path stats
    const stats = fs.statSync(absolutePath);
    const type = stats.isDirectory() ? 'directory' : 'file';

    return c.json({
      exists: true,
      type,
      absolutePath,
      name: path.basename(absolutePath),
    });
  } catch (error) {
    logger.error(`Error checking path: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Run model scan
modelAuditRouter.post('/scan', async (c) => {
  try {
    const { paths, options = {} } = await c.req.json();

    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      return c.json({ error: 'No paths provided' }, 400);
    }

    // Check if modelaudit is installed
    const { installed } = await checkModelAuditInstalled();
    if (!installed) {
      return c.json(
        {
          error: 'ModelAudit is not installed. Please install it using: pip install modelaudit',
        },
        400,
      );
    }

    // Resolve paths to absolute paths
    const resolvedPaths: string[] = [];
    for (const inputPath of paths) {
      if (!inputPath || inputPath.trim() === '') {
        continue;
      }

      let expandedPath = inputPath;
      if (expandedPath.startsWith('~/')) {
        expandedPath = path.join(os.homedir(), expandedPath.slice(2));
      }

      const absolutePath = path.isAbsolute(expandedPath)
        ? expandedPath
        : path.resolve(process.cwd(), expandedPath);

      if (!fs.existsSync(absolutePath)) {
        return c.json(
          { error: `Path does not exist: ${inputPath} (resolved to: ${absolutePath})` },
          400,
        );
      }

      resolvedPaths.push(absolutePath);
    }

    if (resolvedPaths.length === 0) {
      return c.json({ error: 'No valid paths to scan' }, 400);
    }

    // Use the centralized CLI parser to build command arguments
    const { args } = parseModelAuditArgs(resolvedPaths, {
      ...options,
      format: 'json',
      verbose: options.verbose !== false,
      timeout: options.timeout || 3600,
    });

    logger.info(`Running model scan on: ${resolvedPaths.join(', ')}`);

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

    // Run the scan and return a promise
    return new Promise<Response>((resolve) => {
      const modelAudit = spawn('modelaudit', args);
      let stdout = '';
      let stderr = '';
      let responded = false;

      const safeRespond = (statusCode: number, body: object) => {
        if (responded) {
          return;
        }
        responded = true;
        resolve(c.json(body, statusCode as Parameters<typeof c.json>[1]));
      };

      modelAudit.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      modelAudit.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      modelAudit.on('error', (error) => {
        logger.error(`Failed to start modelaudit: ${error.message}`);

        let errorMessage = 'Failed to start model scan';
        let suggestion =
          'Make sure Python and modelaudit are installed and available in your PATH.';

        if (error.message.includes('ENOENT') || error.message.includes('not found')) {
          errorMessage = 'ModelAudit command not found';
          suggestion = 'Install modelaudit using: pip install modelaudit';
        } else if (error.message.includes('EACCES')) {
          errorMessage = 'Permission denied when trying to execute modelaudit';
          suggestion =
            'Check that modelaudit is executable and you have the necessary permissions';
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
        if (responded) {
          return;
        }

        if (code !== null && code !== 0 && code !== 1) {
          logger.error(`Model scan process exited with code ${code}`);

          let errorMessage = `Model scan failed with exit code ${code}`;
          const errorDetails: Record<string, unknown> = {};

          if (stderr) {
            const stderrLower = stderr.toLowerCase();

            if (
              stderrLower.includes('permission denied') ||
              stderrLower.includes('access denied')
            ) {
              errorMessage =
                'Permission denied: Unable to access the specified files or directories';
              errorDetails.type = 'permission_error';
              errorDetails.suggestion =
                'Check that the files exist and you have read permissions';
            } else if (
              stderrLower.includes('file not found') ||
              stderrLower.includes('no such file')
            ) {
              errorMessage = 'Files or directories not found';
              errorDetails.type = 'file_not_found';
              errorDetails.suggestion = 'Verify the file paths are correct and the files exist';
            } else if (stderrLower.includes('out of memory') || stderrLower.includes('memory')) {
              errorMessage = 'Insufficient memory to complete the scan';
              errorDetails.type = 'memory_error';
              errorDetails.suggestion =
                'Try scanning smaller files or reducing the number of files scanned at once';
            } else if (stderrLower.includes('timeout') || stderrLower.includes('timed out')) {
              errorMessage = 'Scan operation timed out';
              errorDetails.type = 'timeout_error';
              errorDetails.suggestion = 'Try increasing the timeout value or scanning fewer files';
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
              output: jsonOutput.substring(0, 1000),
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
              auditId = audit.id;
              logger.info(`Model scan results saved to database with ID: ${auditId}`);
            } catch (dbError) {
              logger.error(`Failed to save scan results to database: ${dbError}`);
            }
          }

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
    });
  } catch (error) {
    logger.error(`Error in model scan endpoint: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Valid sort fields and order values for the /scans endpoint
const VALID_SORT_FIELDS = ['createdAt', 'name', 'modelPath'] as const;
const VALID_SORT_ORDERS = ['asc', 'desc'] as const;
type SortField = (typeof VALID_SORT_FIELDS)[number];
type SortOrder = (typeof VALID_SORT_ORDERS)[number];

// Get all model scans with pagination support
modelAuditRouter.get('/scans', async (c) => {
  try {
    const limit = Math.min(Math.max(1, parseInt(c.req.query('limit') || '100')), 100);
    const offset = Math.max(0, parseInt(c.req.query('offset') || '0'));
    const sortParam = c.req.query('sort') || 'createdAt';
    const orderParam = c.req.query('order') || 'desc';
    const search = c.req.query('search');

    const sort: SortField = VALID_SORT_FIELDS.includes(sortParam as SortField)
      ? (sortParam as SortField)
      : 'createdAt';

    const order: SortOrder = VALID_SORT_ORDERS.includes(orderParam as SortOrder)
      ? (orderParam as SortOrder)
      : 'desc';

    const audits = await ModelAudit.getMany(limit, offset, sort, order, search);
    const total = await ModelAudit.count(search);

    return c.json({
      scans: audits.map((audit) => audit.toJSON()),
      total,
      limit,
      offset,
    });
  } catch (error) {
    logger.error(`Error fetching model audits: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Get the latest/most recent model scan
modelAuditRouter.get('/scans/latest', async (c) => {
  try {
    const audits = await ModelAudit.getMany(1, 0, 'createdAt', 'desc');

    if (audits.length === 0) {
      return c.json({ error: 'No scans found' }, 404);
    }

    return c.json(audits[0].toJSON());
  } catch (error) {
    logger.error(`Error fetching latest model audit: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Get specific model scan by ID (must be after /scans/latest)
modelAuditRouter.get('/scans/:id', async (c) => {
  try {
    const audit = await ModelAudit.findById(c.req.param('id'));

    if (!audit) {
      return c.json({ error: 'Model scan not found' }, 404);
    }

    return c.json(audit.toJSON());
  } catch (error) {
    logger.error(`Error fetching model audit: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Delete model scan
modelAuditRouter.delete('/scans/:id', async (c) => {
  try {
    const audit = await ModelAudit.findById(c.req.param('id'));

    if (!audit) {
      return c.json({ error: 'Model scan not found' }, 404);
    }

    await audit.delete();
    return c.json({ success: true, message: 'Model scan deleted successfully' });
  } catch (error) {
    logger.error(`Error deleting model audit: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

export default modelAuditRouter;
