import chalk from 'chalk';
import { Command, InvalidArgumentError } from 'commander';
import logger from '../logger';
import { optimizePromptTestSuite } from '../optimizer/promptOptimizer';
import telemetry from '../telemetry';
import { type UnifiedConfig } from '../types/index';
import { resolveConfigs } from '../util/config/load';
import { printBorder, setupEnv } from '../util/index';
import { promptfooCommand } from '../util/promptfooCommand';

interface OptimizeOptions {
  config?: string;
  envPath?: string | string[];
  promptIndex?: number;
  providerIndex?: number;
  validationSplit?: number;
  defaultConfig: Partial<UnifiedConfig>;
  defaultConfigPath: string | undefined;
}

export async function doOptimize(options: OptimizeOptions): Promise<void> {
  setupEnv(options.envPath);
  const configPath = options.config || options.defaultConfigPath;
  if (!configPath) {
    throw new Error(
      `Could not find a config file. Pass --config path/to/promptfooconfig.yaml or run "${promptfooCommand(
        'init',
      )}" to create one.`,
    );
  }

  const startTime = Date.now();
  const resolved = await resolveConfigs(
    {
      config: [configPath],
    },
    options.defaultConfig,
  );

  telemetry.record('command_used', {
    name: 'optimize - started',
    numPrompts: resolved.testSuite.prompts.length,
    numTests: resolved.testSuite.tests?.length || 0,
    promptIndex: options.promptIndex ?? 0,
    providerIndex: options.providerIndex ?? 0,
    validationSplit: options.validationSplit ?? 0,
  });

  const result = await optimizePromptTestSuite(resolved.config, resolved.testSuite, {
    promptIndex: options.promptIndex ?? 0,
    providerIndex: options.providerIndex ?? 0,
    validationSplit: options.validationSplit,
  });

  printBorder();
  logger.info(chalk.bold('Prompt optimization result'));
  logger.info(
    `Baseline search: ${result.baselinePrompt.label} (${result.baselinePrompt.metrics?.score ?? 'n/a'})`,
  );
  logger.info(
    `Best search: ${result.bestPrompt.label} (${result.bestPrompt.metrics?.score ?? 'n/a'})`,
  );
  if (result.baselineValidationPrompt && result.bestValidationPrompt) {
    logger.info(
      `Baseline validation: ${result.baselineValidationPrompt.label} (${result.baselineValidationPrompt.metrics?.score ?? 'n/a'})`,
    );
    logger.info(
      `Best validation: ${result.bestValidationPrompt.label} (${result.bestValidationPrompt.metrics?.score ?? 'n/a'})`,
    );
  } else {
    logger.info(
      chalk.yellow(
        'Validation split disabled; reported improvement is measured on the optimization set.',
      ),
    );
  }
  logger.info(
    result.improved
      ? chalk.green('Best candidate improved on the baseline.')
      : chalk.yellow('Baseline remains strongest.'),
  );
  printBorder();
  logger.info(chalk.bold('Best prompt'));
  logger.info(result.bestPrompt.raw);
  printBorder();

  telemetry.record('command_used', {
    duration: Math.round((Date.now() - startTime) / 1000),
    name: 'optimize',
    improved: result.improved,
    numCandidates: result.candidates.length,
    numPrompts: resolved.testSuite.prompts.length,
    promptIndex: options.promptIndex ?? 0,
    providerIndex: options.providerIndex ?? 0,
    searchTestCount: result.searchTestCount,
    numTests: resolved.testSuite.tests?.length || 0,
    validationSplit: result.validationSplit ?? 0,
    validationTestCount: result.validationTestCount,
  });
}

function parseValidationSplit(value: string): number {
  const split = Number.parseFloat(value);
  if (!Number.isFinite(split) || split <= 0 || split > 0.5) {
    throw new InvalidArgumentError(
      '--validation-split must be greater than 0 and less than or equal to 0.5',
    );
  }
  return split;
}

function parseSelectionIndex(value: string, flag: '--prompt-index' | '--provider-index'): number {
  const index = Number(value);
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new InvalidArgumentError(`${flag} must be a non-negative integer.`);
  }
  return index;
}

function parsePromptIndex(value: string): number {
  return parseSelectionIndex(value, '--prompt-index');
}

function parseProviderIndex(value: string): number {
  return parseSelectionIndex(value, '--provider-index');
}

export function optimizeCommand(
  program: Command,
  defaultConfig: Partial<UnifiedConfig>,
  defaultConfigPath: string | undefined,
) {
  const command = program
    .command('optimize')
    .description('Optimize one prompt against one configured provider')
    .option('-c, --config <path>', 'Path to configuration file. Defaults to promptfooconfig.yaml')
    .option('--prompt-index <index>', 'Zero-based prompt index to optimize', parsePromptIndex, 0)
    .option(
      '--provider-index <index>',
      'Zero-based provider index to optimize against',
      parseProviderIndex,
      0,
    )
    .option(
      '--validation-split <fraction>',
      'Hold out this fraction of tests for validation scoring (0 < n <= 0.5)',
      parseValidationSplit,
    )
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(
      async (opts: {
        config?: string;
        envPath?: string | string[];
        promptIndex?: number;
        providerIndex?: number;
        validationSplit?: number;
      }) => {
        try {
          await doOptimize({
            ...opts,
            defaultConfig,
            defaultConfigPath,
          });
        } catch (error) {
          logger.error(error instanceof Error ? error.message : String(error));
          process.exitCode = 1;
        }
      },
    );

  return command;
}
