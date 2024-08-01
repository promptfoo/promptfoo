import checkbox from '@inquirer/checkbox';
import { Separator } from '@inquirer/checkbox';
import confirm from '@inquirer/confirm';
import editor from '@inquirer/editor';
import input from '@inquirer/input';
import number from '@inquirer/number';
import rawlist from '@inquirer/rawlist';
import chalk from 'chalk';
import { Command } from 'commander';
import * as fs from 'fs';
import yaml from 'js-yaml';
import * as path from 'path';
import invariant from 'tiny-invariant';
import logger from '../logger';
import {
  ADDITIONAL_STRATEGIES,
  ALL_PLUGINS,
  DEFAULT_PLUGINS,
  DEFAULT_STRATEGIES,
  subCategoryDescriptions,
} from '../redteam/constants';
import telemetry from '../telemetry';
import { Prompt, TestSuite } from '../types';
import { redteamConfigSchema } from '../validators/redteam';
import { doGenerateRedteam } from './generate/redteam';

export async function redteamInit(directory: string | undefined) {
  telemetry.maybeShowNotice();
  telemetry.record('command_used', { name: 'redteam init - started' });
  await telemetry.send();

  console.clear();
  logger.info(chalk.bold('Red Team Initialization\n'));

  let projectDir = directory;
  if (!projectDir) {
    projectDir = await input({
      message: 'Where do you want to create the project?',
      default: '.',
    });
  }
  if (projectDir !== '.' && !fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }

  const configPath = path.join(projectDir, 'promptfooconfig.yaml');
  const previousConfigExists = fs.existsSync(configPath);
  let existingConfig: TestSuite | undefined;
  if (previousConfigExists) {
    const overwrite = await confirm({
      message: `A promptfoo configuration file already exists at: ${configPath} Do you want to overwrite it?`,
      default: false,
    });
    if (!overwrite) {
      return;
    }
    existingConfig = yaml.load(fs.readFileSync(configPath, 'utf8')) as TestSuite;
  }

  console.clear();
  logger.info(chalk.bold('Prompt Configuration\n'));

  const promptChoices = [
    { name: 'Enter a prompt', value: 'enter' },
    { name: 'Reference a prompt file', value: 'file' },
    ...(previousConfigExists
      ? [{ name: 'Use prompts from existing config', value: 'existing' }]
      : []),
  ];

  const promptChoice = await rawlist({
    message: 'How would you like to specify the prompt?',
    choices: promptChoices,
  });

  let prompts: (Prompt | string)[] = [];
  if (promptChoice === 'enter') {
    prompts.push(
      await editor({
        message: 'Enter your prompt:',
        default:
          'You are a helpful concise assistant.\n\nUser query: {{query}}\n\n(NOTE: your prompt must include "{{query}}" as a placeholder for user input)',
      }),
    );
  } else if (promptChoice === 'file') {
    const promptFile = await input({
      message: 'Enter the path to your prompt file (text or JSON):',
    });
    prompts.push(`file://${promptFile}`);
  } else if (promptChoice === 'existing') {
    invariant(existingConfig?.prompts, 'No prompts found in existing configuration');
    prompts = existingConfig?.prompts;
  }

  console.clear();
  logger.info(chalk.bold('Provider Configuration\n'));

  const providerChoices = [
    { name: 'openai:gpt-4o-mini', value: 'openai:gpt-4o-mini', checked: true },
    { name: 'openai:gpt-4o', value: 'openai:gpt-4o' },
    { name: 'openai:gpt-3.5-turbo', value: 'openai:gpt-3.5-turbo' },
    {
      name: 'anthropic:claude-3-5-sonnet-20240620',
      value: 'anthropic:messages:claude-3-5-sonnet-20240620',
    },
    {
      name: 'anthropic:claude-3-opus-20240307',
      value: 'anthropic:messages:claude-3-opus-20240307',
    },
    { name: 'vertex:gemini-pro', value: 'vertex:gemini-pro' },
    { name: 'Other', value: 'Other' },
  ];

  const selectedProviders = await checkbox({
    message: 'Choose one or more providers to target:',
    choices: providerChoices,
    pageSize: Math.min(providerChoices.length, process.stdout.rows - 4),
  });

  const providers: string[] = selectedProviders.filter((p) => p !== 'Other');
  if (selectedProviders.includes('Other')) {
    const customProvider = await input({
      message:
        'Enter the custom provider ID (see https://www.promptfoo.dev/docs/providers/ for options):',
    });
    providers.push(customProvider);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.clear();
    logger.info(chalk.bold('OpenAI API Configuration\n'));

    const apiKeyChoice = await rawlist({
      message: 'OpenAI API key is required. How to proceed?',
      choices: [
        { name: 'Enter API key now', value: 'enter' },
        { name: 'Set it later', value: 'later' },
      ],
    });

    if (apiKeyChoice === 'enter') {
      const apiKey = await input({ message: 'Enter your OpenAI API key:' });
      process.env.OPENAI_API_KEY = apiKey;
      logger.info('OPENAI_API_KEY set for this session.');
    } else {
      logger.warn('Remember to set OPENAI_API_KEY before generating the dataset.');
    }
  }

  console.clear();
  logger.info(chalk.bold('Plugin Configuration\n'));

  const pluginChoices = Array.from(ALL_PLUGINS)
    .sort()
    .map((plugin) => ({
      name: `${plugin} - ${subCategoryDescriptions[plugin] || 'No description'}`,
      value: plugin,
      checked:
        existingConfig?.redteam?.plugins.some((p) => p.id === plugin) ||
        DEFAULT_PLUGINS.has(plugin),
    }));

  const plugins = await checkbox({
    message: 'Select plugins to enable:',
    choices: pluginChoices,
    pageSize: Math.min(pluginChoices.length, process.stdout.rows - 4),
    loop: false,
  });

  console.clear();
  logger.info(chalk.bold('Strategy Configuration\n'));

  const strategyChoices = [
    ...Array.from(DEFAULT_STRATEGIES).sort(),
    new Separator(),
    ...Array.from(ADDITIONAL_STRATEGIES).sort(),
  ].map((strategy) =>
    typeof strategy === 'string'
      ? {
          name: `${strategy} - ${subCategoryDescriptions[strategy] || 'No description'}`,
          value: strategy,
          checked:
            existingConfig?.redteam?.strategies?.some(
              (s) => s.id === strategy || (typeof s === 'string' && s === strategy),
            ) || DEFAULT_STRATEGIES.includes(strategy as any),
        }
      : strategy,
  );

  const strategies = await checkbox({
    message: 'Select strategies to enable:',
    choices: strategyChoices,
    pageSize: Math.min(strategyChoices.length, process.stdout.rows - 4),
    loop: false,
  });

  const numTests = await number({
    message: 'Number of test cases per plugin:',
    default: 5,
    min: 0,
    max: 1000,
  });
  invariant(numTests, 'No number of tests provided');

  // Create config file
  const config = {
    prompts,
    providers: providers,
    tests: [],
    redteam: redteamConfigSchema.safeParse({
      plugins: plugins,
      strategies: strategies,
      numTests,
    }).data,
  };

  // Write the simplified form to the config file to make it easier
  // for people to play with. Writes 1 in the { id: ..., numTests }
  // and then the rest as strings.
  const parsedPlugins = redteamConfigSchema.safeParse({
    plugins: plugins,
    strategies: strategies,
    numTests,
  })?.data?.plugins;
  const configPlugins = plugins.length >= 2 ? [parsedPlugins?.[0], ...plugins.slice(1)] : plugins;

  fs.writeFileSync(
    configPath,
    yaml.dump({
      ...config,
      redteam: {
        numTests,
        plugins: configPlugins,
        strategies,
      },
    }),
    'utf8',
  );

  console.clear();
  logger.info(chalk.green(`\nCreated red teaming configuration file at ${configPath}\n`));

  const readyToGenerate = await confirm({
    message: 'Are you ready to generate adversarial test cases?',
    default: true,
  });

  if (readyToGenerate) {
    await doGenerateRedteam({
      plugins: parsedPlugins,
      cache: false,
      write: true,
      defaultConfig: config,
      defaultConfigPath: configPath,
      numTests,
    });
  } else {
    logger.info(
      '\n' +
        chalk.blue(
          'To generate test cases later, use the command: ' +
            chalk.bold('promptfoo generate redteam'),
        ),
    );
  }

  telemetry.record('command_used', { name: 'redteam init' });
  await telemetry.send();
}

export function redteamCommand(program: Command) {
  const redteamCommand = program.command('redteam').description('Red team LLM applications');

  redteamCommand
    .command('init [directory]')
    .description('Initialize red teaming project')
    .action(async (directory: string | undefined) => {
      await redteamInit(directory);
    });
}
