import checkbox from '@inquirer/checkbox';
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
  ALL_PLUGINS,
  ALL_STRATEGIES,
  DEFAULT_PLUGINS,
  DEFAULT_STRATEGIES,
  subCategoryDescriptions,
} from '../redteam/constants';
import { redteamConfigSchema } from '../redteam/types';
import telemetry from '../telemetry';
import { Prompt, TestSuite } from '../types';
import { doGenerateRedteam } from './generate/redteam';

export function redteamCommand(program: Command) {
  const redteamCommand = program.command('redteam').description('Red team LLM applications');

  redteamCommand
    .command('init [directory]')
    .description('Initialize red teaming project')
    .action(async (directory: string | undefined) => {
      telemetry.maybeShowNotice();
      telemetry.record('command_used', {
        name: 'redteam init - started',
      });
      await telemetry.send();

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
          message:
            'A promptfoo configuration file already exists. Do you want to modify it or overwrite it?',
          default: false,
        });
        if (!overwrite) {
          return;
        }
        existingConfig = yaml.load(fs.readFileSync(configPath, 'utf8')) as TestSuite;
      }

      const promptChoices = [
        { name: 'Enter a prompt', value: 'enter' },
        { name: 'Reference a prompt file', value: 'file' },
      ];
      if (previousConfigExists) {
        promptChoices.push({ name: 'Use existing prompts', value: 'existing' });
      }
      // Question 2: Prompt
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

      // Question 3: Provider
      let provider: string;
      const providerChoice = await rawlist({
        message: 'Choose a provider:',
        choices: [
          { name: 'openai:gpt-3.5-turbo', value: 'openai:gpt-3.5-turbo' },
          { name: 'openai:gpt-4o-mini', value: 'openai:gpt-4o-mini' },
          { name: 'openai:gpt-4o', value: 'openai:gpt-4o' },
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
        ],
      });

      if (providerChoice === 'Other') {
        provider = await input({
          message:
            'Enter the provider ID (see https://www.promptfoo.dev/docs/providers/ for options):',
        });
      } else {
        provider = providerChoice;
      }

      // Question 4: Plugins
      const pluginChoices = Array.from(ALL_PLUGINS)
        .sort()
        .map((plugin) => ({
          name: `${plugin} - ${subCategoryDescriptions[plugin] || 'No description available'}`,
          value: plugin,
          checked:
            existingConfig?.redteam?.plugins.some((p) => p.id === plugin || p === plugin) ||
            DEFAULT_PLUGINS.has(plugin),
        }));

      const plugins = await checkbox({
        message: 'Select the plugins you want to enable:',
        choices: pluginChoices,
        pageSize: 20,
      });

      // select strategies

      const strategyChoices = Array.from(ALL_STRATEGIES)
        .sort()
        .map((strategy) => ({
          name: strategy,
          value: strategy,
          checked:
            existingConfig?.redteam?.strategies?.some(
              (s) => s.id === strategy || (typeof s === 'string' && s === strategy),
            ) || DEFAULT_STRATEGIES.includes(strategy),
        }));

      const strategies = await checkbox({
        message: 'Select the strategies you want to enable:',
        choices: strategyChoices,
        pageSize: 20,
      });

      const numTests =
        (await number({
          message: 'How many test cases do you want to generate per plugin?',
          default: 5,
          min: 0,
          max: 1000,
        })) ?? 5;

      // Create config file
      const config = {
        prompts,
        providers: [provider],
        tests: [],
        redteam: redteamConfigSchema.safeParse({
          plugins: plugins,
          strategies: strategies,
          numTests,
        }).data,
      };

      fs.writeFileSync(configPath, yaml.dump(config), 'utf8');

      logger.info(
        '\n' + chalk.green(`Created red teaming configuration file at ${configPath}`) + '\n',
      );

      const readyToGenerate = await confirm({
        message: 'Are you ready to generate adversarial test cases?',
        default: true,
      });

      telemetry.record('command_used', {
        name: 'redteam init',
      });
      await telemetry.send();

      if (readyToGenerate) {
        await doGenerateRedteam({
          plugins: config?.redteam?.plugins,
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
    });
}
