import chalk from 'chalk';
import dedent from 'dedent';
import { z } from 'zod';
import { disableCache } from '../cache';
import cliState from '../cliState';
import logger from '../logger';
import { testProviderConnectivity, testProviderSession } from '../node/testProvider';
import { loadApiProvider, loadApiProviders } from '../providers/index';
import { TestSuiteSchema, UnifiedConfigSchema } from '../types/index';
import { getProviderFromCloud } from '../util/cloud';
import { ConfigResolutionError, logConfigResolutionError } from '../util/config/errors';
import { resolveConfigs } from '../util/config/load';
import { isHttpProvider, patchHttpConfigForValidation } from '../util/httpProvider';
import { setupEnv } from '../util/index';
import { safeJsonStringify } from '../util/json';
import { isUuid } from '../util/uuid';
import type { Command } from 'commander';

import type { UnifiedConfig } from '../types/index';
import type { ApiProvider } from '../types/providers';

const VALIDATE_FAILURE_PREFIX = 'Failed to validate configuration: ';
const LOAD_FAILURE_PREFIX = 'Failed to load configuration: ';
const TEST_RESULT_INDENT = '    ';

type ProviderTestResult = Awaited<ReturnType<typeof testProviderConnectivity>>;
type SessionTestResult = Awaited<ReturnType<typeof testProviderSession>>;
type TestResult = ProviderTestResult | SessionTestResult;

interface ValidateOptions {
  config?: string[];
  envPath?: string;
}

interface ValidateTargetOptions {
  target?: string;
  config?: string;
  envPath?: string;
}

/**
 * Test basic connectivity for a provider (Non-http)
 */
