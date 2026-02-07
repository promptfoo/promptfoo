import { spawn } from 'child_process';
import crypto from 'crypto';
import { unlinkSync } from 'fs';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import chalk from 'chalk';
import ora from 'ora';
import semver from 'semver';
import { z } from 'zod';
import { getEnvBool, isCI } from '../envars';
import { getAuthor } from '../globalConfig/accounts';
import { cloudConfig } from '../globalConfig/cloud';
import logger from '../logger';
import ModelAudit from '../models/modelAudit';
import { createShareableModelAuditUrl, isModelAuditSharingEnabled } from '../share';
import { checkModelAuditUpdates, getModelAuditCurrentVersion } from '../updates';
import {
  getHuggingFaceMetadata,
  isHuggingFaceModel,
  parseHuggingFaceModel,
} from '../util/huggingfaceMetadata';
import { DEPRECATED_OPTIONS_MAP, parseModelAuditArgs } from '../util/modelAuditCliParser';
import type { Command } from 'commander';

import type { ModelAuditIssue, ModelAuditScanResults } from '../types/modelAudit';

// ============================================================================
// Types
// ============================================================================

interface SpawnResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

interface RevisionInfo {
  modelId?: string;
  revisionSha?: string;
  contentHash?: string;
  modelSource?: string;
  sourceLastModified?: number;
}

interface ScanOptions {
  blacklist?: string[];
  timeout?: string;
  maxSize?: string;
  verbose?: boolean;
  sbom?: string;
  strict?: boolean;
  dryRun?: boolean;
  cache?: boolean;
  quiet?: boolean;
  progress?: boolean;
  stream?: boolean;
  output?: string;
  format?: string;
  write?: boolean;
  name?: string;
  force?: boolean;
  share?: boolean;
  noShare?: boolean;
  includeScanner?: string[];
  excludeScanner?: string[];
  profile?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a unique temp file path for JSON output.
 * Uses crypto.randomUUID() for better security against TOCTOU attacks.
 * @internal Exported for testing
 */
export function createTempOutputPath(): string {
  const tempDir = os.tmpdir();
  const uuid = crypto.randomUUID();
  return path.join(tempDir, `promptfoo-modelscan-${uuid}.json`);
}

/**
 * Check if modelaudit version supports CLI UI with --output flag.
 * This feature was added in v0.2.20.
 * @internal Exported for testing
 */
export function supportsCliUiWithOutput(version: string | null): boolean {
  if (!version) {
    return false;
  }
  const parsed = semver.valid(semver.coerce(version));
  if (!parsed) {
    return false;
  }
  return semver.gte(parsed, '0.2.20');
}

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
 * Check if exit code indicates a process error (signal termination or crash).
 *
 * modelaudit exit codes:
 * - 0: Scan completed successfully, no security issues found
 * - 1: Scan completed successfully, security issues were found (NOT an error)
 * - 2+: Fatal errors (e.g., invalid arguments, crash, signal termination)
 *
 * This differs from standard Unix conventions where exit 1 = general failure.
 */
function isProcessError(code: number | null): code is number {
  return code !== null && code > 1;
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
    return true;
  }
  return existingVersion !== currentVersion;
}

/**
 * Warn about deprecated CLI options.
 */
