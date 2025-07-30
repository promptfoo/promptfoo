import type { Command } from 'commander';

export function generateAssertionsCommand(
  command: Command,
  defaultConfig: any,
  defaultConfigPath?: string,
) {
  const cmd = command.command('assertions');
  cmd
    .description('Generate additional subjective/objective assertions')
    .option(
      '-t, --type [type]',
      'The type of natural language assertion to generate (pi, g-eval, or llm-rubric)',
      (value) => {
        const validTypes = ['pi', 'g-eval', 'llm-rubric'];
        if (!validTypes.includes(value)) {
          throw new Error(
            `Invalid assertion type: ${value}. Must be one of: ${validTypes.join(', ')}`,
          );
        }
        return value;
      },
      'pi',
    )
    .option(
      '-c, --config [path]',
      'Path to configuration file. Defaults to promptfooconfig.yaml. Requires at least 1 prompt to be defined.',
    )
    .option('-o, --output [path]', 'Path to output file. Supports YAML output')
    .option('-w, --write', 'Write results to promptfoo configuration file')
    .option('--numAssertions <amount>', 'Number of assertions to generate')
    .option('--no-cache', 'Do not read or write results to disk cache')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .option('--provider <provider>', 'Provider to use for generating assertions')
    .option('--instructions <instructions>', 'Additional instructions for generating assertions')
    .action(async (options: any) => {
      const { doGenerateAssertions } = await import('./actions/assertionsAction');
      await doGenerateAssertions({
        ...options,
        defaultConfig: defaultConfig || {},
        defaultConfigPath,
      });
    })
    .addHelpText(
      'after',
      `
Example:
    npx promptfoo generate assertions -c path/to/config.yaml -o assertions.yaml
`,
    );
}
