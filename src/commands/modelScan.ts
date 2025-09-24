import { spawn } from 'child_process';

import chalk from 'chalk';
import { getAuthor } from '../globalConfig/accounts';
import ModelAudit from '../models/modelAudit';
import { checkModelAuditUpdates } from '../updates';
import type { Command } from 'commander';

import type { ModelAuditScanResults } from '../types/modelAudit';
import { parseModelAuditArgs, DEPRECATED_OPTIONS_MAP } from '../util/modelAuditCliParser';
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

    // Miscellaneous
    .option('-v, --verbose', 'Enable verbose output')

    .action(async (paths: string[], options) => {
      if (!paths || paths.length === 0) {
        console.error(
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
            console.warn(
              `⚠️  Warning: The '${fullOption}' option is deprecated. Please use '${replacement}' instead.`,
            );
          } else {
            // Provide specific guidance for common cases
            if (fullOption === '--jfrog-api-token') {
              console.warn(
                `⚠️  Warning: '${fullOption}' is deprecated. Set JFROG_API_TOKEN environment variable instead.`,
              );
            } else if (fullOption === '--jfrog-access-token') {
              console.warn(
                `⚠️  Warning: '${fullOption}' is deprecated. Set JFROG_ACCESS_TOKEN environment variable instead.`,
              );
            } else if (fullOption === '--registry-uri') {
              console.warn(
                `⚠️  Warning: '${fullOption}' is deprecated. Set JFROG_URL or MLFLOW_TRACKING_URI environment variable instead.`,
              );
            } else {
              console.warn(
                `⚠️  Warning: The '${fullOption}' option is deprecated and has been removed. It may be handled automatically or via environment variables. See documentation for details.`,
              );
            }
          }
        });
      }

      // Check if modelaudit is installed
      const isModelAuditInstalled = await checkModelAuditInstalled();
      if (!isModelAuditInstalled) {
        console.error('ModelAudit is not installed.');
        console.info(`Please install it using: ${chalk.green('pip install modelaudit')}`);
        console.info('For more information, visit: https://www.promptfoo.dev/docs/model-audit/');
        process.exit(1);
      }

      // Check for modelaudit updates
      await checkModelAuditUpdates();

      // When saving to database (default), always use JSON format internally
      // Note: --no-write flag sets options.write to false
      const saveToDatabase = options.write === undefined || options.write === true;
      const outputFormat = saveToDatabase ? 'json' : options.format || 'text';

      // Prepare options for CLI parser, excluding output when saving to database
      // Convert string values from Commander to expected types
      const cliOptions = {
        ...options,
        format: outputFormat,
        output: options.output && !saveToDatabase ? options.output : undefined,
        timeout: options.timeout ? parseInt(options.timeout, 10) : undefined,
      };

      // Use centralized CLI argument parser with error handling
      let args: string[];
      try {
        const result = parseModelAuditArgs(paths, cliOptions);
        args = result.args;

        // Optional: Handle any unsupported options (though shouldn't occur with our CLI)
        if (result.unsupportedOptions.length > 0) {
          console.warn(`Unsupported options detected: ${result.unsupportedOptions.join(', ')}`);
        }
      } catch (error) {
        if (error instanceof z.ZodError) {
          console.error('Invalid model audit options provided:');
          error.issues.forEach((err) => {
            console.error(`  - ${err.path.join('.')}: ${err.message}`);
          });
          process.exit(1);
        }
        throw error;
      }

      console.info(`Running model scan on: ${paths.join(', ')}`);

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
          console.error(`Failed to start modelaudit: ${error.message}`);
          console.info('Make sure modelaudit is installed and available in your PATH.');
          console.info('Install it using: pip install modelaudit');
          process.exit(1);
        });

        modelAudit.on('close', async (code) => {
          if (code !== null && code !== 0 && code !== 1) {
            console.error(`Model scan process exited with code ${code}`);
            if (stderr) {
              console.error(`Error output: ${stderr}`);
            }
            process.exit(code);
          }

          // Parse JSON output and save to database
          try {
            const jsonOutput = stdout.trim();
            if (!jsonOutput) {
              console.error('No output received from model scan');
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
                  timeout: cliOptions.timeout,
                  maxSize: options.maxSize,
                  verbose: options.verbose,
                  sbom: options.sbom,
                  strict: options.strict,
                  dryRun: options.dryRun,
                  cache: options.cache,
                  quiet: options.quiet,
                  progress: options.progress,
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
                `\nScanned ${results.files_scanned ?? 0} files (${((results.bytes_scanned ?? 0) / 1024 / 1024).toFixed(2)} MB)`,
              );
              console.log(`Duration: ${((results.duration ?? 0) / 1000).toFixed(2)} seconds`);
              console.log(chalk.green(`\n✓ Results saved to database with ID: ${audit.id}`));
            }

            // Save to file if requested
            if (options.output) {
              const fs = await import('fs');
              fs.writeFileSync(options.output, JSON.stringify(results, null, 2));
              console.info(`Results also saved to ${options.output}`);
            }

            process.exit(code || 0);
          } catch (error) {
            console.error(`Failed to parse or save scan results: ${error}`);
            if (options.verbose) {
              console.error(`Raw output: ${stdout}`);
            }
            process.exit(1);
          }
        });
      } else {
        const modelAudit = spawn('modelaudit', args, { stdio: 'inherit', env: delegationEnv });

        modelAudit.on('error', (error) => {
          console.error(`Failed to start modelaudit: ${error.message}`);
          console.info('Make sure modelaudit is installed and available in your PATH.');
          console.info('Install it using: pip install modelaudit');
          process.exit(1);
        });

        modelAudit.on('close', (code) => {
          if (code !== null && code !== 0 && code !== 1) {
            console.error(`Model scan process exited with code ${code}`);
          }
          process.exit(code || 0);
        });
      }
    });
}