function warnDeprecatedOptions(options: Record<string, unknown>): void {
  const deprecatedOptionsUsed = Object.keys(options).filter((opt) => {
    const fullOption = `--${opt.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
    return DEPRECATED_OPTIONS_MAP[fullOption] !== undefined;
  });

  for (const opt of deprecatedOptionsUsed) {
    const fullOption = `--${opt.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
    const replacement = DEPRECATED_OPTIONS_MAP[fullOption];

    if (replacement) {
      logger.warn(`⚠️  Warning: '${fullOption}' is deprecated. Use '${replacement}' instead.`);
    } else if (fullOption === '--jfrog-api-token') {
      logger.warn(`⚠️  Warning: '${fullOption}' is deprecated. Set JFROG_API_TOKEN env var.`);
    } else if (fullOption === '--jfrog-access-token') {
      logger.warn(`⚠️  Warning: '${fullOption}' is deprecated. Set JFROG_ACCESS_TOKEN env var.`);
    } else if (fullOption === '--registry-uri') {
      logger.warn(
        `⚠️  Warning: '${fullOption}' is deprecated. Set JFROG_URL or MLFLOW_TRACKING_URI env var.`,
      );
    } else {
      logger.warn(`⚠️  Warning: '${fullOption}' is deprecated and has been removed.`);
    }
  }
}

/**
 * Spawn modelaudit with proper signal handling and Promise wrapper.
 * Returns stdout/stderr content when capturing output, or empty strings for inherited stdio.
 *
 * Signal handling note: Node.js does NOT automatically forward signals to child
 * processes, even with inherited stdio. When the parent receives SIGINT (Ctrl+C)
 * or SIGTERM, the child keeps running unless we explicitly kill it. This affects
 * ALL code paths that use this function (--no-write, saveToDatabase, etc.).
 */
function spawnModelAudit(
  args: string[],
  options: {
    captureOutput: boolean;
    env: NodeJS.ProcessEnv;
    onStdout?: (data: string) => void;
    onStderr?: (data: string) => void;
  },
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const spawnOptions = options.captureOutput
      ? { env: options.env }
      : { stdio: 'inherit' as const, env: options.env };

    const childProcess = spawn('modelaudit', args, spawnOptions);

    // Graceful shutdown - forward SIGINT/SIGTERM to child process
    const cleanup = () => {
      if (!childProcess.killed) {
        childProcess.kill('SIGTERM');
      }
    };
    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);

    const removeListeners = () => {
      process.removeListener('SIGINT', cleanup);
      process.removeListener('SIGTERM', cleanup);
    };

    if (options.captureOutput) {
      childProcess.stdout?.on('data', (data: Buffer) => {
        const str = data.toString();
        stdout += str;
        options.onStdout?.(str);
      });

      childProcess.stderr?.on('data', (data: Buffer) => {
        const str = data.toString();
        stderr += str;
        options.onStderr?.(str);
      });
    }

    childProcess.on('error', (error: Error) => {
      removeListeners();
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    });

    childProcess.on('close', (code: number | null) => {
      removeListeners();
      if (settled) {
        return;
      }
      settled = true;
      resolve({ code, stdout, stderr });
    });
  });
}

/**
 * Check for existing scan and determine if re-scan is needed.
 * Returns the existing audit if found and re-scan should happen.
 */
async function checkExistingScan(
  paths: string[],
  options: ScanOptions,
  currentScannerVersion: string | null,
): Promise<{ shouldSkip: boolean; existingAudit: ModelAudit | null }> {
  if (paths.length !== 1 || !isHuggingFaceModel(paths[0])) {
    return { shouldSkip: false, existingAudit: null };
  }

  try {
    const metadata = await getHuggingFaceMetadata(paths[0]);
    if (!metadata) {
      return { shouldSkip: false, existingAudit: null };
    }

    const parsed = parseHuggingFaceModel(paths[0]);
    const modelId = parsed ? `${parsed.owner}/${parsed.repo}` : paths[0];
    const existing = await ModelAudit.findByRevision(modelId, metadata.sha);

    if (!existing) {
      return { shouldSkip: false, existingAudit: null };
    }

    // Force flag - re-scan but update existing record
    if (options.force) {
      logger.debug(`Re-scanning (--force): ${modelId}`);
      return { shouldSkip: false, existingAudit: existing };
    }

    // Version changed - re-scan
    if (shouldRescan(existing.scannerVersion, currentScannerVersion)) {
      const reason = existing.scannerVersion
        ? `modelaudit upgraded from ${existing.scannerVersion} to ${currentScannerVersion}`
        : `previous scan missing version info (now using ${currentScannerVersion})`;
      logger.debug(`Re-scanning: ${reason}`);
      return { shouldSkip: false, existingAudit: existing };
    }

    // Already scanned - skip
    logger.info(chalk.yellow('✓ Model already scanned'));
    logger.info(`  Model: ${modelId}`);
    logger.info(`  Revision: ${metadata.sha}`);
    if (existing.scannerVersion) {
      logger.info(`  Scanner version: ${existing.scannerVersion}`);
    }
    logger.info(`  Previous scan: ${new Date(existing.createdAt).toISOString()}`);
    logger.info(`  Scan ID: ${existing.id}`);
    logger.info(`\n${chalk.gray('Use --force to scan anyway, or view existing results with:')}`);
    logger.info(chalk.green(`  promptfoo view ${existing.id}`));

    return { shouldSkip: true, existingAudit: null };
  } catch (error) {
    logger.debug(`Failed to check for existing scan: ${error}`);
    return { shouldSkip: false, existingAudit: null };
  }
}

