import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { Router } from 'express';
import { checkModelAuditInstalled } from '../../commands/modelScan';
import logger from '../../logger';
import ModelAudit from '../../models/modelAudit';
import telemetry from '../../telemetry';
import type { Request, Response } from 'express';

import type { ModelAuditScanResults } from '../../types/modelAudit';

export const modelAuditRouter = Router();

// Check if modelaudit is installed
modelAuditRouter.get('/check-installed', async (req: Request, res: Response): Promise<void> => {
  try {
    // First try to check if the modelaudit CLI is available
    const installed = await checkModelAuditInstalled();
    res.json({ installed, cwd: process.cwd() });
  } catch {
    res.json({ installed: false, cwd: process.cwd() });
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
    const { paths, options } = req.body;

    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      res.status(400).json({ error: 'No paths provided' });
      return;
    }

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

    // Build command arguments
    const args = ['scan'];

    // Add resolved paths
    args.push(...resolvedPaths);

    // Add options
    if (options.blacklist && Array.isArray(options.blacklist)) {
      options.blacklist.forEach((pattern: string) => {
        args.push('--blacklist', pattern);
      });
    }

    // Always use JSON format for API responses
    args.push('--format', 'json');

    if (options.timeout) {
      args.push('--timeout', String(options.timeout));
    }

    if (options.maxFileSize) {
      args.push('--max-file-size', String(options.maxFileSize));
    }

    if (options.maxTotalSize) {
      args.push('--max-total-size', String(options.maxTotalSize));
    }

    if (options.verbose) {
      args.push('--verbose');
    }

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

    modelAudit.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    modelAudit.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    modelAudit.on('error', (error) => {
      logger.error(`Failed to start modelaudit: ${error.message}`);
      res.status(500).json({
        error: 'Failed to start model scan. Make sure Python and modelaudit are installed.',
      });
    });

    modelAudit.on('close', async (code) => {
      // ModelAudit returns exit code 1 when it finds issues, which is expected
      if (code !== null && code !== 0 && code !== 1) {
        logger.error(`Model scan process exited with code ${code}`);
        res.status(500).json({
          error: `Model scan failed with exit code ${code}`,
          stderr: stderr || undefined,
        });
        return;
      }

      try {
        const jsonOutput = stdout.trim();
        if (!jsonOutput) {
          res.status(500).json({
            error: 'No output received from model scan',
            stderr: stderr || undefined,
          });
          return;
        }

        let scanResults: ModelAuditScanResults;
        try {
          scanResults = JSON.parse(jsonOutput);
        } catch (parseError) {
          logger.error(`Failed to parse model scan output: ${parseError}`);
          res.status(500).json({
            error: 'Failed to parse scan results',
            output: jsonOutput.substring(0, 500), // Include first 500 chars for debugging
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
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    const audits = await ModelAudit.getMany(limit);

    res.json({
      scans: audits.map((audit) => audit.toJSON()),
      total: audits.length,
    });
  } catch (error) {
    logger.error(`Error fetching model audits: ${error}`);
    res.status(500).json({ error: String(error) });
  }
});

// Get specific model scan by ID
modelAuditRouter.get('/scans/:id', async (req: Request, res: Response): Promise<void> => {
  try {
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
    const audit = await ModelAudit.findById(req.params.id);

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
