import { spawn } from 'child_process';

import chalk from 'chalk';
import { getAuthor } from '../globalConfig/accounts';
import logger from '../logger';
import ModelAudit from '../models/modelAudit';
import { checkModelAuditUpdates } from '../updates';
import type { Command } from 'commander';

import type { ModelAuditScanResults } from '../types/modelAudit';

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
    .option('--registry-uri <uri>', 'MLflow registry URI (only used for MLflow model URIs)')

    // Output configuration
    .option('-o, --output <path>', 'Output file path (prints to stdout if not specified)')
    .option('-f, --format <format>', 'Output format (text, json)', 'text')
    .option('--sbom <path>', 'Write CycloneDX SBOM to the specified file')
    .option('--no-write', 'Do not write results to database')
    .option('--name <name>', 'Name for the audit (when saving to database)')

    // Execution control
    .option('-t, --timeout <seconds>', 'Scan timeout in seconds', '300')
    .option('--max-file-size <bytes>', 'Maximum file size to scan in bytes (0 for unlimited)', '0')
    .option(
      '--max-total-size <bytes>',
      'Maximum total bytes to scan before stopping (0 for unlimited)',
      '0',
    )

    // Cloud storage options
    .option(
      '--jfrog-api-token <token>',
      'JFrog API token for authentication (can also use JFROG_API_TOKEN env var)',
    )
    .option(
      '--jfrog-access-token <token>',
      'JFrog access token for authentication (can also use JFROG_ACCESS_TOKEN env var)',
    )
    .option(
      '--max-download-size <size>',
      'Maximum download size for cloud storage (e.g., 500MB, 2GB)',
    )
    .option('--no-cache', 'Do not use cache for downloaded cloud storage files')
    .option(
      '--cache-dir <path>',
      'Directory for caching downloaded files (default: ~/.modelaudit/cache)',
    )
    .option('--preview', 'Preview what would be downloaded without actually downloading')
    .option('--all-files', 'Download all files from directories (default: selective)')
    .option('--stream', 'Use streaming analysis for large cloud files (experimental)')

    // Scanning behavior
    .option('--skip-files', 'Skip non-model file types during directory scans')
    .option('--strict-license', 'Fail scan when incompatible or deprecated licenses are detected')
    .option('--no-large-model-support', 'Disable optimized scanning for large models (≈10GB+)')

    // Progress reporting
    .option('--no-progress', 'Disable progress reporting for large model scans')
    .option('--progress-log <path>', 'Write progress information to log file')
    .option('--progress-format <format>', 'Progress display format (tqdm, simple, json)', 'tqdm')
    .option('--progress-interval <seconds>', 'Progress update interval in seconds', '2.0')

    // Miscellaneous
    .option('-v, --verbose', 'Enable verbose output')

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

      // When saving to database (default), always use JSON format internally
      const saveToDatabase = options.write !== false;
      const outputFormat = saveToDatabase ? 'json' : options.format || 'text';
      args.push('--format', outputFormat);

      if (options.output && !saveToDatabase) {
        args.push('--output', options.output);
      }

      if (options.sbom) {
        args.push('--sbom', options.sbom);
      }

      if (options.timeout) {
        args.push('--timeout', options.timeout);
      }

      if (options.verbose) {
        args.push('--verbose');
      }

      if (options.maxFileSize && options.maxFileSize !== '0') {
        args.push('--max-file-size', options.maxFileSize);
      }

      if (options.maxTotalSize && options.maxTotalSize !== '0') {
        args.push('--max-total-size', options.maxTotalSize);
      }

      // Cloud storage options
      if (options.registryUri) {
        args.push('--registry-uri', options.registryUri);
      }

      if (options.jfrogApiToken) {
        args.push('--jfrog-api-token', options.jfrogApiToken);
      }

      if (options.jfrogAccessToken) {
        args.push('--jfrog-access-token', options.jfrogAccessToken);
      }

      if (options.maxDownloadSize) {
        args.push('--max-download-size', options.maxDownloadSize);
      }

      if (options.cache === false) {
        args.push('--no-cache');
      }

      if (options.cacheDir) {
        args.push('--cache-dir', options.cacheDir);
      }

      if (options.preview) {
        args.push('--preview');
      }

      if (options.allFiles) {
        args.push('--all-files');
      } else {
        args.push('--selective');
      }

      if (options.stream) {
        args.push('--stream');
      }

      // Scanning behavior
      if (options.skipFiles) {
        args.push('--skip-files');
      } else {
        args.push('--no-skip-files');
      }

      if (options.strictLicense) {
        args.push('--strict-license');
      }

      if (options.largeModelSupport === false) {
        args.push('--no-large-model-support');
      }

      // Progress reporting
      if (options.progress === false) {
        args.push('--no-progress');
      }

      if (options.progressLog) {
        args.push('--progress-log', options.progressLog);
      }

      if (options.progressFormat) {
        args.push('--progress-format', options.progressFormat);
      }

      if (options.progressInterval) {
        args.push('--progress-interval', options.progressInterval);
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
                  timeout: options.timeout,
                  maxFileSize: options.maxFileSize,
                  maxTotalSize: options.maxTotalSize,
                  verbose: options.verbose,
                  sbom: options.sbom,
                  registryUri: options.registryUri,
                  jfrogApiToken: options.jfrogApiToken ? '***' : undefined, // Mask sensitive data
                  jfrogAccessToken: options.jfrogAccessToken ? '***' : undefined, // Mask sensitive data
                  maxDownloadSize: options.maxDownloadSize,
                  cache: options.cache,
                  cacheDir: options.cacheDir,
                  preview: options.preview,
                  allFiles: options.allFiles,
                  stream: options.stream,
                  skipFiles: options.skipFiles,
                  strictLicense: options.strictLicense,
                  largeModelSupport: options.largeModelSupport,
                  progress: options.progress,
                  progressLog: options.progressLog,
                  progressFormat: options.progressFormat,
                  progressInterval: options.progressInterval,
                },
              },
            });

            // Display summary to user (unless they requested JSON format)
            if (options.format !== 'json') {
              console.log('\n' + chalk.bold('Model Audit Summary'));
              console.log('=' + '='.repeat(50));

              if (results.has_errors || (results.failed_checks ?? 0) > 0) {
                console.log(chalk.yellow(`⚠  Found ${results.failed_checks || 0} issues`));

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
                      console.log(
                        `\n${color.bold(severity.toUpperCase())} (${severityIssues.length}):`,
                      );
                      severityIssues.slice(0, 5).forEach((issue) => {
                        console.log(`  • ${issue.message}`);
                        if (issue.location) {
                          console.log(`    ${chalk.gray(issue.location)}`);
                        }
                      });
                      if (severityIssues.length > 5) {
                        console.log(`  ${chalk.gray(`... and ${severityIssues.length - 5} more`)}`);
                      }
                    }
                  });
                }
              } else {
                console.log(
                  chalk.green(`✓ No issues found. ${results.passed_checks || 0} checks passed.`),
                );
              }

              console.log(
                `\nScanned ${results.files_scanned ?? 0} files (${(results.bytes_scanned ?? 0 / 1024 / 1024).toFixed(2)} MB)`,
              );
              console.log(`Duration: ${(results.duration ?? 0 / 1000).toFixed(2)} seconds`);
              console.log(chalk.green(`\n✓ Results saved to database with ID: ${audit.id}`));
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
            logger.debug(`Raw output: ${stdout}`);
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