/**
 * Fetch revision info for HuggingFace models.
 */
async function fetchRevisionInfo(
  paths: string[],
  results: ModelAuditScanResults,
): Promise<RevisionInfo> {
  const revisionInfo: RevisionInfo = {};

  if (paths.length !== 1) {
    return revisionInfo;
  }

  const modelPath = paths[0];
  if (isHuggingFaceModel(modelPath)) {
    try {
      const metadata = await getHuggingFaceMetadata(modelPath);
      if (metadata) {
        revisionInfo.modelId = metadata.modelId;
        revisionInfo.revisionSha = metadata.sha;
        revisionInfo.modelSource = 'huggingface';
        revisionInfo.sourceLastModified = new Date(metadata.lastModified).getTime();
      }
    } catch (error) {
      logger.debug(`Failed to fetch revision info: ${error}`);
    }
  }

  // Extract content_hash from modelaudit output if available
  if (results.content_hash) {
    logger.debug(`Using content_hash from modelaudit output: ${results.content_hash}`);
    revisionInfo.contentHash = results.content_hash;
  }

  return revisionInfo;
}

/**
 * Display scan summary to user.
 */
function displayScanSummary(
  results: ModelAuditScanResults,
  auditId: string,
  currentScannerVersion: string | null,
  wasUpdated: boolean,
): void {
  logger.info('\n' + chalk.bold('Model Audit Summary'));
  logger.info('=' + '='.repeat(50));

  if (results.has_errors || (results.failed_checks ?? 0) > 0) {
    logger.info(chalk.yellow(`⚠  Found ${results.failed_checks || 0} issues`));
    displayIssuesBySeverity(results.issues);
  } else {
    logger.info(chalk.green(`✓ No issues found. ${results.passed_checks || 0} checks passed.`));
  }

  const mbScanned = ((results.bytes_scanned ?? 0) / 1024 / 1024).toFixed(2);
  const duration = ((results.duration ?? 0) / 1000).toFixed(2);

  logger.info(`\nScanned ${results.files_scanned ?? 0} files (${mbScanned} MB)`);
  logger.info(`Duration: ${duration} seconds`);

  if (currentScannerVersion) {
    logger.debug(`Scanner version: ${currentScannerVersion}`);
  }
  if (wasUpdated) {
    logger.debug(`Updated existing audit record: ${auditId}`);
  }

  logger.info(chalk.green(`\n✓ Results saved to database with ID: ${auditId}`));
}

/**
 * Display issues grouped by severity.
 */
