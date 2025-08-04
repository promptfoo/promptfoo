import { exec, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

import { Router } from 'express';
import { desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../../database';
import { modelAuditScansTable } from '../../database/tables';
import { getAuthor } from '../../globalConfig/accounts';
import logger from '../../logger';
import telemetry from '../../telemetry';
import { createScanId } from '../../models/modelAuditScan';
import type { Request, Response } from 'express';
import type { ModelAuditIssue, ModelAuditScanResults } from '../../types/modelAudit';

// Get promptfoo version from package.json
const promptfooPackage = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '..', 'package.json'), 'utf8'),
);
const PROMPTFOO_VERSION = promptfooPackage.version;

const execAsync = promisify(exec);
export const modelAuditRouter = Router();

// Helper function to save scan results to database
async function saveScanToDatabase(
  scanId: string,
  resolvedPaths: string[],
  options: any,
  transformedResults: ModelAuditScanResults,
  description?: string,
  modelAuditVersion?: string,
): Promise<void> {
  const db = getDb();
  await db
    .insert(modelAuditScansTable)
    .values({
      id: scanId,
      createdAt: Date.now(),
      author: getAuthor(),
      description: description || null,
      primaryPath: resolvedPaths[0],
      results: transformedResults,
      config: {
        paths: resolvedPaths,
        options: options,
      },
      modelAuditVersion: modelAuditVersion || null,
      promptfooVersion: PROMPTFOO_VERSION,
    })
    .run();
}

// Check if modelaudit is installed
modelAuditRouter.get('/check-installed', async (req: Request, res: Response): Promise<void> => {
  try {
    // First try to check if the modelaudit CLI is available
    try {
      await execAsync('modelaudit --version');
      res.json({ installed: true, cwd: process.cwd() });
      return;
    } catch {
      // If CLI check fails, fall back to Python import check
      await execAsync('python -c "import modelaudit"');
      res.json({ installed: true, cwd: process.cwd() });
    }
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

// List model audit scans
modelAuditRouter.get('/scans', async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate and sanitize pagination parameters
    let limit = Number(req.query.limit) || 20;
    let offset = Number(req.query.offset) || 0;

    // Ensure valid bounds
    limit = Math.max(1, Math.min(100, limit)); // Between 1 and 100
    offset = Math.max(0, offset); // Non-negative

    const db = getDb();

    const scans = await db
      .select({
        id: modelAuditScansTable.id,
        createdAt: modelAuditScansTable.createdAt,
        author: modelAuditScansTable.author,
        description: modelAuditScansTable.description,
        primaryPath: modelAuditScansTable.primaryPath,
        // Extract issue counts from JSON for the list view
        issueCount: sql`json_array_length(json_extract(results, '$.issues'))`,
        criticalCount: sql`(
          SELECT COUNT(*) 
          FROM json_each(json_extract(results, '$.issues')) 
          WHERE json_extract(value, '$.severity') = 'error'
        )`,
        warningCount: sql`(
          SELECT COUNT(*) 
          FROM json_each(json_extract(results, '$.issues')) 
          WHERE json_extract(value, '$.severity') = 'warning'
        )`,
      })
      .from(modelAuditScansTable)
      .orderBy(desc(modelAuditScansTable.createdAt))
      .limit(limit)
      .offset(offset)
      .all();

    // Get total count for pagination
    const totalCount = await db.select({ count: sql`COUNT(*)` }).from(modelAuditScansTable).get();

    res.json({
      scans,
      total: totalCount?.count || 0,
      limit,
      offset,
    });
  } catch (error) {
    logger.error(`Error listing model audit scans: ${error}`);
    res.status(500).json({ error: String(error) });
  }
});

// Get specific model audit scan
modelAuditRouter.get('/scans/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Validate scan ID format
    if (!id || typeof id !== 'string' || !id.startsWith('scan-')) {
      res.status(400).json({ error: 'Invalid scan ID format' });
      return;
    }

    const db = getDb();

    const scan = await db
      .select()
      .from(modelAuditScansTable)
      .where(eq(modelAuditScansTable.id, id))
      .get();

    if (!scan) {
      res.status(404).json({ error: 'Scan not found' });
      return;
    }

    res.json(scan);
  } catch (error) {
    logger.error(`Error getting model audit scan: ${error}`);
    res.status(500).json({ error: String(error) });
  }
});

