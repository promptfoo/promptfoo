import chalk from 'chalk';
import dedent from 'dedent';
import { z } from 'zod';
import cliState from '../cliState';
import { DEFAULT_MAX_CONCURRENCY } from '../constants';
import logger from '../logger';
import { doEval, type EvalCommandOptions, EvalCommandSchema } from '../node/doEval';
import { MAX_SUGGESTIONS_COUNT } from '../types/index';
import { collectKeyValueOption, normalizeTagOption } from '../util/cliOptions';
import invariant from '../util/invariant';
import { getOutputFileFormat, SUPPORTED_OUTPUT_FILE_FORMATS } from '../util/outputFormats';
import { promptfooCommand } from '../util/promptfooCommand';
import type { Command } from 'commander';

import type { CommandLineOptions, UnifiedConfig } from '../types/index';
import type { InternalEvaluateOptions } from '../types/internal';

export function evalCommand(
  program: Command,
  defaultConfig: Partial<UnifiedConfig>,
  defaultConfigPath: string | undefined,
) {
  const evaluateOptions: InternalEvaluateOptions = {};
  if (defaultConfig.evaluateOptions) {
    evaluateOptions.generateSuggestions = defaultConfig.evaluateOptions.generateSuggestions;
    evaluateOptions.suggestionsCount = defaultConfig.evaluateOptions.suggestionsCount;
    evaluateOptions.maxConcurrency = defaultConfig.evaluateOptions.maxConcurrency;
    evaluateOptions.showProgressBar = defaultConfig.evaluateOptions.showProgressBar;
  }

  const evalCmd = program
    .command('eval')
    .description('Evaluate prompts')

    // Core configuration
    .option(
      '-c, --config <paths...>',
      'Path to configuration file or cloud config UUID. Automatically loads promptfooconfig.yaml',
    )

    // Input sources
    .option('-a, --assertions <path>', 'Path to assertions file')
    .option('-p, --prompts <paths...>', 'Paths to prompt files (.txt)')
    .option(
      '-r, --providers <name or path...>',
      'One of: openai:chat, openai:completion, openai:<model name>, or path to custom API caller module',
    )
    .option('-t, --tests <path>', 'Path to CSV with test cases')
    .option(
      '-v, --vars <path>',
      'Path to CSV with test cases (alias for --tests)',
      defaultConfig?.commandLineOptions?.vars,
    )
    .option('--model-outputs <path>', 'Path to JSON containing list of LLM output strings')

    // Prompt modification
    .option(
      '--prompt-prefix <path>',
      'This prefix is prepended to every prompt',
      typeof defaultConfig.defaultTest === 'object'
        ? defaultConfig.defaultTest?.options?.prefix
        : undefined,
    )
    .option(
      '--prompt-suffix <path>',
      'This suffix is appended to every prompt.',
      typeof defaultConfig.defaultTest === 'object'
        ? defaultConfig.defaultTest?.options?.suffix
        : undefined,
    )
    .option(
      '--var <key=value>',
      'Set a variable in key=value format',
      (value: string, previous: Record<string, string> | undefined) => {
        return collectKeyValueOption('--var', value, previous);
      },
      {},
    )
    .option(
      '--tag <key=value>',
      'Set an eval tag in key=value format. Can be specified multiple times; CLI tags override config tags.',
      (value: string, previous: Record<string, string> | undefined) => {
        return collectKeyValueOption('--tag', value, previous);
      },
    )

    // Execution control
    .option(
      '-j, --max-concurrency <number>',
      `Maximum number of concurrent API calls (default: ${DEFAULT_MAX_CONCURRENCY})`,
    )
    .option('--repeat <number>', 'Number of times to run each test (default: 1)')
    .option('--delay <number>', 'Delay between each test (in milliseconds) (default: 0)')
    .option(
      '--no-cache',
      'Do not read or write results to disk cache',
      defaultConfig?.commandLineOptions?.cache ?? defaultConfig?.evaluateOptions?.cache,
    )
    .option('--remote', 'Force remote inference wherever possible (used for red teams)', false)

    // Filtering and subset selection
    .option('-n, --filter-first-n <number>', 'Only run the first N tests')
    .option(
      '--filter-pattern <pattern>',
      'Only run tests whose description matches the regular expression pattern',
    )
    .option(
      '--filter-range <start:end>',
      'Only run tests whose zero-based index is in the range. End is exclusive (e.g. 0:10, 10:20, 10:, :10)',
    )
    .option(
      '--filter-prompts <pattern>',
      'Only run tests with prompts whose id or label matches the regex pattern',
    )
    .option(
      '--filter-providers, --filter-targets <providers>',
      'Only run tests with these providers (regex match)',
    )
    .option('--filter-sample <number>', 'Only run a random sample of N tests')
    .option('--filter-sample-seed <number>', 'Numeric seed used to make --filter-sample repeatable')
    .option(
      '--filter-failing <path or id>',
      'Path to json output file or eval ID to filter non-passing tests from (failures + errors)',
    )
    .option(
      '--filter-failing-only <path or id>',
      'Path to json output file or eval ID to filter assertion failures from (excludes errors)',
    )
    .option(
      '--filter-errors-only <path or id>',
      'Path to json output file or eval ID to filter error tests from',
    )
    .option(
      '--filter-metadata <key=value>',
      'Only run tests whose metadata matches the key=value pair. Can be specified multiple times for AND logic (e.g. --filter-metadata type=unit --filter-metadata env=prod)',
      (value: string, previous: string[] | undefined) => {
        return previous ? [...previous, value] : [value];
      },
    )

    // Output configuration
    .option(
      '-o, --output <paths...>',
      `Path to output file (${SUPPORTED_OUTPUT_FILE_FORMATS.join(', ')}), default is no output file`,
    )
    .option('--table', 'Output table in CLI', defaultConfig?.commandLineOptions?.table ?? true)
    .option('--no-table', 'Do not output table in CLI', defaultConfig?.commandLineOptions?.table)
    .option('--table-cell-max-length <number>', 'Truncate console table cells to this length')
    .option('--show-assertions', 'Show detailed assertion table for each result in CLI output')
    .option('--share', 'Create a shareable URL', defaultConfig?.commandLineOptions?.share)
    .option('--no-share', 'Do not share, this overrides the config file')
    .option(
      '--resume [evalId]',
      'Resume a paused/incomplete evaluation. Defaults to latest when omitted',
    )
    .option('--retry-errors', 'Retry all ERROR results from the latest evaluation')
    .option(
      '--no-write',
      'Do not write results to promptfoo directory',
      defaultConfig?.commandLineOptions?.write,
    )

    // Additional features
    .option(
      '--grader <provider>',
      'Model that will grade outputs',
      defaultConfig?.commandLineOptions?.grader,
    )
    .option(
      '--suggest-prompts <number>',
      `Generate N new prompts (1-${MAX_SUGGESTIONS_COUNT}) and append them to the prompt list`,
    )
    .option('-w, --watch', 'Watch for changes in config and re-run')
    .option(
      '-x, --extension <paths...>',
      'Extension hooks to run (e.g., file://handler.js:afterAll)',
    )

    // Miscellaneous
    .option('--description <description>', 'Description of the eval run')
    .option('--no-progress-bar', 'Do not show progress bar')
    .action(async (opts: EvalCommandOptions, command: Command) => {
      let validatedOpts: z.infer<typeof EvalCommandSchema>;
      try {
        const optsWithAliases = normalizeTagOption(
          opts as EvalCommandOptions & { tag?: Record<string, string> },
        );
        validatedOpts = EvalCommandSchema.parse(optsWithAliases);
      } catch (err) {
        logger.error(dedent`
        Invalid command options:
        ${err instanceof z.ZodError ? z.prettifyError(err) : err}
        `);
        process.exitCode = 1;
        return;
      }
      if (command.args.length > 0) {
        if (command.args[0] === 'help') {
          evalCmd.help();
          return;
        }
        logger.error(`Unknown command: ${command.args[0]}. Did you mean -c ${command.args[0]}?`);
        process.exitCode = 1;
        return;
      }

      if (validatedOpts.help) {
        evalCmd.help();
        return;
      }

      if (validatedOpts.interactiveProviders) {
        const runCommand = promptfooCommand('eval');
        logger.warn(
          chalk.yellow(dedent`
          Warning: The --interactive-providers option has been removed.

          Instead, use -j 1 to run evaluations with a concurrency of 1:
          ${chalk.green(`${runCommand} -j 1`)}
        `),
        );
        process.exitCode = 2;
        return;
      }

      if (validatedOpts.remote) {
        cliState.remote = true;
      }

      for (const maybeFilePath of validatedOpts.output ?? []) {
        const extension = getOutputFileFormat(maybeFilePath);
        invariant(
          extension,
          `Unsupported output file format: ${maybeFilePath}. Please use one of: ${SUPPORTED_OUTPUT_FILE_FORMATS.join(', ')}.`,
        );
      }
      await doEval(
        validatedOpts as Partial<CommandLineOptions & Command>,
        defaultConfig,
        defaultConfigPath,
        { ...evaluateOptions, eventSource: 'cli' },
      );
    });

  return evalCmd;
}

export { EvalRunError, showRedteamProviderLabelMissingWarning } from '../node/doEval';

export type { EvalCommandOptions };
// Preserve established command-module imports while the implementation lives in the node layer.
export { doEval, EvalCommandSchema };
