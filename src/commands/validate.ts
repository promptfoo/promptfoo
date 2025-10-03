import chalk from 'chalk';
import dedent from 'dedent';
import { fromError } from 'zod-validation-error';
import logger from '../logger';
import { loadApiProvider, loadApiProviders } from '../providers/index';
import { testHTTPProviderConnectivity, testProviderSession } from '../providers/test';
import telemetry from '../telemetry';
import { TestSuiteSchema, UnifiedConfigSchema } from '../types/index';
import { getProviderFromCloud } from '../util/cloud';
import { resolveConfigs } from '../util/config/load';
import { setupEnv } from '../util/index';
import type { Command } from 'commander';

import type { UnifiedConfig } from '../types/index';
import type { ApiProvider } from '../types/providers';

interface ValidateOptions {
  config?: string[];
  envPath?: string;
  target?: string;
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
 * Check if a provider is an HTTP provider
 */
function isHttpProvider(provider: ApiProvider): boolean {
  // Check if the provider has the HttpProvider class name or url property
  const providerId = typeof provider.id === 'function' ? provider.id() : provider.id || '';
  return (
    provider.constructor.name === 'HttpProvider' ||
    'url' in provider ||
    providerId.startsWith('http:') ||
    providerId.startsWith('https:')
  );
}

/**
 * Check if provider options represent an HTTP provider
 */
function isHttpProviderOptions(providerOptions: any): boolean {
  const providerId = providerOptions.id || '';
  return (
    providerId.startsWith('http:') || providerId.startsWith('https:') || providerOptions.config?.url
  );
}

/**
 * Patch HTTP provider config for validation.
 * We need to set maxRetries to 1 and add a silent header to avoid excessive logging of the request and response.
 */
function patchHttpConfigForValidation(providerOptions: any): any {
  return {
    ...providerOptions,
    config: {
      ...providerOptions.config,
      maxRetries: 1,
      headers: {
        ...providerOptions.config?.headers,
        'x-promptfoo-silent': 'true',
      },
    },
  };
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
      logger.warn(`  Error: ${result.error}`);
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
  const connectivityResult = await testHTTPProviderConnectivity(provider);
  displayTestResult(connectivityResult, 'Connectivity test');

  // Test 2: Session management (only if connectivity test passed)
  if (connectivityResult.success) {
    logger.info('\nTesting session management...');
    const sessionResult = await testProviderSession(provider, undefined, {
      skipConfigValidation: true,
    });
    displayTestResult(sessionResult, 'Session test');
  } else {
    logger.info(chalk.dim('\nSkipping session management test (connectivity test failed)'));
  }
}

/**
 * Run provider tests for a specific target or all providers in config
 */
async function runProviderTests(target: string | undefined, config: UnifiedConfig): Promise<void> {
  logger.info('\nRunning provider tests...');

  try {
    if (target) {
      // Test a specific target
      let provider: ApiProvider;

      // Check if target is a UUID (cloud provider)
      const UUID_REGEX =
        /^[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}$/;
      if (UUID_REGEX.test(target)) {
        const providerOptions = await getProviderFromCloud(target);
        const patchedOptions = isHttpProviderOptions(providerOptions)
          ? patchHttpConfigForValidation(providerOptions)
          : providerOptions;
        provider = await loadApiProvider(patchedOptions.id, {
          options: patchedOptions,
        });
      } else {
        // Try to load directly as provider ID
        provider = await loadApiProvider(target);
      }

      // Use detailed HTTP tests for HTTP providers, basic connectivity for others
      if (isHttpProvider(provider)) {
        await testHttpProvider(provider);
      } else {
        await testBasicConnectivity(provider);
      }
    } else {
      // Test all providers from config
      if (!config.providers || (Array.isArray(config.providers) && config.providers.length === 0)) {
        logger.info('No providers found in configuration to test.');
        return;
      }

      // Patch HTTP providers before loading (only if providers is an array)
      const patchedProviders = Array.isArray(config.providers)
        ? config.providers.map((providerOption: any) =>
            isHttpProviderOptions(providerOption)
              ? patchHttpConfigForValidation(providerOption)
              : providerOption,
          )
        : config.providers;

      const providers = await loadApiProviders(patchedProviders, {
        env: config.env,
      });

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

  // If only -t flag is provided without a config, just test the target
  if (opts.target && !configPaths) {
    logger.info('Testing provider...');
    try {
      await runProviderTests(opts.target, {} as UnifiedConfig);
    } catch (err) {
      logger.error(`Failed to test provider: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    }
    return;
  }

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

    // Run provider tests (for specific target or all providers in config)
    await runProviderTests(opts.target, configParse.data);
  } catch (err) {
    logger.error(`Failed to validate configuration: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  }
}

export function validateCommand(
  program: Command,
  defaultConfig: Partial<UnifiedConfig>,
  defaultConfigPath: string | undefined,
) {
  program
    .command('validate')
    .description('Validate a promptfoo configuration file')
    .option(
      '-c, --config <paths...>',
      'Path to configuration file. Automatically loads promptfooconfig.yaml',
    )
    .option(
      '-t, --target <target>',
      'Provider ID or cloud provider UUID to test. If not specified, tests all providers from config',
    )
    .action(async (opts: ValidateOptions) => {
      telemetry.record('command_used', { name: 'validate' });
      await doValidate(opts, defaultConfig, defaultConfigPath);
    });
}
