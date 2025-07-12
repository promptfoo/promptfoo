import type { Command } from 'commander';
import { z } from 'zod';
import { DEFAULT_MAX_CONCURRENCY } from '../evaluator';
import { CommandLineOptionsSchema } from '../types';
import type { EvaluateOptions, UnifiedConfig } from '../types';

const EvalCommandSchema = CommandLineOptionsSchema.extend({
  help: z.boolean().optional(),
  interactiveProviders: z.boolean().optional(),
  remote: z.boolean().optional(),
}).partial();

type EvalCommandOptions = z.infer<typeof EvalCommandSchema>;

// Re-export functions for backward compatibility
export {
  showRedteamProviderLabelMissingWarning,
  formatTokenUsage,
  doEval,
} from './eval/evalAction';

export function evalCommand(
  program: Command,
  defaultConfig: Partial<UnifiedConfig>,
  defaultConfigPath: string | undefined,
) {
  const evaluateOptions: EvaluateOptions = {};
  if (defaultConfig.evaluateOptions) {
    evaluateOptions.generateSuggestions = defaultConfig.evaluateOptions.generateSuggestions;
    evaluateOptions.maxConcurrency = defaultConfig.evaluateOptions.maxConcurrency;
    evaluateOptions.showProgressBar = defaultConfig.evaluateOptions.showProgressBar;
  }

  const evalCmd = program
    .command('eval')
    .description('Evaluate prompts')

    // Core configuration
    .option(
      '-c, --config <paths...>',
      'Path to configuration file. Automatically loads promptfooconfig.yaml',
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
      (value, previous) => {
        const [key, val] = value.split('=');
        if (!key || val === undefined) {
          throw new Error('--var must be specified in key=value format.');
        }
        return { ...previous, [key]: val };
      },
      {},
    )

    // Execution control
    .option(
      '-j, --max-concurrency <number>',
      'Maximum number of concurrent API calls',
      defaultConfig.evaluateOptions?.maxConcurrency
        ? String(defaultConfig.evaluateOptions.maxConcurrency)
        : `${DEFAULT_MAX_CONCURRENCY}`,
    )
    .option(
      '--repeat <number>',
      'Number of times to run each test',
      defaultConfig.evaluateOptions?.repeat ? String(defaultConfig.evaluateOptions.repeat) : '1',
    )
    .option(
      '--delay <number>',
      'Delay between each test (in milliseconds)',
      defaultConfig.evaluateOptions?.delay ? String(defaultConfig.evaluateOptions.delay) : '0',
    )
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
      '--filter-providers, --filter-targets <providers>',
      'Only run tests with these providers (regex match)',
    )
    .option('--filter-sample <number>', 'Only run a random sample of N tests')
    .option(
      '--filter-failing <path or id>',
      'Path to json output file or eval ID to filter failing tests from',
    )
    .option(
      '--filter-errors-only <path or id>',
      'Path to json output file or eval ID to filter error tests from',
    )
    .option(
      '--filter-metadata <key=value>',
      'Only run tests whose metadata matches the key=value pair (e.g. --filter-metadata pluginId=debug-access)',
    )

    // Output configuration
    .option(
      '-o, --output <paths...>',
      'Path to output file (csv, txt, json, yaml, yml, html), default is no output file',
    )
    .option('--table', 'Output table in CLI', defaultConfig?.commandLineOptions?.table ?? true)
    .option('--no-table', 'Do not output table in CLI', defaultConfig?.commandLineOptions?.table)
    .option(
      '--table-cell-max-length <number>',
      'Truncate console table cells to this length',
      '250',
    )
    .option('--share', 'Create a shareable URL', defaultConfig?.commandLineOptions?.share)
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
      'Generate N new prompts and append them to the prompt list',
    )
    .option('-w, --watch', 'Watch for changes in config and re-run')

    // Miscellaneous
    .option('--description <description>', 'Description of the eval run')
    .option('--no-progress-bar', 'Do not show progress bar')
    .action(async (opts: EvalCommandOptions, command: Command) => {
      // Dynamically import all the heavy dependencies and the actual implementation
      const [
        { fromError },
        { default: chalk },
        { default: logger },
        { isRunningUnderNpx },
        { default: cliState },
        { OutputFileExtension },
        { doEval },
      ] = await Promise.all([
        import('zod-validation-error'),
        import('chalk'),
        import('../logger'),
        import('../util'),
        import('../cliState'),
        import('../types'),
        import('./eval/evalAction'),
      ]);

      let validatedOpts: z.infer<typeof EvalCommandSchema>;
      try {
        validatedOpts = EvalCommandSchema.parse(opts);
      } catch (err) {
        const validationError = fromError(err);
        logger.error(`Invalid command options:\n${validationError.toString()}`);
        process.exitCode = 1;
        return;
      }

      if (command.args.length > 0) {
        logger.warn(`Unknown command: ${command.args[0]}. Did you mean -c ${command.args[0]}?`);
      }

      if (validatedOpts.help) {
        evalCmd.help();
        return;
      }

      if (validatedOpts.interactiveProviders) {
        const runCommand = isRunningUnderNpx() ? 'npx promptfoo eval' : 'promptfoo eval';
        logger.warn(
          chalk.yellow(`Warning: The --interactive-providers option has been removed.

Instead, use -j 1 to run evaluations with a concurrency of 1:
${chalk.green(`${runCommand} -j 1`)}`),
        );
        process.exitCode = 2;
        return;
      }

      if (validatedOpts.remote) {
        cliState.remote = true;
      }

      for (const maybeFilePath of validatedOpts.output ?? []) {
        const { data: extension } = OutputFileExtension.safeParse(
          maybeFilePath.split('.').pop()?.toLowerCase(),
        );
        if (!extension) {
          throw new Error(
            `Unsupported output file format: ${maybeFilePath}. Please use one of: ${(OutputFileExtension as any).options.join(', ')}.`,
          );
        }
      }

      doEval(validatedOpts as any, defaultConfig, defaultConfigPath, evaluateOptions);
    });

  return evalCmd;
}
