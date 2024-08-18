import checkbox from '@inquirer/checkbox';
import { Separator } from '@inquirer/checkbox';
import confirm from '@inquirer/confirm';
import editor from '@inquirer/editor';
import input from '@inquirer/input';
import rawlist from '@inquirer/rawlist';
import select from '@inquirer/select';
import chalk from 'chalk';
import type { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { getUserEmail, setUserEmail } from '../accounts';
import { getEnvString } from '../envars';
import { readGlobalConfig, writeGlobalConfigPartial } from '../globalConfig';
import logger from '../logger';
import {
  ADDITIONAL_STRATEGIES,
  ALL_PLUGINS,
  DEFAULT_PLUGINS,
  DEFAULT_STRATEGIES,
  subCategoryDescriptions,
} from '../redteam/constants';
import telemetry from '../telemetry';
import type { RedteamPluginObject } from '../types';
import { getNunjucksEngine } from '../util/templates';
import { doGenerateRedteam } from './generate/redteam';

const REDTEAM_CONFIG_TEMPLATE = `# Red teaming configuration
# Docs: https://promptfoo.dev/docs/red-team/configuration

description: "My first red team"

prompts:
  {% for prompt in prompts -%}
  - {{ prompt | dump }}
  {% endfor -%}
  {% if prompts.length > 0 and not prompts[0].startsWith('file://') -%}
  # You can also reference external prompts, e.g.
  # - file:///path/to/prompt.json
  # Learn more: https://promptfoo.dev/docs/configuration/parameters/#prompts
  {% endif %}

providers:
  # To talk directly to your application, use a custom provider.
  # See https://promptfoo.dev/docs/red-team/configuration/#providers
  {% for provider in providers -%}
  - {{ provider }}
  {% endfor %}

redteam:
  # Default number of inputs to generate for each plugin
  numTests: {{numTests}}

  {% if plugins.length > 0 -%}
  # Each plugin generates {{numTests}} adversarial inputs.
  # To control the number of tests for each plugin, use:
  # - id: plugin-name
  #   numTests: 10
  plugins:
    {% for plugin in plugins -%}
    {% if plugin is string -%}
    - {{plugin}}
    {% else -%}
    - id: {{plugin.id}}
      {% if plugin.numTests is defined -%}
      numTests: {{plugin.numTests}}
      {% endif -%}
      {% if plugin.config is defined and plugin.config.policy is defined -%}
      config:
        policy: {{plugin.config.policy | dump}}
      {% endif -%}
    {% endif -%}
    {% endfor %}
  {% endif -%}

  {% if strategies.length > 0 -%}
  # Strategies for applying adversarial inputs
  strategies:
    {% for strategy in strategies -%}
    - {{strategy}}
    {% endfor %}
  {% endif -%}
`;

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

  console.clear();
  logger.info(chalk.bold('Prompt Configuration\n'));

  const promptChoices = [
    { name: 'Enter a prompt', value: 'enter' },
    { name: 'Reference a prompt file', value: 'file' },
    { name: 'No prompt', value: 'none' },
  ];

  const promptChoice = await rawlist({
    message: 'How would you like to specify the prompt?',
    choices: promptChoices,
  });

  const prompts: string[] = [];
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
  } else if (promptChoice === 'none') {
    prompts.push('{{query}}');
  }

  console.clear();
  logger.info(chalk.bold('Provider Configuration\n'));

  const providerChoices = [
    { name: 'openai:gpt-4o-mini', value: 'openai:gpt-4o-mini' },
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

  const selectedProvider = await select({
    message: 'Choose a provider to target:',
    choices: providerChoices,
    pageSize: process.stdout.rows - 4,
  });

  let providers: string[];
  if (selectedProvider === 'Other') {
    const customProvider = await input({
      message:
        'Enter the custom provider ID (see https://promptfoo.dev/docs/red-team/configuration/#providers for info):',
    });
    providers = [customProvider || 'openai:gpt-4o-mini'];
  } else {
    providers = [selectedProvider];
  }

  if (!getEnvString('OPENAI_API_KEY')) {
    console.clear();
    logger.info(chalk.bold('OpenAI API Configuration\n'));

    const apiKeyChoice = await rawlist({
      message: `OpenAI API key is required, but I don't see an OPENAI_API_KEY environment variable. How to proceed?`,
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
      checked: DEFAULT_PLUGINS.has(plugin),
    }));

  const plugins: (string | RedteamPluginObject)[] = await checkbox({
    message: 'Select plugins to enable:',
    choices: pluginChoices,
    pageSize: process.stdout.rows - 4,
    loop: false,
    validate: (answer) => answer.length > 0 || 'You must select at least one plugin.',
  });

  // Handle policy plugin
  if (plugins.includes('policy')) {
    // Remove the original 'policy' string if it exists
    const policyIndex = plugins.indexOf('policy');
    if (policyIndex !== -1) {
      plugins.splice(policyIndex, 1);
    }

    const policyDescription = await input({
      message:
        'You selected the `policy` plugin. Please enter your custom policy description (leave empty to skip):',
    });

    if (policyDescription.trim() !== '') {
      plugins.push({
        id: 'policy',
        config: { policy: policyDescription.trim() },
      } as RedteamPluginObject);
    }
  }

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
          checked: DEFAULT_STRATEGIES.includes(strategy as any),
        }
      : strategy,
  );

  const strategies = await checkbox({
    message: 'Select strategies to enable:',
    choices: strategyChoices,
    pageSize: process.stdout.rows - 4,
    loop: false,
  });

  const hasHarmfulPlugin = plugins.some(
    (plugin) => typeof plugin === 'string' && plugin.startsWith('harmful'),
  );
  if (hasHarmfulPlugin) {
    const { hasHarmfulRedteamConsent } = readGlobalConfig();
    if (!hasHarmfulRedteamConsent) {
      logger.info(chalk.yellow('\nImportant Notice:'));
      logger.info(
        'You have selected one or more plugins that generate potentially harmful content.',
      );
      logger.info(
        'This content is intended solely for adversarial testing and evaluation purposes.',
      );

      const existingEmail = getUserEmail();

      let email: string;
      if (existingEmail) {
        const confirmExistingEmail = await confirm({
          message: `Do you agree?`,
          default: true,
        });
        if (!confirmExistingEmail) {
          process.exit(1);
        }
        email = existingEmail;
      } else {
        email = await input({
          message: 'Please enter your email address to confirm your agreement:',
          validate: (value) => {
            return value.includes('@') || 'Please enter a valid email address';
          },
        });
        setUserEmail(email);
      }

      try {
        await telemetry.saveConsent(email);
        writeGlobalConfigPartial({ hasHarmfulRedteamConsent: true });
      } catch (err) {
        logger.error(`Error saving consent: ${(err as Error).message}`);
      }
    }
  }

  const numTests = 5;

  const nunjucks = getNunjucksEngine();
  const redteamConfig = nunjucks.renderString(REDTEAM_CONFIG_TEMPLATE, {
    numTests,
    plugins,
    strategies,
    prompts,
    providers,
  });

  fs.writeFileSync(configPath, redteamConfig, 'utf8');

  console.clear();
  logger.info(chalk.green(`\nCreated red teaming configuration file at ${configPath}\n`));

  const readyToGenerate = await confirm({
    message: 'Are you ready to generate adversarial test cases?',
    default: true,
  });

  if (readyToGenerate) {
    await doGenerateRedteam({
      plugins: plugins.map((plugin) => (typeof plugin === 'string' ? { id: plugin } : plugin)),
      cache: false,
      write: true,
      defaultConfig: {},
      defaultConfigPath: configPath,
      numTests,
    });
  } else {
    logger.info(
      '\n' +
        chalk.blue(
          'To generate test cases later, use the command: ' +
            chalk.bold('promptfoo redteam generate'),
        ),
    );
  }

  telemetry.record('command_used', { name: 'redteam init' });
  await telemetry.send();
}

export function initRedteamCommand(program: Command) {
  program
    .command('init [directory]')
    .description('Initialize red teaming project')
    .action(async (directory: string | undefined) => {
      await redteamInit(directory);
    });
}
