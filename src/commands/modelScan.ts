import { spawn } from 'child_process';

import chalk from 'chalk';
import { z } from 'zod';
import { getAuthor } from '../globalConfig/accounts';
import logger from '../logger';
import ModelAudit from '../models/modelAudit';
import { checkModelAuditUpdates, getModelAuditCurrentVersion } from '../updates';
import {
  getHuggingFaceMetadata,
  isHuggingFaceModel,
  parseHuggingFaceModel,
} from '../util/huggingfaceMetadata';
import { DEPRECATED_OPTIONS_MAP, parseModelAuditArgs } from '../util/modelAuditCliParser';
import type { Command } from 'commander';

import type { ModelAuditScanResults } from '../types/modelAudit';

/**
 * Check if modelaudit is installed and get its version.
 */
export async function checkModelAuditInstalled(): Promise<{
  installed: boolean;
  version: string | null;
}> {
  const version = await getModelAuditCurrentVersion();
  return { installed: version !== null, version };
}

/**
 * Determine if scan results contain errors.
 */
function hasErrorsInResults(results: ModelAuditScanResults): boolean {
  return Boolean(
    results.has_errors ||
      results.issues?.some((issue) => issue.severity === 'critical' || issue.severity === 'error'),
  );
}

/**
 * Determine if a model should be re-scanned based on version changes.
 */
function shouldRescan(
  existingVersion: string | null | undefined,
  currentVersion: string | null,
): boolean {
  if (!currentVersion) {
    return false;
  }
  if (!existingVersion) {
    return true; // Previous scan missing version
  }
  return existingVersion !== currentVersion; // Version changed
}

