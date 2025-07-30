import type { Command } from 'commander';

export function generateDatasetCommand(command: Command) {
  const cmd = command.command('dataset');
  cmd
    .description('Generate test cases')
    .option('-c, --config <path>', 'Path to configuration file. Defaults to promptfooconfig.yaml')
    .option('-i, --instructions <text>', 'Additional instructions to guide test case generation')
    .option('-o, --output <path>', 'Path to output file')
    .option('-w, --write', 'Write directly to the loaded config file')
    .option(
      '--numPersonas <number>',
      'Number of personas to generate. If not provided, AI will choose.',
    )
    .option('--numTestCasesPerPersona <number>', 'Number of test cases per persona')
    .option(
      '--provider <provider>',
      'Provider to use for generating dataset (e.g., openai:chat:gpt-4)',
    )
    .action(async (options: any) => {
      const { doGenerateDataset } = await import('./actions/datasetAction');
      await doGenerateDataset(options);
    })
    .addHelpText(
      'after',
      `
Example:
    npx promptfoo generate dataset -i "Create test cases covering a wide range of math problems"
`,
    );
}
