import { Command } from 'commander';
import * as fs from 'fs';
import inquirer from 'inquirer';
import yaml from 'js-yaml';
import * as path from 'path';
import telemetry from '../telemetry';
import { doGenerateRedteam } from './generate';

interface RunRedteamOptions {
  config: string;
  cache: boolean;
  envFile: string;
}

export async function doRunRedteam(cmdObj: RunRedteamOptions) {
  await doGenerateRedteam({
    cache: false,
    write: true,
    defaultConfig: {},
    defaultConfigPath: undefined,
  });
}

export function redteamCommand(program: Command) {
  const redteamCommand = program.command('redteam').description('Red team LLM applications');

  redteamCommand
    .command('init [directory]')
    .description('Initialize red teaming project')
    .action(async (directory: string | undefined) => {
      telemetry.maybeShowNotice();
      telemetry.record('command_used', {
        name: 'redteam init',
      });
      await telemetry.send();

      // Question 1: Directory
      const { targetDir } = await inquirer.prompt([
        {
          type: 'list',
          name: 'targetDir',
          message: 'Where would you like to create the red teaming project?',
          choices: [
            { name: 'Current directory', value: '.' },
            { name: 'Custom directory', value: 'custom' },
          ],
        },
      ]);

      let projectDir = targetDir === '.' ? process.cwd() : directory || '';
      if (targetDir === 'custom' && !directory) {
        const { customDir } = await inquirer.prompt([
          {
            type: 'input',
            name: 'customDir',
            message: 'Enter the directory name:',
          },
        ]);
        projectDir = customDir;
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

      // Create config file
      const config = {
        prompts: [prompt],
        providers: [provider],
        tests: [],
      };

      const configPath = path.join(projectDir, 'promptfooconfig.yaml');
      fs.writeFileSync(configPath, yaml.dump(config), 'utf8');

      await doRunRedteam({
        config: configPath,
        cache: false,
        envFile: '',
      });
    });

  redteamCommand
    .command('run')
    .description('Run red teaming evaluation')
    .option('-c, --config <path>', 'Path to configuration file')
    .option('--no-cache', 'Disable cache', false)
    .option('--env-file <path>', 'Path to .env file')
    .action(doRunRedteam);
}
