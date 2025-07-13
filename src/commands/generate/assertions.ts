import type { Command } from 'commander';
import { InvalidArgumentError } from 'commander';
import { type UnifiedConfig } from '../../types';

// Re-export for backward compatibility
export { doGenerateAssertions } from './actions/assertionsAction';

function validateAssertionType(value: string) {
  const validTypes = ['pi', 'g-eval', 'llm-rubric'];
  if (!validTypes.includes(value)) {
    throw new InvalidArgumentError(
      `Invalid assertion type. Must be one of: ${validTypes.join(', ')}`,
    );
  }
  return value;
}

export function generateAssertionsCommand(
  program: Command,
  defaultConfig: Partial<UnifiedConfig>,
  defaultConfigPath: string | undefined,
) {
  program
    .command('assertions')
    .description('Generate additional subjective/objective assertions')
    .option(
      '-t, --type [type]',
      'The type of natural language assertion to generate (pi, g-eval, or llm-rubric)',
      validateAssertionType,
      'pi',
    )
    .option(
      '-c, --config [path]',
      'Path to configuration file. Defaults to promptfooconfig.yaml. Requires at least 1 prompt to be defined.',
    )
    .option('-o, --output [path]', 'Path to output file. Supports YAML output')
    .option('-w, --write', 'Write results to promptfoo configuration file')
    .option('--numAssertions <amount>', 'Number of assertions to generate')
    .option(
      '-i, --instructions [instructions]',
      'Additional instructions to guide assertion generation',
    )
    .option(
      '--provider <provider>',
      `Provider to use for generating assertions. Defaults to the default grading provider.`,
    )
    .option('--no-cache', 'Do not read or write results to disk cache', false)
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(async (opts) => {
      // Lazy load the action handler
      const { doGenerateAssertions } = await import('./actions/assertionsAction');
      await doGenerateAssertions({ ...opts, defaultConfig, defaultConfigPath });
    });
}
