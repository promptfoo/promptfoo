import chalk from 'chalk';
import { Command } from 'commander';
import * as fs from 'fs';
import inquirer from 'inquirer';
import yaml from 'js-yaml';
import * as path from 'path';
import logger from '../logger';
import { ALL_PLUGINS, DEFAULT_PLUGINS, subCategoryDescriptions } from '../redteam/constants';
import telemetry from '../telemetry';
import { doGenerateRedteam } from './generate';

interface RunRedteamOptions {
  config: string;
  cache: boolean;
  envFile: string;
}

export async function doRunRedteam(cmdObj: RunRedteamOptions) {}

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
        const { chosenDir } = await inquirer.prompt([
          {
            type: 'input',
            name: 'chosenDir',
            message: 'Where do you want to create the project?',
            default: '.',
          },
        ]);
        projectDir = (chosenDir as string | undefined) || '.';
      }
      if (projectDir !== '.' && !fs.existsSync(projectDir)) {
        fs.mkdirSync(projectDir, { recursive: true });
      }

      // Question 2: Prompt
      const { promptChoice } = await inquirer.prompt([
        {
          type: 'list',
          name: 'promptChoice',
          message: 'How would you like to specify the prompt?',
          choices: [
            { name: 'Enter a prompt', value: 'enter' },
            { name: 'Reference a prompt file', value: 'file' },
          ],
        },
      ]);

      let prompt: string;
      if (promptChoice === 'enter') {
        const { enteredPrompt } = await inquirer.prompt([
          {
            type: 'editor',
            name: 'enteredPrompt',
            message: 'Enter your prompt:',
            default:
              'You are a helpful concise assistant.\n\nUser query: {{query}}\n\n(NOTE: your prompt must include "{{query}}" as a placeholder for user input)',
          },
        ]);
        prompt = enteredPrompt;
      } else {
        const { promptFile } = await inquirer.prompt([
          {
            type: 'input',
            name: 'promptFile',
            message: 'Enter the path to your prompt file (text or JSON):',
          },
        ]);
        prompt = `file://${promptFile}`;
      }

      // Question 3: Provider
      let provider: string;
      const { providerChoice } = await inquirer.prompt([
        {
          type: 'list',
          name: 'providerChoice',
          message: 'Choose a provider:',
          choices: [
            'openai:gpt-3.5-turbo',
            'openai:gpt-4',
            'anthropic:messages:claude-3-5-sonnet-20240620',
            'anthropic:messages:claude-3-opus-20240307',
            'vertex:gemini-pro',
            'Other',
          ],
        },
      ]);

      if (providerChoice === 'Other') {
        const { customProvider } = await inquirer.prompt([
          {
            type: 'input',
            name: 'customProvider',
            message:
              'Enter the provider ID (see https://www.promptfoo.dev/docs/providers/ for options):',
          },
        ]);
        provider = customProvider;
      } else {
        provider = providerChoice;
      }

      // Question 4: Plugins
      const pluginChoices = Array.from(ALL_PLUGINS).map((plugin) => ({
        name: `${plugin} - ${subCategoryDescriptions[plugin] || 'No description available'}`,
        value: plugin,
        checked: DEFAULT_PLUGINS.has(plugin),
      }));

      const { selectedPlugins } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'selectedPlugins',
          message: 'Select the plugins you want to enable:',
          choices: pluginChoices,
          pageSize: 20,
        },
      ]);

      const plugins = selectedPlugins;

      // Create config file
      const config = {
        prompts: [prompt],
        providers: [provider],
        tests: [],
      };

      const configPath = path.join(projectDir, 'promptfooconfig.yaml');
      fs.writeFileSync(configPath, yaml.dump(config), 'utf8');

      logger.info(
        '\n' + chalk.green(`Created red teaming configuration file at ${configPath}`) + '\n',
      );

      const { readyToGenerate } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'readyToGenerate',
          message: 'Are you ready to generate adversarial test cases?',
          default: true,
        },
      ]);

      telemetry.record('command_used', {
        name: 'redteam init',
      });
      await telemetry.send();

      if (readyToGenerate) {
        await doGenerateRedteam({
          plugins,
          cache: false,
          write: true,
          defaultConfig: config,
          defaultConfigPath: configPath,
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

  redteamCommand
    .command('run')
    .description('Run red teaming evaluation')
    .option('-c, --config <path>', 'Path to configuration file')
    .option('--no-cache', 'Disable cache', false)
    .option('--env-file <path>', 'Path to .env file')
    .action(doRunRedteam);
}
