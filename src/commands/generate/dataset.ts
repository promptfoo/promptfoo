import type { Command } from 'commander';
import { type UnifiedConfig } from '../../types';

// Re-export for backward compatibility
export { doGenerateDataset } from './actions/datasetAction';

export function generateDatasetCommand(
  program: Command,
  defaultConfig: Partial<UnifiedConfig>,
  defaultConfigPath: string | undefined,
) {
  program
    .command('dataset')
    .description('Generate test cases')
    .option(
      '-i, --instructions [instructions]',
      'Additional instructions to follow while generating test cases',
    )
    .option('-c, --config [path]', 'Path to configuration file. Defaults to promptfooconfig.yaml')
    .option('-o, --output [path]', 'Path to output file. Supports CSV and YAML output.')
    .option('-w, --write', 'Write results to promptfoo configuration file')
    .option(
      '--provider <provider>',
      `Provider to use for generating adversarial tests. Defaults to the default grading provider.`,
    )
    .option('--numPersonas <number>', 'Number of personas to generate', '5')
    .option('--numTestCasesPerPersona <number>', 'Number of test cases per persona', '3')
    .option('--no-cache', 'Do not read or write results to disk cache', false)
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(async (opts) => {
      // Lazy load the action handler
      const { doGenerateDataset } = await import('./actions/datasetAction');
      await doGenerateDataset({ ...opts, defaultConfig, defaultConfigPath });
    });
}