function displayIssuesBySeverity(issues: ModelAuditIssue[] | undefined): void {
  if (!issues || issues.length === 0) {
    return;
  }

  const issuesBySeverity = issues.reduce(
    (acc, issue) => {
      const severity = issue.severity || 'info';
      if (!acc[severity]) {
        acc[severity] = [];
      }
      acc[severity].push(issue);
      return acc;
    },
    {} as Record<string, ModelAuditIssue[]>,
  );

  const severityOrder = ['critical', 'error', 'warning', 'info'];
  const severityColors: Record<string, typeof chalk.red> = {
    critical: chalk.red,
    error: chalk.red,
    warning: chalk.yellow,
    info: chalk.blue,
  };

  for (const severity of severityOrder) {
    const severityIssues = issuesBySeverity[severity];
    if (!severityIssues || severityIssues.length === 0) {
      continue;
    }

    const color = severityColors[severity] || chalk.white;
    logger.info(`\n${color.bold(severity.toUpperCase())} (${severityIssues.length}):`);

    const displayCount = Math.min(severityIssues.length, 5);
    for (let i = 0; i < displayCount; i++) {
      const issue = severityIssues[i];
      logger.info(`  • ${issue.message}`);
      if (issue.location) {
        logger.info(`    ${chalk.gray(issue.location)}`);
      }
    }

    if (severityIssues.length > 5) {
      logger.info(`  ${chalk.gray(`... and ${severityIssues.length - 5} more`)}`);
    }
  }
}

/**
 * Save or update audit record in database.
 */
async function saveAuditRecord(
  paths: string[],
  results: ModelAuditScanResults,
  options: ScanOptions,
  currentScannerVersion: string | null,
  existingAudit: ModelAudit | null,
  revisionInfo: RevisionInfo,
): Promise<ModelAudit> {
  const auditMetadata = {
    paths,
    options: {
      blacklist: options.blacklist,
      timeout: options.timeout ? parseInt(options.timeout, 10) : undefined,
      maxSize: options.maxSize,
      verbose: options.verbose,
      sbom: options.sbom,
      strict: options.strict,
      dryRun: options.dryRun,
      cache: options.cache,
      quiet: options.quiet,
      progress: options.progress,
      stream: options.stream,
      includeScanner: options.includeScanner,
      excludeScanner: options.excludeScanner,
      profile: options.profile,
    },
  };

  if (existingAudit) {
    // Update existing record with new scan results
    existingAudit.results = results;
    existingAudit.checks = results.checks ?? null;
    existingAudit.issues = results.issues ?? null;
    existingAudit.hasErrors = hasErrorsInResults(results);
    existingAudit.totalChecks = results.total_checks ?? null;
    existingAudit.passedChecks = results.passed_checks ?? null;
    existingAudit.failedChecks = results.failed_checks ?? null;
    existingAudit.scannerVersion = currentScannerVersion ?? null;
    existingAudit.metadata = auditMetadata;
    existingAudit.updatedAt = Date.now();
    if (revisionInfo.contentHash) {
      existingAudit.contentHash = revisionInfo.contentHash;
    }
    await existingAudit.save();
    return existingAudit;
  }

  return ModelAudit.create({
    name: options.name || `Model scan ${new Date().toISOString()}`,
    author: getAuthor() || undefined,
    modelPath: paths.join(', '),
    results,
    metadata: auditMetadata,
    scannerVersion: currentScannerVersion || undefined,
    ...revisionInfo,
  });
}

/**
 * Common logic for processing scan results after JSON is obtained.
 * Parses JSON, saves to database, and displays summary.
 */
