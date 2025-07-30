import { exec, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

import { Router } from 'express';
import logger from '../../logger';
import telemetry from '../../telemetry';
import type { Request, Response } from 'express';

const execAsync = promisify(exec);
export const modelAuditRouter = Router();

// Check if modelaudit is installed
modelAuditRouter.get('/check-installed', async (req: Request, res: Response): Promise<void> => {
  try {
    await execAsync('python -c "import modelaudit"');
    res.json({ installed: true, cwd: process.cwd() });
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

    // Track the scan
    telemetry.record('webui_api', {
      event: 'model_scan',
      pathCount: paths.length,
      hasBlacklist: options.blacklist?.length > 0,
      timeout: options.timeout,
      verbose: options.verbose,
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

          // Map 'critical' severity to 'error' for frontend compatibility
          const mappedIssues = (scanResults.issues || []).map((issue: any) => ({
            ...issue,
            severity: issue.severity === 'critical' ? 'error' : issue.severity,
          }));

          // Extract list of scanned files from assets
          const scannedFilesList = scanResults.assets
            ? scanResults.assets.map((asset: any) => asset.path)
            : undefined;

          // Transform the results into our expected format
          const transformedResults = {
            path: resolvedPaths[0], // Primary resolved path
            issues: mappedIssues,
            success: true,
            scannedFiles: scanResults.files_scanned || resolvedPaths.length,
            totalFiles: scanResults.files_total || resolvedPaths.length,
            duration: scanResults.scan_duration || null,
            rawOutput: stdout, // Always include raw output for debugging
            scannedFilesList,
          };

          res.json(transformedResults);
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
            const criticalMatch = line.match(/\[CRITICAL\]\s*\(([^)]+)\):\s*(.+)/);
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
            } else if (criticalMatch) {
              // Map critical to error for frontend compatibility
              issues.push({
                severity: 'error',
                message: criticalMatch[2],
                location: criticalMatch[1],
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
            } else if (line.includes(' - CRITICAL - ')) {
              // Fallback for other critical formats - map to error
              const parts = line.split(' - CRITICAL - ');
              if (parts[1]) {
                issues.push({
                  severity: 'error',
                  message: parts[1],
                });
              }
            }
          });

          // Extract scanned files from the output
          const scannedFilesList: string[] = [];
          lines.forEach((line) => {
            // Match lines like: "2025-07-29 13:43:03,616 - INFO - Scanning file: /path/to/file"
            const fileMatch = line.match(/Scanning file:\s*(.+)$/);
            if (fileMatch && fileMatch[1]) {
              scannedFilesList.push(fileMatch[1].trim());
            }
          });

          res.json({
            path: resolvedPaths[0],
            issues,
            success: true,
            scannedFiles: scannedFilesList.length || resolvedPaths.length,
            scannedFilesList: scannedFilesList.length > 0 ? scannedFilesList : undefined,
            rawOutput: stdout,
          });
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
    logger.error(`Error in model scan: ${error}`);
    res.status(500).json({ error: String(error) });
  }
});
