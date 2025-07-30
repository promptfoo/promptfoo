import type { Command } from 'commander';

export function generateAssertionsCommand(command: Command) {
  const cmd = command.command('assertions');
  cmd
    .description('Generate AI-based assertions for the specified configuration')
    .option('-c, --config <path>', 'Path to configuration file. Defaults to promptfooconfig.yaml')
    .option(
      '-o, --output <path>',
      'Path to output file. Defaults to `<config_dir>/redteam.yaml`',
    )
    .option('-p, --prompts <paths...>', 'Paths to prompt files')
    .option('-r, --providers <names...>', 'Provider names to use for redteam generation')
    .option('-i, --injectVar <varname>', 'Variable name to inject user/redteam input')
    .option('--purpose <purpose>', 'Purpose override for redteam generation')
    .action(async (options: any) => {
      const { doGenerateAssertions } = await import('./actions/assertionsAction');
      await doGenerateAssertions(options);
    })
    .addHelpText(
      'after',
      `
Example:
    npx promptfoo generate assertions -c path/to/config.yaml -o assertions.yaml
`,
    );
}
