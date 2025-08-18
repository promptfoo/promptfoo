import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

import chalk from 'chalk';
import { getDb } from '../database';
import {
  modelAuditScansTable,
  modelAuditChecksTable,
  modelAuditIssuesTable,
  modelAuditAssetsTable,
  modelAuditScanPathsTable,
} from '../database/tables';
import { getAuthor } from '../globalConfig/accounts';
import logger from '../logger';
import { createScanId } from '../models/modelAuditScan';
import { checkModelAuditUpdates } from '../updates';
import type { Command } from 'commander';
import type { ModelAuditIssue, ModelAuditScanResults } from '../types/modelAudit';

// Get promptfoo version from package.json
const promptfooPackage = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'),
);
const PROMPTFOO_VERSION = promptfooPackage.version;

const execAsync = promisify(exec);

export async function checkModelAuditInstalled(): Promise<boolean> {
  try {
    await execAsync('which modelaudit');
    return true;
  } catch {
    return false;
  }
}

export function modelScanCommand(program: Command): void {
  program
    .command('scan-model')
    .description('Scan ML models for security vulnerabilities')
    .argument('[paths...]', 'Paths to model files or directories to scan')
    .option(
      '-b, --blacklist <pattern>',
      'Additional blacklist patterns to check against model names',
      (val: string, acc: string[]) => [...acc, val],
      [] as string[],
    )
    .option('-f, --format <format>', 'Output format (text or json)', 'text')
    .option('-o, --output <path>', 'Output file path (prints to stdout if not specified)')
    .option(
      '-t, --timeout <seconds>',
      'Scan timeout in seconds',
      (val) => Number.parseInt(val, 10),
      300,
    )
    .option('-v, --verbose', 'Enable verbose output')
    .option('--max-file-size <bytes>', 'Maximum file size to scan in bytes')
    .option('--max-total-size <bytes>', 'Maximum total bytes to scan before stopping')
    .option('--no-write', 'Do not save scan results to database')
    .option('-d, --description <text>', 'Description for the scan')
    .action(async (paths: string[], options) => {
      if (!paths || paths.length === 0) {
        logger.error(
          'No paths specified. Please provide at least one model file or directory to scan.',
        );
        process.exit(1);
      }

      // Check if modelaudit is installed
      const isModelAuditInstalled = await checkModelAuditInstalled();
      if (!isModelAuditInstalled) {
        logger.error('ModelAudit is not installed.');
        logger.info(`Please install it using: ${chalk.green('pip install modelaudit')}`);
        logger.info('For more information, visit: https://www.promptfoo.dev/docs/model-audit/');
        process.exit(1);
      }

      // Check for modelaudit updates
      await checkModelAuditUpdates();

      const args = ['scan', ...paths];

      // Add options
      if (options.blacklist && options.blacklist.length > 0) {
        options.blacklist.forEach((pattern: string) => {
          args.push('--blacklist', pattern);
        });
      }

      // Force JSON format if writing to database
      const outputFormat = options.write !== false ? 'json' : options.format || 'text';
      args.push('--format', outputFormat);

      if (options.output) {
        args.push('--output', options.output);
      }

      if (options.timeout) {
        args.push('--timeout', options.timeout.toString());
      }

      if (options.verbose) {
        args.push('--verbose');
      }

      if (options.maxFileSize) {
        args.push('--max-file-size', options.maxFileSize);
      }

      if (options.maxTotalSize) {
        args.push('--max-total-size', options.maxTotalSize);
      }

      logger.info(`Running model scan on: ${paths.join(', ')}`);

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

      // If writing is enabled (default), capture output to save to database
      if (options.write !== false) {
        let stdout = '';

        const modelAudit = spawn('modelaudit', args);

        modelAudit.stdout.on('data', (data) => {
          stdout += data.toString();
          if (!options.output) {
            process.stdout.write(data);
          }
        });

        modelAudit.stderr.on('data', (data) => {
          process.stderr.write(data);
        });

        modelAudit.on('error', (error) => {
          logger.error(`Failed to start modelaudit: ${error.message}`);
          logger.info('Make sure modelaudit is installed and available in your PATH.');
          logger.info('Install it using: pip install modelaudit');
          process.exit(1);
        });

        modelAudit.on('close', async (code) => {
          if (code === 0 || code === 1) {
            try {
              // Parse JSON output
              const jsonMatch = stdout.match(/\{[\s\S]*\}/);
              if (!jsonMatch) {
                throw new Error('No JSON found in output');
              }

              let scanResults;
              try {
                scanResults = JSON.parse(jsonMatch[0]);
              } catch (parseErr) {
                logger.error(`Invalid JSON format in scan output: ${parseErr}`);
                throw new Error('Invalid JSON format in scan output');
              }

              // Map critical to error for consistency
              const mappedIssues = (scanResults.issues || []).map(
                (issue: ModelAuditIssue) =>
                  ({
                    ...issue,
                    severity: issue.severity === 'critical' ? 'error' : issue.severity,
                  }) as ModelAuditIssue,
              );

              // Transform results
              const transformedResults: ModelAuditScanResults = {
                // New fields from updated modelaudit
                bytes_scanned: scanResults.bytes_scanned || 0,
                issues: mappedIssues,
                checks: scanResults.checks || [],
                files_scanned: scanResults.files_scanned || paths.length,
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
                path: paths[0],
                success: true,
                scannedFiles: scanResults.files_scanned || paths.length,
                totalFiles: scanResults.files_total || paths.length,
                rawOutput: stdout,
              };

              // Save to database using normalized schema
              const db = getDb();
              const scanId = createScanId();

              // Calculate summary counts
              const criticalCount = transformedResults.issues.filter(
                (i) => i.severity === 'critical' || i.severity === 'error',
              ).length;
              const warningCount = transformedResults.issues.filter(
                (i) => i.severity === 'warning',
              ).length;
              const infoCount = transformedResults.issues.filter(
                (i) => i.severity === 'info',
              ).length;

              // Use transaction for consistency
              await db.transaction(async (tx) => {
                // Insert main scan record
                await tx.insert(modelAuditScansTable).values({
                  id: scanId,
                  createdAt: Date.now(),
                  author: getAuthor(),
                  description: options.description || null,
                  primaryPath: path.resolve(paths[0]),

                  // Core metrics
                  bytesScanned: transformedResults.bytes_scanned || 0,
                  filesScanned: transformedResults.files_scanned || 0,
                  startTime: transformedResults.start_time,
                  duration: transformedResults.duration,
                  hasErrors: transformedResults.has_errors || false,

                  // Summary counts
                  totalChecks: transformedResults.total_checks || 0,
                  passedChecks: transformedResults.passed_checks || 0,
                  failedChecks: transformedResults.failed_checks || 0,
                  totalIssues: transformedResults.issues.length,
                  criticalIssues: criticalCount,
                  warningIssues: warningCount,
                  infoIssues: infoCount,

                  // Version tracking
                  modelAuditVersion: modelAuditVersion || null,
                  promptfooVersion: PROMPTFOO_VERSION,

                  // Legacy support
                  results: transformedResults,
                  config: {
                    paths: paths.map((p) => path.resolve(p)),
                    options: {
                      blacklist: options.blacklist || [],
                      timeout: options.timeout,
                      maxFileSize: options.maxFileSize
                        ? parseInt(options.maxFileSize, 10)
                        : undefined,
                      maxTotalSize: options.maxTotalSize
                        ? parseInt(options.maxTotalSize, 10)
                        : undefined,
                      verbose: options.verbose || false,
                    },
                  },
                });

                // Insert scan paths
                for (let i = 0; i < paths.length; i++) {
                  await tx.insert(modelAuditScanPathsTable).values({
                    scanId,
                    path: path.resolve(paths[i]),
                    isPrimary: i === 0,
                  });
                }

                // Insert checks
                if (transformedResults.checks && transformedResults.checks.length > 0) {
                  for (const check of transformedResults.checks) {
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
                if (transformedResults.issues && transformedResults.issues.length > 0) {
                  for (const issue of transformedResults.issues) {
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
                if (transformedResults.assets && transformedResults.assets.length > 0) {
                  for (const asset of transformedResults.assets) {
                    await tx.insert(modelAuditAssetsTable).values({
                      scanId,
                      path: asset.path,
                      type: asset.type,
                      size: asset.size,
                      fileMetadata: transformedResults.file_metadata?.[asset.path],
                    });
                  }
                }
              });

              logger.info(`Model scan completed successfully.`);
              logger.info(chalk.green(`✓ Scan saved with ID: ${scanId}`));
            } catch (err) {
              logger.warn(`Failed to save scan results: ${err}`);
              logger.info('Model scan completed but results were not saved to database.');
            }
          } else {
            logger.error(`Model scan failed with exit code: ${code}`);
            process.exit(code || 1);
          }
        });
      } else {
        // Original behavior - just stream output
        const modelAudit = spawn('modelaudit', args, { stdio: 'inherit' });

        modelAudit.on('error', (error) => {
          logger.error(`Failed to start modelaudit: ${error.message}`);
          logger.info('Make sure modelaudit is installed and available in your PATH.');
          logger.info('Install it using: pip install modelaudit');
          process.exit(1);
        });

        modelAudit.on('close', (code) => {
          if (code === 0) {
            logger.info('Model scan completed successfully.');
          } else {
            logger.error(`Model scan completed with issues. Exit code: ${code}`);
            process.exit(code || 1);
          }
        });
      }
    });
}