async function testBasicConnectivity(provider: ApiProvider): Promise<{
  success: boolean;
  error?: string;
}> {
  const providerId = typeof provider.id === 'function' ? provider.id() : provider.id;
  logger.info('');
  logger.info(chalk.bold(`Provider: ${providerId}`));
  logger.info(chalk.dim('─'.repeat(50)));

  try {
    // Make a simple test call
    const result = await provider.callApi('Hello, world!', {
      debug: true,
      prompt: { raw: 'Hello, world!', label: 'Hello, world!' },
      vars: {},
    });

    if (result.error) {
      logger.error(chalk.red(`  ✗ Connectivity test`));
      logger.error(chalk.red(`    ${result.error}`));
      return { success: false, error: result.error };
    } else if (result.output !== null && result.output !== undefined) {
      logger.info(chalk.green(`  ✓ Connectivity test`));
      // safeJsonStringify keeps the preview non-throwing (circular refs, BigInt);
      // String() covers values it cannot serialize at all.
      const fullResponse = safeJsonStringify(result.output) ?? String(result.output);
      const isTruncated = fullResponse.length > 100;
      const responsePreview = fullResponse.substring(0, 100);
      logger.info(chalk.dim(`    Response: ${responsePreview}${isTruncated ? '...' : ''}`));
      return { success: true };
    } else {
      logger.warn(chalk.yellow(`  ✗ Connectivity test`));
      logger.info(chalk.dim(`    No output received from provider`));
      return { success: false, error: 'No output received' };
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error(chalk.red(`  ✗ Connectivity test`));
    logger.error(chalk.red(`    ${errorMsg}`));
    return { success: false, error: errorMsg };
  }
}

/**
 * Display a successful test result.
 */
function displaySuccessfulTestResult(
  result: TestResult,
  testName: string,
  sessionId: string | undefined,
): void {
  logger.info(chalk.green(`  ✓ ${testName}`));
  if (result.message && result.message !== 'Test completed') {
    logger.info(chalk.dim(`${TEST_RESULT_INDENT}${result.message}`));
  }
  if (sessionId) {
    logger.info(chalk.dim(`${TEST_RESULT_INDENT}Session ID: ${sessionId}`));
  }
}

/**
 * Display a failed test result.
 */
function displayFailedTestResult(
  result: TestResult,
  testName: string,
  analysis: ProviderTestResult['analysis'],
  reason: string | undefined,
): void {
  const hasSuggestions = analysis?.changes_needed;
  const isHardError = result.error && !hasSuggestions;

  if (isHardError) {
    logger.error(chalk.red(`  ✗ ${testName}`));
    if (result.message) {
      logger.error(chalk.red(`${TEST_RESULT_INDENT}${result.message}`));
    }
    if (result.error && result.error !== result.message) {
      logger.error(chalk.red(`${TEST_RESULT_INDENT}${result.error}`));
    }
  } else if (hasSuggestions) {
    logger.warn(chalk.yellow(`  ⚠ ${testName}`));
    if (result.message) {
      logger.info(`${TEST_RESULT_INDENT}${result.message}`);
    }
  } else {
    logger.warn(chalk.yellow(`  ✗ ${testName}`));
    if (result.message) {
      logger.info(`${TEST_RESULT_INDENT}${result.message}`);
    }
  }

  if (reason) {
    logger.info(chalk.dim(`${TEST_RESULT_INDENT}Reason: ${reason}`));
  }
}

/**
 * Display API analysis feedback from testAnalyzerResponse.
 */
function displayAnalysisFeedback(analysis: ProviderTestResult['analysis']): void {
  if (!analysis?.changes_needed) {
    return;
  }

  logger.info('');
  logger.info(chalk.cyan(`${TEST_RESULT_INDENT}Suggestions:`));
  if (analysis.changes_needed_reason) {
    logger.info(`${TEST_RESULT_INDENT}${analysis.changes_needed_reason}`);
  }
  if (Array.isArray(analysis.changes_needed_suggestions)) {
    logger.info('');
    analysis.changes_needed_suggestions.forEach((suggestion, idx) => {
      logger.info(`${TEST_RESULT_INDENT}${chalk.cyan(`${idx + 1}.`)} ${suggestion}`);
    });
  }
}

function getTransformedRequest(result: TestResult): Record<string, unknown> | undefined {
  if (
    !('transformedRequest' in result) ||
    result.transformedRequest === null ||
    typeof result.transformedRequest !== 'object'
  ) {
    return undefined;
  }
  return result.transformedRequest as Record<string, unknown>;
}

/**
 * Show transformed request details when available.
 */
function displayTransformedRequest(transformedRequest: Record<string, unknown> | undefined): void {
  if (!transformedRequest) {
    return;
  }

  logger.debug('');
  logger.debug(chalk.dim(`${TEST_RESULT_INDENT}Request details:`));
  if (transformedRequest.url) {
    logger.debug(chalk.dim(`${TEST_RESULT_INDENT}  URL: ${transformedRequest.url}`));
  }
  if (transformedRequest.method) {
    logger.debug(chalk.dim(`${TEST_RESULT_INDENT}  Method: ${transformedRequest.method}`));
  }
}

/**
 * Display detailed test results with suggestions.
 */
function displayTestResult(result: TestResult, testName: string): void {
  const analysis = 'analysis' in result ? result.analysis : undefined;
  const sessionId = 'sessionId' in result ? result.sessionId : undefined;
  const reason = 'reason' in result ? result.reason : undefined;

  if (result.success) {
    displaySuccessfulTestResult(result, testName, sessionId);
  } else {
    displayFailedTestResult(result, testName, analysis, reason);
  }

  displayAnalysisFeedback(analysis);
  displayTransformedRequest(getTransformedRequest(result));
}

interface ProviderTestSummary {
  providerId: string;
  connectivityPassed: boolean;
  sessionPassed: boolean | null;
  hasSuggestions: boolean;
  sessionSkipped: boolean;
}

/**
 * Run comprehensive tests for HTTP providers
 */
async function testHttpProvider(provider: ApiProvider): Promise<ProviderTestSummary> {
  const providerId = typeof provider.id === 'function' ? provider.id() : provider.id;
  logger.info('');
  logger.info(chalk.bold(`Provider: ${providerId}`));
  logger.info(chalk.dim('─'.repeat(50)));

  const summary: ProviderTestSummary = {
    providerId,
    connectivityPassed: false,
    sessionPassed: null,
    hasSuggestions: false,
    sessionSkipped: false,
  };

  // Test 1: Connectivity
  logger.info(`  ◌ Connectivity test ${chalk.dim('(running...)')}`);
  const connectivityResult = await testProviderConnectivity({ provider });
  displayTestResult(connectivityResult, 'Connectivity test');
  summary.hasSuggestions = !!connectivityResult.analysis?.changes_needed;

  // Connectivity actually works if success is true OR if the only issue is suggestions (no actual error)
  const connectivityActuallyWorked =
    connectivityResult.success || (summary.hasSuggestions && !connectivityResult.error);
  summary.connectivityPassed = connectivityActuallyWorked;

  // Test 2: Session management (only if connectivity test passed and target is stateful)
  if (connectivityActuallyWorked) {
    // Check if the provider is explicitly configured as non-stateful
    if (provider.config?.stateful === false) {
      logger.info(chalk.dim(`  ○ Session test (skipped - target is stateless)`));
      summary.sessionSkipped = true;
    } else {
      logger.info(`  ◌ Session test ${chalk.dim('(running...)')}`);
      const sessionResult = await testProviderSession({
        provider,
        options: { skipConfigValidation: true },
      });
      displayTestResult(sessionResult, 'Session test');
      summary.sessionPassed = sessionResult.success;
    }
  } else {
    logger.info(chalk.dim(`  ○ Session test (skipped - connectivity failed)`));
    summary.sessionSkipped = true;
  }

  return summary;
}

/**
 * Load provider(s) for testing - either a specific target or all providers from config
 */
async function loadProvidersForTesting(
  target: string | undefined,
  config: UnifiedConfig,
): Promise<ApiProvider[]> {
  if (target) {
    // Load a specific target
    let provider: ApiProvider;

    // Cloud target
    if (isUuid(target)) {
      const providerOptions = await getProviderFromCloud(target);
      const patchedOptions = isHttpProvider(providerOptions)
        ? patchHttpConfigForValidation(providerOptions)
        : providerOptions;
      provider = await loadApiProvider(patchedOptions.id, {
        options: patchedOptions,
        basePath: cliState.basePath,
      });
    } else {
      // Check if it's an HTTP provider and patch config if needed
      const isHttp = target.startsWith('http:') || target.startsWith('https:');
      if (isHttp) {
        provider = await loadApiProvider(target, {
          options: {
            config: {
              maxRetries: 1,
              headers: {
                'x-promptfoo-silent': 'true',
              },
            },
          },
          basePath: cliState.basePath,
        });
      } else {
        provider = await loadApiProvider(target, { basePath: cliState.basePath });
      }
    }
    return [provider];
  } else {
    // Load all providers from config
    if (!config.providers || (Array.isArray(config.providers) && config.providers.length === 0)) {
      logger.info(
        'No providers found in configuration to test. Add providers to your config or run `promptfoo validate -t <provider-id>` to test a specific provider.',
      );
      return [];
    }

    // Patch HTTP providers before loading (only if providers is an array)
    const patchedProviders = Array.isArray(config.providers)
      ? config.providers.map((providerOption: any) =>
          isHttpProvider(providerOption)
            ? patchHttpConfigForValidation(providerOption)
            : providerOption,
        )
      : config.providers;

    return loadApiProviders(patchedProviders, {
      env: config.env,
      basePath: cliState.basePath,
    });
  }
}

/**
 * Display a summary of all test results
 */
function displayTestSummary(summaries: ProviderTestSummary[]): void {
  logger.info('');
  logger.info(chalk.bold('Summary'));
  logger.info(chalk.dim('═'.repeat(50)));

  let totalPassed = 0;
  let totalFailed = 0;
  let totalSuggestions = 0;
  let totalSkipped = 0;

  for (const summary of summaries) {
    const parts: string[] = [];

    if (summary.connectivityPassed) {
      parts.push(chalk.green('connectivity: passed'));
      totalPassed++;
    } else {
      parts.push(chalk.red('connectivity: failed'));
      totalFailed++;
    }

    if (summary.sessionSkipped) {
      parts.push(chalk.dim('session: skipped'));
      totalSkipped++;
    } else if (summary.sessionPassed === true) {
      parts.push(chalk.green('session: passed'));
      totalPassed++;
    } else if (summary.sessionPassed === false) {
      parts.push(chalk.red('session: failed'));
      totalFailed++;
    }

    if (summary.hasSuggestions) {
      totalSuggestions++;
    }

    logger.info(`  ${summary.providerId}`);
    logger.info(`    ${parts.join(', ')}`);
  }

  logger.info('');

  // Overall status
  const statusParts: string[] = [];
  if (totalPassed > 0) {
    statusParts.push(chalk.green(`${totalPassed} passed`));
  }
  if (totalFailed > 0) {
    statusParts.push(chalk.red(`${totalFailed} failed`));
  }
  if (totalSkipped > 0) {
    statusParts.push(chalk.dim(`${totalSkipped} skipped`));
  }

  logger.info(`Tests: ${statusParts.join(', ')}`);

  if (totalSuggestions > 0) {
    logger.info(
      chalk.yellow(
        `\n${totalSuggestions} provider(s) have configuration suggestions - see above for details`,
      ),
    );
  }

  if (totalFailed > 0) {
    process.exitCode = 1;
  }
}

/**
 * Run provider tests for a specific target or all providers in config
 */
async function runProviderTests(target: string | undefined, config: UnifiedConfig): Promise<void> {
  const summaries: ProviderTestSummary[] = [];

  try {
    // Load provider(s)
    const providers = await loadProvidersForTesting(target, config);

    if (providers.length === 0) {
      return;
    }

    // Run tests on all loaded providers
    for (const provider of providers) {
      try {
        // Use detailed HTTP tests for HTTP providers, basic connectivity for others
        if (isHttpProvider(provider)) {
          const summary = await testHttpProvider(provider);
          summaries.push(summary);
        } else {
          const result = await testBasicConnectivity(provider);
          const providerId = typeof provider.id === 'function' ? provider.id() : provider.id;
          summaries.push({
            providerId,
            connectivityPassed: result.success,
            sessionPassed: null,
            hasSuggestions: false,
            sessionSkipped: true, // Non-HTTP providers don't have session tests
          });
        }
      } catch (err) {
        const providerId = typeof provider.id === 'function' ? provider.id() : provider.id;
        logger.error('');
        logger.error(chalk.bold(`Provider: ${providerId}`));
        logger.error(chalk.dim('─'.repeat(50)));
        logger.error(chalk.red(`  ✗ Test execution failed`));
        logger.error(chalk.red(`    ${err instanceof Error ? err.message : String(err)}`));
        summaries.push({
          providerId,
          connectivityPassed: false,
          sessionPassed: null,
          hasSuggestions: false,
          sessionSkipped: true,
        });
      }
    }

    // Display summary
    if (summaries.length > 0) {
      displayTestSummary(summaries);
    }
  } catch (err) {
    logger.error(
      chalk.red(`Provider tests failed: ${err instanceof Error ? err.message : String(err)}`),
    );
    process.exitCode = 1;
  }
}

export async function doValidate(
  opts: ValidateOptions,
  defaultConfig: Partial<UnifiedConfig>,
  defaultConfigPath: string | undefined,
): Promise<void> {
  setupEnv(opts.envPath);
  const configPaths = opts.config || (defaultConfigPath ? [defaultConfigPath] : undefined);

  try {
    const { config, testSuite } = await resolveConfigs(
      { ...opts, config: configPaths },
      defaultConfig,
    );
    const configParse = UnifiedConfigSchema.safeParse(config);
    if (!configParse.success) {
      logger.error(
        dedent`Configuration validation error:
Config file path(s): ${Array.isArray(configPaths) ? configPaths.join(', ') : (configPaths ?? 'N/A')}
${z.prettifyError(configParse.error)}`,
      );
      process.exitCode = 1;
      return;
    }
    const suiteParse = TestSuiteSchema.safeParse(testSuite);
    if (!suiteParse.success) {
      logger.error(dedent`Test suite validation error:\n${z.prettifyError(suiteParse.error)}`);
      process.exitCode = 1;
      return;
    }
    logger.info(chalk.green('Configuration is valid.'));
  } catch (err) {
    if (err instanceof ConfigResolutionError) {
      logConfigResolutionError(err, VALIDATE_FAILURE_PREFIX);
    } else {
      logger.error(`${VALIDATE_FAILURE_PREFIX}${err instanceof Error ? err.message : err}`);
    }
    process.exitCode = 1;
  }
}

/**
 * Validate a specific target (provider)
 */
export async function doValidateTarget(
  opts: ValidateTargetOptions,
  defaultConfig: Partial<UnifiedConfig>,
): Promise<void> {
  setupEnv(opts.envPath);
  disableCache();

  if (!opts.target && !opts.config) {
    logger.error(chalk.red('Please specify either -t <provider-id> or -c <config-path>'));
    process.exitCode = 1;
    return;
  }

  logger.info('');
  logger.info(chalk.bold('Validating Target'));
  logger.info(chalk.dim('═'.repeat(50)));

  // If -c is provided, load config and test all providers
  if (opts.config) {
    logger.info(chalk.dim(`Configuration: ${opts.config}`));
    try {
      const { config } = await resolveConfigs(
        { config: [opts.config], envPath: opts.envPath },
        defaultConfig,
      );
      await runProviderTests(undefined, config as UnifiedConfig);
    } catch (err) {
      if (err instanceof ConfigResolutionError) {
        logConfigResolutionError(err, LOAD_FAILURE_PREFIX);
      } else {
        logger.error(
          chalk.red(`${LOAD_FAILURE_PREFIX}${err instanceof Error ? err.message : String(err)}`),
        );
      }
      process.exitCode = 1;
    }
  } else if (opts.target) {
    // Test a specific provider ID or cloud UUID
    logger.info(chalk.dim(`Target: ${opts.target}`));
    try {
      await runProviderTests(opts.target, {} as UnifiedConfig);
    } catch (err) {
      logger.error(
        chalk.red(`Failed to test provider: ${err instanceof Error ? err.message : String(err)}`),
      );
      process.exitCode = 1;
    }
  }
}

export function validateCommand(
  program: Command,
  defaultConfig: Partial<UnifiedConfig>,
  defaultConfigPath: string | undefined,
) {
  const validateCmd = program
    .command('validate')
    .description('Validate configuration files and test providers');

  // Add 'config' subcommand
  validateCmd
    .command('config', { isDefault: true })
    .description('Validate a promptfoo configuration file')
    .option(
      '-c, --config <paths...>',
      'Path to configuration file. Automatically loads promptfooconfig.yaml',
    )
    .action(async (opts: ValidateOptions) => {
      await doValidate(opts, defaultConfig, defaultConfigPath);
    });

  // Add 'target' subcommand
  validateCmd
    .command('target')
    .description('Test providers from a config file or a specific provider')
    .option('-t, --target <id>', 'Provider ID or cloud UUID to test')
    .option('-c, --config <path>', 'Path to configuration file to test all providers')
    .action(async (opts: ValidateTargetOptions) => {
      await doValidateTarget(opts, defaultConfig);
    });
}
