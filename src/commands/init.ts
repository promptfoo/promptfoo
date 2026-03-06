import fs from 'fs/promises';
import path from 'path';

import confirm from '@inquirer/confirm';
import select from '@inquirer/select';
import chalk from 'chalk';
import dedent from 'dedent';
import { VERSION } from '../constants';
import logger from '../logger';
import { initializeProject } from '../onboarding';
import telemetry from '../telemetry';
import { fetchWithProxy } from '../util/fetch/index';
import { promptfooCommand } from '../util/promptfooCommand';
import { EXAMPLE_ALIASES, EXAMPLE_REPLACEMENTS, REMOVED_EXAMPLES } from './exampleAliases';
import type { Command } from 'commander';

const GITHUB_API_BASE = 'https://api.github.com';
const DEFAULT_EXAMPLE_REFS = [VERSION, 'main'];
const EXAMPLE_CONFIG_FILENAMES = new Set([
  'promptfooconfig.yaml',
  'promptfooconfig.yml',
  'promptfooconfig.js',
  'promptfooconfig.cjs',
  'promptfooconfig.mjs',
  'promptfooconfig.ts',
]);

interface GitHubTreeItem {
  path: string;
  type: 'blob' | 'tree' | string;
}

interface GitHubContentItem {
  name: string;
  type: 'file' | 'dir' | string;
  download_url: string | null;
}

function getGitHubHeaders() {
  return {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'promptfoo-cli',
  };
}