async function processJsonResults(
  jsonOutput: string,
  exitCode: number,
  paths: string[],
  options: ScanOptions,
  currentScannerVersion: string | null,
  existingAudit: ModelAudit | null,
): Promise<number> {
  if (!jsonOutput) {
    logger.error('No output received from model scan');
    return 1;
  }

  let results: ModelAuditScanResults;
  try {
    results = JSON.parse(jsonOutput);
  } catch (error) {
    logger.error(`Failed to parse scan results: ${error}`);
    if (options.verbose) {
      logger.error(`Raw output: ${jsonOutput}`);
    }
    return 1;
  }

  // Fetch revision info and save to database
  const revisionInfo = await fetchRevisionInfo(paths, results);
  const audit = await saveAuditRecord(
    paths,
    results,
    options,
    currentScannerVersion,
    existingAudit,
    revisionInfo,
  );

  // Determine if we should share (matches eval command behavior)
  const hasExplicitDisable =
    options.share === false || options.noShare === true || getEnvBool('PROMPTFOO_DISABLE_SHARING');

  let wantsToShare: boolean;
  if (hasExplicitDisable) {
    wantsToShare = false;
  } else if (options.share === true) {
    wantsToShare = true;
  } else {
    // Default: auto-share when cloud is enabled
    wantsToShare = cloudConfig.isEnabled();
  }

  // Check if sharing is actually possible (cloud enabled or custom share URL configured)
  const canShare = isModelAuditSharingEnabled();

  logger.debug(`Model audit sharing decision: wantsToShare=${wantsToShare}, canShare=${canShare}`);

  // Start sharing in background (don't await yet - non-blocking like evals!)
  let sharePromise: Promise<string | null> | null = null;
  if (wantsToShare && canShare) {
    sharePromise = createShareableModelAuditUrl(audit);
  }

  // Display summary immediately (don't wait for upload)
  if (options.format !== 'json') {
    displayScanSummary(results, audit.id, currentScannerVersion, existingAudit !== null);
  }

  // Save to user-specified output file if requested
  if (options.output) {
    try {
      await fs.writeFile(options.output, JSON.stringify(results, null, 2));
      logger.info(`Results also saved to ${options.output}`);
    } catch (error) {
      logger.error(`Failed to save results to ${options.output}: ${error}`);
    }
  }

  // Now wait for share to complete and show spinner (like evals)
  if (sharePromise != null) {
    if (process.stdout.isTTY && !isCI()) {
      const spinner = ora({
        text: 'Sharing model audit...',
        prefixText: chalk.dim('»'),
        spinner: 'dots',
      }).start();

      try {
        const shareableUrl = await sharePromise;
        if (shareableUrl) {
          spinner.succeed(shareableUrl);
        } else {
          spinner.fail(chalk.red('Share failed'));
        }
      } catch (error) {
        spinner.fail(chalk.red('Share failed'));
        logger.debug(`Share error: ${error}`);
      }
    } else {
      // CI mode - direct log
      try {
        const shareableUrl = await sharePromise;
        if (shareableUrl) {
          logger.info(`${chalk.dim('»')} ${chalk.green('✓')} ${shareableUrl}`);
        }
      } catch (error) {
        logger.debug(`Share error: ${error}`);
      }
    }
  }

  return exitCode;
}

/**
 * Process scan results from a JSON file (used when CLI UI is displayed).
 * Reads JSON from temp file, processes results, and cleans up the temp file.
 */
async function processScanResultsFromFile(
  spawnResult: SpawnResult,
  jsonFilePath: string,
  paths: string[],
  options: ScanOptions,
  currentScannerVersion: string | null,
  existingAudit: ModelAudit | null,
): Promise<number> {
  // Helper to clean up temp file
  const cleanupTempFile = async () => {
    try {
      await fs.unlink(jsonFilePath);
    } catch (error) {
      logger.debug(`Failed to cleanup temp file ${jsonFilePath}: ${error}`);
    }
  };

  // Handle process errors (stderr already displayed via inherited stdio)
  if (isProcessError(spawnResult.code)) {
    logger.error(`Model scan process exited with code ${spawnResult.code}`);
    await cleanupTempFile();
    return spawnResult.code;
  }

  // Read JSON from temp file
  let jsonOutput: string;
  try {
    jsonOutput = (await fs.readFile(jsonFilePath, 'utf-8')).trim();
  } catch (error) {
    logger.error(`Failed to read scan results from file: ${error}`);
    await cleanupTempFile();
    return 1;
  }

  // Clean up temp file after successful read
  await cleanupTempFile();

  return processJsonResults(
    jsonOutput,
    spawnResult.code || 0,
    paths,
    options,
    currentScannerVersion,
    existingAudit,
  );
}

/**
 * Process scan results from stdout (used for older modelaudit versions).
 * Parses JSON from captured stdout and saves to database.
 */
