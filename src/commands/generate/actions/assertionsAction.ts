import chalk from 'chalk';
import * as fs from 'fs';
import yaml from 'js-yaml';
import { synthesizeFromTestSuite } from '../../../assertions/synthesis';
import { disableCache } from '../../../cache';
import logger from '../../../logger';
import telemetry from '../../../telemetry';
import { type TestSuite, type UnifiedConfig } from '../../../types';
import { isRunningUnderNpx, printBorder, setupEnv } from '../../../util';
import { resolveConfigs } from '../../../util/config/load';

interface DatasetGenerateOptions {
  cache: boolean;
  config?: string;
  envFile?: string;
  instructions?: string;
  numAssertions?: string;
  output?: string;
  provider?: string;
  write: boolean;
  defaultConfig: Partial<UnifiedConfig>;
  defaultConfigPath: string | undefined;
  type: 'pi' | 'g-eval' | 'llm-rubric';
}

export async function doGenerateAssertions(options: DatasetGenerateOptions): Promise<void> {
  setupEnv(options.envFile);
  if (!options.cache) {
    logger.info('Cache is disabled.');
    disableCache();
  }

  let testSuite: TestSuite;
  const configPath = options.config || options.defaultConfigPath;
  if (configPath) {
    const resolved = await resolveConfigs(
      {
        config: [configPath],
      },
      options.defaultConfig,
      'AssertionGeneration',
    );
    testSuite = resolved.testSuite;
  } else {
    throw new Error('Could not find config file. Please use `--config`');
  }

  const startTime = Date.now();
  telemetry.record('command_used', {
    name: 'generate assertions',
    numAssertions: options.numAssertions || 1,
  });
  // Call synthesize function
  const assertions = await synthesizeFromTestSuite(testSuite, {
    instructions: options.instructions,
    provider: options.provider,
    type: options.type,
  });
  logger.info(
    `Generated ${assertions.length} assertions in ${Math.round((Date.now() - startTime) / 1000)}s`,
  );

  if (options.output) {
    // Validate output file extension
    if (
      !options.output.endsWith('.yaml') &&
      !options.output.endsWith('.yml') &&
      !options.output.endsWith('.json') &&
      !options.output.endsWith('.jsonl')
    ) {
      throw new Error(`Unsupported output file type: ${options.output}`);
    }
    logger.info('Writing output...');
    // Currently, we always write YAML.
    const yamlOutput = yaml.dump(assertions);
    fs.writeFileSync(options.output, yamlOutput);
  } else {
    printBorder();
    logger.info('Generated assertions:\n');
    logger.info(yaml.dump(assertions));
    printBorder();
  }

  logger.info(
    chalk.green(
      '\n✅ Assertion generation complete.' +
        (options.write ? `\n\n${isRunningUnderNpx() ? 'npx ' : ''}promptfoo eval` : ''),
    ),
  );

  if (options.write && testSuite) {
    logger.info('Updating config file...');
    // Add assertions to existing tests
    if (testSuite.tests) {
      testSuite.tests = testSuite.tests.map((test, index) => ({
        ...test,
        assert: [...(test.assert || []), ...(assertions[index] ? [assertions[index]] : [])],
      }));
    }
    const configPath = options.config || options.defaultConfigPath;
    const yamlOutput = yaml.dump(testSuite as any);
    fs.writeFileSync(configPath!, yamlOutput);
  }
}
