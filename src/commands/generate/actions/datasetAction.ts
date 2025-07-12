import chalk from 'chalk';
import * as fs from 'fs';
import yaml from 'js-yaml';
import { disableCache } from '../../../cache';
import { serializeObjectArrayAsCSV } from '../../../csv';
import logger from '../../../logger';
import telemetry from '../../../telemetry';
import { synthesizeFromTestSuite } from '../../../testCase/synthesis';
import { type TestSuite, type UnifiedConfig } from '../../../types';
import { isRunningUnderNpx, printBorder, setupEnv } from '../../../util';
import { resolveConfigs } from '../../../util/config/load';

interface DatasetGenerateOptions {
  cache: boolean;
  config?: string;
  envFile?: string;
  instructions?: string;
  numPersonas: string;
  numTestCasesPerPersona: string;
  output?: string;
  provider?: string;
  write: boolean;
  defaultConfig: Partial<UnifiedConfig>;
  defaultConfigPath: string | undefined;
}

export async function doGenerateDataset(options: DatasetGenerateOptions): Promise<void> {
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
      'DatasetGeneration',
    );
    testSuite = resolved.testSuite;
  } else {
    throw new Error('Could not find config file. Please use `--config`');
  }

  const startTime = Date.now();
  telemetry.record('command_used', {
    name: 'generate dataset',
    numPersonas: options.numPersonas || 5,
    numTestCasesPerPersona: options.numTestCasesPerPersona || 3,
  });
  // Call synthesize function
  const results = await synthesizeFromTestSuite(testSuite, {
    instructions: options.instructions,
    numPersonas: Number(options.numPersonas) || 5,
    numTestCasesPerPersona: Number(options.numTestCasesPerPersona) || 3,
    provider: options.provider,
  });
  logger.info(
    `Generated ${results.length} test cases in ${Math.round((Date.now() - startTime) / 1000)}s`,
  );

  if (options.output) {
    let outputFormat = 'csv';
    if (options.output.endsWith('.csv')) {
      outputFormat = 'csv';
    } else if (
      options.output.endsWith('.json') ||
      options.output.endsWith('.jsonl') ||
      options.output.endsWith('.yaml') ||
      options.output.endsWith('.yml')
    ) {
      outputFormat = 'yaml';
    } else {
      // Throw error for unsupported file types
      const ext = options.output.includes('.') ? options.output.split('.').pop() : 'no extension';
      throw new Error(`Unsupported output file type: ${options.output}`);
    }

    if (outputFormat === 'csv') {
      logger.info('Writing CSV output...');
      const csvOutput = serializeObjectArrayAsCSV(results);
      fs.writeFileSync(options.output, csvOutput);
    } else {
      logger.info('Writing YAML output...');
      const yamlOutput = yaml.dump(results);
      fs.writeFileSync(options.output, yamlOutput);
    }
  } else {
    printBorder();
    logger.info('Generated test cases:\n');
    results.forEach((vars, index) => {
      logger.info(`Test Case ${index + 1}:`);
      logger.info(yaml.dump(vars));
      logger.info('---');
    });
    printBorder();
  }

  logger.info(
    chalk.green(
      '\n✅ Dataset generation complete.' +
        (options.write
          ? `\n\n${isRunningUnderNpx() ? 'npx ' : ''}promptfoo eval`
          : `\n\nTo run these tests: \n\n${isRunningUnderNpx() ? 'npx ' : ''}promptfoo eval --tests ${options.output || 'tests.csv'}`),
    ),
  );

  if (options.write && testSuite) {
    logger.info('Updating config file...');
    // Convert VarMapping[] to test cases
    testSuite.tests = results.map((vars) => ({ vars }));
    const configPath = options.config || options.defaultConfigPath;
    const yamlOutput = yaml.dump(testSuite as any);
    fs.writeFileSync(configPath!, yamlOutput);
  }
}
