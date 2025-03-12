import confirm from '@inquirer/confirm';
import select from '@inquirer/select';
import chalk from 'chalk';
import type { Command } from 'commander';
import dedent from 'dedent';
import fs from 'fs/promises';
import path from 'path';
import { VERSION } from '../constants';
import logger from '../logger';
import { initializeProject } from '../onboarding';
import telemetry from '../telemetry';
import { isRunningUnderNpx, setupEnv } from '../util';

const GITHUB_API_BASE = 'https://api.github.com';

export async function downloadFile(url: string, filePath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }
  const content = await response.text();
  await fs.writeFile(filePath, content);
}

export async function downloadDirectory(dirPath: string, targetDir: string): Promise<void> {
  const url = `${GITHUB_API_BASE}/repos/promptfoo/promptfoo/contents/examples/${dirPath}?ref=${VERSION}`;
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
      `${GITHUB_API_BASE}/repos/promptfoo/promptfoo/contents/examples?ref=${VERSION}`,
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
  ];

  const selectedExample = await select({
    message: 'Choose an example to download:',
    choices,
  });
  return selectedExample;
}

async function handleExampleDownload(
  directory: string | null,
  example: string | boolean | undefined,
): Promise<string | undefined> {
  let exampleName: string | undefined;

  if (example === true) {
    exampleName = await selectExample();
  } else if (typeof example === 'string') {
    exampleName = example;
  }

  let attemptDownload = true;
  while (attemptDownload && exampleName) {
    const targetDir = path.join(directory || '.', exampleName);
    try {
      await downloadExample(exampleName, targetDir);
      logger.info(chalk.green(`✅ Example project '${exampleName}' written to: ${targetDir}`));
      attemptDownload = false;
    } catch (error) {
      logger.error(`Failed to download example: ${error instanceof Error ? error.message : error}`);
      attemptDownload = await confirm({
        message: 'Would you like to try downloading a different example?',
        default: true,
      });
      if (attemptDownload) {
        exampleName = await selectExample();
      }
    }
  }

  const runCommand = isRunningUnderNpx() ? 'npx promptfoo eval' : 'promptfoo eval';
  if (!exampleName) {
    return;
  }

  const basePath = directory && directory !== '.' ? `${directory}/` : '';
  const readmePath = path.join(basePath, exampleName, 'README.md');
  const cdCommand = `cd ${path.join(basePath, exampleName)}`;

  if (exampleName.includes('redteam')) {
    logger.info(
      dedent`

      View the README file at ${chalk.bold(readmePath)} to get started!
      `,
    );
  } else {
    logger.info(
      dedent`

      View the README at ${chalk.bold(readmePath)} or run:

      \`${chalk.bold(`${cdCommand} && ${runCommand}`)}\`

      to get started!
      `,
    );
  }

  return exampleName;
}

interface InitCommandOptions {
  interactive: boolean;
  example: string | boolean | undefined;
  envPath: string | undefined;
}

export function initCommand(program: Command) {
  program
    .command('init [directory]')
    .description('Initialize project with dummy files or download an example')
    .option('--no-interactive', 'Do not run in interactive mode')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .option('--example [name]', 'Download an example from the promptfoo repo')
    .action(async (directory: string | null, cmdObj: InitCommandOptions) => {
      telemetry.record('command_used', {
        name: 'init - started',
      });
      setupEnv(cmdObj.envPath);

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

      const exampleName = await handleExampleDownload(directory, cmdObj.example);

      if (exampleName) {
        telemetry.record('command_used', {
          example: exampleName,
          name: 'init',
        });
      } else {
        const details = await initializeProject(directory, cmdObj.interactive);
        telemetry.record('command_used', {
          ...details,
          name: 'init',
        });
      }
      await telemetry.send();
    });
}
