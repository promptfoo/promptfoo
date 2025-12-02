import chalk from 'chalk';
import dedent from 'dedent';
import { validate as isUUID } from 'uuid';
import { fromError } from 'zod-validation-error/v3';
import { disableCache } from '../cache';
import logger from '../logger';
import { loadApiProvider, loadApiProviders } from '../providers/index';
import telemetry from '../telemetry';
import { TestSuiteSchema, UnifiedConfigSchema } from '../types/index';
import { getProviderFromCloud } from '../util/cloud';
import { resolveConfigs } from '../util/config/load';
import { isHttpProvider, patchHttpConfigForValidation } from '../util/httpProvider';
import { setupEnv } from '../util/index';
import { testProviderConnectivity, testProviderSession } from '../validators/testProvider';
import type { Command } from 'commander';

import type { UnifiedConfig } from '../types/index';
import type { ApiProvider } from '../types/providers';

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
async function testBasicConnectivity(provider: ApiProvider): Promise<void> {
  const providerId = typeof provider.id === 'function' ? provider.id() : provider.id;
  logger.info(`\n${chalk.bold(`Testing provider: ${providerId}`)}`);

  try {
    // Make a simple test call
    const result = await provider.callApi('Hello, world!', {
      debug: true,
      prompt: { raw: 'Hello, world!', label: 'Hello, world!' },
      vars: {},
    });

    if (result.error) {
      logger.warn(chalk.yellow(`✗ Connectivity test failed`));
      logger.warn(`  ${result.error}`);
    } else if (result.output) {
      logger.info(chalk.green(`✓ Connectivity test passed`));
      logger.info(`  Response: ${JSON.stringify(result.output).substring(0, 100)}...`);
    } else {
      logger.warn(chalk.yellow(`✗ Connectivity test returned no output`));
    }
  } catch (err) {
    logger.warn(chalk.yellow(`✗ Connectivity test failed`));
    logger.warn(`  Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Display detailed test results with suggestions
 */
function displayTestResult(result: any, testName: string): void {
  if (result.success) {
    logger.info(chalk.green(`✓ ${testName} passed`));
    if (result.message && result.message !== 'Test completed') {
      logger.info(`  ${result.message}`);
    }
    if (result.sessionId) {
      logger.info(`  Session ID: ${result.sessionId}`);
    }
  } else {
    logger.warn(chalk.yellow(`✗ ${testName} failed`));
    if (result.message) {
      logger.warn(`  ${result.message}`);
    }
    if (result.error && result.error !== result.message) {
      logger.warn(`  ${result.error}`);
    }
    if (result.reason) {
      logger.warn(`  Reason: ${result.reason}`);
    }
  }

  // Display API analysis feedback if available (from testAnalyzerResponse)
  if (result.analysis) {
    const analysis = result.analysis;

    if (analysis.changes_needed) {
      logger.warn(chalk.yellow('\n  Configuration issues detected:'));
      if (analysis.changes_needed_reason) {
        logger.warn(`  ${analysis.changes_needed_reason}`);
      }
      if (
        analysis.changes_needed_suggestions &&
        Array.isArray(analysis.changes_needed_suggestions)
      ) {
        logger.warn(chalk.yellow('\n  Suggestions:'));
        analysis.changes_needed_suggestions.forEach((suggestion: string, idx: number) => {
          logger.warn(`  ${idx + 1}. ${suggestion}`);
        });
      }
    }
  }

  // Show transformed request if available
  if (result.transformedRequest) {
    logger.info(chalk.dim('\n  Request details:'));
    if (result.transformedRequest.url) {
      logger.info(chalk.dim(`  URL: ${result.transformedRequest.url}`));
    }
    if (result.transformedRequest.method) {
      logger.info(chalk.dim(`  Method: ${result.transformedRequest.method}`));
    }
  }
}

/**
 * Run comprehensive tests for HTTP providers
 */
async function testHttpProvider(provider: ApiProvider): Promise<void> {
  const providerId = typeof provider.id === 'function' ? provider.id() : provider.id;
  logger.info(`\n${chalk.bold(`Testing HTTP provider: ${providerId}`)}`);

  // Test 1: Connectivity
  logger.info('Testing basic connectivity...');
  const connectivityResult = await testProviderConnectivity(provider);
  displayTestResult(connectivityResult, 'Connectivity test');

  // Test 2: Session management (only if connectivity test passed and target is stateful)
  if (connectivityResult.success) {
    // Check if the provider is explicitly configured as non-stateful
    if (provider.config?.stateful === false) {
      logger.info(chalk.dim('\nSkipping session management test (target is not stateful)'));
    } else {
      logger.info('\nTesting session management...');
      const sessionResult = await testProviderSession(provider, undefined, {
        skipConfigValidation: true,
      });
      displayTestResult(sessionResult, 'Session test');
    }
  } else {
    logger.info(chalk.dim('\nSkipping session management test (connectivity test failed)'));
  }
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
    if (isUUID(target)) {
      const providerOptions = await getProviderFromCloud(target);
      const patchedOptions = isHttpProvider(providerOptions)
        ? patchHttpConfigForValidation(providerOptions)
        : providerOptions;
      provider = await loadApiProvider(patchedOptions.id, {
        options: patchedOptions,
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
        });
      } else {
        provider = await loadApiProvider(target);
      }
    }
    return [provider];
  } else {
    // Load all providers from config
    if (!config.providers || (Array.isArray(config.providers) && config.providers.length === 0)) {
      logger.info('No providers found in configuration to test.');
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
    });
  }
}

/**
 * Run provider tests for a specific target or all providers in config
 */
async function runProviderTests(target: string | undefined, config: UnifiedConfig): Promise<void> {
  logger.info('\nRunning provider tests...');

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
          await testHttpProvider(provider);
        } else {
          await testBasicConnectivity(provider);
        }
      } catch (err) {
        const providerId = typeof provider.id === 'function' ? provider.id() : provider.id;
        logger.warn(
          chalk.yellow(
            `Failed to test provider ${providerId}: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      }
    }
  } catch (err) {
    // Don't fail validation on test errors, just warn
    logger.warn(
      chalk.yellow(`Provider tests failed: ${err instanceof Error ? err.message : String(err)}`),
    );
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
${fromError(configParse.error).message}`,
      );
      process.exitCode = 1;
      return;
    }
    const suiteParse = TestSuiteSchema.safeParse(testSuite);
    if (!suiteParse.success) {
      logger.error(dedent`Test suite validation error:\n${fromError(suiteParse.error).message}`);
      process.exitCode = 1;
      return;
    }
    logger.info(chalk.green('Configuration is valid.'));
  } catch (err) {
    logger.error(`Failed to validate configuration: ${err instanceof Error ? err.message : err}`);
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
    logger.error('Please specify either -t <provider-id> or -c <config-path>');
    process.exitCode = 1;
    return;
  }

  // If -c is provided, load config and test all providers
  if (opts.config) {
    logger.info(`Loading configuration from ${opts.config}...`);
    try {
      const { config } = await resolveConfigs(
        { config: [opts.config], envPath: opts.envPath },
        defaultConfig,
      );
      await runProviderTests(undefined, config as UnifiedConfig);
    } catch (err) {
      logger.error(
        `Failed to load or test providers from config: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exitCode = 1;
    }
  } else if (opts.target) {
    // Test a specific provider ID or cloud UUID
    logger.info('Testing provider...');
    try {
      await runProviderTests(opts.target, {} as UnifiedConfig);
    } catch (err) {
      logger.error(`Failed to test provider: ${err instanceof Error ? err.message : String(err)}`);
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
      telemetry.record('command_used', { name: 'validate' });
      await doValidate(opts, defaultConfig, defaultConfigPath);
    });

  // Add 'target' subcommand
  validateCmd
    .command('target')
    .description('Test providers from a config file or a specific provider')
    .option('-t, --target <id>', 'Provider ID or cloud UUID to test')
    .option('-c, --config <path>', 'Path to configuration file to test all providers')
    .action(async (opts: ValidateTargetOptions) => {
      telemetry.record('command_used', { name: 'validate_target' });
      await doValidateTarget(opts, defaultConfig);
    });
}