// Delete model audit scan
modelAuditRouter.delete('/scans/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Validate scan ID format
    if (!id || typeof id !== 'string' || !id.startsWith('scan-')) {
      res.status(400).json({ error: 'Invalid scan ID format' });
      return;
    }

    const db = getDb();

    const result = await db
      .delete(modelAuditScansTable)
      .where(eq(modelAuditScansTable.id, id))
      .run();

    if (result.changes === 0) {
      res.status(404).json({ error: 'Scan not found' });
      return;
    }

    logger.info(`Deleted model audit scan: ${id}`);
    res.json({ success: true });
  } catch (error) {
    logger.error(`Error deleting model audit scan: ${error}`);
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
      // First try to check if the modelaudit CLI is available
      try {
        await execAsync('modelaudit --version');
      } catch {
        // If CLI check fails, fall back to Python import check
        await execAsync('python -c "import modelaudit"');
      }
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

    // Get ModelAudit version
    let modelAuditVersion: string | undefined;
    try {
      const versionResult = await execAsync('modelaudit --version');
      const versionMatch = versionResult.stdout.match(/modelaudit(?:,)? version (\S+)/i);
      if (versionMatch) {
        modelAuditVersion = versionMatch[1];
      }
    } catch (error) {
      logger.debug(`Failed to get ModelAudit version: ${error}`);
    }

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

    modelAudit.on('close', async (code) => {
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
          const mappedIssues = (scanResults.issues || []).map(
            (issue: ModelAuditIssue) =>
              ({
                ...issue,
                severity: issue.severity === 'critical' ? 'error' : issue.severity,
              }) as ModelAuditIssue,
          );

          // Extract list of scanned files from assets
          const scannedFilesList = scanResults.assets
            ? scanResults.assets.map((asset: { path: string }) => asset.path)
            : undefined;

          // Transform the results into our expected format
          const transformedResults: ModelAuditScanResults = {
            path: resolvedPaths[0], // Primary resolved path
            issues: mappedIssues,
            success: true,
            scannedFiles: scanResults.files_scanned || resolvedPaths.length,
            totalFiles: scanResults.files_total || resolvedPaths.length,
            duration: scanResults.scan_duration || null,
            rawOutput: stdout, // Always include raw output for debugging
            scannedFilesList,
          };

          // Save scan results to database
          let scanId: string | undefined;
          try {
            scanId = createScanId();
            await saveScanToDatabase(
              scanId,
              resolvedPaths,
              options,
              transformedResults,
              req.body.description,
              modelAuditVersion,
            );
            logger.info(`Saved model audit scan with ID: ${scanId}`);
          } catch (dbError) {
            logger.error(`Failed to save scan results to database: ${dbError}`);
            scanId = undefined; // Clear scanId if save failed
            // Don't fail the request if DB save fails - user still gets results
          }

          res.json({ ...transformedResults, scanId });
        } catch (parseError) {
          logger.debug(`Failed to parse JSON from stdout: ${parseError}`);
          logger.debug(`stdout: ${stdout}`);
          logger.debug(`stderr: ${stderr}`);
          // If JSON parsing fails, parse text output
          const issues: ModelAuditIssue[] = [];

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
                severity: 'warning' as const,
                message: warningMatch[2],
                location: warningMatch[1],
              });
            } else if (errorMatch) {
              issues.push({
                severity: 'error' as const,
                message: errorMatch[2],
                location: errorMatch[1],
              });
            } else if (criticalMatch) {
              // Map critical to error for frontend compatibility
              issues.push({
                severity: 'error' as const,
                message: criticalMatch[2],
                location: criticalMatch[1],
              });
            } else if (infoMatch) {
              issues.push({
                severity: 'info' as const,
                message: infoMatch[2],
                location: infoMatch[1],
              });
            } else if (line.includes(' - WARNING - ')) {
              // Fallback for other warning formats
              const parts = line.split(' - WARNING - ');
              if (parts[1]) {
                issues.push({
                  severity: 'warning' as const,
                  message: parts[1],
                });
              }
            } else if (line.includes(' - ERROR - ')) {
              // Fallback for other error formats
              const parts = line.split(' - ERROR - ');
              if (parts[1]) {
                issues.push({
                  severity: 'error' as const,
                  message: parts[1],
                });
              }
            } else if (line.includes(' - CRITICAL - ')) {
              // Fallback for other critical formats - map to error
              const parts = line.split(' - CRITICAL - ');
              if (parts[1]) {
                issues.push({
                  severity: 'error' as const,
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

          const fallbackResults: ModelAuditScanResults = {
            path: resolvedPaths[0],
            issues,
            success: true,
            scannedFiles: scannedFilesList.length || resolvedPaths.length,
            scannedFilesList: scannedFilesList.length > 0 ? scannedFilesList : undefined,
            rawOutput: stdout,
          };

          // Save scan results to database
          let scanId: string | undefined;
          try {
            scanId = createScanId();
            await saveScanToDatabase(
              scanId,
              resolvedPaths,
              options,
              fallbackResults,
              req.body.description,
              modelAuditVersion,
            );
            logger.info(`Saved model audit scan with ID: ${scanId}`);
          } catch (dbError) {
            logger.error(`Failed to save scan results to database: ${dbError}`);
            scanId = undefined; // Clear scanId if save failed
            // Don't fail the request if DB save fails - user still gets results
          }

          res.json({ ...fallbackResults, scanId });
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
