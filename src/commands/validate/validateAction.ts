import chalk from 'chalk';
import dedent from 'dedent';
import { fromError } from 'zod-validation-error';
import logger from '../../logger';
import telemetry from '../../telemetry';
import type { UnifiedConfig } from '../../types';
import { TestSuiteSchema, UnifiedConfigSchema } from '../../types';
import { setupEnv } from '../../util';
import { resolveConfigs } from '../../util/config/load';

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

export async function validateAction(
  filePath: string | undefined,
  cmdObj: { config?: string },
  defaultConfig: any,
  defaultConfigPath?: string,
): Promise<void> {
  telemetry.record('command_used', {
    name: 'validate',
  });

  // Build config array from filePath and/or --config option
  const configPaths: string[] = [];
  if (filePath) {
    configPaths.push(filePath);
  }
  if (cmdObj.config) {
    configPaths.push(cmdObj.config);
  }

  await doValidate(
    { config: configPaths.length > 0 ? configPaths : undefined },
    defaultConfig || {},
    defaultConfigPath,
  );
}