async function processScanResultsFromStdout(
  spawnResult: SpawnResult,
  paths: string[],
  options: ScanOptions,
  currentScannerVersion: string | null,
  existingAudit: ModelAudit | null,
): Promise<number> {
  // Handle process errors
  if (isProcessError(spawnResult.code)) {
    logger.error(`Model scan process exited with code ${spawnResult.code}`);
    if (spawnResult.stderr) {
      logger.error(spawnResult.stderr);
    }
    return spawnResult.code;
  }

  const jsonOutput = spawnResult.stdout.trim();
  if (!jsonOutput && spawnResult.stderr) {
    logger.error('No output received from model scan');
    logger.error(spawnResult.stderr);
    return 1;
  }

  return processJsonResults(
    jsonOutput,
    spawnResult.code || 0,
    paths,
    options,
    currentScannerVersion,
    existingAudit,
  );
}

// ============================================================================
// Main Command
// ============================================================================

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

    // Scanner selection
    .option(
      '--include-scanner <scanners...>',
      'Include specific scanners to run (space-separated)',
    )
    .option(
      '--exclude-scanner <scanners...>',
      'Exclude specific scanners from running (space-separated)',
    )
    .option(
      '--profile <profile>',
      'Use a predefined scanner profile (quick-scan, serialization-attacks, format-integrity, archive-inspection, secrets-network-threats, model-behavior, full-audit)',
    )

    // Sharing options
    .option('--share', 'Share the model audit results')
    .option('--no-share', 'Do not share the model audit results')

    .action(async (paths: string[], options: ScanOptions) => {
      // Validate input
      if (!paths || paths.length === 0) {
        logger.error('No paths specified. Provide at least one model file or directory to scan.');
        process.exitCode = 1;
        return;
      }

      // Warn about deprecated options
      warnDeprecatedOptions(options as Record<string, unknown>);

      // Check modelaudit installation
      const { installed, version: currentScannerVersion } = await checkModelAuditInstalled();
      if (!installed) {
        logger.error('ModelAudit is not installed.');
        logger.info(`Please install it using: ${chalk.green('pip install modelaudit')}`);
        logger.info('For more information, visit: https://www.promptfoo.dev/docs/model-audit/');
        process.exitCode = 1;
        return;
      }

      // Check for updates
      await checkModelAuditUpdates();
      if (currentScannerVersion) {
        logger.debug(`Using modelaudit version: ${currentScannerVersion}`);
      }

      // Determine if we should save to database
      const saveToDatabase = options.write === undefined || options.write === true;

      // Check for existing scan (skip or get audit to update)
      let existingAuditToUpdate: ModelAudit | null = null;
      if (saveToDatabase) {
        const { shouldSkip, existingAudit } = await checkExistingScan(
          paths,
          options,
          currentScannerVersion,
        );
        if (shouldSkip) {
          process.exitCode = 0;
          return;
        }
        existingAuditToUpdate = existingAudit;
      }

      // Parse CLI arguments
      const outputFormat = saveToDatabase ? 'json' : options.format || 'text';
      const cliOptions = {
        ...options,
        format: outputFormat,
        output: options.output && !saveToDatabase ? options.output : undefined,
        timeout: options.timeout ? parseInt(options.timeout, 10) : undefined,
        includeScanner: options.includeScanner,
        excludeScanner: options.excludeScanner,
        profile: options.profile,
      };

      let args: string[];
      try {
        const result = parseModelAuditArgs(paths, cliOptions);
        args = result.args;
        if (result.unsupportedOptions.length > 0) {
          logger.warn(`Unsupported options detected: ${result.unsupportedOptions.join(', ')}`);
        }
      } catch (error) {
        if (error instanceof z.ZodError) {
          logger.error('Invalid model audit options provided:');
          for (const err of error.issues) {
            logger.error(`  - ${err.path.join('.')}: ${err.message}`);
          }
          process.exitCode = 1;
          return;
        }
        throw error;
      }

      logger.info(`Running model scan on: ${paths.join(', ')}`);

      // Set up environment
      const delegationEnv = {
        ...process.env,
        PROMPTFOO_DELEGATED: 'true',
      };

      try {
        if (saveToDatabase) {
          // Check if modelaudit version supports CLI UI with --output flag (v0.2.20+)
          const useCliUiFlow = supportsCliUiWithOutput(currentScannerVersion);

          if (useCliUiFlow) {
            // Use temp file for JSON output so CLI UI can display
            // (modelaudit 0.2.20+ shows CLI UI when --output is used)
            const tempOutputPath = createTempOutputPath();
            args.push('--output', tempOutputPath);

            // Cleanup handler for temp file on abnormal termination.
            // Note: Child process termination is handled by spawnModelAudit's signal
            // handlers - this only handles temp file cleanup.
            //
            // IMPORTANT: We use unlinkSync (synchronous) instead of fs.promises.unlink
            // because signal handlers must complete synchronously. Async operations
            // in signal handlers are unsafe - the process may exit before they complete.
            let cleanedUp = false;
            const cleanupTempFileOnExit = () => {
              if (cleanedUp) {
                return;
              }
              cleanedUp = true;
              try {
                unlinkSync(tempOutputPath);
              } catch {
                // Ignore - file may already be cleaned up or doesn't exist
              }
            };

            // Register cleanup handlers for abnormal termination.
            // We use once() so handlers auto-remove after firing, but we also manually
            // remove them in finally{} for the normal exit path. The cleanedUp flag
            // prevents double-cleanup if a signal fires between our manual cleanup call
            // and removeListener calls. This belt-and-suspenders approach ensures:
            // 1. Normal exit: finally{} cleans up and removes handlers
            // 2. Signal during await: once() handler cleans up, auto-removes itself
            // 3. Signal during finally{}: cleanedUp flag prevents double-cleanup
            process.once('exit', cleanupTempFileOnExit);
            process.once('SIGINT', cleanupTempFileOnExit);
            process.once('SIGTERM', cleanupTempFileOnExit);

            try {
              // Use inherited stdio so CLI UI displays (spinners, progress, colors)
              const spawnResult = await spawnModelAudit(args, {
                captureOutput: false,
                env: delegationEnv,
              });

              // Read JSON from temp file and process results
              process.exitCode = await processScanResultsFromFile(
                spawnResult,
                tempOutputPath,
                paths,
                options,
                currentScannerVersion,
                existingAuditToUpdate,
              );
            } finally {
              // Cleanup first, then remove handlers. Order matters: if we removed
              // handlers first, a signal arriving before cleanup would be missed.
              cleanupTempFileOnExit();
              process.removeListener('exit', cleanupTempFileOnExit);
              process.removeListener('SIGINT', cleanupTempFileOnExit);
              process.removeListener('SIGTERM', cleanupTempFileOnExit);
            }
          } else {
            // Fallback for older modelaudit versions: capture stdout for JSON
            logger.debug('Using stdout capture (modelaudit < 0.2.20)');
            const spawnResult = await spawnModelAudit(args, {
              captureOutput: true,
              env: delegationEnv,
            });

            process.exitCode = await processScanResultsFromStdout(
              spawnResult,
              paths,
              options,
              currentScannerVersion,
              existingAuditToUpdate,
            );
          }
        } else {
          // Pass through to terminal (inherited stdio)
          const spawnResult = await spawnModelAudit(args, {
            captureOutput: false,
            env: delegationEnv,
          });

          if (spawnResult.code !== null && spawnResult.code !== 0 && spawnResult.code !== 1) {
            logger.error(`Model scan process exited with code ${spawnResult.code}`);
          }
          process.exitCode = spawnResult.code || 0;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to start modelaudit: ${message}`);
        logger.info('Make sure modelaudit is installed and available in your PATH.');
        logger.info('Install it using: pip install modelaudit');
        process.exitCode = 1;
      }
    });
}
