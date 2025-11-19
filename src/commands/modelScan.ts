import { spawn } from 'child_process';

import chalk from 'chalk';
import { getAuthor } from '../globalConfig/accounts';
import ModelAudit from '../models/modelAudit';
import { checkModelAuditUpdates } from '../updates';
import type { Command } from 'commander';

import type { ModelAuditScanResults } from '../types/modelAudit';
import { parseModelAuditArgs, DEPRECATED_OPTIONS_MAP } from '../util/modelAuditCliParser';
import {
  getHuggingFaceMetadata,
  isHuggingFaceModel,
  parseHuggingFaceModel,
} from '../util/huggingfaceMetadata';
import logger from '../logger';
import { z } from 'zod';

export async function checkModelAuditInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('modelaudit', ['--version']);
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0 || code === 1));
  });
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

      // When saving to database (default), always use JSON format internally
      // Note: --no-write flag sets options.write to false
      const saveToDatabase = options.write === undefined || options.write === true;

      // Check for duplicate scans (HuggingFace models only, before download)
      // Only check if saving to database and not forcing
      if (saveToDatabase && !options.force && paths.length === 1) {
        const modelPath = paths[0];
        if (isHuggingFaceModel(modelPath)) {
          try {
            const metadata = await getHuggingFaceMetadata(modelPath);
            if (metadata) {
              const parsed = parseHuggingFaceModel(modelPath);
              const modelId = parsed ? `${parsed.owner}/${parsed.repo}` : modelPath;

              // Check if already scanned with this revision
              const existing = await ModelAudit.findByRevision(modelId, metadata.sha);
              if (existing) {
                logger.info(chalk.yellow('✓ Model already scanned'));
                logger.info(`  Model: ${modelId}`);
                logger.info(`  Revision: ${metadata.sha}`);
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
            // Continue with scan if metadata fetch fails
          }
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
        let stdout = '';
        let stderr = '';

        const modelAudit = spawn('modelaudit', args, { env: delegationEnv });

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
          logger.error(`Failed to start modelaudit: ${error.message}`);
          logger.info('Make sure modelaudit is installed and available in your PATH.');
          logger.info('Install it using: pip install modelaudit');
          process.exit(1);
        });

        modelAudit.on('close', async (code) => {
          if (code !== null && code !== 0 && code !== 1) {
            logger.error(`Model scan process exited with code ${code}`);
            if (stderr) {
              logger.error(`Error output: ${stderr}`);
            }
            process.exit(code);
          }

          // Parse JSON output and save to database
          try {
            const jsonOutput = stdout.trim();
            if (!jsonOutput) {
              logger.error('No output received from model scan');
              process.exit(1);
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
                logger.debug(`Using content_hash from modelaudit output: ${results.content_hash}`);
                revisionInfo.contentHash = results.content_hash;
              }
            }

            // Create audit record in database
            const audit = await ModelAudit.create({
              name: options.name || `Model scan ${new Date().toISOString()}`,
              author: getAuthor() || undefined,
              modelPath: paths.join(', '),
              results,
              metadata: {
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
              },
              // Revision tracking
              ...revisionInfo,
            });

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
                        logger.info(`  ${chalk.gray(`... and ${severityIssues.length - 5} more`)}`);
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
              logger.info(chalk.green(`\n✓ Results saved to database with ID: ${audit.id}`));
            }

            // Save to file if requested
            if (options.output) {
              const fs = await import('fs');
              fs.writeFileSync(options.output, JSON.stringify(results, null, 2));
              logger.info(`Results also saved to ${options.output}`);
            }

            process.exit(code || 0);
          } catch (error) {
            logger.error(`Failed to parse or save scan results: ${error}`);
            if (options.verbose) {
              logger.error(`Raw output: ${stdout}`);
            }
            process.exit(1);
          }
        });
      } else {
        const modelAudit = spawn('modelaudit', args, { stdio: 'inherit', env: delegationEnv });

        modelAudit.on('error', (error) => {
          logger.error(`Failed to start modelaudit: ${error.message}`);
          logger.info('Make sure modelaudit is installed and available in your PATH.');
          logger.info('Install it using: pip install modelaudit');
          process.exit(1);
        });

        modelAudit.on('close', (code) => {
          if (code !== null && code !== 0 && code !== 1) {
            logger.error(`Model scan process exited with code ${code}`);
          }
          process.exit(code || 0);
        });
      }
    });
}