export function modelScanCommand(program: Command): void {
  program
    .command('scan-model')
    .description('Scan model files for security and quality issues')
    .argument('<paths...>', 'Model files or directories to scan')

    // Core configuration
    .option(
      '-b, --blacklist <patterns...>',
      'Additional blacklist patterns to check against model names',
    )

    // Output configuration
    .option('-o, --output <path>', 'Output file path (prints to stdout if not specified)')
    .option('-f, --format <format>', 'Output format (text, json, sarif)', 'text')
    .option('--sbom <path>', 'Write CycloneDX SBOM to the specified file')
    .option('--no-write', 'Do not write results to database')
    .option('--name <name>', 'Name for the audit (when saving to database)')

    // Execution control
    .option('-t, --timeout <seconds>', 'Scan timeout in seconds', '300')
    .option('--max-size <size>', 'Override auto-detected size limits (e.g., 10GB, 500MB)')

    // Scanning behavior
    .option(
      '--strict',
      'Strict mode: fail on warnings, scan all file types, strict license validation',
    )
    .option('--dry-run', 'Preview what would be scanned/downloaded without actually doing it')
    .option('--no-cache', 'Force disable caching (overrides smart detection)')
    .option('--quiet', 'Silence detection messages')
    .option('--progress', 'Force enable progress reporting (auto-detected by default)')
    .option('--stream', 'Scan and delete downloaded files immediately after scan')

    // Miscellaneous
    .option('-v, --verbose', 'Enable verbose output')
    .option('--force', 'Force scan even if model was already scanned')

    .action(async (paths: string[], options) => {
      if (!paths || paths.length === 0) {
        logger.error(
          'No paths specified. Please provide at least one model file or directory to scan.',
        );
        process.exit(1);
      }

      // Check for deprecated options and warn users
      const deprecatedOptionsUsed = Object.keys(options).filter((opt) => {
        const fullOption = `--${opt.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
        return DEPRECATED_OPTIONS_MAP[fullOption] !== undefined;
      });

      if (deprecatedOptionsUsed.length > 0) {
        deprecatedOptionsUsed.forEach((opt) => {
          const fullOption = `--${opt.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
          const replacement = DEPRECATED_OPTIONS_MAP[fullOption];
          if (replacement) {
            logger.warn(
              `⚠️  Warning: The '${fullOption}' option is deprecated. Please use '${replacement}' instead.`,
            );
          } else {
            // Provide specific guidance for common cases
            if (fullOption === '--jfrog-api-token') {
              logger.warn(
                `⚠️  Warning: '${fullOption}' is deprecated. Set JFROG_API_TOKEN environment variable instead.`,
              );
            } else if (fullOption === '--jfrog-access-token') {
              logger.warn(
                `⚠️  Warning: '${fullOption}' is deprecated. Set JFROG_ACCESS_TOKEN environment variable instead.`,
              );
            } else if (fullOption === '--registry-uri') {
              logger.warn(
                `⚠️  Warning: '${fullOption}' is deprecated. Set JFROG_URL or MLFLOW_TRACKING_URI environment variable instead.`,
              );
            } else {
              logger.warn(
                `⚠️  Warning: The '${fullOption}' option is deprecated and has been removed. It may be handled automatically or via environment variables. See documentation for details.`,
              );
            }
          }
        });
      }

      // Check if modelaudit is installed and get its version
      const { installed: isModelAuditInstalled, version: currentScannerVersion } =
        await checkModelAuditInstalled();
      if (!isModelAuditInstalled) {
        logger.error('ModelAudit is not installed.');
        logger.info(`Please install it using: ${chalk.green('pip install modelaudit')}`);
        logger.info('For more information, visit: https://www.promptfoo.dev/docs/model-audit/');
        process.exit(1);
      }

      // Check for modelaudit updates
      await checkModelAuditUpdates();

      if (currentScannerVersion) {
        logger.debug(`Using modelaudit version: ${currentScannerVersion}`);
      }

      // When saving to database (default), always use JSON format internally
      // Note: --no-write flag sets options.write to false
      const saveToDatabase = options.write === undefined || options.write === true;

      // Track existing audit to update (when re-scanning or using --force)
      let existingAuditToUpdate: ModelAudit | null = null;

      // Check for duplicate scans (HuggingFace models only, before download)
      // When --force is used, we still need to find existing record to update (avoid unique constraint)
      if (saveToDatabase && paths.length === 1 && isHuggingFaceModel(paths[0])) {
        try {
          const metadata = await getHuggingFaceMetadata(paths[0]);
          if (metadata) {
            const parsed = parseHuggingFaceModel(paths[0]);
            const modelId = parsed ? `${parsed.owner}/${parsed.repo}` : paths[0];
            const existing = await ModelAudit.findByRevision(modelId, metadata.sha);

            if (existing && options.force) {
              logger.debug(`Re-scanning (--force): ${modelId}`);
              existingAuditToUpdate = existing;
            } else if (existing && shouldRescan(existing.scannerVersion, currentScannerVersion)) {
              const reason = existing.scannerVersion
                ? `modelaudit upgraded from ${existing.scannerVersion} to ${currentScannerVersion}`
                : `previous scan missing version info (now using ${currentScannerVersion})`;
              logger.debug(`Re-scanning: ${reason}`);
              existingAuditToUpdate = existing;
            } else if (existing) {
              logger.info(chalk.yellow('✓ Model already scanned'));
              logger.info(`  Model: ${modelId}`);
              logger.info(`  Revision: ${metadata.sha}`);
              if (existing.scannerVersion) {
                logger.info(`  Scanner version: ${existing.scannerVersion}`);
              }
              logger.info(`  Previous scan: ${new Date(existing.createdAt).toISOString()}`);
              logger.info(`  Scan ID: ${existing.id}`);
              logger.info(
                `\n${chalk.gray('Use --force to scan anyway, or view existing results with:')}`,
              );
              logger.info(chalk.green(`  promptfoo view ${existing.id}`));
              process.exitCode = 0;
              return;
            }
          }
        } catch (error) {
          logger.debug(`Failed to check for existing scan: ${error}`);
        }
      }
      const outputFormat = saveToDatabase ? 'json' : options.format || 'text';

      // Prepare options for CLI parser, excluding output when saving to database
      // Convert string values from Commander to expected types
      const cliOptions = {
        ...options,
        format: outputFormat,
        output: options.output && !saveToDatabase ? options.output : undefined,
        timeout: options.timeout ? parseInt(options.timeout, 10) : undefined,
        stream: options.stream,
      };

      // Use centralized CLI argument parser with error handling
      let args: string[];
      try {
        const result = parseModelAuditArgs(paths, cliOptions);
        args = result.args;

        // Optional: Handle any unsupported options (though shouldn't occur with our CLI)
        if (result.unsupportedOptions.length > 0) {
          logger.warn(`Unsupported options detected: ${result.unsupportedOptions.join(', ')}`);
        }
      } catch (error) {
        if (error instanceof z.ZodError) {
          logger.error('Invalid model audit options provided:');
          error.errors.forEach((err) => {
            logger.error(`  - ${err.path.join('.')}: ${err.message}`);
          });
          process.exit(1);
        }
        throw error;
      }

      logger.info(`Running model scan on: ${paths.join(', ')}`);

      // Set up environment for delegation
      const delegationEnv = {
        ...process.env,
        PROMPTFOO_DELEGATED: 'true', // Signal to modelaudit that it's being delegated
      };

      if (saveToDatabase) {
        // When saving to database, capture output
        // Wrap in Promise to ensure we wait for the spawn to complete
        await new Promise<void>((resolve, reject) => {
          let stdout = '';
          let stderr = '';
          let settled = false; // Prevent double resolution/rejection

          const modelAudit = spawn('modelaudit', args, { env: delegationEnv });

          // Handle graceful shutdown - kill child process on SIGINT/SIGTERM
          const cleanup = () => {
            if (!modelAudit.killed) {
              modelAudit.kill('SIGTERM');
            }
          };
          process.once('SIGINT', cleanup);
          process.once('SIGTERM', cleanup);

          modelAudit.stdout?.on('data', (data) => {
            stdout += data.toString();
            // Show human-readable output to user unless format is explicitly JSON
            if (options.format !== 'json' && !options.output) {
              // Parse JSON and display summary
              try {
                JSON.parse(stdout);
                // Don't display the raw JSON, we'll show a summary at the end
              } catch {
                // If we can't parse it yet, just accumulate
              }
            } else if (options.format === 'json' && !options.output) {
              // If user explicitly requested JSON format, show it
              process.stdout.write(data);
            }
          });

          modelAudit.stderr?.on('data', (data) => {
            stderr += data.toString();
            if (options.verbose) {
              process.stderr.write(data);
            }
          });

          modelAudit.on('error', (error) => {
            // Remove signal handlers since process is done
            process.removeListener('SIGINT', cleanup);
            process.removeListener('SIGTERM', cleanup);

            if (settled) {
              return;
            }
            settled = true;

            logger.error(`Failed to start modelaudit: ${error.message}`);
            logger.info('Make sure modelaudit is installed and available in your PATH.');
            logger.info('Install it using: pip install modelaudit');
            process.exitCode = 1;
            reject(error);
          });

          modelAudit.on('close', async (code) => {
            // Remove signal handlers since process is done
            process.removeListener('SIGINT', cleanup);
            process.removeListener('SIGTERM', cleanup);

            if (settled) {
              return;
            }
            settled = true;

            if (code !== null && code !== 0 && code !== 1) {
              logger.error(`Model scan process exited with code ${code}`);
              if (stderr) {
                logger.error(`Error output: ${stderr}`);
              }
              process.exitCode = code;
              resolve();
              return;
            }

            // Parse JSON output and save to database
            try {
              const jsonOutput = stdout.trim();
              if (!jsonOutput) {
                logger.error('No output received from model scan');
                process.exitCode = 1;
                resolve();
                return;
              }

              const results: ModelAuditScanResults = JSON.parse(jsonOutput);

              // Fetch revision tracking info if HuggingFace model
              let revisionInfo: {
                modelId?: string;
                revisionSha?: string;
                contentHash?: string;
                modelSource?: string;
                sourceLastModified?: number;
              } = {};

              if (paths.length === 1) {
                const modelPath = paths[0];
                if (isHuggingFaceModel(modelPath)) {
                  try {
                    const metadata = await getHuggingFaceMetadata(modelPath);
                    if (metadata) {
                      revisionInfo = {
                        modelId: metadata.modelId,
                        revisionSha: metadata.sha,
                        modelSource: 'huggingface',
                        sourceLastModified: new Date(metadata.lastModified).getTime(),
                      };
                    }
                  } catch (error) {
                    logger.debug(`Failed to fetch revision info: ${error}`);
                  }
                }

                // Extract content_hash from modelaudit output if available
                // modelaudit generates content hash during scan for deduplication
                if (results.content_hash) {
                  logger.debug(
                    `Using content_hash from modelaudit output: ${results.content_hash}`,
                  );
                  revisionInfo.contentHash = results.content_hash;
                }
              }

              // Shared metadata for audit records
              const auditMetadata = {
                paths,
                options: {
                  blacklist: options.blacklist,
                  timeout: cliOptions.timeout,
                  maxSize: options.maxSize,
                  verbose: options.verbose,
                  sbom: options.sbom,
                  strict: options.strict,
                  dryRun: options.dryRun,
                  cache: options.cache,
                  quiet: options.quiet,
                  progress: options.progress,
                  stream: options.stream,
                },
              };

              // Create or update audit record in database
              let audit: ModelAudit;
              if (existingAuditToUpdate) {
                // Update existing record with new scan results
                existingAuditToUpdate.results = results;
                existingAuditToUpdate.checks = results.checks ?? null;
                existingAuditToUpdate.issues = results.issues ?? null;
                existingAuditToUpdate.hasErrors = hasErrorsInResults(results);
                existingAuditToUpdate.totalChecks = results.total_checks ?? null;
                existingAuditToUpdate.passedChecks = results.passed_checks ?? null;
                existingAuditToUpdate.failedChecks = results.failed_checks ?? null;
                existingAuditToUpdate.scannerVersion = currentScannerVersion ?? null;
                existingAuditToUpdate.metadata = auditMetadata;
                existingAuditToUpdate.updatedAt = Date.now();
                if (revisionInfo.contentHash) {
                  existingAuditToUpdate.contentHash = revisionInfo.contentHash;
                }
                await existingAuditToUpdate.save();
                audit = existingAuditToUpdate;
              } else {
                audit = await ModelAudit.create({
                  name: options.name || `Model scan ${new Date().toISOString()}`,
                  author: getAuthor() || undefined,
                  modelPath: paths.join(', '),
                  results,
                  metadata: auditMetadata,
                  scannerVersion: currentScannerVersion || undefined,
                  ...revisionInfo,
                });
              }

              // Display summary to user (unless they requested JSON format)
              if (options.format !== 'json') {
                logger.info('\n' + chalk.bold('Model Audit Summary'));
                logger.info('=' + '='.repeat(50));

                if (results.has_errors || (results.failed_checks ?? 0) > 0) {
                  logger.info(chalk.yellow(`⚠  Found ${results.failed_checks || 0} issues`));

                  // Show issues grouped by severity
                  if (results.issues && results.issues.length > 0) {
                    const issuesBySeverity = results.issues.reduce(
                      (acc, issue) => {
                        const severity = issue.severity || 'info';
                        if (!acc[severity]) {
                          acc[severity] = [];
                        }
                        acc[severity].push(issue);
                        return acc;
                      },
                      {} as Record<string, typeof results.issues>,
                    );

                    ['critical', 'error', 'warning', 'info'].forEach((severity) => {
                      const severityIssues = issuesBySeverity[severity];
                      if (severityIssues && severityIssues.length > 0) {
                        const color =
                          severity === 'critical' || severity === 'error'
                            ? chalk.red
                            : severity === 'warning'
                              ? chalk.yellow
                              : chalk.blue;
                        logger.info(
                          `\n${color.bold(severity.toUpperCase())} (${severityIssues.length}):`,
                        );
                        severityIssues.slice(0, 5).forEach((issue) => {
                          logger.info(`  • ${issue.message}`);
                          if (issue.location) {
                            logger.info(`    ${chalk.gray(issue.location)}`);
                          }
                        });
                        if (severityIssues.length > 5) {
                          logger.info(
                            `  ${chalk.gray(`... and ${severityIssues.length - 5} more`)}`,
                          );
                        }
                      }
                    });
                  }
                } else {
                  logger.info(
                    chalk.green(`✓ No issues found. ${results.passed_checks || 0} checks passed.`),
                  );
                }

                logger.info(
                  `\nScanned ${results.files_scanned ?? 0} files (${((results.bytes_scanned ?? 0) / 1024 / 1024).toFixed(2)} MB)`,
                );
                logger.info(`Duration: ${((results.duration ?? 0) / 1000).toFixed(2)} seconds`);
                if (currentScannerVersion) {
                  logger.debug(`Scanner version: ${currentScannerVersion}`);
                }
                if (existingAuditToUpdate) {
                  logger.debug(`Updated existing audit record: ${audit.id}`);
                }
                logger.info(chalk.green(`\n✓ Results saved to database with ID: ${audit.id}`));
              }

              // Save to file if requested
              if (options.output) {
                const fs = await import('fs');
                fs.writeFileSync(options.output, JSON.stringify(results, null, 2));
                logger.info(`Results also saved to ${options.output}`);
              }

              process.exitCode = code || 0;
              resolve();
            } catch (error) {
              logger.error(`Failed to parse or save scan results: ${error}`);
              if (options.verbose) {
                logger.error(`Raw output: ${stdout}`);
              }
              process.exitCode = 1;
              resolve();
            }
          });
        });
      } else {
        // Wrap in Promise to ensure we wait for the spawn to complete
        await new Promise<void>((resolve, reject) => {
          let settled = false; // Prevent double resolution/rejection

          const modelAudit = spawn('modelaudit', args, { stdio: 'inherit', env: delegationEnv });

          // Handle graceful shutdown - kill child process on SIGINT/SIGTERM
          const cleanup = () => {
            if (!modelAudit.killed) {
              modelAudit.kill('SIGTERM');
            }
          };
          process.once('SIGINT', cleanup);
          process.once('SIGTERM', cleanup);

          modelAudit.on('error', (error) => {
            // Remove signal handlers since process is done
            process.removeListener('SIGINT', cleanup);
            process.removeListener('SIGTERM', cleanup);

            if (settled) {
              return;
            }
            settled = true;

            logger.error(`Failed to start modelaudit: ${error.message}`);
            logger.info('Make sure modelaudit is installed and available in your PATH.');
            logger.info('Install it using: pip install modelaudit');
            process.exitCode = 1;
            reject(error);
          });

          modelAudit.on('close', (code) => {
            // Remove signal handlers since process is done
            process.removeListener('SIGINT', cleanup);
            process.removeListener('SIGTERM', cleanup);

            if (settled) {
              return;
            }
            settled = true;
            if (code !== null && code !== 0 && code !== 1) {
              logger.error(`Model scan process exited with code ${code}`);
            }
            process.exitCode = code || 0;
            resolve();
          });
        });
      }
    });
}
