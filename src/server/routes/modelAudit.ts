import { exec } from 'child_process';
import { spawn } from 'child_process';
import { Router } from 'express';
import type { Request, Response } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { z } from 'zod';
import { fromZodError } from 'zod-validation-error';
import logger from '../../logger';
import telemetry from '../../telemetry';
import { ApiSchemas } from '../apiSchemas';

const execAsync = promisify(exec);
export const modelAuditRouter = Router();

// Check if modelaudit is installed
modelAuditRouter.get('/check-installed', async (req: Request, res: Response): Promise<void> => {
  try {
    await execAsync('python -c "import modelaudit"');
    res.json(ApiSchemas.ModelAudit.CheckInstalled.Response.parse({ installed: true, cwd: process.cwd() }));
  } catch {
    res.json(ApiSchemas.ModelAudit.CheckInstalled.Response.parse({ installed: false, cwd: process.cwd() }));
  }
});

// Check path type
modelAuditRouter.post('/check-path', async (req: Request, res: Response): Promise<void> => {
  try {
    const { path: inputPath } = ApiSchemas.ModelAudit.CheckPath.Request.parse(req.body);

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

    res.json(ApiSchemas.ModelAudit.CheckPath.Response.parse({
      exists: true,
      type,
      absolutePath,
      name: path.basename(absolutePath),
    }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: fromZodError(error).toString() });
    } else {
      logger.error(`Error checking path: ${error}`);
      res.status(500).json({ error: String(error) });
    }
  }
});

// Run model scan
modelAuditRouter.post('/scan', async (req: Request, res: Response): Promise<void> => {
  try {
    const { paths, options = {} } = ApiSchemas.ModelAudit.Scan.Request.parse(req.body);

    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      res.status(400).json({ error: 'No paths provided' });
      return;
    }

    // Check if modelaudit is installed
    try {
      await execAsync('python -c "import modelaudit"');
    } catch {
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
    if (options.exclude && Array.isArray(options.exclude)) {
      options.exclude.forEach((pattern: string) => {
        args.push('--blacklist', pattern);
      });
    }

    // Always use JSON format for API responses
    args.push('--format', 'json');

    if (options.verbose) {
      args.push('--verbose');
    }

    logger.info(`Running model scan on: ${resolvedPaths.join(', ')}`);

    // Track the scan
    telemetry.record('webui_api', {
      event: 'model_scan',
      pathCount: paths.length,
      hasExclude: (options.exclude?.length || 0) > 0,
      verbose: options.verbose || false,
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

    modelAudit.on('close', (code) => {
      // ModelAudit returns exit code 1 when it finds issues, which is expected
      if (code === 0 || code === 1) {
        try {
          // Find JSON in the output (it might be mixed with other log messages)
          const jsonMatch = stdout.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            throw new Error('No JSON found in output');
          }

          // Parse JSON output
          const scanResults = JSON.parse(jsonMatch[0]);

          // Transform the results into our expected format
          const transformedResults = {
            path: resolvedPaths[0], // Primary resolved path
            issues: scanResults.issues || [],
            success: true,
            scannedFiles: scanResults.files_scanned || resolvedPaths.length,
            totalFiles: scanResults.files_total || resolvedPaths.length,
            duration: scanResults.scan_duration || null,
            rawOutput: stdout, // Always include raw output for debugging
          };

          res.json(ApiSchemas.ModelAudit.Scan.Response.parse({
            success: true,
            results: {
              totalFiles: transformedResults.totalFiles,
              scannedFiles: transformedResults.scannedFiles,
              findings: transformedResults.issues.map((issue: any) => ({
                file: issue.location || transformedResults.path,
                severity: issue.severity === 'warning' ? 'medium' : issue.severity === 'error' ? 'high' : 'low',
                type: issue.type || 'security',
                message: issue.message,
                details: issue,
              })),
              summary: {
                critical: 0,
                high: transformedResults.issues.filter((i: any) => i.severity === 'error').length,
                medium: transformedResults.issues.filter((i: any) => i.severity === 'warning').length,
                low: transformedResults.issues.filter((i: any) => i.severity === 'info').length,
              },
            },
          }));
        } catch (parseError) {
          logger.debug(`Failed to parse JSON from stdout: ${parseError}`);
          logger.debug(`stdout: ${stdout}`);
          logger.debug(`stderr: ${stderr}`);
          // If JSON parsing fails, parse text output
          const issues: Array<{ severity: string; message: string; location?: string }> = [];

          // Parse the log format output
          const lines = stdout.split('\n');
          lines.forEach((line) => {
            // Parse lines like: "2025-06-08 20:46:58,090 - modelaudit.scanners - WARNING - [WARNING] (/path/to/file): Message"
            const warningMatch = line.match(/\[WARNING\]\s*\(([^)]+)\):\s*(.+)/);
            const errorMatch = line.match(/\[ERROR\]\s*\(([^)]+)\):\s*(.+)/);
            const infoMatch = line.match(/\[INFO\]\s*\(([^)]+)\):\s*(.+)/);

            if (warningMatch) {
              issues.push({
                severity: 'warning',
                message: warningMatch[2],
                location: warningMatch[1],
              });
            } else if (errorMatch) {
              issues.push({
                severity: 'error',
                message: errorMatch[2],
                location: errorMatch[1],
              });
            } else if (infoMatch) {
              issues.push({
                severity: 'info',
                message: infoMatch[2],
                location: infoMatch[1],
              });
            } else if (line.includes(' - WARNING - ')) {
              // Fallback for other warning formats
              const parts = line.split(' - WARNING - ');
              if (parts[1]) {
                issues.push({
                  severity: 'warning',
                  message: parts[1],
                });
              }
            } else if (line.includes(' - ERROR - ')) {
              // Fallback for other error formats
              const parts = line.split(' - ERROR - ');
              if (parts[1]) {
                issues.push({
                  severity: 'error',
                  message: parts[1],
                });
              }
            }
          });

          // Count scanned files from the output
          const scannedFiles = lines.filter(
            (line) => line.includes('Scanning file:') || line.includes('Scanning directory:'),
          ).length;

          res.json(ApiSchemas.ModelAudit.Scan.Response.parse({
            success: true,
            output: stdout,
            results: {
              totalFiles: scannedFiles || resolvedPaths.length,
              scannedFiles: scannedFiles || resolvedPaths.length,
              findings: issues.map((issue) => ({
                file: issue.location || resolvedPaths[0],
                severity: issue.severity === 'warning' ? 'medium' : issue.severity === 'error' ? 'high' : 'low',
                type: 'security',
                message: issue.message,
                details: issue,
              })),
              summary: {
                critical: 0,
                high: issues.filter(i => i.severity === 'error').length,
                medium: issues.filter(i => i.severity === 'warning').length,
                low: issues.filter(i => i.severity === 'info').length,
              },
            },
          }));
        }
      } else {
        // Only treat codes other than 0 and 1 as actual errors
        logger.error(`Model scan failed with code ${code}: ${stderr}`);
        res.status(500).json({
          error: `Model scan failed with exit code ${code}: ${stderr || stdout || 'Unknown error'}`,
          code,
        });
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: fromZodError(error).toString() });
    } else {
      logger.error(`Error in model scan: ${error}`);
      res.status(500).json({ error: String(error) });
    }
  }
});