async function fetchExamplesTree(ref: string): Promise<GitHubTreeItem[]> {
  const response = await fetchWithProxy(
    `${GITHUB_API_BASE}/repos/promptfoo/promptfoo/git/trees/${ref}?recursive=1`,
    { headers: getGitHubHeaders() },
  );

  if (!response.ok) {
    throw new Error(
      `GitHub tree request failed for ref '${ref}': ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as { tree?: GitHubTreeItem[] };
  return data.tree ?? [];
}

function extractRunnableExamples(tree: GitHubTreeItem[]): string[] {
  const examples = new Set<string>();

  for (const item of tree) {
    if (item.type !== 'blob' || !item.path.startsWith('examples/')) {
      continue;
    }

    const basename = path.posix.basename(item.path);
    if (!EXAMPLE_CONFIG_FILENAMES.has(basename)) {
      continue;
    }

    const exampleDir = path.posix.dirname(item.path).replace(/^examples\//, '');
    if (exampleDir && exampleDir !== '.') {
      examples.add(exampleDir);
    }
  }

  return [...examples].sort((a, b) => a.localeCompare(b));
}

async function hasRootPromptfooConfig(exampleDir: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(exampleDir);
    return entries.some((entry) => EXAMPLE_CONFIG_FILENAMES.has(entry));
  } catch {
    return false;
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function getExampleDocsUrl(exampleName: string, refs: string[]): string {
  const docsRef = isLegacyRefs(refs) ? refs[0] : 'main';
  return `https://github.com/promptfoo/promptfoo/tree/${docsRef}/examples/${exampleName}`;
}

async function fetchExampleDirectoryContents(
  dirPath: string,
  refs: string[],
): Promise<GitHubContentItem[]> {
  const failedRefs: string[] = [];

  for (const ref of refs) {
    const url = `${GITHUB_API_BASE}/repos/promptfoo/promptfoo/contents/examples/${dirPath}?ref=${ref}`;
    const response = await fetchWithProxy(url, {
      headers: getGitHubHeaders(),
    });
    if (response.ok) {
      return (await response.json()) as GitHubContentItem[];
    }
    failedRefs.push(`${ref} (${response.status} ${response.statusText})`);
  }

  throw new Error(
    `Failed to fetch directory contents for refs: ${failedRefs.join(', ') || refs.join(', ')}`,
  );
}

export async function downloadFile(url: string, filePath: string): Promise<void> {
  const response = await fetchWithProxy(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }
  const content = await response.text();
  await fs.writeFile(filePath, content);
}

export async function downloadDirectory(
  dirPath: string,
  targetDir: string,
  refs: string[] = DEFAULT_EXAMPLE_REFS,
): Promise<void> {
  const contents = await fetchExampleDirectoryContents(dirPath, refs);

  for (const item of contents) {
    const itemPath = path.join(targetDir, item.name);
    if (item.type === 'file' && item.download_url) {
      await downloadFile(item.download_url, itemPath);
    } else if (item.type === 'dir') {
      await fs.mkdir(itemPath, { recursive: true });
      await downloadDirectory(`${dirPath}/${item.name}`, itemPath, refs);
    }
  }
}

export async function downloadExample(
  exampleName: string,
  targetDir: string,
  refs: string[] = DEFAULT_EXAMPLE_REFS,
): Promise<void> {
  let dirAlreadyExists = false;
  try {
    await fs.access(targetDir);
    dirAlreadyExists = true;
  } catch {
    // Directory doesn't exist, continue
  }
  try {
    await fs.mkdir(targetDir, { recursive: true });
    await downloadDirectory(exampleName, targetDir, refs);
  } catch (error) {
    if (!dirAlreadyExists) {
      try {
        await fs.rm(targetDir, { recursive: true, force: true });
      } catch (error) {
        logger.error(`Failed to remove directory: ${error}`);
      }
    }
    throw new Error(
      `Failed to download example: ${error instanceof Error ? error.message : error}`,
    );
  }
}

export async function getExamplesList(): Promise<string[]> {
  try {
    try {
      return extractRunnableExamples(await fetchExamplesTree(VERSION));
    } catch {
      // Fall back to main when VERSION isn't available.
      return extractRunnableExamples(await fetchExamplesTree('main'));
    }
  } catch (error) {
    logger.error(
      `Failed to fetch examples list: ${error instanceof Error ? error.message : error}`,
    );
    return [];
  }
}

interface ExampleDownloadSelection {
  exampleName: string | undefined;
  downloadRefs: string[];
}

function isLegacyRefs(refs: string[]): boolean {
  return refs.length === 1 && !DEFAULT_EXAMPLE_REFS.includes(refs[0]);
}

function resolveExampleSelection(example: string): ExampleDownloadSelection {
  const removedExample = REMOVED_EXAMPLES[example];
  if (removedExample) {
    logger.warn(chalk.yellow(`Note: ${removedExample.reason}`));
    logger.info(
      chalk.yellow(
        `Downloading the legacy '${example}' example from promptfoo@${removedExample.legacyRef}.`,
      ),
    );
    return {
      exampleName: example,
      downloadRefs: [removedExample.legacyRef],
    };
  }

  const resolved = EXAMPLE_ALIASES[example];
  if (resolved) {
    if (EXAMPLE_REPLACEMENTS[example]) {
      logger.info(
        chalk.yellow(`Note: ${EXAMPLE_REPLACEMENTS[example]} Downloading '${resolved}' instead.`),
      );
    } else {
      logger.info(
        chalk.yellow(`Note: '${example}' has been renamed to '${resolved}'. Using new name.`),
      );
    }
    return {
      exampleName: resolved,
      downloadRefs: DEFAULT_EXAMPLE_REFS,
    };
  }

  return {
    exampleName: example,
    downloadRefs: DEFAULT_EXAMPLE_REFS,
  };
}

async function logExampleInstructions(
  exampleName: string,
  directory: string | null,
  refs: string[],
) {
  const examplePath = path.join(directory || '.', exampleName);
  const readmePath = path.join(examplePath, 'README.md');
  const readmeExists = await pathExists(readmePath);
  const docsUrl = getExampleDocsUrl(exampleName, refs);
  const cdCommand = `cd ${examplePath}`;
  const isRunnableFromRoot = await hasRootPromptfooConfig(examplePath);

  if (exampleName.includes('redteam') || !isRunnableFromRoot) {
    if (readmeExists) {
      logger.info(
        dedent`

        View the README file at ${chalk.bold(readmePath)} to get started!
        `,
      );
    } else {
      logger.info(
        dedent`

        View the example at ${chalk.bold(docsUrl)} to get started!
        `,
      );
    }
    return;
  }

  const runCommand = promptfooCommand('eval');
  if (readmeExists) {
    logger.info(
      dedent`

      View the README at ${chalk.bold(readmePath)} or run:

      \`${chalk.bold(`${cdCommand} && ${runCommand}`)}\`

      to get started!
      `,
    );
  } else {
    logger.info(
      dedent`

      Run:

      \`${chalk.bold(`${cdCommand} && ${runCommand}`)}\`

      to get started.
      Example docs: ${chalk.bold(docsUrl)}
      `,
    );
  }
}

async function selectExample(): Promise<string> {
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

export async function handleExampleDownload(
  directory: string | null,
  example: string | boolean | undefined,
): Promise<string | undefined> {
  let exampleName: string | undefined;
  let downloadRefs = DEFAULT_EXAMPLE_REFS;

  if (example === true) {
    exampleName = await selectExample();
  } else if (typeof example === 'string') {
    const selection = resolveExampleSelection(example);
    exampleName = selection.exampleName;
    downloadRefs = selection.downloadRefs;
  }

  let attemptDownload = true;
  while (attemptDownload && exampleName) {
    const targetDir = path.join(directory || '.', exampleName);
    try {
      await downloadExample(exampleName, targetDir, downloadRefs);
      logger.info(chalk.green(`✅ Example project '${exampleName}' written to: ${targetDir}`));
      if (isLegacyRefs(downloadRefs)) {
        logger.info(
          chalk.yellow(`Downloaded legacy example '${exampleName}' from ref '${downloadRefs[0]}'.`),
        );
      }
      attemptDownload = false;
    } catch (error) {
      logger.error(`Failed to download example: ${error instanceof Error ? error.message : error}`);
      attemptDownload = await confirm({
        message: 'Would you like to try downloading a different example?',
        default: true,
      });
      if (attemptDownload) {
        exampleName = await selectExample();
        downloadRefs = DEFAULT_EXAMPLE_REFS;
      } else {
        // User declined to try downloading a different example
        logger.info(
          dedent`

          No example downloaded. To get started, try:

            ${chalk.bold('promptfoo init --example')}    (browse and select an example)
            ${chalk.bold('promptfoo init')}              (create a basic project)

           `,
        );
        return exampleName;
      }
    }
  }

  if (!exampleName) {
    return;
  }

  await logExampleInstructions(exampleName, directory, downloadRefs);

  return exampleName;
}

interface InitCommandOptions {
  interactive: boolean;
  example: string | boolean | undefined;
}

export function initCommand(program: Command) {
  program
    .command('init [directory]')
    .description('Set up a new promptfoo project with prompts, providers, and test cases')
    .option('--no-interactive', 'Do not run in interactive mode')
    .option('--example [name]', 'Download an example from the promptfoo repo')
    .action(async (directory: string | null, cmdObj: InitCommandOptions) => {
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
    });
}
