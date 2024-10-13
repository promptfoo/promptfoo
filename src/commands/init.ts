import confirm from '@inquirer/confirm';
import input from '@inquirer/input';
import select from '@inquirer/select';
import type { Command } from 'commander';
import fs from 'fs/promises';
import fetch from 'node-fetch';
import path from 'path';
import { VERSION } from '../constants';
import logger from '../logger';
import { initializeProject } from '../onboarding';
import telemetry from '../telemetry';

const GITHUB_API_BASE = 'https://api.github.com';
const REPO_OWNER = 'promptfoo';
const REPO_NAME = 'promptfoo';
const EXAMPLES_PATH = 'examples';

export async function downloadFile(url: string, filePath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }
  const content = await response.text();
  await fs.writeFile(filePath, content);
}

export async function downloadDirectory(dirPath: string, targetDir: string): Promise<void> {
  const url = `${GITHUB_API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${EXAMPLES_PATH}/${dirPath}?ref=${VERSION}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'promptfoo-cli',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch directory contents: ${response.statusText}`);
  }
  console.log(response);
  const contents = await response.json();
  console.log(contents);

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

export async function downloadExample(exampleName: string, targetDir: string): Promise<void> {
  try {
    await fs.mkdir(targetDir, { recursive: true });
    await downloadDirectory(exampleName, targetDir);
  } catch (error) {
    throw new Error(
      `Failed to download example: ${error instanceof Error ? error.message : error}`,
    );
  }
}

export async function getExamplesList(): Promise<string[]> {
  try {
    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${EXAMPLES_PATH}?ref=${VERSION}`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'promptfoo-cli',
        },
      },
    );

    if (!response.ok) {
      throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as Array<{ name: string; type: string }>;

    // Filter for directories only
    return data.filter((item) => item.type === 'dir').map((item) => item.name);
  } catch (error) {
    logger.error(
      `Failed to fetch examples list: ${error instanceof Error ? error.message : error}`,
    );
    return []; // Return an empty array if fetching fails
  }
}

export async function selectExample(): Promise<string> {
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
    return input({ message: 'Enter the name of the example:' });
  }

  return selectedExample;
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

        if (cmdObj.example === true) {
          exampleName = await selectExample();
        } else if (typeof cmdObj.example === 'string') {
          exampleName = cmdObj.example;
        }

        let attemptDownload = true;
        while (attemptDownload && exampleName) {
          const targetDir = path.join(directory || '.', exampleName);
          try {
            await downloadExample(exampleName, targetDir);
            logger.info(`Example '${exampleName}' downloaded successfully to ${targetDir}`);
            attemptDownload = false;
          } catch (error) {
            logger.error(
              `Failed to download example: ${error instanceof Error ? error.message : error}`,
            );
            attemptDownload = await confirm({
              message: 'Would you like to try downloading a different example?',
              default: true,
            });
            if (attemptDownload) {
              exampleName = await selectExample();
            }
          }
        }

        if (!exampleName) {
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
