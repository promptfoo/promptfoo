import confirm from '@inquirer/confirm';
import input from '@inquirer/input';
import select from '@inquirer/select';
import type { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import logger from '../logger';
import { initializeProject } from '../onboarding';
import telemetry from '../telemetry';

const EXAMPLES_BASE_URL = `https://api.github.com/repos/promptfoo/promptfoo/contents/examples`;

async function downloadFile(url: string, filePath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }
  const content = await response.text();
  await fs.writeFile(filePath, content);
}

async function downloadDirectory(dirPath: string, targetDir: string): Promise<void> {
  const url = `${EXAMPLES_BASE_URL}/${dirPath}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'promptfoo-cli',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch directory contents: ${response.statusText}`);
  }

  const contents = await response.json();

  for (const item of contents) {
    const itemPath = path.join(targetDir, item.name);
    if (item.type === 'file') {
      await downloadFile(item.download_url, itemPath);
    } else if (item.type === 'dir') {
      await fs.mkdir(itemPath, { recursive: true });
      await downloadDirectory(`${dirPath}/${item.name}`, itemPath);
    }
  }
}

async function downloadExample(exampleName: string, targetDir: string): Promise<void> {
  try {
    await fs.mkdir(targetDir, { recursive: true });
    await downloadDirectory(exampleName, targetDir);
  } catch (error) {
    throw new Error(
      `Failed to download example: ${error instanceof Error ? error.message : error}`,
    );
  }
}

async function getExamplesList(): Promise<string[]> {
  // This is a simplified version. In a real implementation, you might want to fetch this list dynamically.
  return [
    'simple-test',
    'claude-vs-gpt',
    'openai-function-call',
    // Add more examples here
  ];
}

export function initCommand(program: Command) {
  program
    .command('init [directory]')
    .description('Initialize project with dummy files or download an example')
    .option('--no-interactive', 'Do not run in interactive mode')
    .option('--example [name]', 'Download a specific example')
    .action(
      async (
        directory: string | null,
        cmdObj: { interactive: boolean; example?: string | boolean },
      ) => {
        telemetry.record('command_used', {
          name: 'init - started',
        });

        if (directory === 'redteam' && cmdObj.interactive) {
          const useRedteam = await confirm({
            message:
              'You specified "redteam" as the directory. Did you mean to write "promptfoo redteam init" instead?',
            default: false,
          });
          if (useRedteam) {
            logger.warn('Please use "promptfoo redteam init" to initialize a red teaming project.');
            return;
          }
        }

        let exampleName: string | undefined;

        if (cmdObj.example === true || (cmdObj.example === undefined && cmdObj.interactive)) {
          // --example flag was passed without a value, or we're in interactive mode
          const examples = await getExamplesList();
          const choices = [
            { name: 'None (initialize with dummy files)', value: '' },
            ...examples.map((ex) => ({ name: ex, value: ex })),
            { name: 'Enter custom example name', value: 'custom' },
          ];

          const selectedExample = await select({
            message: 'Choose an example to download:',
            choices,
          });

          if (selectedExample === 'custom') {
            exampleName = await input({ message: 'Enter the name of the example:' });
          } else {
            exampleName = selectedExample;
          }
        } else if (typeof cmdObj.example === 'string') {
          // --example flag was passed with a value
          exampleName = cmdObj.example;
        }

        if (exampleName) {
          const targetDir = path.join(directory || '.', exampleName);
          try {
            await downloadExample(exampleName, targetDir);
            logger.info(`Example '${exampleName}' downloaded successfully to ${targetDir}`);
          } catch (error) {
            logger.error(
              `Failed to download example: ${error instanceof Error ? error.message : error}`,
            );

            // Offer to try again or exit
            const tryAgain = await confirm({
              message: 'Would you like to try downloading a different example?',
              default: true,
            });

            if (tryAgain) {
              // Recursively call the action to start over
              await program.commands
                .find((cmd) => cmd.name() === 'init')
                ?.action(directory, cmdObj);
              return;
            }
          }
        } else {
          const details = await initializeProject(directory, cmdObj.interactive);
          telemetry.record('command_used', {
            ...details,
            name: 'init',
          });
        }

        await telemetry.send();
      },
    );
}
