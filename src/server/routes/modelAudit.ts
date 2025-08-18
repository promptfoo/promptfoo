import { exec, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

import { Router } from 'express';
import { desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../../database';
import {
  modelAuditScansTable,
  modelAuditChecksTable,
  modelAuditIssuesTable,
  modelAuditAssetsTable,
  modelAuditScanPathsTable,
} from '../../database/tables';
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

// Helper function to save scan results to database using normalized schema
async function saveScanToDatabase(
  scanId: string,
  resolvedPaths: string[],
  options: any,
  scanResults: ModelAuditScanResults,
  description?: string,
  modelAuditVersion?: string,
): Promise<void> {
  const db = getDb();

  // Start a transaction for consistency
  await db.transaction(async (tx) => {
    // Calculate summary counts
    const criticalCount = scanResults.issues.filter(
      (i) => i.severity === 'critical' || i.severity === 'error',
    ).length;
    const warningCount = scanResults.issues.filter((i) => i.severity === 'warning').length;
    const infoCount = scanResults.issues.filter((i) => i.severity === 'info').length;

    // Insert main scan record
    await tx.insert(modelAuditScansTable).values({
      id: scanId,
      createdAt: Date.now(),
      author: getAuthor(),
      description: description || null,
      primaryPath: resolvedPaths[0],

      // Core metrics
      bytesScanned: scanResults.bytes_scanned || 0,
      filesScanned: scanResults.files_scanned || 0,
      startTime: scanResults.start_time,
      duration: scanResults.duration,
      hasErrors: scanResults.has_errors || false,

      // Summary counts
      totalChecks: scanResults.total_checks || 0,
      passedChecks: scanResults.passed_checks || 0,
      failedChecks: scanResults.failed_checks || 0,
      totalIssues: scanResults.issues.length,
      criticalIssues: criticalCount,
      warningIssues: warningCount,
      infoIssues: infoCount,

      // Version tracking
      modelAuditVersion: modelAuditVersion || null,
      promptfooVersion: PROMPTFOO_VERSION,

      // Legacy support (for backward compatibility)
      results: scanResults,
      config: {
        paths: resolvedPaths,
        options: options,
      },
    });

    // Insert scan paths
    for (let i = 0; i < resolvedPaths.length; i++) {
      await tx.insert(modelAuditScanPathsTable).values({
        scanId,
        path: resolvedPaths[i],
        isPrimary: i === 0,
      });
    }

    // Insert checks
    if (scanResults.checks && scanResults.checks.length > 0) {
      for (const check of scanResults.checks) {
        await tx.insert(modelAuditChecksTable).values({
          scanId,
          name: check.name,
          status: check.status,
          message: check.message,
          location: check.location,
          severity: check.severity,
          timestamp: check.timestamp,
          details: check.details,
          why: check.why,
        });
      }
    }

    // Insert issues
    if (scanResults.issues && scanResults.issues.length > 0) {
      for (const issue of scanResults.issues) {
        await tx.insert(modelAuditIssuesTable).values({
          scanId,
          severity: issue.severity === 'critical' ? 'error' : issue.severity,
          message: issue.message,
          location: issue.location,
          timestamp: issue.timestamp,
          details: issue.details,
          why: issue.why,
        });
      }
    }

    // Insert assets
    if (scanResults.assets && scanResults.assets.length > 0) {
      for (const asset of scanResults.assets) {
        await tx.insert(modelAuditAssetsTable).values({
          scanId,
          path: asset.path,
          type: asset.type,
          size: asset.size,
          fileMetadata: scanResults.file_metadata?.[asset.path],
        });
      }
    }
  });
}

// Check if modelaudit is installed
modelAuditRouter.get('/check-installed', async (req: Request, res: Response): Promise<void> => {
  try {
    // Check if modelaudit is installed
    await execAsync('python -c "import modelaudit"');

    // Get current working directory
    const cwd = process.cwd();

    res.json({
      installed: true,
      cwd,
    });
  } catch (_error) {
    res.json({
      installed: false,
      error: 'ModelAudit is not installed. Please install it using: pip install modelaudit',
      cwd: process.cwd(),
    });
  }
});

// Check path validity
modelAuditRouter.post('/check-path', async (req: Request, res: Response): Promise<void> => {
  const { path: inputPath } = req.body;

  if (!inputPath) {
    res.status(400).json({ error: 'Path is required' });
    return;
  }

  // Define a safe root directory (project root)
  const SAFE_ROOT = process.cwd();

  try {
    // Handle home directory expansion
    let expandedPath = inputPath;
    if (expandedPath.startsWith('~/')) {
      expandedPath = path.join(os.homedir(), expandedPath.slice(2));
    }

    // Normalize and resolve the path
    const resolvedPath = path.isAbsolute(expandedPath)
      ? expandedPath
      : path.resolve(SAFE_ROOT, expandedPath);
    
    let absolutePath: string;
    try {
      absolutePath = fs.realpathSync(resolvedPath);
    } catch (err) {
      // If realpath fails, the path doesn't exist - check if the resolved path is safe first
      const normalizedPath = path.resolve(resolvedPath);
      if (!normalizedPath.startsWith(SAFE_ROOT + path.sep) && normalizedPath !== SAFE_ROOT) {
        res.status(403).json({
          exists: false,
          error: 'Access to paths outside the project root is forbidden.',
        });
        return;
      }
      res.json({
        exists: false,
        error: `Path does not exist: ${resolvedPath}`,
      });
      return;
    }

    // Ensure the resolved path is within the safe root directory
    if (!absolutePath.startsWith(SAFE_ROOT + path.sep) && absolutePath !== SAFE_ROOT) {
      res.status(403).json({
        exists: false,
        error: 'Access to paths outside the project root is forbidden.',
      });
      return;
    }

    const exists = fs.existsSync(absolutePath);
    if (!exists) {
      res.json({
        exists: false,
        error: `Path does not exist: ${absolutePath}`,
      });
      return;
    }

    const stats = fs.statSync(absolutePath);
    const isDirectory = stats.isDirectory();
    const isFile = stats.isFile();

    res.json({
      exists: true,
      absolutePath,
      isDirectory,
      isFile,
      size: stats.size,
    });
  } catch (error) {
    res.status(500).json({
      error: `Failed to check path: ${error}`,
    });
  }
});

// List model audit scans with normalized data
modelAuditRouter.get('/scans', async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate and sanitize pagination parameters
    let limit = Number(req.query.limit) || 20;
    let offset = Number(req.query.offset) || 0;

    // Ensure valid bounds
    limit = Math.max(1, Math.min(100, limit)); // Between 1 and 100
    offset = Math.max(0, offset); // Non-negative

    const db = getDb();

    // Use denormalized counts for performance
    const scans = await db
      .select({
        id: modelAuditScansTable.id,
        createdAt: modelAuditScansTable.createdAt,
        author: modelAuditScansTable.author,
        description: modelAuditScansTable.description,
        primaryPath: modelAuditScansTable.primaryPath,

        // Use pre-computed counts from main table
        issueCount: modelAuditScansTable.totalIssues,
        criticalCount: modelAuditScansTable.criticalIssues,
        warningCount: modelAuditScansTable.warningIssues,
        passedChecks: modelAuditScansTable.passedChecks,
        failedChecks: modelAuditScansTable.failedChecks,
        totalChecks: modelAuditScansTable.totalChecks,
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

// Get specific model audit scan with full normalized data
modelAuditRouter.get('/scans/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const db = getDb();

    // Get main scan record
    const scan = await db
      .select()
      .from(modelAuditScansTable)
      .where(eq(modelAuditScansTable.id, id))
      .get();

    if (!scan) {
      res.status(404).json({ error: 'Scan not found' });
      return;
    }

    // Get related data in parallel
    const [checks, issues, assets, paths] = await Promise.all([
      db.select().from(modelAuditChecksTable).where(eq(modelAuditChecksTable.scanId, id)).all(),
      db.select().from(modelAuditIssuesTable).where(eq(modelAuditIssuesTable.scanId, id)).all(),
      db.select().from(modelAuditAssetsTable).where(eq(modelAuditAssetsTable.scanId, id)).all(),
      db
        .select()
        .from(modelAuditScanPathsTable)
        .where(eq(modelAuditScanPathsTable.scanId, id))
        .all(),
    ]);

    // Build file metadata map
    const fileMetadata: Record<string, any> = {};
    for (const asset of assets) {
      if (asset.fileMetadata) {
        fileMetadata[asset.path] = asset.fileMetadata;
      }
    }

    // Reconstruct the results object for backward compatibility
    const results: ModelAuditScanResults = {
      // Core results
      bytes_scanned: scan.bytesScanned,
      issues: issues.map((issue) => ({
        severity: issue.severity as any,
        message: issue.message,
        location: issue.location || undefined,
        details: issue.details || undefined,
        why: issue.why || undefined,
        timestamp: issue.timestamp || Date.now() / 1000,
      })),
      checks: checks.map((check) => ({
        name: check.name,
        status: check.status as 'passed' | 'failed',
        message: check.message,
        location: check.location || '',
        details: check.details || undefined,
        timestamp: check.timestamp || Date.now() / 1000,
        severity: check.severity as any,
        why: check.why || undefined,
      })),

      // File information
      files_scanned: scan.filesScanned,
      assets: assets.map((asset) => ({
        path: asset.path,
        type: asset.type,
        size: asset.size,
      })),
      file_metadata: fileMetadata,

      // Summary stats
      has_errors: scan.hasErrors,
      scanner_names: [],
      start_time: scan.startTime || Date.now() / 1000,
      duration: scan.duration || 0,
      total_checks: scan.totalChecks,
      passed_checks: scan.passedChecks,
      failed_checks: scan.failedChecks,

      // Legacy fields
      path: scan.primaryPath,
      success: true,
      scannedFiles: scan.filesScanned,
    };

    res.json({
      id: scan.id,
      createdAt: scan.createdAt,
      author: scan.author,
      description: scan.description,
      primaryPath: scan.primaryPath,
      results,
      config: {
        paths: paths.map((p) => p.path),
        options: scan.config?.options || {},
      },
    });
  } catch (error) {
    logger.error(`Error getting model audit scan: ${error}`);
    res.status(500).json({ error: String(error) });
  }
});

// Delete model audit scan (cascade will handle related records)
modelAuditRouter.delete('/scans/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const db = getDb();
    const result = await db
      .delete(modelAuditScansTable)
      .where(eq(modelAuditScansTable.id, id))
      .returning();

    if (result.length === 0) {
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
            // New fields from updated modelaudit
            bytes_scanned: scanResults.bytes_scanned || 0,
            issues: mappedIssues,
            checks: scanResults.checks || [],
            files_scanned: scanResults.files_scanned || resolvedPaths.length,
            assets: scanResults.assets || [],
            file_metadata: scanResults.file_metadata || {},
            has_errors: scanResults.has_errors || false,
            scanner_names: scanResults.scanner_names || [],
            start_time: scanResults.start_time || Date.now() / 1000,
            duration: scanResults.duration || 0,
            total_checks: scanResults.total_checks || 0,
            passed_checks: scanResults.passed_checks || 0,
            failed_checks: scanResults.failed_checks || 0,

            // Legacy fields for backwards compatibility
            path: resolvedPaths[0], // Primary resolved path
            success: true,
            scannedFiles: scanResults.files_scanned || resolvedPaths.length,
            totalFiles: scanResults.files_total || resolvedPaths.length,
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
                timestamp: Date.now() / 1000,
              });
            } else if (errorMatch) {
              issues.push({
                severity: 'error' as const,
                message: errorMatch[2],
                location: errorMatch[1],
                timestamp: Date.now() / 1000,
              });
            } else if (criticalMatch) {
              // Map critical to error for frontend compatibility
              issues.push({
                severity: 'error' as const,
                message: criticalMatch[2],
                location: criticalMatch[1],
                timestamp: Date.now() / 1000,
              });
            } else if (infoMatch) {
              issues.push({
                severity: 'info' as const,
                message: infoMatch[2],
                location: infoMatch[1],
                timestamp: Date.now() / 1000,
              });
            } else if (line.includes(' - WARNING - ')) {
              // Fallback for other warning formats
              const parts = line.split(' - WARNING - ');
              if (parts[1]) {
                issues.push({
                  severity: 'warning' as const,
                  message: parts[1],
                  timestamp: Date.now() / 1000,
                });
              }
            } else if (line.includes(' - ERROR - ')) {
              // Fallback for other error formats
              const parts = line.split(' - ERROR - ');
              if (parts[1]) {
                issues.push({
                  severity: 'error' as const,
                  message: parts[1],
                  timestamp: Date.now() / 1000,
                });
              }
            } else if (line.includes(' - CRITICAL - ')) {
              // Fallback for other critical formats - map to error
              const parts = line.split(' - CRITICAL - ');
              if (parts[1]) {
                issues.push({
                  severity: 'error' as const,
                  message: parts[1],
                  timestamp: Date.now() / 1000,
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
            // New fields (with defaults for text parsing)
            bytes_scanned: 0,
            issues,
            checks: [],
            files_scanned: scannedFilesList.length || resolvedPaths.length,
            assets: [],
            file_metadata: {},
            has_errors: issues.some((i) => i.severity === 'error'),
            scanner_names: [],
            start_time: Date.now() / 1000,
            duration: 0,
            total_checks: 0,
            passed_checks: 0,
            failed_checks: issues.length,

            // Legacy fields for backwards compatibility
            path: resolvedPaths[0],
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
            scanId = undefined;
          }

          res.json({ ...fallbackResults, scanId });
        }
      } else {
        // Unexpected exit code
        logger.error(`Model scan failed with exit code: ${code}`);
        logger.error(`stderr: ${stderr}`);
        res.status(500).json({
          error: `Model scan failed with exit code: ${code}`,
          stderr,
        });
      }
    });
  } catch (error) {
    logger.error(`Error running model scan: ${error}`);
    res.status(500).json({ error: String(error) });
  }
});
