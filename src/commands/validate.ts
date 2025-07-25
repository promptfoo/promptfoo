import chalk from 'chalk';
import dedent from 'dedent';
import { fromError } from 'zod-validation-error';
import logger from '../logger';
import telemetry from '../telemetry';
import { TestSuiteSchema, UnifiedConfigSchema } from '../types';
import { setupEnv } from '../util';
import { resolveConfigs } from '../util/config/load';
import type { Command } from 'commander';

import type { UnifiedConfig } from '../types';

interface ValidateOptions {
  config?: string[];
  envPath?: string;
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
    .action(async (opts: ValidateOptions) => {
      telemetry.record('command_used', { name: 'validate' });
      await doValidate(opts, defaultConfig, defaultConfigPath);
    });
}
